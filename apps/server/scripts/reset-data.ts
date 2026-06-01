import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

import mongoose from 'mongoose';
import { v2 as cloudinary } from 'cloudinary';
import { connectDatabase } from '../src/infrastructure/database';
import { logger } from '../src/shared/logger';

const CLOUDINARY_PREFIX = 'zync/';

type CloudinaryResourceType = 'image' | 'video' | 'raw';

type CloudinaryResource = {
  public_id: string;
};

type CloudinaryResourcesResult = {
  resources?: CloudinaryResource[];
  next_cursor?: string;
};

function configureCloudinary(): boolean {
  const cloudName = process.env['CLOUDINARY_CLOUD_NAME'];
  const apiKey = process.env['CLOUDINARY_API_KEY'];
  const apiSecret = process.env['CLOUDINARY_API_SECRET'];

  if (!cloudName || !apiKey || !apiSecret) {
    logger.warn('Không có đủ cấu hình Cloudinary, sẽ bỏ qua bước xóa ảnh cũ');
    return false;
  }

  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
  });

  return true;
}

async function deleteCloudinaryResourcesByPrefix(
  prefix: string,
  resourceType: CloudinaryResourceType,
): Promise<number> {
  let nextCursor: string | undefined;
  let deletedCount = 0;

  do {
    const result = (await cloudinary.api.resources({
      type: 'upload',
      resource_type: resourceType,
      prefix,
      max_results: 500,
      next_cursor: nextCursor,
    })) as CloudinaryResourcesResult;

    const publicIds = (result.resources ?? [])
      .map((resource) => resource.public_id)
      .filter((publicId) => Boolean(publicId));

    if (publicIds.length > 0) {
      await cloudinary.api.delete_resources(publicIds, {
        type: 'upload',
        resource_type: resourceType,
      });
      deletedCount += publicIds.length;
    }

    nextCursor = result.next_cursor;
  } while (nextCursor);

  return deletedCount;
}

async function deleteCloudinaryFolderIfExists(folder: string): Promise<void> {
  try {
    await cloudinary.api.delete_folder(folder);
  } catch {
    // Bỏ qua lỗi folder chưa tồn tại hoặc vẫn còn tài nguyên con
  }
}

async function cleanupCloudinaryMedia(): Promise<void> {
  const isCloudinaryConfigured = configureCloudinary();
  if (!isCloudinaryConfigured) {
    return;
  }

  let deletedTotal = 0;
  for (const resourceType of ['image', 'video', 'raw'] as const) {
    const deleted = await deleteCloudinaryResourcesByPrefix(CLOUDINARY_PREFIX, resourceType);
    deletedTotal += deleted;
  }

  await deleteCloudinaryFolderIfExists('zync/images');
  await deleteCloudinaryFolderIfExists('zync/videos');
  await deleteCloudinaryFolderIfExists('zync/documents');
  await deleteCloudinaryFolderIfExists('zync');

  logger.info(`Đã xóa ${deletedTotal} ảnh/video/file cũ trên Cloudinary prefix "${CLOUDINARY_PREFIX}"`);
}

async function resetData(): Promise<void> {
  try {
    await connectDatabase();
    logger.info('Connected to DB for reset data');

    await cleanupCloudinaryMedia();

    const db = mongoose.connection.db;
    if (!db) {
      throw new Error('Không lấy được database connection hiện tại');
    }

    await db.dropDatabase();
    logger.info('Đã xóa toàn bộ dữ liệu cũ trong MongoDB');
  } catch (error) {
    logger.error('Reset data failed', error);
    process.exitCode = 1;
  } finally {
    await mongoose.connection.close();
  }
}

void resetData();
