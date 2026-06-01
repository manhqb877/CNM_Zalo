import multer from 'multer';
import type { Request, Response, NextFunction } from 'express';
import type { AuthRequest } from '../../shared/middleware/auth.middleware';
import { uploadToS3, deleteFromS3, extractS3KeyFromUrl } from '../../infrastructure/s3';
import { updateProfile } from './users.service';
import { UserModel } from './user.model';
import { logger } from '../../shared/logger';

// ─── Multer config: lưu trong memory (không ghi disk) ────────────────────────
const AVATAR_MAX_SIZE = parseInt(process.env['AVATAR_MAX_SIZE_BYTES'] ?? '5242880', 10); // 5MB default
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

const storage = multer.memoryStorage();

const fileFilter: multer.Options['fileFilter'] = (_req, file, cb) => {
  if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Định dạng file không hỗ trợ. Chỉ chấp nhận: ${ALLOWED_MIME_TYPES.join(', ')}`));
  }
};

export const avatarUploadMiddleware = multer({
  storage,
  limits: { fileSize: AVATAR_MAX_SIZE },
  fileFilter,
}).single('avatar'); // field name trong form-data phải là "avatar"

// ─── Handler: POST /api/users/me/avatar ──────────────────────────────────────

/**
 * Upload avatar lên AWS S3 và cập nhật avatarUrl trong DB.
 * FE gửi multipart/form-data với field "avatar".
 * Response: { success: true, avatarUrl: "https://..." }
 */
export async function uploadAvatarHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { userId } = req as AuthRequest;
    if (!userId) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    if (!req.file) {
      res.status(400).json({ success: false, error: 'Không tìm thấy file avatar. Hãy gửi multipart/form-data với field "avatar".' });
      return;
    }

    const file = req.file;
    const ext = file.mimetype.split('/')[1] ?? 'jpg';

    // S3 key: avatars/<userId>/<timestamp>.<ext>
    const s3Key = `avatars/${userId}/${Date.now()}.${ext}`;

    logger.info(`[Avatar] Uploading for user ${userId}: ${s3Key} (${file.size} bytes, ${file.mimetype})`);

    // Xóa avatar cũ trên S3 nếu có
    const existingUser = await UserModel.findById(userId).select('avatarUrl').lean();
    if (existingUser?.avatarUrl) {
      const oldKey = extractS3KeyFromUrl(existingUser.avatarUrl as string);
      if (oldKey && oldKey.startsWith('avatars/')) {
        // Xóa bất đồng bộ, không block response nếu lỗi
        deleteFromS3(oldKey).catch((err: unknown) => {
          logger.warn(`[Avatar] Failed to delete old avatar: ${oldKey}`, err);
        });
      }
    }

    // Upload lên S3
    const avatarUrl = await uploadToS3({
      key: s3Key,
      body: file.buffer,
      contentType: file.mimetype,
      cacheControl: 'max-age=2592000, public', // 30 ngày
    });

    // Cập nhật avatarUrl trong MongoDB
    await updateProfile(userId, { avatarUrl });

    logger.info(`[Avatar] Updated for user ${userId}: ${avatarUrl}`);

    res.status(200).json({ success: true, avatarUrl });
  } catch (err: unknown) {
    // Multer error (file too large, wrong type)
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        res.status(413).json({
          success: false,
          error: `File quá lớn. Kích thước tối đa: ${Math.round(AVATAR_MAX_SIZE / 1024 / 1024)}MB`,
        });
        return;
      }
      res.status(400).json({ success: false, error: err.message });
      return;
    }
    next(err);
  }
}
