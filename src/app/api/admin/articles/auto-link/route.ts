/**
 * @file POST /api/admin/articles/auto-link
 *
 * Auto-link endpoint — automatically re-renders published articles whose wiki
 * links are stale or missing. Designed to be called by an external cron service
 * (e.g. cron-job.org) every few hours.
 *
 * This respects the `features.autoLink` setting. If disabled, returns a 503
 * status so the cron caller knows the feature is off.
 *
 * Logic:
 * 1. Find all published original articles.
 * 2. For each, check the link-status logic:
 *    - No wiki entries exist → skip (no terms to link)
 *    - Never detected (`lastDetectedAt` is null) → needs re-render
 *    - Detected more than 7 days ago → needs re-render
 * 3. Re-render only those that need it.
 *
 * Response:
 *   { enabled: boolean, total: number, reRendered: number, skipped: number, errors: string[] }
 *
 * Query params:
 *   - `dryRun` (optional, boolean): If "true", only report what would be done without actually rendering.
 */

import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/db";
import { renderMarkdown } from "@/lib/markdown/renderer";
import { detectWikiLinks } from "@/lib/markdown/linkDetector";
import { parseFrontmatter } from "@/lib/articles/frontmatter";
import { getSettings } from "../../../../../../config/settings";
import type { ContentType } from "@/lib/markdown/renderer";

export async function POST(request: NextRequest) {
  try {
    // 1. Check feature flag
    const settings = await getSettings();
    const autoLinkCfg = settings.features?.autoLink;
    const autoLinkEnabled =
      typeof autoLinkCfg === "object" ? autoLinkCfg.enabled : Boolean(autoLinkCfg);
    if (!autoLinkEnabled) {
      return NextResponse.json(
        {
          enabled: false,
          message: 'Auto-link feature is disabled in settings.',
        },
        { status: 503 },
      );
    }

    // 2. Parse query params
    const url = new URL(request.url);
    const dryRun = url.searchParams.get("dryRun") === "true";

    // 3. Fetch all published original articles (not translations)
    const articles = await prisma.article.findMany({
      where: { status: "published", originalId: null },
      select: {
        id: true,
        slug: true,
        language: true,
        contentPath: true,
        contentType: true,
      },
    });

    // 4. Batch query link detection timestamps from ArticleWikiLink
    const linkRecords = await prisma.articleWikiLink.groupBy({
      by: ["articleId"],
      _max: { detectedAt: true },
      where: { articleId: { in: articles.map((a) => a.id) } },
    });
    const lastDetectedMap = new Map(
      linkRecords.map((r) => [r.articleId, r._max.detectedAt]),
    );

    // 5. Count wiki entries per language to know if there are any terms to link
    const wikiEntryCounts = await prisma.wikiEntry.groupBy({
      by: ["language"],
      where: { status: { not: "deleted" } },
      _count: { id: true },
    });
    const wikiCountByLang: Record<string, number> = {};
    for (const w of wikiEntryCounts) {
      wikiCountByLang[w.language] = w._count.id;
    }

    const now = new Date();
    const staleThresholdMs =
      (typeof autoLinkCfg === "object" && autoLinkCfg.intervalDays
        ? autoLinkCfg.intervalDays
        : 7) *
      24 *
      60 *
      60 *
      1000;

    const toRender: Array<{
      id: string;
      slug: string;
      language: string;
      contentPath: string;
      contentType: string;
      reason: string;
    }> = [];
    const skipped: Array<{ id: string; slug: string; reason: string }> = [];

    for (const article of articles) {
      // No wiki entries at all for this language → skip
      const langWikiCount = wikiCountByLang[article.language] || 0;
      if (langWikiCount === 0) {
        skipped.push({ id: article.id, slug: article.slug, reason: "no wiki entries in this language" });
        continue;
      }

      // Check staleness
      const lastDetected = lastDetectedMap.get(article.id) ?? null;
      if (!lastDetected) {
        // Never detected
        toRender.push({ ...article, reason: "never detected" });
      } else {
        const age = now.getTime() - new Date(lastDetected).getTime();
        if (age > staleThresholdMs) {
          toRender.push({
            ...article,
            reason: `last detected ${Math.floor(age / (24 * 60 * 60 * 1000))} days ago (stale)`,
          });
        } else {
          // Skip — up to date
          skipped.push({ id: article.id, slug: article.slug, reason: "up to date" });
        }
      }
    }

    if (dryRun) {
      return NextResponse.json({
        enabled: true,
        total: articles.length,
        needsUpdate: toRender.length,
        skipped: skipped.length,
        toRender: toRender.map((a) => ({ id: a.id, slug: a.slug, reason: a.reason })),
        skippedArticles: skipped,
      });
    }

    // 5. Do the actual re-rendering
    const errors: string[] = [];
    let reRendered = 0;

    for (const article of toRender) {
      try {
        const filePath = path.join(process.cwd(), article.contentPath);
        const rawContent = await readFile(filePath, "utf-8");

        const { content: mdBody } = parseFrontmatter(rawContent);
        const pipeline: ContentType = (article.contentType as ContentType) || "markdown";

        const linkedContent = await detectWikiLinks({
          lang: article.language,
          content: mdBody,
        });
        const html = await renderMarkdown(linkedContent, pipeline);

        await prisma.article.update({
          where: { id: article.id },
          data: { renderedContent: html },
        });

        reRendered++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`Article "${article.slug}" (${article.id}): ${msg}`);
      }
    }

    return NextResponse.json({
      enabled: true,
      total: articles.length,
      reRendered,
      needsUpdate: toRender.length,
      skipped: skipped.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error("Auto-link error:", error);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
