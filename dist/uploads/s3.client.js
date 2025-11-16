"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createS3Client = createS3Client;
const client_s3_1 = require("@aws-sdk/client-s3");
function createS3Client() {
    if ((process.env.UPLOADS_DRIVER || 's3').toLowerCase() === 'local') {
        return new client_s3_1.S3Client({ region: 'us-east-1' });
    }
    const bucket = process.env.S3_BUCKET;
    const endpoint = process.env.S3_ENDPOINT || undefined;
    const region = process.env.S3_REGION || (endpoint ? 'auto' : undefined);
    const forcePathStyle = String(process.env.S3_FORCE_PATH_STYLE ?? (endpoint ? 'true' : 'false')) === 'true';
    const accessKeyId = process.env.S3_ACCESS_KEY_ID || process.env.S3_ACCESS_KEY;
    const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY || process.env.S3_SECRET_KEY;
    if (!bucket)
        throw new Error('S3_BUCKET is required');
    if (!accessKeyId || !secretAccessKey) {
        throw new Error('S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY are required');
    }
    if (!region)
        throw new Error('S3_REGION is required when S3_ENDPOINT is not set');
    return new client_s3_1.S3Client({
        region,
        endpoint,
        forcePathStyle,
        credentials: { accessKeyId, secretAccessKey },
    });
}
//# sourceMappingURL=s3.client.js.map