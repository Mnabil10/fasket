import { S3Client } from '@aws-sdk/client-s3';

export function createS3Client() {
  // Allow running without S3 in local dev
  if ((process.env.UPLOADS_DRIVER || 's3').toLowerCase() === 'local') {
    return new S3Client({ region: 'us-east-1' });
  }

  const bucket = process.env.S3_BUCKET;
  const endpoint = process.env.S3_ENDPOINT || undefined;
  // If using custom S3-compatible endpoint (e.g., R2/MinIO), default region to 'auto'; otherwise require explicit region
  const region = process.env.S3_REGION || (endpoint ? 'auto' : undefined);
  const forcePathStyle = String(process.env.S3_FORCE_PATH_STYLE ?? (endpoint ? 'true' : 'false')) === 'true';

  const accessKeyId = process.env.S3_ACCESS_KEY;
  const secretAccessKey = process.env.S3_SECRET_KEY;

  if (!bucket) throw new Error('S3_BUCKET is required');
  if (!accessKeyId || !secretAccessKey) throw new Error('S3_ACCESS_KEY and S3_SECRET_KEY are required');
  if (!region) throw new Error('S3_REGION is required when S3_ENDPOINT is not set');

  return new S3Client({
    region,
    endpoint,
    forcePathStyle,
    credentials: { accessKeyId, secretAccessKey },
  });
}
