ALTER TABLE "WhatsAppInstance" ADD COLUMN "ownerId" UUID;

CREATE UNIQUE INDEX "WhatsAppInstance_ownerId_key" ON "WhatsAppInstance"("ownerId");

ALTER TABLE "WhatsAppInstance"
ADD CONSTRAINT "WhatsAppInstance_ownerId_fkey"
FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
