"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateEnv = validateEnv;
const zod_1 = require("zod");
const baseSchema = zod_1.z.object({
    NODE_ENV: zod_1.z.enum(['development', 'test', 'production']).default('development'),
    PORT: zod_1.z.coerce.number().int().positive().optional(),
    DATABASE_URL: zod_1.z.string().url({ message: 'DATABASE_URL must be a valid URL' }),
    API_PREFIX: zod_1.z.string().optional().refine((v) => !v || v === 'api', { message: 'API_PREFIX must be "api"' }),
    ENFORCE_HTTPS: zod_1.z.enum(['true', 'false']).optional(),
    JWT_ACCESS_SECRET: zod_1.z.string().min(10, 'JWT_ACCESS_SECRET is required'),
    JWT_REFRESH_SECRET: zod_1.z.string().min(10, 'JWT_REFRESH_SECRET is required'),
    JWT_ACCESS_TTL: zod_1.z.coerce.number().int().positive().default(900),
    JWT_REFRESH_TTL: zod_1.z.coerce.number().int().positive().default(1209600),
    RATE_LIMIT_TTL: zod_1.z.coerce.number().int().positive().default(60),
    RATE_LIMIT_MAX: zod_1.z.coerce.number().int().positive().default(100),
    AUTH_BRUTE_TTL: zod_1.z.coerce.number().int().positive().default(300),
    AUTH_BRUTE_MAX: zod_1.z.coerce.number().int().positive().default(5),
    REDIS_ENABLED: zod_1.z.enum(['true', 'false']).optional(),
    REDIS_URL: zod_1.z.string().url().optional(),
    CACHE_DEFAULT_TTL: zod_1.z.coerce.number().int().nonnegative().default(60),
    CATEGORIES_CACHE_TTL: zod_1.z.coerce.number().int().nonnegative().optional(),
    PRODUCT_LIST_CACHE_TTL: zod_1.z.coerce.number().int().nonnegative().optional(),
    HOME_CACHE_TTL: zod_1.z.coerce.number().int().nonnegative().optional(),
    BULK_PRODUCT_BATCH_SIZE: zod_1.z.coerce.number().int().positive().optional(),
    ALLOWED_ORIGINS: zod_1.z.string().optional(),
    CORS_ALLOWED_ORIGINS: zod_1.z.string().optional(),
    CORS_DEV_ORIGINS: zod_1.z.string().optional(),
    CORS_ALLOW_LOCALHOST: zod_1.z.enum(['true', 'false']).optional(),
    LOG_LEVEL: zod_1.z.string().optional(),
    SWAGGER_ENABLED: zod_1.z.string().optional(),
    SWAGGER_BASIC_USER: zod_1.z.string().optional(),
    SWAGGER_BASIC_PASS: zod_1.z.string().optional(),
    UPLOADS_DRIVER: zod_1.z.enum(['s3', 'local', 'inline']).default('s3'),
    UPLOADS_DIR: zod_1.z.string().default('uploads'),
    UPLOAD_ALLOWED_MIME: zod_1.z.string().optional(),
    UPLOAD_MAX_BYTES: zod_1.z.coerce.number().int().positive().optional(),
    LOCAL_UPLOADS_BASE_URL: zod_1.z.string().optional(),
    S3_BUCKET: zod_1.z.string().optional(),
    S3_ENDPOINT: zod_1.z.string().optional(),
    S3_REGION: zod_1.z.string().optional(),
    S3_PUBLIC_BASE_URL: zod_1.z.string().optional(),
    S3_FORCE_PATH_STYLE: zod_1.z.string().optional(),
    S3_SSE: zod_1.z.string().optional(),
    S3_ACCESS_KEY: zod_1.z.string().optional(),
    S3_ACCESS_KEY_ID: zod_1.z.string().optional(),
    S3_SECRET_KEY: zod_1.z.string().optional(),
    S3_SECRET_ACCESS_KEY: zod_1.z.string().optional(),
    SENTRY_DSN: zod_1.z.string().optional(),
    SENTRY_TRACES_SAMPLE_RATE: zod_1.z.coerce.number().optional(),
    SENTRY_PROFILES_SAMPLE_RATE: zod_1.z.coerce.number().optional(),
});
function validateEnv(config) {
    const parsed = baseSchema.superRefine((env, ctx) => {
        if (env.UPLOADS_DRIVER === 's3') {
            const accessKey = env.S3_ACCESS_KEY || env.S3_ACCESS_KEY_ID;
            const secretKey = env.S3_SECRET_KEY || env.S3_SECRET_ACCESS_KEY;
            if (!env.S3_BUCKET) {
                ctx.addIssue({ code: 'custom', message: 'S3_BUCKET is required when using s3 uploads' });
            }
            if (!env.S3_REGION && !env.S3_ENDPOINT) {
                ctx.addIssue({
                    code: 'custom',
                    message: 'S3_REGION is required when no S3_ENDPOINT is configured',
                });
            }
            if (!accessKey || !secretKey) {
                ctx.addIssue({
                    code: 'custom',
                    message: 'S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY are required when using s3 uploads',
                });
            }
        }
        if (env.UPLOADS_DRIVER === 'local' && !env.LOCAL_UPLOADS_BASE_URL) {
            ctx.addIssue({
                code: 'custom',
                message: 'LOCAL_UPLOADS_BASE_URL is required when using local uploads',
            });
        }
    }).safeParse(config);
    if (!parsed.success) {
        const formatted = parsed.error.errors.map((err) => `${err.path.join('.')}: ${err.message}`).join('; ');
        throw new Error(`Invalid environment configuration: ${formatted}`);
    }
    return parsed.data;
}
//# sourceMappingURL=env.validation.js.map