-- CreateEnum
CREATE TYPE "ArticleLanguage" AS ENUM ('zh', 'en');

-- CreateEnum
CREATE TYPE "ArticleStatus" AS ENUM ('draft', 'published', 'review');

-- CreateEnum
CREATE TYPE "AiTaskType" AS ENUM ('review', 'translate', 'generate', 'scan');

-- CreateEnum
CREATE TYPE "AiTaskStatus" AS ENUM ('pending', 'processing', 'completed', 'failed');

-- CreateTable
CREATE TABLE "Article" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "language" "ArticleLanguage" NOT NULL,
    "contentPath" TEXT NOT NULL,
    "summary" TEXT,
    "tags" TEXT[],
    "status" "ArticleStatus" NOT NULL DEFAULT 'draft',
    "accessGroup" TEXT[],
    "publishedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "changelog" TEXT,
    "renderedContent" TEXT,
    "author" TEXT NOT NULL DEFAULT '博主',

    CONSTRAINT "Article_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WikiEntry" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "aliases" TEXT[],
    "language" "ArticleLanguage" NOT NULL,
    "definition" TEXT NOT NULL,
    "contentPath" TEXT NOT NULL,
    "tags" TEXT[],
    "accessGroup" TEXT[],
    "isAIGenerated" BOOLEAN NOT NULL DEFAULT false,
    "isReviewed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WikiEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArticleWikiLink" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "wikiEntryId" TEXT NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArticleWikiLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiTask" (
    "id" TEXT NOT NULL,
    "type" "AiTaskType" NOT NULL,
    "status" "AiTaskStatus" NOT NULL DEFAULT 'pending',
    "input" JSONB NOT NULL,
    "output" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "AiTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Comment" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "isHidden" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Article_slug_language_key" ON "Article"("slug", "language");

-- CreateIndex
CREATE UNIQUE INDEX "ArticleWikiLink_articleId_wikiEntryId_key" ON "ArticleWikiLink"("articleId", "wikiEntryId");

-- AddForeignKey
ALTER TABLE "ArticleWikiLink" ADD CONSTRAINT "ArticleWikiLink_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleWikiLink" ADD CONSTRAINT "ArticleWikiLink_wikiEntryId_fkey" FOREIGN KEY ("wikiEntryId") REFERENCES "WikiEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;
