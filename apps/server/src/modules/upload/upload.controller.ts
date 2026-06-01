import type { Request, Response } from 'express';
import type { AuthRequest } from '../../shared/middleware/auth.middleware';
import { UploadService } from './upload.service';
import { logger } from '../../shared/logger';

/**
 * Task 8.1: Upload Controller
 * Handle upload-related HTTP requests
 */
export class UploadController {
  /**
   * Task 8.1: POST /api/upload/generate-signature
   * Generate Cloudinary upload signature for direct client upload
   *
   * Request body: { type: 'image' | 'video' | 'document' }
   * Response: { timestamp, signature, cloudName, apiKey, folder, publicIdPrefix }
   */
  static async generateSignatureHandler(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req as AuthRequest;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const { type } = req.body as { type?: string };

      // Validate type
      if (!type || !['image', 'video', 'document'].includes(type)) {
        res.status(400).json({ error: 'Invalid type. Must be one of: image, video, document' });
        return;
      }

      // Task 8.1: Generate signature
      const signature = await UploadService.generateUploadSignature(
        userId,
        type as 'image' | 'video' | 'document',
      );

      logger.debug(`Generated upload signature for user ${userId}`);

      res.status(200).json(signature);
    } catch (err) {
      logger.error('Error generating upload signature', err);
      res.status(500).json({ error: 'Failed to generate signature' });
    }
  }

  /**
   * Task 8.1: POST /api/upload/verify
   * Verify Cloudinary upload was successful
   * Client sends publicId after successful upload
   *
   * Request body: { publicId: string, type: 'image' | 'video' }
   * Response: { url, secureUrl, size }
   */
  static async verifyUploadHandler(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req as AuthRequest
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const { publicId, type } = req.body as { publicId?: string; type?: string };

      // Validate publicId
      if (!publicId || typeof publicId !== 'string') {
        res.status(400).json({ error: 'Missing or invalid publicId' });
        return;
      }

      // Validate type
      if (!type || !['image', 'video', 'document'].includes(type)) {
        res.status(400).json({ error: 'Missing or invalid type' });
        return;
      }

      // Task 8.1: Verify upload
      const uploadInfo = await UploadService.verifyUploadResult(publicId, userId, type as 'image' | 'video' | 'document');

      if (!uploadInfo) {
        res.status(400).json({ error: 'Upload verification failed' });
        return;
      }

      logger.debug(`Verified upload for user ${userId}: ${publicId}`);

      res.status(200).json({
        url: uploadInfo.url,
        secureUrl: uploadInfo.secureUrl,
        size: uploadInfo.size,
      });
    } catch (err) {
      logger.error('Error verifying upload', err);
      res.status(500).json({ error: 'Failed to verify upload' });
    }
  }

  /**
   * Task 8.2: DELETE /api/upload/:publicId
   * Delete uploaded file from Cloudinary
   */
  static async deleteUploadHandler(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req as AuthRequest;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const { publicId } = req.params;

      if (!publicId) {
        res.status(400).json({ error: 'Missing publicId' });
        return;
      }

      const deleted = await UploadService.deleteUpload(publicId, userId);

      if (!deleted) {
        res.status(400).json({ error: 'Failed to delete upload' });
        return;
      }

      logger.debug(`Deleted upload for user ${userId}: ${publicId}`);

      res.status(200).json({ success: true });
    } catch (err) {
      logger.error('Error deleting upload', err);
      res.status(500).json({ error: 'Failed to delete upload' });
    }
  }
}
