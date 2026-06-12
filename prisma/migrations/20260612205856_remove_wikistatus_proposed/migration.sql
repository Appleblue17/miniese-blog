-- AlterEnum: Remove 'proposed' from WikiStatus
-- Step 1: Update any existing WikiEntry records with status 'proposed' to 'creating'
UPDATE "WikiEntry" SET status = 'creating' WHERE status = 'proposed';

-- Step 2: Create a new enum type without 'proposed'
CREATE TYPE "WikiStatus_new" AS ENUM ('creating', 'unreviewed', 'reviewed');

-- Step 3: Alter the table to use the new enum
ALTER TABLE "WikiEntry" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "WikiEntry" ALTER COLUMN "status" TYPE "WikiStatus_new" USING ("status"::text::"WikiStatus_new");
ALTER TABLE "WikiEntry" ALTER COLUMN "status" SET DEFAULT 'creating';

-- Step 4: Drop the old enum
DROP TYPE "WikiStatus";

-- Step 5: Rename the new enum to the original name
ALTER TYPE "WikiStatus_new" RENAME TO "WikiStatus";
