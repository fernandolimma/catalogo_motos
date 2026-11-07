INSERT INTO "MotorcycleOption" ("id", "type", "value")
SELECT gen_random_uuid(), 'CATEGORY'::"MotorcycleOptionType", TRIM("category")
FROM "Motorcycle"
WHERE "category" IS NOT NULL AND TRIM("category") <> ''
GROUP BY TRIM("category")
ON CONFLICT ("type", "value") DO NOTHING;

INSERT INTO "MotorcycleOption" ("id", "type", "value")
SELECT gen_random_uuid(), 'YEAR'::"MotorcycleOptionType", "year"::TEXT
FROM "Motorcycle"
GROUP BY "year"
ON CONFLICT ("type", "value") DO NOTHING;

INSERT INTO "MotorcycleOption" ("id", "type", "value")
SELECT gen_random_uuid(), 'VERSION'::"MotorcycleOptionType", TRIM("version")
FROM "Motorcycle"
WHERE "version" IS NOT NULL AND TRIM("version") <> ''
GROUP BY TRIM("version")
ON CONFLICT ("type", "value") DO NOTHING;
