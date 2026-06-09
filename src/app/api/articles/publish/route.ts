/**
 * @file POST /api/articles/publish
 *
 * Publishes a draft article:
 * 1. Reads the draft file from `content/articles/drafts/`
 * 2. Parses frontmatter for metadata
 * 3. Generates/validates slug (unique per language)
 * 4. Renders Markdown to HTML via `renderMarkdown()`
 * 5. Moves the file to `content/articles/{lang}/{slug}.md`
 * 6. Creates a database record with rendered HTML cache
 *
 * Request body: { fileName: string, language: "zh"|"en", slug?: string, changelog?: string }
 * Response: { success: true, article: { id, slug, url } }
 */

import { NextRequest, NextResponse } from "next/server";
import { readFile, rename, mkdir } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/db";
import { renderMarkdown } from "@/lib/markdown/renderer";
import { parseFrontmatter, generateSlug } from "@/lib/articles/frontmatter";
import type { ContentType } from "@/lib/markdown/renderer";

const DRAFTS_DIR = path.join(process.cwd(), "content", "articles", "drafts");
const PUBLISHED_DIR = (lang: string) =>
  path.join(process.cwd(), "content", "articles", lang);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { fileName, language, slug: customSlug, changelog } = body;

    // --- Validation ---

    if (!fileName || typeof fileName !== "string") {
      return NextResponse.json(
        { error: "fileName is required and must be a string." },
        { status: 400 },
      );
    }

    if (language !== "zh" && language !== "en") {
      return NextResponse.json(
        { error: "language must be 'zh' or 'en'." },
        { status: 400 },
      );
    }

    // --- Read draft file ---

    const draftPath = path.join(DRAFTS_DIR, fileName);
    let raw: string;
    try {
      raw = await readFile(draftPath, "utf-8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return NextResponse.json(
          { error: `Draft file not found: ${fileName}` },
          { status: 404 },
        );
      }
      throw err;
    }

    // --- Parse frontmatter ---

    const { frontmatter, content: mdBody } = parseFrontmatter(raw);

    if (!frontmatter.title) {
      return NextResponse.json(
        { error: "title is required in frontmatter." },
        { status: 400 },
      );
    }

    // --- Generate/validate slug ---

    const slug = generateSlug(frontmatter.title, customSlug || frontmatter.slug);

    if (!slug) {
      return NextResponse.json(
        { error: "Could not generate a valid slug from the title." },
        { status: 400 },
      );
    }

    // --- Check slug+language uniqueness ---

    const existing = await prisma.article.findUnique({
      where: { slug_language: { slug, language } },
    });
    if (existing) {
      return NextResponse.json(
        {
          error: `Article with slug "${slug}" and language "${language}" already exists.`,
        },
        { status: 409 },
      );
    }

    // --- Render HTML ---

    const pipeline: ContentType =
      frontmatter.contentType === "notesaw" ? "notesaw" : "markdown";
    const html = await renderMarkdown(mdBody, pipeline);

    // --- Move file to published directory ---

    const targetDir = PUBLISHED_DIR(language);
    await mkdir(targetDir, { recursive: true });
    const targetPath = path.join(targetDir, `${slug}.md`);
    await rename(draftPath, targetPath);

    // --- Create database record ---

    const article = await prisma.article.create({
      data: {
        slug,
        title: frontmatter.title,
        language,
        contentPath: `content/articles/${language}/${slug}.md`,
        renderedContent: html,
        summary: frontmatter.summary || null,
        tags: frontmatter.tags || [],
        status: "published",
        accessGroup: frontmatter.accessGroup || [],
        changelog: changelog || null,
        author: frontmatter.author || "博主",
        publishedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      article: {
        id: article.id,
        slug: article.slug,
        url: `/${language}/${article.slug}`,
      },
    });
  } catch (error) {
    console.error("Publish error:", error);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 },
    );
  }
}
