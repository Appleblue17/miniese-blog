/*
  Warnings:

  - You are about to drop the column `role` on the `User` table. All the data in the column will be lost.

*/
-- AlterEnum
ALTER TYPE "WikiStatus" ADD VALUE 'deleted';

-- DropForeignKey
ALTER TABLE "WikiDiscovery" DROP CONSTRAINT "WikiDiscovery_articleId_fkey";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "role",
ADD COLUMN     "roles" TEXT[] DEFAULT ARRAY['user']::TEXT[];

-- CreateIndex
CREATE INDEX "WikiDiscovery_articleId_term_idx" ON "WikiDiscovery"("articleId", "term");

-- AddForeignKey
ALTER TABLE "WikiDiscovery" ADD CONSTRAINT "WikiDiscovery_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE SET NULL ON UPDATE CASCADE;
