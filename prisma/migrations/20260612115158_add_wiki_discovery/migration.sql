-- CreateEnum
CREATE TYPE "DiscoveryStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateTable
CREATE TABLE "WikiDiscovery" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "articleSlug" TEXT NOT NULL,
    "articleLang" "ArticleLanguage" NOT NULL,
    "term" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "definition" TEXT NOT NULL,
    "importance" DOUBLE PRECISION NOT NULL,
    "status" "DiscoveryStatus" NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),

    CONSTRAINT "WikiDiscovery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WikiDiscovery_status_idx" ON "WikiDiscovery"("status");

-- CreateIndex
CREATE INDEX "WikiDiscovery_articleId_idx" ON "WikiDiscovery"("articleId");

-- CreateIndex
CREATE UNIQUE INDEX "WikiDiscovery_articleId_term_key" ON "WikiDiscovery"("articleId", "term");

-- AddForeignKey
ALTER TABLE "WikiDiscovery" ADD CONSTRAINT "WikiDiscovery_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;
