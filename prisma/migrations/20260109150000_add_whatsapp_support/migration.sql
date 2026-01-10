-- WhatsApp + Support enums
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SupportChannel') THEN
        CREATE TYPE "SupportChannel" AS ENUM ('WHATSAPP');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SupportConversationStatus') THEN
        CREATE TYPE "SupportConversationStatus" AS ENUM ('OPEN', 'PENDING', 'RESOLVED');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SupportMessageDirection') THEN
        CREATE TYPE "SupportMessageDirection" AS ENUM ('INBOUND', 'OUTBOUND');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SupportMessageType') THEN
        CREATE TYPE "SupportMessageType" AS ENUM ('TEXT', 'TEMPLATE', 'DOCUMENT');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'WhatsAppProvider') THEN
        CREATE TYPE "WhatsAppProvider" AS ENUM ('MOCK', 'META');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'WhatsAppMessageDirection') THEN
        CREATE TYPE "WhatsAppMessageDirection" AS ENUM ('INBOUND', 'OUTBOUND');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'WhatsAppMessageStatus') THEN
        CREATE TYPE "WhatsAppMessageStatus" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'RECEIVED');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'WhatsAppMessageType') THEN
        CREATE TYPE "WhatsAppMessageType" AS ENUM ('TEXT', 'TEMPLATE', 'DOCUMENT');
    END IF;
END $$;

-- Support conversations
CREATE TABLE IF NOT EXISTS "SupportConversation" (
    "id" TEXT NOT NULL,
    "channel" "SupportChannel" NOT NULL,
    "status" "SupportConversationStatus" NOT NULL DEFAULT 'OPEN',
    "phone" TEXT NOT NULL,
    "userId" TEXT,
    "assignedToId" TEXT,
    "lastMessageAt" TIMESTAMPTZ,
    "lastMessagePreview" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "SupportConversation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SupportConversation_channel_phone_key" ON "SupportConversation"("channel", "phone");
CREATE INDEX IF NOT EXISTS "SupportConversation_status_updatedAt_idx" ON "SupportConversation"("status", "updatedAt");
CREATE INDEX IF NOT EXISTS "SupportConversation_phone_idx" ON "SupportConversation"("phone");
CREATE INDEX IF NOT EXISTS "SupportConversation_userId_idx" ON "SupportConversation"("userId");
CREATE INDEX IF NOT EXISTS "SupportConversation_assignedToId_idx" ON "SupportConversation"("assignedToId");

ALTER TABLE "SupportConversation" ADD CONSTRAINT "SupportConversation_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SupportConversation" ADD CONSTRAINT "SupportConversation_assignedToId_fkey"
  FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Support messages
CREATE TABLE IF NOT EXISTS "SupportMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "direction" "SupportMessageDirection" NOT NULL,
    "messageType" "SupportMessageType" NOT NULL,
    "body" TEXT,
    "externalId" TEXT,
    "metadata" JSONB,
    "agentId" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "SupportMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SupportMessage_conversationId_createdAt_idx" ON "SupportMessage"("conversationId", "createdAt");
CREATE INDEX IF NOT EXISTS "SupportMessage_externalId_idx" ON "SupportMessage"("externalId");

ALTER TABLE "SupportMessage" ADD CONSTRAINT "SupportMessage_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "SupportConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupportMessage" ADD CONSTRAINT "SupportMessage_agentId_fkey"
  FOREIGN KEY ("agentId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- WhatsApp message logs
CREATE TABLE IF NOT EXISTS "WhatsAppMessageLog" (
    "id" TEXT NOT NULL,
    "provider" "WhatsAppProvider" NOT NULL,
    "direction" "WhatsAppMessageDirection" NOT NULL,
    "type" "WhatsAppMessageType" NOT NULL,
    "status" "WhatsAppMessageStatus" NOT NULL,
    "toPhone" TEXT,
    "fromPhone" TEXT,
    "templateName" TEXT,
    "templateLanguage" VARCHAR(8),
    "body" TEXT,
    "mediaUrl" TEXT,
    "providerMessageId" TEXT,
    "supportConversationId" TEXT,
    "supportMessageId" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "payload" JSONB,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "WhatsAppMessageLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "WhatsAppMessageLog_providerMessageId_key" ON "WhatsAppMessageLog"("providerMessageId");
CREATE INDEX IF NOT EXISTS "WhatsAppMessageLog_status_updatedAt_idx" ON "WhatsAppMessageLog"("status", "updatedAt");
CREATE INDEX IF NOT EXISTS "WhatsAppMessageLog_supportConversationId_idx" ON "WhatsAppMessageLog"("supportConversationId");
CREATE INDEX IF NOT EXISTS "WhatsAppMessageLog_supportMessageId_idx" ON "WhatsAppMessageLog"("supportMessageId");

ALTER TABLE "WhatsAppMessageLog" ADD CONSTRAINT "WhatsAppMessageLog_supportConversationId_fkey"
  FOREIGN KEY ("supportConversationId") REFERENCES "SupportConversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WhatsAppMessageLog" ADD CONSTRAINT "WhatsAppMessageLog_supportMessageId_fkey"
  FOREIGN KEY ("supportMessageId") REFERENCES "SupportMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
