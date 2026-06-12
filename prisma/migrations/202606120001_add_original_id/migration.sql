-- Add originalId field and unique constraint for translation binding

-- 1. Add the originalId column (nullable)
ALTER TABLE "Article" ADD COLUMN "originalId" TEXT;

-- 2. Add foreign key constraint referencing Article.id
ALTER TABLE "Article" ADD CONSTRAINT "Article_originalId_fkey" 
  FOREIGN KEY ("originalId") REFERENCES "Article"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 3. Add unique constraint on [originalId, language]
-- Note: PostgreSQL treats NULLs as distinct in unique constraints,
-- so multiple articles with originalId=null are allowed.
-- But for non-null originalId, each (originalId, language) pair must be unique.
CREATE UNIQUE INDEX "Article_originalId_language_key" ON "Article"("originalId", "language");
