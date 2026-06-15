/**
 * @file POST /api/articles/publish
 *
 * Publishes a draft article:
 * 1. Reads content from filesystem (directory structure) or direct input
 * 2. Uses meta to build frontmatter if provided, or parses frontmatter
 * 3. Generates/validates slug (unique per language)
 * 4. Renders Markdown to HTML via `renderMarkdown()`
 * 5. Moves entire draft directory to `content/articles/{lang}/{slug}/` (with images/)
 * 6. Creates (or updates) database record
 *
 * Directory structure:
 *   Draft:   content/articles/drafts/{slugDir}/article.md + images/
 *   Published: content/articles/{lang}/{slug}/article.md + images/
 *
 * Request body: { fileName, language, meta, slug?, changelog?, draftOfId?, fileContent?, draftId? }
 *
 * Response: { success: true, article: { id, slug, url } }
 */

import { NextRequest, NextResponse } from "next/server";
import { readFile, mkdir, writeFile, rename, rm, cp, readdir } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/db";
import { renderMarkdown } from "@/lib/markdown/renderer";
import { detectWikiLinks } from "@/lib/markdown/linkDetector";
import { parseFrontmatter, buildFrontmatter, generateSlug } from "@/lib/articles/frontmatter";
import { addJob } from "@/lib/queue/producer";
import { validateImageReferences, extractImageReferences } from "@/lib/articles/images";
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
      defaultImageAccessGroup,
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

    // --- Determine draft directory name ---
    // _FileName can be "my-article/article.md" or "my-article.md" (legacy)
    let draftDirName: string;
    if (_fileName && _fileName.includes("/")) {
      draftDirName = _fileName.split("/")[0];
    } else if (_fileName) {
      draftDirName = _fileName.replace(/\.md$/i, "");
    } else {
      draftDirName = `draft-${Date.now()}`;
    }

    // --- Read content (from direct input or filesystem) ---

    let raw: string;
    let fromFileSystem = false;

    if (directContent) {
      raw = directContent;
    } else {
      // Read from drafts/{draftDirName}/article.md
      const draftArticlePath = path.join(DRAFTS_DIR, draftDirName, "article.md");
      try {
        raw = await readFile(draftArticlePath, "utf-8");
        fromFileSystem = true;
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") {
          return NextResponse.json(
            { error: `Draft not found: ${draftDirName}/article.md` },
            { status: 404 },
          );
        }
        throw err;
      }
    }

    // --- Build final content with frontmatter ---

    let finalContent: string;
    let frontmatter: ArticleFrontmatter;

    if (meta) {
      finalContent = buildFrontmatter(raw, meta as ArticleMeta);
      const parsed = parseFrontmatter(finalContent);
      frontmatter = parsed.frontmatter;
    } else {
      finalContent = raw;
      const parsed = parseFrontmatter(raw);
      frontmatter = parsed.frontmatter;
    }

    if (!frontmatter.title) {
      return NextResponse.json({ error: "title is required." }, { status: 400 });
    }

    // --- Guard: draft must not be published via the wrong flow ---
    if (draftId && !draftOfId) {
      const draftRecord = await prisma.article.findUnique({
        where: { id: draftId },
        select: { draftOfId: true },
      });
      if (draftRecord?.draftOfId) {
        return NextResponse.json(
          {
            error:
              "This draft is already linked to a published article. Please use the draft editor to publish.",
          },
          { status: 400 },
        );
      }
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
    if (draftOfId) {
      const existing = await prisma.article.findFirst({
        where: { slug, language, id: { not: draftOfId } },
      });
      if (existing) {
        return NextResponse.json(
          {
            error: `Article with slug "${slug}" and language "${language}" already exists.`,
          },
          { status: 409 },
        );
      }
    } else {
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

    // Pre-compute target directory for image validation and later moves
    const targetDir = PUBLISHED_DIR(language);
    const targetArticleDir = path.join(targetDir, slug);
    const targetArticlePath = path.join(targetArticleDir, "article.md");

    // --- Validate image references ---
    const { content: mdBody } = parseFrontmatter(finalContent);

    // Determine the source directory for image reference validation
    let sourceDir: string;
    if (fromFileSystem) {
      sourceDir = path.join(DRAFTS_DIR, draftDirName);
    } else if (draftId) {
      // Use the draft's contentPath to find its images/ directory
      const draftRecord = await prisma.article.findUnique({
        where: { id: draftId },
        select: { contentPath: true },
      });
      if (draftRecord) {
        sourceDir = path.dirname(path.join(process.cwd(), draftRecord.contentPath));
      } else {
        sourceDir = targetArticleDir;
      }
    } else {
      sourceDir = targetArticleDir;
    }

    const validationResult = await validateImageReferences(mdBody, sourceDir);
    if (!validationResult.valid && validationResult.missing.length > 0) {
      return NextResponse.json(
        {
          error: `Missing image files referenced in article: ${validationResult.missing.join(", ")}`,
          missingImages: validationResult.missing,
        },
        { status: 400 },
      );
    }

    const pipeline: ContentType =
      frontmatter.contentType === "notesaw" || frontmatter.fileType === "notesaw"
        ? "notesaw"
        : "markdown";

    const linkedContent = await detectWikiLinks({ lang: language, content: mdBody });
    const html = await renderMarkdown(linkedContent, pipeline);

    let oldSourceContent = "";

    // --- Move directory to published location ---
    // Published: content/articles/{lang}/{slug}/article.md + images/

    // For updates, capture old content before overwriting
    if (draftOfId) {
      try {
        oldSourceContent = await readFile(targetArticlePath, "utf-8");
      } catch {
        oldSourceContent = "";
      }
    }

    if (fromFileSystem) {
      // Write updated frontmatter to the draft's article.md first
      const draftArticlePath = path.join(DRAFTS_DIR, draftDirName, "article.md");
      await writeFile(draftArticlePath, finalContent, "utf-8");

      // Move the entire draft directory to published location
      // First ensure target parent dir exists
      await mkdir(targetDir, { recursive: true });

      // If target already exists (update), remove it first
      try {
        await rm(targetArticleDir, { recursive: true, force: true });
      } catch {
        // May not exist
      }

      // Rename the entire directory (includes images/)
      await rename(path.join(DRAFTS_DIR, draftDirName), targetArticleDir);
    } else {
      // Direct content (no filesystem draft) — create directory structure
      await mkdir(targetArticleDir, { recursive: true });
      const imagesDir = path.join(targetArticleDir, "images");
      await mkdir(imagesDir, { recursive: true });
      await writeFile(targetArticlePath, finalContent, "utf-8");

      // Copy images from draft directory if available
      if (draftId) {
        const draftRecord = await prisma.article.findUnique({
          where: { id: draftId },
          select: { contentPath: true },
        });
        if (draftRecord) {
          const draftImagesDir = path.join(
            path.dirname(path.join(process.cwd(), draftRecord.contentPath)),
            "images",
          );
          try {
            const files = await readdir(draftImagesDir);
            if (files.length > 0) {
              await cp(draftImagesDir, imagesDir, { recursive: true });
            }
          } catch {
            // Draft images directory may not exist — that's fine
          }
        }
      }
    }

    // Compute contentPath for DB
    const contentPath = `content/articles/${language}/${slug}/article.md`;

    let article;

    if (draftOfId) {
      // --- Update existing published article ---
      article = await prisma.article.update({
        where: { id: draftOfId },
        data: {
          slug,
          title: frontmatter.title,
          contentPath,
          renderedContent: html,
          summary: frontmatter.summary || null,
          tags: frontmatter.tags || [],
          status: "published",
          accessGroup: frontmatter.accessGroup || [],
          defaultImageAccessGroup: defaultImageAccessGroup || [],
          changelog: changelog || null,
          author: frontmatter.author || "博主",
          contentType: pipeline,
        },
      });

      // Migrate AiTask records from draft to the published article
      if (draftId) {
        await prisma.aiTask.updateMany({
          where: { articleId: draftId },
          data: { articleId: article.id },
        });
        await prisma.article.delete({ where: { id: draftId } });
      }
    } else if (draftId) {
      // --- Create new published article from a draft (first-time publish) ---
      article = await prisma.article.create({
        data: {
          slug,
          title: frontmatter.title,
          language,
          contentPath,
          renderedContent: html,
          summary: frontmatter.summary || null,
          tags: frontmatter.tags || [],
          status: "published",
          accessGroup: frontmatter.accessGroup || [],
          defaultImageAccessGroup: defaultImageAccessGroup || [],
          changelog: changelog || null,
          author: frontmatter.author || "博主",
          contentType: pipeline,
          publishedAt: new Date(),
        },
      });

      // Migrate AiTask records from draft to the new published article
      await prisma.aiTask.updateMany({
        where: { articleId: draftId },
        data: { articleId: article.id },
      });

      // Clean up draft record (directory already renamed)
      await prisma.article.delete({ where: { id: draftId } });
    } else {
      // --- Create new published article (no draft, direct publish) ---
      article = await prisma.article.create({
        data: {
          slug,
          title: frontmatter.title,
          language,
          contentPath,
          renderedContent: html,
          summary: frontmatter.summary || null,
          tags: frontmatter.tags || [],
          status: "published",
          accessGroup: frontmatter.accessGroup || [],
          defaultImageAccessGroup: defaultImageAccessGroup || [],
          changelog: changelog || null,
          author: frontmatter.author || "博主",
          contentType: pipeline,
          publishedAt: new Date(),
        },
      });
    }

    // --- Trigger auto-translation ---
    triggerAutoTranslate({
      sourceArticleId: article.id,
      sourceLanguage: language,
      slug: article.slug,
      oldSourceContent,
    }).catch((err) => {
      console.error("Auto-translate trigger failed (non-fatal):", err);
    });

    // --- Trigger auto term generation ---
    triggerAutoGenerate(article.id, slug, language).catch((err) => {
      console.error("Auto-generate trigger failed (non-fatal):", err);
    });

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
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}

/**
 * Triggers auto-translation after publish.
 */
async function triggerAutoTranslate(params: {
  sourceArticleId: string;
  sourceLanguage: string;
  slug: string;
  oldSourceContent: string;
}): Promise<void> {
  const { sourceArticleId, sourceLanguage, slug, oldSourceContent } = params;
  const targetLanguage = sourceLanguage === "zh" ? "en" : "zh";
  const targetLang = targetLanguage as "zh" | "en";
  const targetDir = path.join(process.cwd(), "content", "articles", targetLanguage);

  let translationArticle = await prisma.article.findFirst({
    where: { originalId: sourceArticleId, language: targetLang },
    select: { id: true, isAITranslated: true },
  });

  if (translationArticle) {
    if (!translationArticle.isAITranslated) {
      console.log(
        `[Publish] Skipping auto-translate: translation for article "${slug}" ` +
          `(${targetLanguage}) has been manually modified.`,
      );
      return;
    }
  } else {
    const sourceArticle = await prisma.article.findUnique({
      where: { id: sourceArticleId },
      select: {
        title: true,
        tags: true,
        summary: true,
        author: true,
        accessGroup: true,
        defaultImageAccessGroup: true,
        contentType: true,
      },
    });

    if (!sourceArticle) {
      console.error(`[Publish] Cannot create translation: source ${sourceArticleId} not found`);
      return;
    }

    // Create target directory structure
    const targetArticleDir = path.join(targetDir, slug);
    await mkdir(targetArticleDir, { recursive: true });
    const imagesDir = path.join(targetArticleDir, "images");
    await mkdir(imagesDir, { recursive: true });

    const targetFilePath = `content/articles/${targetLanguage}/${slug}/article.md`;
    const targetFullPath = path.join(process.cwd(), targetFilePath);
    await writeFile(targetFullPath, "", "utf-8");

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
        defaultImageAccessGroup: sourceArticle.defaultImageAccessGroup || [],
        summary: sourceArticle.summary,
        contentType: sourceArticle.contentType || "markdown",
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

  await addJob("translate", {
    articleId: sourceArticleId,
    targetArticleId: translationArticle.id,
    sourceLanguage,
    targetLanguage,
    oldSourceContent,
  });
}

/**
 * Triggers AI term discovery for a newly published article.
 */
async function triggerAutoGenerate(
  articleId: string,
  articleSlug: string,
  articleLang: string,
): Promise<void> {
  await addJob("discover", { articleId, articleSlug, articleLang });
}
