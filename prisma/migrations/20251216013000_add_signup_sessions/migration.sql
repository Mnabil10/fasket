CREATE TABLE IF NOT EXISTS "signup_sessions" (
    "id" TEXT PRIMARY KEY,
    "phone" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "full_name" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING_TELEGRAM',
    "telegram_chat_id" BIGINT,
    "telegram_user_id" BIGINT,
    "telegram_username" TEXT,
    "otp_hash" TEXT,
    "otp_expires_at" TIMESTAMPTZ,
    "otp_attempts" INTEGER NOT NULL DEFAULT 0,
    "request_id" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "expires_at" TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS "signup_sessions_status_idx" ON "signup_sessions"("status");
CREATE INDEX IF NOT EXISTS "signup_sessions_expires_at_idx" ON "signup_sessions"("expires_at");
