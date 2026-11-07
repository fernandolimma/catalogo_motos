ALTER TABLE "Message"
ADD COLUMN "mediaType" TEXT,
ADD COLUMN "mimeType" TEXT,
ADD COLUMN "fileName" TEXT,
ADD COLUMN "quotedContent" TEXT,
ADD COLUMN "reaction" TEXT,
ADD COLUMN "isDeleted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "providerPayload" JSONB;
