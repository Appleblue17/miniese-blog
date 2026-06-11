/**
 * @file POST /api/articles/publish
 *
 * Publishes a draft article:
 * 1. Reads content (from provided fileContent or filesystem)
 * 2. Uses meta to build frontmatter if provided, or parses frontmatter
 * 3. Generates/validates slug (unique per language)
 * 4. Renders Markdown to HTML via `renderMarkdown()`
 * 5. Writes file to `content/articles/{lang}/{slug}.md` with buildFrontmatter
 * 6. Creates (or updates) database record
 *
 * Request body: { fileName, language, meta, slug?, changelog?, draftOfId?, fileContent?, draftId? }
 *   - meta: { title, language, fileType, tags, author, summary }
 *   - If meta is provided, uses it to build frontmatter (overriding file content)
 *   - If meta is not provided, parses frontmatter from file content (legacy)
 *   - draftId: optional — if provided, the draft record will be linked to the
 *     newly created published article (draftOfId set to article.id)
 *
 * Response: { success: true, article: { id, slug, url } }
 */

import { NextRequest, NextResponse } from "next/server";
import { readFile, mkdir, writeFile, unlink } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/db";
import { renderMarkdown } from "@/lib/markdown/renderer";
import { detectWikiLinks } from "@/lib/markdown/linkDetector";
import { parseFrontmatter, buildFrontmatter, generateSlug } from "@/lib/articles/frontmatter";
import type { ArticleMeta, ArticleFrontmatter } from "@/lib/articles/frontmatter";
import type { ContentType } from "@/lib/markdown/renderer";

const DRAFTS_DIR = path.join(process.cwd(), "content", "articles", "drafts");
const PUBLISHED_DIR = (lang: string) =>
  path.join(process.cwd(), "content", "articles", lang);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      fileName: _fileName,
      language,
      meta,
      slug: customSlug,
      changelog,
      draftOfId,
      fileContent: directContent,
      draftId,
    } = body;

    // --- Validation ---

    if (!directContent && !_fileName) {
      return NextResponse.json(
        { error: "fileContent or fileName is required." },
        { status: 400 },
      );
    }

    if (language !== "zh" && language !== "en") {
      return NextResponse.json(
        { error: "language must be 'zh' or 'en'." },
        { status: 400 },
      );
    }

    // --- Read content (from direct input or filesystem) ---

    let raw: string;
    let fromFileSystem = false;

    if (directContent) {
      raw = directContent;
    } else {
      const draftPath = path.join(DRAFTS_DIR, _fileName);
      try {
        raw = await readFile(draftPath, "utf-8");
        fromFileSystem = true;
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") {
          return NextResponse.json(
            { error: `Draft file not found: ${_fileName}` },
            { status: 404 },
          );
        }
        throw err;
      }
    }

    // --- Build final content with frontmatter ---

    // Use meta if provided, otherwise parse from raw content
    let finalContent: string;
    let frontmatter: ArticleFrontmatter;

    if (meta) {
      finalContent = buildFrontmatter(raw, meta as ArticleMeta);
      // Parse the result to extract frontmatter for DB
      const parsed = parseFrontmatter(finalContent);
      frontmatter = parsed.frontmatter;
    } else {
      finalContent = raw;
      const parsed = parseFrontmatter(raw);
      frontmatter = parsed.frontmatter;
    }

    if (!frontmatter.title) {
      return NextResponse.json(
        { error: "title is required." },
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
    if (!draftOfId) {
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
    }

    // --- Render HTML with wiki link detection ---
    // Parse body from finalContent for rendering
    const { content: mdBody } = parseFrontmatter(finalContent);
    const pipeline: ContentType =
      frontmatter.contentType === "notesaw" || frontmatter.fileType === "notesaw"
        ? "notesaw"
        : "markdown";

    // First detect wiki links in the Markdown content, then render
    // This allows the renderer to produce proper <a> tags in the HTML output
    const linkedContent = await detectWikiLinks({ lang: language, content: mdBody });
    const html = await renderMarkdown(linkedContent, pipeline);

    // --- Write file to published directory ---

    const targetDir = PUBLISHED_DIR(language);
    await mkdir(targetDir, { recursive: true });
    const targetPath = path.join(targetDir, `${slug}.md`);

    if (fromFileSystem) {
      // If reading from filesystem, we need to write the new content
      // (which includes the updated frontmatter) instead of renaming
      await writeFile(targetPath, finalContent, "utf-8");
      // Remove old draft file
      try {
        await unlink(path.join(DRAFTS_DIR, _fileName));
      } catch {
        // Draft file may already have been removed
      }
    } else {
      await writeFile(targetPath, finalContent, "utf-8");
    }

    let article;

    if (draftOfId) {
      // --- Update existing published article ---
      article = await prisma.article.update({
        where: { id: draftOfId },
        data: {
          slug,
          title: frontmatter.title,
          contentPath: `content/articles/${language}/${slug}.md`,
          renderedContent: html,
          summary: frontmatter.summary || null,
          tags: frontmatter.tags || [],
          status: "published",
          accessGroup: frontmatter.accessGroup || [],
          changelog: changelog || null,
          author: frontmatter.author || "博主",
        },
      });

      // Delete the draft record after publishing
      await prisma.article.deleteMany({
        where: { draftOfId, id: { not: article.id } },
      });
    } else {
      // --- Create new published article ---
      article = await prisma.article.create({
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

      // Link the draft to the newly published article
      if (draftId) {
        // Clean up draft file
        const draftRecord = await prisma.article.findUnique({
          where: { id: draftId },
          select: { contentPath: true },
        });
        if (draftRecord?.contentPath) {
          const draftFilePath = path.join(process.cwd(), draftRecord.contentPath);
          try {
            await unlink(draftFilePath);
          } catch {
            // Draft file may not exist
          }
        }

        await prisma.article.update({
          where: { id: draftId },
          data: { draftOfId: article.id },
        });
      }
    }

    return NextResponse.json({
      success: true,
      article: {
        id: article.id,
        slug: article.slug,
        url: `/${language}/articles/${article.slug}`,
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
