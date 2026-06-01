import { Schema, model, type Document } from 'mongoose';

export interface ISticker {
  stickerId: string;
  mediaUrl: string;
  alt?: string;
  category?: string;
}

export interface IStickerPack extends Document {
  packId: string;
  packName: string;
  packDescription?: string;
  stickers: ISticker[];
  icon?: string;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

const stickerSchema = new Schema<ISticker>({
  stickerId: { type: String, required: true },
  mediaUrl: { type: String, required: true },
  alt: String,
  category: String,
});

const stickerPackSchema = new Schema<IStickerPack>(
  {
    packId: { type: String, required: true, unique: true, index: true },
    packName: { type: String, required: true },
    packDescription: String,
    stickers: [stickerSchema],
    icon: String,
    order: { type: Number, default: 0, index: true },
  },
  { timestamps: true }
);

export const StickerPackModel = model<IStickerPack>('StickerPack', stickerPackSchema);
