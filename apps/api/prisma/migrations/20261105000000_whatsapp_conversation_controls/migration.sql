ALTER TABLE "Conversation"
ADD COLUMN "isPinned" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "isArchived" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "isMuted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "isStarred" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Message"
ADD COLUMN "isRead" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "Message"
ALTER COLUMN "isRead" SET DEFAULT false;

CREATE INDEX "Message_conversationId_isRead_idx" ON "Message"("conversationId", "isRead");
