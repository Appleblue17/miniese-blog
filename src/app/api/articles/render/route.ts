/**
 * @file POST /api/articles/render
 *
 * Re-renders a published article's content (with wiki link detection) and
 * updates the `renderedContent` field in the database.
 *
 * This is useful when wiki entries are updated and the admin wants to
 * refresh existing articles to reflect new/changed wiki links.
 *
 * Request body: { articleId: string, lang: string, preserveUpdatedAt?: boolean }
 *   - articleId: The ID of the published article to re-render
 *   - lang: The language of the article ('zh' | 'en')
 *   - preserveUpdatedAt: If true, the `updatedAt` timestamp will not be changed
 *     (default: false)
 *
 * Response: { success: true, article: { id, slug } }
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
    const body = await request.json();
    const { articleId, lang, preserveUpdatedAt } = body;

    // --- Validation ---

    if (!articleId) {
      return NextResponse.json({ error: "articleId is required." }, { status: 400 });
    }

    if (lang !== "zh" && lang !== "en") {
      return NextResponse.json({ error: "lang must be 'zh' or 'en'." }, { status: 400 });
    }

    // --- Find the article ---

    const article = await prisma.article.findUnique({
      where: { id: articleId },
    });

    if (!article) {
      return NextResponse.json({ error: `Article not found: ${articleId}` }, { status: 404 });
    }

    if (article.status !== "published") {
      return NextResponse.json(
        { error: "Only published articles can be re-rendered." },
        { status: 400 },
      );
    }

    // --- Read the source Markdown file ---

    let rawContent: string;
    try {
      const filePath = path.join(process.cwd(), article.contentPath);
      rawContent = await readFile(filePath, "utf-8");
    } catch (err) {
      return NextResponse.json(
        {
          error: `Could not read article file: ${article.contentPath}`,
        },
        { status: 500 },
      );
    }

    // --- Re-render with wiki link detection ---

    const { content: mdBody } = parseFrontmatter(rawContent);
    const pipeline: ContentType = article.contentType || "markdown";

    // Detect wiki links in the Markdown body, then render to HTML
    const linkedContent = await detectWikiLinks({ lang, content: mdBody });
    const html = await renderMarkdown(linkedContent, pipeline);

    // --- Update the database ---

    const updateData: Record<string, unknown> = { renderedContent: html };
    if (preserveUpdatedAt) {
      updateData.updatedAt = article.updatedAt;
    }

    await prisma.article.update({
      where: { id: articleId },
      data: updateData,
    });

    // --- Sync ArticleWikiLink records ---
    //
    // Extract wiki entry names from the rendered HTML (data-wiki-name attributes),
    // look up their IDs, and create/delete ArticleWikiLink records so the
    // link-status API can report accurate link counts and detection timestamps.

    await syncArticleWikiLinks(articleId, lang, html);

    return NextResponse.json({
      success: true,
      article: {
        id: article.id,
        slug: article.slug,
      },
    });
  } catch (error) {
    console.error("Render error:", error);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
