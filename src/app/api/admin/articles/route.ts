/**
 * @file GET /api/admin/articles
 *
 * Returns all published articles with their linked drafts.
 * Used by the admin dashboard article list.
 *
 * Response: { articles: [...], drafts: [...], newDrafts: [...] }
 */

import { NextResponse } from "next/server";
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

export async function GET() {
  try {
    // Get all published articles
    const publishedArticles = await prisma.article.findMany({
      where: { status: "published" },
      orderBy: { publishedAt: "desc" },
    });

    // Get all draft/review articles, then split into linked vs new
    const allDrafts = await prisma.article.findMany({
      where: { status: { in: ["draft", "review"] } },
    });

    const drafts = allDrafts.filter((d) => d.draftOfId !== null);
    const newDrafts = allDrafts.filter((d) => d.draftOfId === null);

    // Gather file stats for all articles
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
    });
  } catch (error) {
    console.error("Admin articles list error:", error);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 },
    );
  }
}
