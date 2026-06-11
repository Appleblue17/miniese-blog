-- AlterTable
ALTER TABLE "AiTask" ADD COLUMN     "articleId" TEXT;

-- AddForeignKey
ALTER TABLE "AiTask" ADD CONSTRAINT "AiTask_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE SET NULL ON UPDATE CASCADE;
