import { StickerPackModel, type IStickerPack } from './sticker.model';
import { logger } from '../../shared/logger';

const STICKER_CDN_DOMAIN = process.env['STICKER_CDN_URL'] || 'https://res.cloudinary.com/';

export class StickerService {
  async getAllStickerPacks(): Promise<IStickerPack[]> {
    try {
      const packs = await StickerPackModel.find().sort({ order: 1 }).lean();
      return packs as unknown as IStickerPack[];
    } catch (error) {
      logger.error('Error getting sticker packs:', error);
      throw error;
    }
  }

  async getStickerPackById(packId: string): Promise<IStickerPack | null> {
    try {
      const pack = await StickerPackModel.findOne({ packId }).lean();
      return (pack as unknown as IStickerPack) || null;
    } catch (error) {
      logger.error(`Error getting sticker pack ${packId}:`, error);
      throw error;
    }
  }

  async getStickerById(packId: string, stickerId: string) {
    try {
      const pack = await StickerPackModel.findOne({ packId }).lean();
      if (!pack) return null;
      return pack.stickers.find(s => s.stickerId === stickerId) || null;
    } catch (error) {
      logger.error(`Error getting sticker ${stickerId} from pack ${packId}:`, error);
      throw error;
    }
  }

  /**
   * Validate sticker URL (security)
   * Only allow URLs from configured CDN domain
   */
  validateStickerUrl(mediaUrl: string): boolean {
    if (!mediaUrl) return false;
    return mediaUrl.startsWith(STICKER_CDN_DOMAIN);
  }

  /**
   * Create sticker pack (admin only)
   */
  async createStickerPack(data: Omit<IStickerPack, '_id' | 'createdAt' | 'updatedAt'>): Promise<IStickerPack> {
    try {
      const pack = new StickerPackModel(data);
      await pack.save();
      return pack.toObject();
    } catch (error) {
      logger.error('Error creating sticker pack:', error);
      throw error;
    }
  }

  /**
   * Update sticker pack (admin only)
   */
  async updateStickerPack(packId: string, data: Partial<IStickerPack>) {
    try {
      const updated = await StickerPackModel.findOneAndUpdate({ packId }, data, { new: true }).lean();
      return updated;
    } catch (error) {
      logger.error(`Error updating sticker pack ${packId}:`, error);
      throw error;
    }
  }

  /**
   * Delete sticker pack (admin only)
   */
  async deleteStickerPack(packId: string): Promise<boolean> {
    try {
      const result = await StickerPackModel.deleteOne({ packId });
      return result.deletedCount > 0;
    } catch (error) {
      logger.error(`Error deleting sticker pack ${packId}:`, error);
      throw error;
    }
  }
}

export const stickerService = new StickerService();
