import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

import mongoose from 'mongoose';
import { connectDatabase } from '../src/infrastructure/database';
import { StickerPackModel } from '../src/modules/stickers/sticker.model';

const CDN_URL = process.env.STICKER_CDN_URL || 'https://res.cloudinary.com/dfzp860lh/image/upload/';

const stickerPacks = [
  {
    packId: 'trả-lời-nhanh',
    packName: 'Trả lời nhanh',
    packDescription: 'Sticker trả lời nhanh cho mọi tình huống',
    order: 1,
    stickers: [
      {
        stickerId: 'quick-1',
        mediaUrl: `${CDN_URL}v1776575279/zapynoel_thumb_l35beo.png`,
        alt: 'Tuyệt vời!',
        category: 'quick',
      },
      {
        stickerId: 'quick-2',
        mediaUrl: `${CDN_URL}v1776575335/webpc_ah8lie.png`,
        alt: 'Ok!',
        category: 'quick',
      },
      {
        stickerId: 'quick-3',
        mediaUrl: `${CDN_URL}v1776575409/cotsongzookiz_thumb_e2tg3f.png`,
        alt: 'Burn out!',
        category: 'quick',
      },
    ],
    icon: 'https://res.cloudinary.com/stickers/quick/icon.png',
  },
  {
    packId: 'thỏ',
    packName: 'Thỏ',
    packDescription: 'Sticker thỏ dễ thương',
    order: 2,
    stickers: [
      {
        stickerId: 'owl-1',
        mediaUrl: `${CDN_URL}v1776575531/webpc_1_xpdzqn.png`,
        alt: 'Cú vui vẻ',
        category: 'owl',
      },
      {
        stickerId: 'owl-2',
        mediaUrl: `${CDN_URL}v1776575555/webpc_2_z2xtvf.png`,
        alt: 'Cú buồn',
        category: 'owl',
      },
      {
        stickerId: 'owl-3',
        mediaUrl: `${CDN_URL}v1776575602/webpc_3_lidlph.png`,
        alt: 'Cú tức giận',
        category: 'owl',
      },
    ],
    icon: 'https://res.cloudinary.com/stickers/owl/icon.png',
  },
];

async function seedStickers() {
  try {
    // Connect to database
    await connectDatabase();
    console.log('✓ Connected to database');

    // Delete existing stickers
    await StickerPackModel.deleteMany({});
    console.log('✓ Cleared existing sticker packs');

    // Insert new stickers
    const result = await StickerPackModel.insertMany(stickerPacks);
    console.log(`✅ Seeded ${result.length} sticker packs successfully`);

    // List seeded packs
    result.forEach(pack => {
      console.log(`   - ${pack.packName} (${pack.stickers.length} stickers)`);
    });

    return result;
  } catch (error) {
    console.error('❌ Error seeding stickers:', error);
    process.exitCode = 1;
  } finally {
    await mongoose.connection.close();
  }
}

void seedStickers();
