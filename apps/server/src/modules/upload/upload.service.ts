import { v2 as cloudinary } from 'cloudinary';
import { logger } from '../../shared/logger';

/**
 * Task 8.2: Cloudinary Integration
 * Service to handle upload signature generation and verification
 */
export class UploadService {
  /**
   * Initialize Cloudinary with environment credentials
   */
  static initCloudinary(): void {
    const cloudName = process.env['CLOUDINARY_CLOUD_NAME'];
    const apiKey = process.env['CLOUDINARY_API_KEY'];
    const apiSecret = process.env['CLOUDINARY_API_SECRET'];

    if (!cloudName || !apiKey || !apiSecret) {
      logger.warn(
        'Cloudinary credentials not configured. Upload service will be limited. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET',
      );
      return;
    }

    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
    });

    logger.info('Cloudinary configured');
  }

  /**
   * Task 8.2: Generate upload signature for direct Cloudinary upload
   * Client uses signature to upload directly to Cloudinary CDN (bypassing server)
   *
   * @param userId User ID (used for folder organization)
   * @param type Media type (image, video, etc.)
   * @returns Signature params for Cloudinary widget
   */
  static async generateUploadSignature(
    userId: string,
    type: 'image' | 'video' | 'document',
  ): Promise<{
    timestamp: number;
    signature: string;
    cloudName: string;
    apiKey: string;
    folder: string;
    publicIdPrefix: string;
  }> {
    const cloudName = process.env['CLOUDINARY_CLOUD_NAME'];
    const apiKey = process.env['CLOUDINARY_API_KEY'];
    const apiSecret = process.env['CLOUDINARY_API_SECRET'];

    if (!cloudName || !apiKey || !apiSecret) {
      logger.error('Cloudinary credentials missing');
      throw new Error('Upload service not configured');
    }

    const timestamp = Math.floor(Date.now() / 1000);

    // Ky signature bang utility chinh thuc cua Cloudinary de tranh sai khac thu tu params.
    const paramsToSign = {
      folder: `zync/${type}s/${userId}`, // e.g., zync/images/user123
      timestamp,
    };

    const signature = cloudinary.utils.api_sign_request(paramsToSign, apiSecret);

    logger.debug(`Generated upload signature for user ${userId}`);

    return {
      timestamp,
      signature,
      cloudName,
      apiKey,
      folder: `zync/${type}s/${userId}`,
      publicIdPrefix: '',
    };
  }

  /**
   * Task 8.2: Verify upload result from Cloudinary webhook or client callback
   * Validate that the uploaded file exists and belongs to current user
   *
   * @param publicId Cloudinary public ID of uploaded file (includes folder path)
   * @param userId User ID (verify ownership)
   * @param type Media type (image or video)
   * @returns File metadata if verification succeeds
   */
  static async verifyUploadResult(
    publicId: string,
    userId: string,
    type: 'image' | 'video' | 'document',
  ): Promise<{
    publicId: string;
    url: string;
    secureUrl: string;
    type: string;
    size: number;
  } | null> {
    try {
      // Task 8.2: Verify publicId contains userId (ownership check)
      // publicId format: zync/images/userId/userId_timestamp
      if (!publicId.includes(userId)) {
        logger.warn(`Upload verification failed: publicId ${publicId} does not contain userId ${userId}`);
        return null;
      }

      // Fetch resource info from Cloudinary with correct resource_type
      // publicId already contains folder path, so pass it directly
      const resource = await cloudinary.api.resource(publicId, {
        resource_type: type === 'document' ? 'raw' : type,
      });

      if (!resource) {
        logger.warn(`Upload verification failed: resource ${publicId} not found in Cloudinary`);
        return null;
      }

      logger.info(`Verified upload for user ${userId}: ${publicId}`);

      return {
        publicId: resource.public_id,
        url: resource.url,
        secureUrl: resource.secure_url,
        type: resource.type, // 'upload', 'fetch', etc.
        size: resource.bytes,
      };
    } catch (err) {
      logger.error('Error verifying upload result', err);
      return null;
    }
  }

  /**
   * Task 8.2: Delete uploaded file from Cloudinary
   * Client can request deletion of uploaded media
   *
   * @param publicId Cloudinary public ID
   * @param userId User ID (verify ownership before delete)
   */
  static async deleteUpload(publicId: string, userId: string): Promise<boolean> {
    try {
      // Verify ownership
      if (!publicId.includes(`/${userId}/`) && !publicId.startsWith(`${userId}_`)) {
        logger.warn(`Delete failed: publicId ${publicId} does not belong to user ${userId}`);
        return false;
      }

      const result = await cloudinary.api.delete_resources([publicId]);
      logger.info(`Deleted upload: ${publicId} (user: ${userId})`);
      return result.deleted[publicId] === 'deleted';
    } catch (err) {
      logger.error('Error deleting upload', err);
      return false;
    }
  }
}
