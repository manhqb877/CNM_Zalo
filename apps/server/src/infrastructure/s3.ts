import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { logger } from '../shared/logger';

let _s3Client: S3Client | null = null;

/** Trả về S3Client đã được khởi tạo (singleton) */
export function getS3Client(): S3Client {
  if (_s3Client) return _s3Client;

  const region = process.env['AWS_REGION'];
  const accessKeyId = process.env['AWS_ACCESS_KEY_ID'];
  const secretAccessKey = process.env['AWS_SECRET_ACCESS_KEY'];

  if (!region || !accessKeyId || !secretAccessKey) {
    throw new Error(
      'AWS S3 không được cấu hình. Vui lòng đặt AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY và AWS_REGION trong file .env',
    );
  }

  _s3Client = new S3Client({
    region,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });

  logger.info(`[S3] Client initialized (region: ${region})`);
  return _s3Client;
}

export function getS3Bucket(): string {
  const bucket = process.env['AWS_S3_BUCKET'];
  if (!bucket) throw new Error('AWS_S3_BUCKET chưa được cấu hình trong .env');
  return bucket;
}

/** Xây URL public của object trên S3 */
export function buildS3Url(key: string): string {
  const publicUrl = process.env['AWS_S3_PUBLIC_URL'];
  const bucket = getS3Bucket();
  const region = process.env['AWS_REGION'] ?? 'us-east-1';

  if (publicUrl) {
    return `${publicUrl.replace(/\/$/, '')}/${key}`;
  }
  // Fallback: URL S3 chuẩn
  return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
}

export interface UploadToS3Options {
  key: string;         // S3 object key (path in bucket)
  body: Buffer;        // File content
  contentType: string; // MIME type
  cacheControl?: string;
}

/** Upload file lên S3 và trả về public URL */
export async function uploadToS3(opts: UploadToS3Options): Promise<string> {
  const s3 = getS3Client();
  const bucket = getS3Bucket();

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: opts.key,
    Body: opts.body,
    ContentType: opts.contentType,
    CacheControl: opts.cacheControl ?? 'max-age=31536000, public',
  });

  await s3.send(command);
  const url = buildS3Url(opts.key);
  logger.info(`[S3] Uploaded: ${opts.key} → ${url}`);
  return url;
}

/** Xóa object khỏi S3 theo key */
export async function deleteFromS3(key: string): Promise<void> {
  const s3 = getS3Client();
  const bucket = getS3Bucket();

  const command = new DeleteObjectCommand({ Bucket: bucket, Key: key });
  await s3.send(command);
  logger.info(`[S3] Deleted: ${key}`);
}

/** Trích xuất S3 key từ URL đầy đủ */
export function extractS3KeyFromUrl(url: string): string | null {
  try {
    const bucket = getS3Bucket();
    const region = process.env['AWS_REGION'] ?? 'us-east-1';
    const patterns = [
      // https://bucket.s3.region.amazonaws.com/key
      new RegExp(`https://${bucket}\\.s3\\.${region}\\.amazonaws\\.com/(.+)`),
      // Custom public URL
      process.env['AWS_S3_PUBLIC_URL']
        ? new RegExp(`${process.env['AWS_S3_PUBLIC_URL'].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/(.+)`)
        : null,
    ].filter(Boolean) as RegExp[];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match?.[1]) return decodeURIComponent(match[1]);
    }
    return null;
  } catch {
    return null;
  }
}
