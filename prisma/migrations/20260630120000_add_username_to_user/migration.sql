-- Add username column (nullable first, then fill data, then make non-null)
ALTER TABLE "User" ADD COLUMN "username" TEXT;

-- Fill username from email (part before @), handle conflicts by appending a counter
UPDATE "User" SET "username" = "subquery"."new_username"
FROM (
  SELECT
    "id",
    CASE
      WHEN COUNT(*) OVER (PARTITION BY SPLIT_PART("email", '@', 1)) > 1
      THEN SPLIT_PART("email", '@', 1) || '_' || ROW_NUMBER() OVER (PARTITION BY SPLIT_PART("email", '@', 1) ORDER BY "id")
      ELSE SPLIT_PART("email", '@', 1)
    END AS "new_username"
  FROM "User"
) AS "subquery"
WHERE "User"."id" = "subquery"."id";

-- Make username non-null and unique
ALTER TABLE "User" ALTER COLUMN "username" SET NOT NULL;
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- Make email optional
ALTER TABLE "User" ALTER COLUMN "email" DROP NOT NULL;
