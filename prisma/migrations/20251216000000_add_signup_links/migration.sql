-- Signup links table for stateless signup sessions
CREATE TABLE IF NOT EXISTS "signup_links" (
    "session_key" TEXT PRIMARY KEY,
    "telegram_chat_id" BIGINT NOT NULL,
    "telegram_user_id" BIGINT,
    "telegram_username" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "expires_at" TIMESTAMPTZ NOT NULL,
    "otp_hash" TEXT,
    "otp_expires_at" TIMESTAMPTZ,
    "otp_attempts" INTEGER NOT NULL DEFAULT 0,
    "request_id" TEXT
);

CREATE INDEX IF NOT EXISTS "signup_links_expires_at_idx" ON "signup_links"("expires_at");
