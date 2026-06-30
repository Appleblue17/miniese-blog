/**
 * @file POST /api/admin/articles/render-all
 *
 * Batch re-render all published articles (with wiki link detection).
 * Processes articles sequentially, tracking progress and errors.
 * Only processes articles with status "published".
 *
 * NOTE: Does not process translations (they share links with originals,
 * and re-rendering the original is sufficient; translations are already
 * in sync from their own render at publish/translate time).
 *
 * Request body (optional):
 *   { articleIds?: string[], olderThanDays?: number }
 *   - If provided, only re-render the specified articles.
 *   - If olderThanDays provided, only re-render articles whose last link detection
 *     is older than the specified number of days (or never detected).
 *   - If omitted, re-render ALL published original articles.
 *
 * Response:
 *   { total: number, succeeded: number, failed: number, errors: Array<{id, slug, error}>, linkUpdatedCount: number }
 */

import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/db";
import { renderMarkdown } from "@/lib/markdown/renderer";
import { detectWikiLinks, syncArticleWikiLinks } from "@/lib/markdown/linkDetector";
import { parseFrontmatter } from "@/lib/articles/frontmatter";
import type { ContentType } from "@/lib/markdown/renderer";

export async function POST(request: NextRequest) {
  try {
    let articleIds: string[] | undefined;
    let olderThanDays: number | undefined;

    // Parse optional body
    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      try {
        const body = await request.json();
        if (Array.isArray(body.articleIds)) {
          articleIds = body.articleIds;
        }
        if (typeof body.olderThanDays === "number") {
          olderThanDays = body.olderThanDays;
        }
      } catch {
        // No body or invalid JSON — process all
      }
    }

    // Fetch articles to re-render
    const where: Record<string, unknown> = { status: "published", originalId: null };
    if (articleIds && articleIds.length > 0) {
      where.id = { in: articleIds };
    }

    let articles = await prisma.article.findMany({
      where,
      select: {
        id: true,
        slug: true,
        title: true,
        language: true,
        contentPath: true,
        contentType: true,
      },
    });

    // If olderThanDays is specified, filter to articles whose last link
    // detection is older than that (or never detected).
    if (olderThanDays !== undefined && olderThanDays > 0) {
      const linkRecords = await prisma.articleWikiLink.groupBy({
        by: ["articleId"],
        _max: { detectedAt: true },
        where: { articleId: { in: articles.map((a) => a.id) } },
      });
      const lastDetectedMap = new Map(
        linkRecords.map((r) => [r.articleId, r._max.detectedAt]),
      );
      const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
      articles = articles.filter((a) => {
        const lastDetected = lastDetectedMap.get(a.id);
        return !lastDetected || lastDetected < cutoff;
      });
    }

    let succeeded = 0;
    let failed = 0;
    let linkUpdatedCount = 0;
    const errors: Array<{ id: string; slug: string; error: string }> = [];

    for (const article of articles) {
      try {
        // Read source file
        const filePath = path.join(process.cwd(), article.contentPath);
        const rawContent = await readFile(filePath, "utf-8");

        // Parse frontmatter and re-render
        const { content: mdBody } = parseFrontmatter(rawContent);
        const pipeline: ContentType = (article.contentType as ContentType) || "markdown";

        const linkedContent = await detectWikiLinks({
          lang: article.language,
          content: mdBody,
        });
        const html = await renderMarkdown(linkedContent, pipeline);

        // Update DB
        await prisma.article.update({
          where: { id: article.id },
          data: { renderedContent: html },
        });

        // Sync ArticleWikiLink records
        await syncArticleWikiLinks(article.id, article.language, html);

        succeeded++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push({ id: article.id, slug: article.slug, error: msg });
        failed++;
      }
    }

    // Count total wiki links across all articles (for reference)
    if (succeeded > 0) {
      const linkCount = await prisma.articleWikiLink.count({
        where: {
          articleId: { in: articles.map((a) => a.id) },
        },
      });
      linkUpdatedCount = linkCount;
    }

    return NextResponse.json({
      total: articles.length,
      succeeded,
      failed,
      errors: errors.length > 0 ? errors : undefined,
      linkUpdatedCount,
    });
  } catch (error) {
    console.error("Batch render error:", error);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
