-- AlterTable
ALTER TABLE "Article" ADD COLUMN     "draftOfId" TEXT;

-- AddForeignKey
ALTER TABLE "Article" ADD CONSTRAINT "Article_draftOfId_fkey" FOREIGN KEY ("draftOfId") REFERENCES "Article"("id") ON DELETE SET NULL ON UPDATE CASCADE;
