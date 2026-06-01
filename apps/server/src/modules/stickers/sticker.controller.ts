import { type Request, type Response, type NextFunction } from 'express';
import { stickerService } from './sticker.service';
import { logger } from '../../shared/logger';

export class StickerController {
  /**
   * GET /api/stickers - Get all sticker packs
   */
  async getAllPacks(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const packs = await stickerService.getAllStickerPacks();
      res.json({
        success: true,
        data: packs,
      });
    } catch (error) {
      logger.error('Error getting sticker packs:', error);
      next(error);
    }
  }

  /**
   * GET /api/stickers/:packId - Get sticker pack by ID
   */
  async getPackById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { packId } = req.params;
      const pack = await stickerService.getStickerPackById(packId);

      if (!pack) {
        res.status(404).json({
          success: false,
          error: 'Sticker pack not found',
        });
        return;
      }

      res.json({
        success: true,
        data: pack,
      });
    } catch (error) {
      logger.error('Error getting sticker pack:', error);
      next(error);
    }
  }

  /**
   * GET /api/stickers/:packId/:stickerId - Get sticker by ID
   */
  async getStickerById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { packId, stickerId } = req.params;
      const sticker = await stickerService.getStickerById(packId, stickerId);

      if (!sticker) {
        res.status(404).json({
          success: false,
          error: 'Sticker not found',
        });
        return;
      }

      res.json({
        success: true,
        data: sticker,
      });
    } catch (error) {
      logger.error('Error getting sticker:', error);
      next(error);
    }
  }

  /**
   * POST /api/stickers - Create sticker pack (admin only)
   */
  async createPack(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const packData = req.body;

      // Validate required fields
      if (!packData.packId || !packData.packName || !Array.isArray(packData.stickers)) {
        res.status(400).json({
          success: false,
          error: 'Missing required fields: packId, packName, stickers',
        });
        return;
      }

      const pack = await stickerService.createStickerPack(packData);
      res.status(201).json({
        success: true,
        data: pack,
      });
    } catch (error) {
      logger.error('Error creating sticker pack:', error);
      next(error);
    }
  }
}

export const stickerController = new StickerController();
