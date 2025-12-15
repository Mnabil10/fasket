-- Telegram link status enum
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TelegramLinkStatus') THEN
        CREATE TYPE "TelegramLinkStatus" AS ENUM ('linked', 'blocked', 'unlinked');
    END IF;
END $$;

-- Telegram links table
CREATE TABLE IF NOT EXISTS "telegram_links" (
    "id" SERIAL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "phone_e164" TEXT NOT NULL,
    "telegram_chat_id" BIGINT NOT NULL,
    "telegram_user_id" BIGINT,
    "telegram_username" TEXT,
    "status" "TelegramLinkStatus" NOT NULL DEFAULT 'linked',
    "linked_at" TIMESTAMPTZ,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "last_otp_sent_at" TIMESTAMPTZ,
    "last_otp_attempts" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "telegram_links_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "telegram_links_user_id_key" ON "telegram_links"("user_id");
CREATE UNIQUE INDEX IF NOT EXISTS "telegram_links_phone_e164_key" ON "telegram_links"("phone_e164");
CREATE UNIQUE INDEX IF NOT EXISTS "telegram_links_telegram_chat_id_key" ON "telegram_links"("telegram_chat_id");
CREATE INDEX IF NOT EXISTS "telegram_links_status_idx" ON "telegram_links"("status");
CREATE INDEX IF NOT EXISTS "telegram_links_last_otp_sent_at_idx" ON "telegram_links"("last_otp_sent_at");
