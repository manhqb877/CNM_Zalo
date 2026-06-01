import { Router, type Request, type Response } from 'express';
import { v2 as cloudinary } from 'cloudinary';
import { authenticate } from '../../shared/middleware/auth.middleware';
import { uploadRateLimiter } from '../../shared/middleware/rate-limiter.middleware';
import { UploadController } from './upload.controller';
import { UploadService } from './upload.service';

export const uploadRouter = Router();

// Initialize Cloudinary when router is loaded
UploadService.initCloudinary();

uploadRouter.use(authenticate);

uploadRouter.post('/sign', uploadRateLimiter, (req: Request, res: Response) => {
  const cloudName = process.env['CLOUDINARY_CLOUD_NAME'];
  const apiKey = process.env['CLOUDINARY_API_KEY'];
  const apiSecret = process.env['CLOUDINARY_API_SECRET'];

  if (!cloudName || !apiKey || !apiSecret) {
    res.status(500).json({ success: false, error: 'Cloudinary not configured' });
    return;
  }

  const folder = (req.body as { folder?: string }).folder || 'uploads';
  const timestamp = Math.floor(Date.now() / 1000);

  const signature = cloudinary.utils.api_sign_request(
    { folder, timestamp },
    apiSecret,
  );

  res.json({
    success: true,
    data: { signature, timestamp, apiKey, cloudName, folder },
  });
});
/**
 * Task 8.1: POST /api/upload/generate-signature
 * Generate Cloudinary signature for direct client upload
 * Request: { type: 'image' | 'video' | 'document' }
 * Response: { timestamp, signature, cloudName, apiKey, folder, publicIdPrefix }
 */
uploadRouter.post('/generate-signature', uploadRateLimiter, (req, res) => {
  void UploadController.generateSignatureHandler(req, res);
});

/**
 * Task 8.1: POST /api/upload/verify
 * Verify Cloudinary upload was successful
 * Request: { publicId: string }
 * Response: { url, secureUrl, size }
 */
uploadRouter.post('/verify', uploadRateLimiter, (req, res) => {
  void UploadController.verifyUploadHandler(req, res);
});

/**
 * Task 8.2: DELETE /api/upload/:publicId
 * Delete uploaded file from Cloudinary
 */
uploadRouter.delete('/:publicId', uploadRateLimiter, (req, res) => {
  void UploadController.deleteUploadHandler(req, res);
});
