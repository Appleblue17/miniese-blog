-- DropForeignKey
ALTER TABLE "WikiDiscovery" DROP CONSTRAINT "WikiDiscovery_articleId_fkey";

-- AlterTable
ALTER TABLE "WikiEntry" ADD COLUMN     "type" TEXT NOT NULL DEFAULT 'concept';

-- CreateIndex
CREATE INDEX "WikiDiscovery_articleId_term_idx" ON "WikiDiscovery"("articleId", "term");

-- AddForeignKey
ALTER TABLE "WikiDiscovery" ADD CONSTRAINT "WikiDiscovery_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE SET NULL ON UPDATE CASCADE;
