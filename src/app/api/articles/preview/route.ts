/**
 * @file POST /api/articles/preview
 *
 * Accepts Markdown/Notesaw content and returns the rendered HTML.
 * Also extracts frontmatter metadata (title, tags, summary, contentType).
 *
 * Request body: { content: string, contentType?: "markdown" | "notesaw" }
 * Response: { html: string, metadata: { title, tags, summary, contentType } }
 */

import { NextRequest, NextResponse } from "next/server";
import { renderMarkdown } from "@/lib/markdown/renderer";
import { parseFrontmatter } from "@/lib/articles/frontmatter";
import type { ContentType } from "@/lib/markdown/renderer";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { content, contentType } = body;

    if (!content || typeof content !== "string") {
      return NextResponse.json(
        { error: "Content is required and must be a string." },
        { status: 400 },
      );
    }

    // Parse frontmatter to extract metadata and body
    const { frontmatter, content: mdBody } = parseFrontmatter(content);

    // Determine rendering pipeline: explicit contentType > frontmatter field > default
    const pipeline: ContentType =
      contentType === "notesaw"
        ? "notesaw"
        : frontmatter.contentType === "notesaw"
          ? "notesaw"
          : "markdown";

    const html = await renderMarkdown(mdBody, pipeline);

    return NextResponse.json({
      html,
      metadata: {
        title: frontmatter.title || null,
        tags: frontmatter.tags || [],
        summary: frontmatter.summary || null,
        contentType: pipeline,
      },
    });
  } catch (error) {
    console.error("Preview error:", error);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
