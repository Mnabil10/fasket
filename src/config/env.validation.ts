import { z } from 'zod';

const baseSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().optional(),
  DATABASE_URL: z.string().url({ message: 'DATABASE_URL must be a valid URL' }),
  API_PREFIX: z.string().optional().refine((v) => !v || v === 'api', { message: 'API_PREFIX must be "api"' }),
  ENFORCE_HTTPS: z.enum(['true','false']).optional(),

  JWT_ACCESS_SECRET: z.string().min(10, 'JWT_ACCESS_SECRET is required'),
  JWT_REFRESH_SECRET: z.string().min(10, 'JWT_REFRESH_SECRET is required'),
  JWT_ACCESS_TTL: z.coerce.number().int().positive().default(900),
  JWT_REFRESH_TTL: z.coerce.number().int().positive().default(1209600),

  RATE_LIMIT_TTL: z.coerce.number().int().positive().default(60),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
  AUTH_BRUTE_TTL: z.coerce.number().int().positive().default(300),
  AUTH_BRUTE_MAX: z.coerce.number().int().positive().default(5),

  REDIS_ENABLED: z.enum(['true','false']).optional(),
  REDIS_URL: z.string().url().optional(),
  CACHE_DEFAULT_TTL: z.coerce.number().int().nonnegative().default(60),
  CATEGORIES_CACHE_TTL: z.coerce.number().int().nonnegative().optional(),
  PRODUCT_LIST_CACHE_TTL: z.coerce.number().int().nonnegative().optional(),
  HOME_CACHE_TTL: z.coerce.number().int().nonnegative().optional(),
  BULK_PRODUCT_BATCH_SIZE: z.coerce.number().int().positive().optional(),

  ALLOWED_ORIGINS: z.string().optional(),
  CORS_ALLOWED_ORIGINS: z.string().optional(),
  LOG_LEVEL: z.string().optional(),

  SWAGGER_ENABLED: z.string().optional(),
  SWAGGER_BASIC_USER: z.string().optional(),
  SWAGGER_BASIC_PASS: z.string().optional(),

  UPLOADS_DRIVER: z.enum(['s3', 'local', 'inline']).default('s3'),
  UPLOADS_DIR: z.string().default('uploads'),
  UPLOAD_ALLOWED_MIME: z.string().optional(),
  UPLOAD_MAX_BYTES: z.coerce.number().int().positive().optional(),
  LOCAL_UPLOADS_BASE_URL: z.string().optional(),

  S3_BUCKET: z.string().optional(),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_PUBLIC_BASE_URL: z.string().optional(),
  S3_FORCE_PATH_STYLE: z.string().optional(),
  S3_SSE: z.string().optional(),
  S3_ACCESS_KEY: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),

  SENTRY_DSN: z.string().optional(),
  SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().optional(),
  SENTRY_PROFILES_SAMPLE_RATE: z.coerce.number().optional(),
});

export type EnvShape = z.infer<typeof baseSchema>;

export function validateEnv(config: Record<string, unknown>) {
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
