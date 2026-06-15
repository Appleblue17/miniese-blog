-- AlterTable
ALTER TABLE "Article" ADD COLUMN     "defaultImageAccessGroup" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "ArticleImageOverride" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "accessGroup" TEXT[],

    CONSTRAINT "ArticleImageOverride_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ArticleImageOverride_articleId_filename_key" ON "ArticleImageOverride"("articleId", "filename");

-- AddForeignKey
ALTER TABLE "ArticleImageOverride" ADD CONSTRAINT "ArticleImageOverride_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;
