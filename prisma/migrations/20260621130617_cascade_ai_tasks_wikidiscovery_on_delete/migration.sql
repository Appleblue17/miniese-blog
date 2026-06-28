-- DropForeignKey
ALTER TABLE "AiTask" DROP CONSTRAINT "AiTask_articleId_fkey";

-- DropForeignKey
ALTER TABLE "WikiDiscovery" DROP CONSTRAINT "WikiDiscovery_articleId_fkey";

-- AddForeignKey
ALTER TABLE "AiTask" ADD CONSTRAINT "AiTask_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WikiDiscovery" ADD CONSTRAINT "WikiDiscovery_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;
