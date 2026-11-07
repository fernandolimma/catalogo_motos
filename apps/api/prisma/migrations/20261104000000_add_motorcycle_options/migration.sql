CREATE TYPE "MotorcycleOptionType" AS ENUM ('GROUP', 'MODEL');

CREATE TABLE "MotorcycleOption" (
    "id" UUID NOT NULL,
    "type" "MotorcycleOptionType" NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MotorcycleOption_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MotorcycleOption_type_value_key" ON "MotorcycleOption"("type", "value");
CREATE INDEX "MotorcycleOption_type_value_idx" ON "MotorcycleOption"("type", "value");

INSERT INTO "MotorcycleOption" ("id", "type", "value")
SELECT gen_random_uuid(), 'GROUP'::"MotorcycleOptionType", TRIM("group")
FROM "Motorcycle"
WHERE "group" IS NOT NULL AND TRIM("group") <> ''
GROUP BY TRIM("group")
ON CONFLICT ("type", "value") DO NOTHING;

INSERT INTO "MotorcycleOption" ("id", "type", "value")
SELECT gen_random_uuid(), 'MODEL'::"MotorcycleOptionType", TRIM("model")
FROM "Motorcycle"
WHERE TRIM("model") <> ''
GROUP BY TRIM("model")
ON CONFLICT ("type", "value") DO NOTHING;
