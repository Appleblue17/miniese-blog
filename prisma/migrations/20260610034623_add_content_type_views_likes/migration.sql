-- CreateEnum
CREATE TYPE "ContentFormat" AS ENUM ('markdown', 'notesaw');

-- AlterTable
ALTER TABLE "Article" ADD COLUMN     "contentType" "ContentFormat" NOT NULL DEFAULT 'markdown',
ADD COLUMN     "likes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "viewCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "WikiEntry" ADD COLUMN     "contentType" "ContentFormat" NOT NULL DEFAULT 'markdown';
