-- Add unique constraint on (articleId, term) to prevent duplicate discoveries
-- First, clean up existing duplicates by keeping only the latest record for each (articleId, term) pair
DELETE FROM "WikiDiscovery" WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY "articleId", term ORDER BY "createdAt" DESC) AS rn
    FROM "WikiDiscovery"
  ) sub WHERE sub.rn > 1
);

-- Drop the old non-unique index
DROP INDEX IF EXISTS "WikiDiscovery_articleId_term_idx";

-- Create unique index
CREATE UNIQUE INDEX "WikiDiscovery_articleId_term_key" ON "WikiDiscovery" ("articleId", "term");
