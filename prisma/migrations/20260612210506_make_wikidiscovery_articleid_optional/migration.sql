-- Drop the foreign key constraint first
ALTER TABLE "WikiDiscovery" DROP CONSTRAINT "WikiDiscovery_articleId_fkey";

-- Drop the unique constraint
ALTER TABLE "WikiDiscovery" DROP CONSTRAINT IF EXISTS "WikiDiscovery_articleId_term_key";

-- Drop the unique index that was left behind by Prisma
DROP INDEX IF EXISTS "WikiDiscovery_articleId_term_key";

-- Make articleId nullable
ALTER TABLE "WikiDiscovery" ALTER COLUMN "articleId" DROP NOT NULL;

-- Re-create foreign key with ON DELETE SET NULL
ALTER TABLE "WikiDiscovery" ADD CONSTRAINT "WikiDiscovery_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"(id) ON DELETE SET NULL;

-- Create an index for (articleId, term) pair
CREATE INDEX IF NOT EXISTS "WikiDiscovery_articleId_term_idx" ON "WikiDiscovery" ("articleId", "term");
