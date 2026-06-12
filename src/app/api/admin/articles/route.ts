/**
 * @file GET /api/admin/articles
 *
 * Returns paginated published articles with their linked drafts and translations.
 * Also includes active AI tasks (pending/processing) for each article to prevent
 * duplicate submissions.
 * Query params: page (default 1), limit (default 15)
 *
 * Response: { articles: [...], translations: [...], drafts: [...], newDrafts: [...], pendingTasks: Record<string, string[]>, total, page, totalPages }
 */

import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/db";

async function getFileStats(contentPath: string) {
  try {
    const content = await readFile(path.join(process.cwd(), contentPath), "utf-8");
    return {
      charCount: content.length,
      lineCount: content.split("\n").length,
    };
  } catch {
    return { charCount: 0, lineCount: 0 };
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "15", 10)));

    // Get total count of published ORIGINAL articles (exclude translations)
    const total = await prisma.article.count({
      where: { status: "published", originalId: null },
    });

    // Get paginated published ORIGINAL articles (exclude translations)
    const publishedArticles = await prisma.article.findMany({
      where: { status: "published", originalId: null },
      orderBy: { publishedAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    });

    const linkedArticleIds = publishedArticles.map((a) => a.id);

    // Get all translation versions linked to the current page's articles
    const allTranslations = await prisma.article.findMany({
      where: {
        originalId: { in: linkedArticleIds },
      },
    });

    // Get ALL drafts (not paginated — they're linked to the current page's articles)
    const allDrafts = await prisma.article.findMany({
      where: { status: { in: ["draft", "review"] } },
    });

    const drafts = allDrafts.filter(
      (d) => d.draftOfId !== null && linkedArticleIds.includes(d.draftOfId),
    );
    const newDrafts = allDrafts.filter((d) => d.draftOfId === null);

    // Get active AI tasks (pending or processing) for all linked articles
    // to enable anti-duplicate protection on translate/generate buttons
    const allArticleIds = [...linkedArticleIds, ...allTranslations.map((t) => t.id)];
    const activeTasks = await prisma.aiTask.findMany({
      where: {
        articleId: { in: allArticleIds },
        status: { in: ["pending", "processing"] },
      },
      select: { articleId: true, type: true },
    });

    // Build a lookup map: articleId -> array of active task types
    const pendingTasks: Record<string, string[]> = {};
    for (const task of activeTasks) {
      if (!pendingTasks[task.articleId!]) {
        pendingTasks[task.articleId!] = [];
      }
      pendingTasks[task.articleId!].push(task.type);
    }

    // Gather file stats
    const articlesWithStats = await Promise.all(
      publishedArticles.map(async (a) => {
        const stats = await getFileStats(a.contentPath);
        return {
          id: a.id,
          slug: a.slug,
          title: a.title,
          language: a.language,
          status: a.status,
          contentPath: a.contentPath,
          summary: a.summary,
          tags: a.tags,
          author: a.author,
          publishedAt: a.publishedAt?.toISOString() || null,
          updatedAt: a.updatedAt.toISOString(),
          changelog: a.changelog,
          viewCount: a.viewCount,
          isAITranslated: a.isAITranslated,
          ...stats,
        };
      }),
    );

    const translationsWithStats = await Promise.all(
      allTranslations.map(async (t) => {
        const stats = await getFileStats(t.contentPath);
        return {
          id: t.id,
          slug: t.slug,
          title: t.title,
          language: t.language,
          status: t.status,
          contentPath: t.contentPath,
          updatedAt: t.updatedAt.toISOString(),
          originalId: t.originalId,
          isAITranslated: t.isAITranslated,
          ...stats,
        };
      }),
    );

    const draftsWithStats = await Promise.all(
      drafts.map(async (d) => {
        const stats = await getFileStats(d.contentPath);
        return {
          id: d.id,
          slug: d.slug,
          title: d.title,
          language: d.language,
          status: d.status,
          contentPath: d.contentPath,
          updatedAt: d.updatedAt.toISOString(),
          draftOfId: d.draftOfId,
          ...stats,
        };
      }),
    );

    const newDraftsWithStats = await Promise.all(
      newDrafts.map(async (d) => {
        const stats = await getFileStats(d.contentPath);
        return {
          id: d.id,
          slug: d.slug,
          title: d.title,
          language: d.language,
          status: d.status,
          contentPath: d.contentPath,
          updatedAt: d.updatedAt.toISOString(),
          ...stats,
        };
      }),
    );

    return NextResponse.json({
      articles: articlesWithStats,
      translations: translationsWithStats,
      drafts: draftsWithStats,
      newDrafts: newDraftsWithStats,
      pendingTasks,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error("Admin articles list error:", error);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
