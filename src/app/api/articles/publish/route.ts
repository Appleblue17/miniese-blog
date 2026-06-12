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
import { addJob } from "@/lib/queue/producer";
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

    let oldSourceContent = "";

    // --- Write file to published directory ---

    const targetDir = PUBLISHED_DIR(language);
    await mkdir(targetDir, { recursive: true });
    const targetPath = path.join(targetDir, `${slug}.md`);

    // --- Capture old content BEFORE overwriting (for update case) ---
    if (draftOfId) {
      try {
        oldSourceContent = await readFile(targetPath, "utf-8");
      } catch {
        // File may not exist yet (first publish), that's fine
        oldSourceContent = "";
      }
    }

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

    // --- Trigger auto-translation if sibling article exists ---

    // Fire-and-forget: don't block the publish response on translation job creation
    triggerAutoTranslate({
      sourceArticleId: article.id,
      sourceLanguage: language,
      slug: article.slug,
      oldSourceContent,
    }).catch((err) => {
      console.error("Auto-translate trigger failed (non-fatal):", err);
    });

    // // --- Trigger auto term generation (always runs on publish) ---
    // // Disabled for now
    // triggerAutoGenerate(article.id).catch((err) => {
    //   console.error("Auto-generate trigger failed (non-fatal):", err);
    // });

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

/**
 * Attempts to auto-trigger translation for a published article.
 *
 * If no translation version exists in the target language, creates one
 * automatically (empty placeholder) linked to the source article via originalId.
 * Then submits a translate job.
 *
 * Translation versions:
 * - Are bound to the original article via originalId
 * - Cannot be manually edited (isAITranslated=true)
 * - Do not appear as independent articles in listings
 * - Share the same slug as the original article
 *
 * This function is fire-and-forget — errors are logged but not propagated.
 *
 * @param params - The source article info and old content
 */
async function triggerAutoTranslate(params: {
  sourceArticleId: string;
  sourceLanguage: string;
  slug: string;
  oldSourceContent: string;
}): Promise<void> {
  const { sourceArticleId, sourceLanguage, slug, oldSourceContent } = params;

  // Determine target language
  const targetLanguage = sourceLanguage === "zh" ? "en" : "zh";
  const targetLang = targetLanguage as "zh" | "en";
  const targetDir = path.join(process.cwd(), "content", "articles", targetLanguage);

  // Look up translation version by originalId + language
  // (translation versions are bound to the original article)
  let translationArticle = await prisma.article.findFirst({
    where: {
      originalId: sourceArticleId,
      language: targetLang,
    },
    select: { id: true, isAITranslated: true },
  });

  if (translationArticle) {
    // Translation already exists — guard against overwriting manual modifications
    if (!translationArticle.isAITranslated) {
      console.log(
        `[Publish] Skipping auto-translate: translation for article "${slug}" ` +
          `(${targetLanguage}) has been manually modified.`,
      );
      return;
    }
  } else {
    // No translation exists — create one linked to the source article
    const sourceArticle = await prisma.article.findUnique({
      where: { id: sourceArticleId },
      select: { title: true, tags: true, summary: true, author: true, accessGroup: true },
    });

    if (!sourceArticle) {
      console.error(`[Publish] Cannot create translation: source ${sourceArticleId} not found`);
      return;
    }

    // Create the target directory
    await mkdir(targetDir, { recursive: true });

    // Create an empty placeholder file (will be overwritten by the worker)
    const targetFilePath = `content/articles/${targetLanguage}/${slug}.md`;
    const targetFullPath = path.join(process.cwd(), targetFilePath);
    await writeFile(targetFullPath, "", "utf-8");

    // Create the DB record with originalId pointing to source article
    translationArticle = await prisma.article.create({
      data: {
        slug,
        title: `${sourceArticle.title} (${targetLanguage === "en" ? "English" : "中文版"})`,
        language: targetLang,
        status: "published",
        contentPath: targetFilePath,
        tags: sourceArticle.tags || [],
        author: sourceArticle.author || "博主",
        accessGroup: sourceArticle.accessGroup || [],
        summary: sourceArticle.summary,
        isAITranslated: true,
        originalId: sourceArticleId,
        publishedAt: new Date(),
      },
      select: { id: true, isAITranslated: true },
    });

    console.log(
      `[Publish] Created translation "${slug}" (${targetLanguage}) ` +
        `with id ${translationArticle.id}, linked to original ${sourceArticleId}`,
    );
  }

  console.log(
    `[Publish] Triggering auto-translate for article ${sourceArticleId} ` +
      `(${sourceLanguage} → ${targetLanguage})`,
  );

  // Submit the translation job
  await addJob("translate", {
    articleId: sourceArticleId,
    targetArticleId: translationArticle.id,
    sourceLanguage,
    targetLanguage,
    oldSourceContent,
  });
}

/**
 * Triggers AI term generation for a newly published article.
 *
 * Creates a "generate" task that will scan the article content and
 * discover potential wiki terms, creating proposed wiki entries.
 *
 * This function is fire-and-forget.
 *
 * @param articleId - The ID of the published article
 */
async function triggerAutoGenerate(articleId: string): Promise<void> {
  await addJob("generate", {
    articleId,
  });
}
