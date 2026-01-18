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
  SIGNUP_SESSION_SECRET: z.string().min(10, 'SIGNUP_SESSION_SECRET is required').optional(),
  SIGNUP_SESSION_TTL_SECONDS: z.coerce.number().int().positive().optional(),
  SIGNUP_SESSION_TTL: z.coerce.number().int().positive().optional(),

  OTP_SECRET: z.string().optional(),
  OTP_ENABLED: z.enum(['true','false']).optional(),
  OTP_TTL_SECONDS: z.coerce.number().int().positive().optional(),
  OTP_TTL_MIN: z.coerce.number().int().positive().default(5),
  OTP_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  OTP_LOCK_MINUTES: z.coerce.number().int().positive().default(15),
  OTP_RATE_LIMIT_SECONDS: z.coerce.number().int().positive().default(60),
  OTP_TTL_SECONDS_TEST: z.coerce.number().int().positive().optional(),
  OTP_DAILY_LIMIT: z.coerce.number().int().positive().optional(),
  OTP_MAX_PER_DAY: z.coerce.number().int().positive().optional(),
  OTP_PER_IP_LIMIT: z.coerce.number().int().positive().default(20),
  RESET_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  PASSWORD_RESET_URL_BASE: z.string().optional(),

  RATE_LIMIT_TTL: z.coerce.number().int().positive().default(60),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
  AUTH_BRUTE_TTL: z.coerce.number().int().positive().default(300),
  AUTH_BRUTE_MAX: z.coerce.number().int().positive().default(5),
  AUTH_REQUIRE_ADMIN_2FA: z.enum(['true','false']).optional(),
  AUTH_ADMIN_STATIC_OTP: z.string().optional(),
  INTERNAL_SECRET: z.string().optional(),
  INTERNAL_TELEGRAM_SECRET: z.string().optional(),

  REDIS_ENABLED: z.enum(['true','false']).optional(),
  REDIS_URL: z.string().url().optional(),
  CACHE_DEFAULT_TTL: z.coerce.number().int().nonnegative().default(60),
  CATEGORIES_CACHE_TTL: z.coerce.number().int().nonnegative().optional(),
  PRODUCT_LIST_CACHE_TTL: z.coerce.number().int().nonnegative().optional(),
  HOME_CACHE_TTL: z.coerce.number().int().nonnegative().optional(),
  BULK_PRODUCT_BATCH_SIZE: z.coerce.number().int().positive().optional(),

  ALLOWED_ORIGINS: z.string().optional(),
  CORS_ALLOWED_ORIGINS: z.string().optional(),
  CORS_DEV_ORIGINS: z.string().optional(),
  CORS_ALLOW_LOCALHOST: z.enum(['true','false']).optional(),
  LOG_LEVEL: z.string().optional(),

  DELIVERY_DISTANCE_ENABLED: z.enum(['true','false']).optional(),
  GUEST_ORDERS_ENABLED: z.enum(['true','false']).optional(),
  ROUTING_BASE_URL: z.string().url().optional(),
  ROUTING_TIMEOUT_MS: z.coerce.number().int().positive().optional(),
  ROUTING_FALLBACK_SPEED_KPH: z.coerce.number().positive().optional(),

  CLICKHOUSE_URL: z.string().url().optional(),
  CLICKHOUSE_DB: z.string().optional(),
  CLICKHOUSE_USER: z.string().optional(),
  CLICKHOUSE_PASSWORD: z.string().optional(),
  CLICKHOUSE_TIMEOUT_MS: z.coerce.number().int().positive().optional(),

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

  AUTOMATION_WEBHOOK_URL: z.string().url().optional(),
  AUTOMATION_HMAC_SECRET: z.string().optional(),
  AUTOMATION_WEBHOOK_SECRET: z.string().optional(),
  TELEGRAM_OTP_WEBHOOK_URL: z.string().url().optional(),
  TELEGRAM_OTP_WEBHOOK_SECRET: z.string().optional(),
  TELEGRAM_BOT_USERNAME: z.string().optional(),
  TELEGRAM_LINK_TOKEN_TTL_MIN: z.coerce.number().int().positive().default(10),
  TELEGRAM_LINK_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().optional(),
  N8N_SEND_TELEGRAM_OTP_URL: z.string().url().optional(),
  N8N_SECRET: z.string().optional(),

  WHATSAPP_PROVIDER: z.enum(['mock', 'meta']).default('mock'),
  WHATSAPP_ENABLED: z.enum(['true','false']).optional(),
  WHATSAPP_ACCESS_TOKEN: z.string().optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_VERIFY_TOKEN: z.string().optional(),
  WHATSAPP_WEBHOOK_SECRET: z.string().optional(),
  WHATSAPP_API_VERSION: z.string().optional(),
  WHATSAPP_API_BASE_URL: z.string().url().optional(),
  WHATSAPP_DEFAULT_LANGUAGE: z.enum(['en', 'ar']).optional(),

  PUSH_PROVIDER: z.enum(['fcm', 'onesignal', 'apns', 'mock']).optional(),
  FCM_SERVER_KEY: z.string().optional(),
  ONESIGNAL_REST_KEY: z.string().optional(),
  ONESIGNAL_APP_ID: z.string().optional(),
  WEB_PUSH_PUBLIC_KEY: z.string().optional(),
  WEB_PUSH_PRIVATE_KEY: z.string().optional(),
  WEB_PUSH_SUBJECT: z.string().optional(),
  NOTIFICATION_BATCH_SIZE: z.coerce.number().int().positive().optional(),

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
    if (env.NODE_ENV === 'production' && !env.AUTOMATION_WEBHOOK_SECRET) {
      ctx.addIssue({
        code: 'custom',
        message: 'AUTOMATION_WEBHOOK_SECRET is required in production',
      });
    }
    if (env.WHATSAPP_PROVIDER === 'meta') {
      if (!env.WHATSAPP_ACCESS_TOKEN) {
        ctx.addIssue({ code: 'custom', message: 'WHATSAPP_ACCESS_TOKEN is required when WHATSAPP_PROVIDER=meta' });
      }
      if (!env.WHATSAPP_PHONE_NUMBER_ID) {
        ctx.addIssue({ code: 'custom', message: 'WHATSAPP_PHONE_NUMBER_ID is required when WHATSAPP_PROVIDER=meta' });
      }
    }
    // Internal secret is optional; guard will fall back to INTERNAL_TELEGRAM_SECRET or JWT_ACCESS_SECRET
  }).safeParse(config);

  if (!parsed.success) {
    const formatted = parsed.error.errors.map((err) => `${err.path.join('.')}: ${err.message}`).join('; ');
    throw new Error(`Invalid environment configuration: ${formatted}`);
  }

  return parsed.data;
}
