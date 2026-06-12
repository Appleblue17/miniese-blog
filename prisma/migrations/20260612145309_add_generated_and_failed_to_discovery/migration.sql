-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "DiscoveryStatus" ADD VALUE 'generated';
ALTER TYPE "DiscoveryStatus" ADD VALUE 'failed';

-- DropForeignKey
ALTER TABLE "WikiDiscovery" DROP CONSTRAINT "WikiDiscovery_articleId_fkey";

-- AlterTable
ALTER TABLE "WikiDiscovery" ADD COLUMN     "failedReason" TEXT,
ADD COLUMN     "wikiEntryId" TEXT;

-- CreateIndex
CREATE INDEX "WikiDiscovery_articleId_term_idx" ON "WikiDiscovery"("articleId", "term");

-- AddForeignKey
ALTER TABLE "WikiDiscovery" ADD CONSTRAINT "WikiDiscovery_wikiEntryId_fkey" FOREIGN KEY ("wikiEntryId") REFERENCES "WikiEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WikiDiscovery" ADD CONSTRAINT "WikiDiscovery_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE SET NULL ON UPDATE CASCADE;
