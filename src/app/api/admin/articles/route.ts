/**
 * @file GET /api/admin/articles
 *
 * Returns paginated published articles with their linked drafts.
 * Query params: page (default 1), limit (default 15)
 *
 * Response: { articles: [...], drafts: [...], newDrafts: [...], total, page, totalPages }
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
    const limit = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get("limit") || "15", 10)),
    );

    // Get total count of published articles
    const total = await prisma.article.count({
      where: { status: "published" },
    });

    // Get paginated published articles
    const publishedArticles = await prisma.article.findMany({
      where: { status: "published" },
      orderBy: { publishedAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    });

    // Get ALL drafts (not paginated — they're linked to the current page's articles)
    const allDrafts = await prisma.article.findMany({
      where: { status: { in: ["draft", "review"] } },
    });

    const linkedArticleIds = publishedArticles.map((a) => a.id);
    const drafts = allDrafts.filter(
      (d) => d.draftOfId !== null && linkedArticleIds.includes(d.draftOfId),
    );
    const newDrafts = allDrafts.filter((d) => d.draftOfId === null);

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
      drafts: draftsWithStats,
      newDrafts: newDraftsWithStats,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error("Admin articles list error:", error);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 },
    );
  }
}
