import { Router } from 'express';
import { stickerController } from './sticker.controller';

export const stickersRouter = Router();

// Public routes
stickersRouter.get('/', (req, res, next) => stickerController.getAllPacks(req, res, next));
stickersRouter.get('/:packId', (req, res, next) => stickerController.getPackById(req, res, next));
stickersRouter.get('/:packId/:stickerId', (req, res, next) => stickerController.getStickerById(req, res, next));

// Admin routes (authentication middleware can be added here later)
stickersRouter.post('/', (req, res, next) => stickerController.createPack(req, res, next));
