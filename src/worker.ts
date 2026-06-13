/**
 * @file Worker entry point.
 *
 * Separate Node.js process that consumes jobs from the `ai-tasks` Bull queue.
 * Dispatches to type-specific handler functions and updates the database.
 *
 * Usage: `npx tsx src/worker.ts`
 */

import "dotenv/config";
import path from "path";
import fs from "fs/promises";
import Queue from "bull";
import { prisma } from "./lib/db";
import { callDeepSeek } from "./lib/ai/client";
import { incrementalTranslate, type TranslationMap } from "./lib/ai/translator2";
import { incrementalReview } from "./lib/ai/reviewer";
import { generateWikiEntry } from "./lib/ai/generator";
import { renderMarkdown } from "./lib/markdown/renderer";
import { detectWikiLinks } from "./lib/markdown/linkDetector";
import { parseFrontmatter } from "./lib/articles/frontmatter";
import { discoverWikiCandidates } from "./lib/ai/discovery";
import { addJob } from "./lib/queue/producer";
import { loadCustomPrompt } from "./lib/ai/promptLoader";
import { getSettings } from "../config/settings";
import type { Job } from "bull";
import type { Prisma } from "./generated/prisma/client";

/** Input JSON type used by Prisma for Json fields */
type JsonInput = Prisma.InputJsonValue;

/** Redis connection URL */
const REDIS_URL = process.env.REDIS_URL;
if (!REDIS_URL) {
  throw new Error("REDIS_URL environment variable is required");
}

// ---------------------------------------------------------------------------
// Review handler
// ---------------------------------------------------------------------------

/**
 * Processes an AI review job.
 *
 * Flow:
 * 1. Read article content from file system
 * 2. Load the previous review's content snapshot as old source (for incremental diff)
 * 3. Call incrementalReview with the shared pipeline (detectChanges + splitRange + buildContext)
 * 4. Return merged report including contentMap + contentSnapshot for next incremental run
 *
 * Payload required fields:
 * - `articleId`: ID of the article to review
 */
async function processReview(job: Job): Promise<Record<string, unknown>> {
  const payload = (job.data.payload ?? {}) as Record<string, unknown>;
  const { articleId } = payload;

  const articleIdStr = String(articleId ?? "");

  console.log(`[Worker] Processing review for article ${articleIdStr}`);

  if (!articleIdStr) {
    throw new Error("Missing required payload field: articleId");
  }

  // 1. Read article content from DB + file system
  const article = await prisma.article.findUnique({
    where: { id: articleIdStr },
    select: { contentPath: true, slug: true, title: true, draftOfId: true },
  });

  if (!article) {
    throw new Error(`Article not found: ${articleIdStr}`);
  }

  const filePath = path.join(process.cwd(), article.contentPath);
  let currentContent: string;
  try {
    currentContent = await fs.readFile(filePath, "utf-8");
  } catch (err) {
    throw new Error(
      `Could not read article file: ${article.contentPath} (${err instanceof Error ? err.message : String(err)})`,
    );
  }

  // 2. Load old source content from the latest completed review task's
  //    contentSnapshot (for incremental diff). If none exists, pass empty string
  //    which triggers a full review.
  //
  //    If this article is a draft (has draftOfId), use the published article's
  //    review history. This ensures that editing a published article and then
  //    re-reviewing can do incremental diff against the last review.
  const { taskId } = job.data as { taskId: string };

  // Resolve to the published article's ID when reviewing a draft
  const reviewArticleId = article.draftOfId || articleIdStr;

  const latestReview = await prisma.aiTask.findFirst({
    where: {
      articleId: reviewArticleId,
      type: "review",
      status: "completed",
    },
    orderBy: { completedAt: "desc" },
    select: { output: true },
  });

  let oldSourceContent = "";
  let existingContentMap: Record<string, unknown> = {};

  if (latestReview?.output && typeof latestReview.output === "object") {
    const output = latestReview.output as Record<string, unknown>;
    if (typeof output.contentSnapshot === "string") {
      oldSourceContent = output.contentSnapshot;
    }
    if (
      output.contentMap &&
      typeof output.contentMap === "object" &&
      !Array.isArray(output.contentMap)
    ) {
      existingContentMap = output.contentMap as Record<string, unknown>;
    }
  }

  // 3. Store initial progress so detail page can show 0/total immediately
  await prisma.$executeRawUnsafe(
    `UPDATE "AiTask" SET output = jsonb_set(
      COALESCE(output, '{}'::jsonb),
      '{progress}',
      '{"totalChunks": 0, "processedChunks": 0}'::jsonb
    ) WHERE id = $1`,
    taskId,
  );

  // 3b. Load the effective review prompt from settings
  const customReviewPrompt = await loadCustomPrompt("review");

  // 4. Perform incremental review with progress callback
  const result = await incrementalReview(
    oldSourceContent,
    currentContent,
    existingContentMap as Record<string, import("./lib/ai/reviewer").ReviewChunk>,
    articleIdStr,
    "latest",
    // Report progress after each sub-chunk (fire-and-forget, don't block)
    (processed, total) => {
      prisma
        .$executeRawUnsafe(
          `UPDATE "AiTask" SET output = jsonb_set(
          COALESCE(output, '{}'::jsonb),
          '{progress}',
          $2::jsonb
        ) WHERE id = $1`,
          taskId,
          JSON.stringify({ totalChunks: total, processedChunks: processed }),
        )
        .catch((err) => {
          console.warn(
            `[Worker] Failed to update review progress: ${err instanceof Error ? err.message : String(err)}`,
          );
        });
    },
    customReviewPrompt,
  );

  console.log(
    `[Worker] Review complete: ${result.summary.totalIssues} issues found ` +
      `(${result.summary.errors} errors, ${result.summary.warnings} warnings, ` +
      `${result.summary.suggestions} suggestions), ` +
      `${result.reviewedCount} reviewed, ${result.reusedCount} reused`,
  );

  // 5. Return the full result (stored as AiTask.output)
  return result as unknown as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Translate handler
// ---------------------------------------------------------------------------

/**
 * Processes an AI translation job.
 *
 * Flow:
 * 1. Read old source content from payload (provided by publish API)
 * 2. Read current source content from file
 * 3. Load existing paragraph-level translations from the latest completed task
 * 4. Detect paragraph-level changes (diff) and perform incremental translation
 * 5. Translate frontmatter metadata (title, summary) via DeepSeek
 * 6. Rebuild frontmatter with translated title/summary and updated language
 * 7. Write translated content to the target language file
 * 8. Update article's DB record (title, language, isAITranslated)
 * 9. Re-render the target article to HTML
 * 10. Trigger term discovery for the translated article (fire-and-forget)
 * 11. Return translation stats
 *
 * Payload required fields:
 * - `articleId`: ID of the source article (the one being translated FROM)
 * - `oldSourceContent`: Previous file content before the latest edit
 * - `targetLanguage`: Target language code ("zh" | "en")
 * - `sourceLanguage`: Source language code ("zh" | "en")
 * - `targetArticleId`: ID of the target article (where translation is stored)
 */
async function processTranslate(job: Job): Promise<Record<string, unknown>> {
  const payload = (job.data.payload ?? {}) as Record<string, unknown>;
  const {
    articleId,
    targetLanguage,
    sourceLanguage,
    targetArticleId,
    oldSourceContent: rawOldContent,
  } = payload;

  const articleIdStr = String(articleId ?? "");
  const targetArticleIdStr = String(targetArticleId ?? "");
  const targetLang = String(targetLanguage ?? "en");
  const sourceLang = String(sourceLanguage ?? "zh");

  console.log(
    `[Worker] Processing translation for article ${articleIdStr} ` +
      `(${sourceLang} → ${targetLang})`,
  );

  if (!articleIdStr) {
    throw new Error("Missing required payload field: articleId");
  }
  if (!targetArticleIdStr) {
    throw new Error("Missing required payload field: targetArticleId");
  }

  // 1. Read source article from DB
  const sourceArticle = await prisma.article.findUnique({
    where: { id: articleIdStr },
    select: { contentPath: true, slug: true, title: true },
  });

  if (!sourceArticle) {
    throw new Error(`Source article not found: ${articleIdStr}`);
  }

  // 2. Read current source content from file
  const sourcePath = path.join(process.cwd(), sourceArticle.contentPath);
  let currentSourceContent: string;
  try {
    currentSourceContent = await fs.readFile(sourcePath, "utf-8");
  } catch (err) {
    throw new Error(
      `Could not read source article file: ${sourceArticle.contentPath} ` +
        `(${err instanceof Error ? err.message : String(err)})`,
    );
  }

  // 3. Read old source content from payload (provided by publish API)
  const oldSourceContent = typeof rawOldContent === "string" ? rawOldContent : "";

  // 4. Load existing translations from the latest completed translate task
  const existingTranslationMap = await loadExistingTranslations(articleIdStr, targetLang);

  // 5. Detect source/target language names for prompts
  const sourceLangName = sourceLang === "zh" ? "Chinese" : "English";
  const targetLangName = targetLang === "en" ? "English" : "Chinese";

  // 6. Store initial progress so detail page can show 0/total immediately
  const { taskId: translateTaskId } = job.data as { taskId: string };

  // Store initial progress using jsonb_set to avoid overwriting
  // any existing output fields.
  await prisma.$executeRawUnsafe(
    `UPDATE "AiTask" SET output = jsonb_set(
      COALESCE(output, '{}'::jsonb),
      '{progress}',
      '{"totalChunks": 0, "processedChunks": 0}'::jsonb
    ) WHERE id = $1`,
    translateTaskId,
  );

  // 6b. Load the effective translate prompt from settings
  const customTranslatePrompt = await loadCustomPrompt("translate");

  // 7. Perform incremental translation with progress callback
  const result = await incrementalTranslate(
    oldSourceContent,
    currentSourceContent,
    existingTranslationMap,
    sourceLangName,
    targetLangName,
    // Report progress after each sub-chunk (fire-and-forget, don't block)
    (processed, total) => {
      prisma
        .$executeRawUnsafe(
          `UPDATE "AiTask" SET output = jsonb_set(
          COALESCE(output, '{}'::jsonb),
          '{progress}',
          $2::jsonb
        ) WHERE id = $1`,
          translateTaskId,
          JSON.stringify({ totalChunks: total, processedChunks: processed }),
        )
        .catch((err) => {
          console.warn(
            `[Worker] Failed to update translate progress: ${err instanceof Error ? err.message : String(err)}`,
          );
        });
    },
    customTranslatePrompt,
  );

  console.log(
    `[Worker] Translation complete: ${result.translatedCount} translated, ` +
      `${result.reusedCount} reused, ${result.totalTokensUsed} tokens`,
  );

  // 7. Translate frontmatter metadata (title, summary) and update language
  let finalContent = result.translatedContent;
  let translatedTitle = "";
  let translatedSummary: string | undefined;

  try {
    const { frontmatter } = parseFrontmatter(result.translatedContent);

    if (frontmatter.title) {
      // Translate the title via DeepSeek
      const titlePrompt =
        `Translate the following article title from ${sourceLangName} to ${targetLangName}. ` +
        `Return ONLY the translated title, nothing else.\n\n` +
        frontmatter.title;

      const titleResult = await callDeepSeek({
        prompt: titlePrompt,
        responseFormat: "text",
        temperature: 0.3,
      });
      translatedTitle = titleResult.content.trim();
    }

    if (frontmatter.summary) {
      // Translate the summary via DeepSeek
      const summaryPrompt =
        `Translate the following article summary from ${sourceLangName} to ${targetLangName}. ` +
        `Return ONLY the translated summary, nothing else.\n\n` +
        frontmatter.summary;

      const summaryResult = await callDeepSeek({
        prompt: summaryPrompt,
        responseFormat: "text",
        temperature: 0.3,
      });
      translatedSummary = summaryResult.content.trim();
    }

    // Rebuild frontmatter with translated metadata and updated language
    const bodyMatch = result.translatedContent.match(/^---\n[\s\S]*?\n---\n*/);
    const body = bodyMatch
      ? result.translatedContent.slice(bodyMatch[0].length)
      : result.translatedContent;

    const newFrontmatterLines: string[] = [];
    newFrontmatterLines.push("---");

    // Keep all original frontmatter fields, but override title, summary, language
    const { frontmatter: origFm } = parseFrontmatter(result.translatedContent);
    for (const [key, value] of Object.entries(origFm)) {
      if (key === "title") {
        newFrontmatterLines.push(`title: "${translatedTitle.replace(/"/g, '\\"')}"`);
      } else if (key === "summary" && translatedSummary) {
        newFrontmatterLines.push(`summary: "${translatedSummary.replace(/"/g, '\\"')}"`);
      } else if (key === "language") {
        newFrontmatterLines.push(`language: ${targetLang}`);
      } else if (key === "slug") {
        // Keep slug unchanged (same slug, different language)
        newFrontmatterLines.push(`slug: ${value}`);
      } else if (Array.isArray(value)) {
        const items = value.map((v: unknown) => String(v));
        newFrontmatterLines.push(`${key}: [${items.join(", ")}]`);
      } else if (typeof value === "string" && /[:\-#\[\]{}%,&*?|<>!@`"'\s]/.test(value)) {
        newFrontmatterLines.push(`${key}: "${String(value).replace(/"/g, '\\"')}"`);
      } else if (value !== undefined && value !== null) {
        newFrontmatterLines.push(`${key}: ${String(value)}`);
      }
    }
    newFrontmatterLines.push("---");

    finalContent = newFrontmatterLines.join("\n") + "\n" + body.trimStart();
    console.log(
      `[Worker] Frontmatter updated: title="${translatedTitle}", language=${targetLang}` +
        (translatedSummary ? `, summary="${translatedSummary}"` : ""),
    );
  } catch (err) {
    // Frontmatter translation is best-effort — log warning but use original content
    console.warn(
      `[Worker] Failed to translate frontmatter metadata: ${err instanceof Error ? err.message : String(err)}`,
    );
    translatedTitle = ""; // Will fall back to keeping original below
  }

  // 8. Write translated content to the target article file
  const targetArticle = await prisma.article.findUnique({
    where: { id: targetArticleIdStr },
    select: { contentPath: true },
  });

  if (!targetArticle) {
    throw new Error(`Target article not found: ${targetArticleIdStr}`);
  }

  const targetPath = path.join(process.cwd(), targetArticle.contentPath);

  // Ensure the target directory exists
  await fs.mkdir(path.dirname(targetPath), { recursive: true });

  await fs.writeFile(targetPath, finalContent, "utf-8");
  console.log(`[Worker] Translated content written to: ${targetArticle.contentPath}`);

  // 9. Update target article's DB record (title, language, isAITranslated)
  const dbUpdateData: Record<string, unknown> = {
    isAITranslated: true,
    language: targetLang,
  };
  if (translatedTitle) {
    dbUpdateData.title = translatedTitle;
  }
  await prisma.article.update({
    where: { id: targetArticleIdStr },
    data: dbUpdateData,
  });
  console.log(
    `[Worker] Target article DB record updated: title="${translatedTitle || "(kept original)"}", language=${targetLang}`,
  );

  // 10. Re-render the target article's Markdown content to HTML
  //    The public page reads `renderedContent` from the database,
  //    so we need to update it after writing the translated file.
  try {
    const targetArticleFull = await prisma.article.findUnique({
      where: { id: targetArticleIdStr },
      select: { contentType: true },
    });

    const renderedContent = await fs.readFile(targetPath, "utf-8");
    const { content: mdBody } = parseFrontmatter(renderedContent);
    const pipeline = (targetArticleFull?.contentType as "markdown" | "notesaw") || "markdown";

    const linkedContent = await detectWikiLinks({
      lang: targetLang,
      content: mdBody,
    });
    const html = await renderMarkdown(linkedContent, pipeline);

    await prisma.article.update({
      where: { id: targetArticleIdStr },
      data: { renderedContent: html },
    });

    console.log(`[Worker] Rendered content updated for article ${targetArticleIdStr}`);
  } catch (err) {
    // Rendering is a best-effort step — don't fail the whole task
    console.warn(
      `[Worker] Failed to re-render translated article: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // 11. Trigger term discovery for the translated article (fire-and-forget)
  addJob("discover", {
    articleId: targetArticleIdStr,
    articleSlug: sourceArticle.slug,
    articleLang: targetLang,
  }).catch((err) => {
    console.warn(
      `[Worker] Failed to trigger discovery for translated article ${targetArticleIdStr}: ${err instanceof Error ? err.message : String(err)}`,
    );
  });

  // 12. Return result including the full translation map for future incremental runs
  //     and translatedGroups for the detail page display
  return {
    articleId: articleIdStr,
    targetArticleId: targetArticleIdStr,
    sourceLanguage: sourceLang,
    targetLanguage: targetLang,
    translatedAt: new Date().toISOString(),
    translatedCount: result.translatedCount,
    reusedCount: result.reusedCount,
    totalTokensUsed: result.totalTokensUsed,
    translations: result.translations,
    translatedGroups: result.translatedGroups,
  };
}

/**
 * Loads existing translations for an article from the latest completed
 * translate task.
 *
 * @param articleId - The source article ID
 * @param targetLanguage - The target language code
 * @returns The existing translation map, or empty object if none found
 */
async function loadExistingTranslations(
  articleId: string,
  targetLanguage: string,
): Promise<TranslationMap> {
  try {
    // Find the latest completed translate task for this article
    const latestTask = await prisma.aiTask.findFirst({
      where: {
        articleId,
        type: "translate",
        status: "completed",
      },
      orderBy: { completedAt: "desc" },
      select: { output: true },
    });

    if (!latestTask?.output || typeof latestTask.output !== "object") {
      return {};
    }

    // The output contains the translations map
    const output = latestTask.output as Record<string, unknown>;
    if (
      output.translations &&
      typeof output.translations === "object" &&
      !Array.isArray(output.translations)
    ) {
      // Validate that all values are strings
      const map: TranslationMap = {};
      for (const [key, value] of Object.entries(output.translations)) {
        if (typeof value === "string") {
          map[key] = value;
        }
      }
      return map;
    }

    return {};
  } catch (err) {
    console.warn(
      `[Worker] Failed to load existing translations: ${err instanceof Error ? err.message : String(err)}`,
    );
    return {};
  }
}

/**
 * Processes an AI term generation job.
 *
 * Given a discoveryId, calls DeepSeek to generate a complete wiki entry
 * (definition + content) for the term, then updates the WikiEntry file
 * and DB record with the generated content, transitioning from "creating"
 * to "unreviewed".
 *
 * Flow:
 * 1. Look up the WikiDiscovery record by discoveryId
 * 2. Look up the associated WikiEntry(creating) record
 * 3. Call generateWikiEntry() with term + definition hint
 * 4. On success: update WikiEntry file with generated content, transition to unreviewed
 * 5. On success: update WikiDiscovery status to "generated", store wikiEntryId
 * 6. On failure: update WikiDiscovery status to "failed", store failedReason
 *
 * Payload required fields:
 * - `discoveryId`: ID of the WikiDiscovery record to generate content for
 */
async function processGenerate(job: Job): Promise<Record<string, unknown>> {
  const payload = (job.data.payload ?? {}) as Record<string, unknown>;
  const { discoveryId } = payload;

  const discoveryIdStr = String(discoveryId ?? "");

  console.log(`[Worker] Processing term generation for discovery ${discoveryIdStr}`);

  if (!discoveryIdStr) {
    throw new Error("Missing required payload field: discoveryId");
  }

  // 1. Look up the discovery record
  const discovery = await prisma.wikiDiscovery.findUnique({
    where: { id: discoveryIdStr },
    select: {
      id: true,
      term: true,
      definition: true,
      articleSlug: true,
      articleLang: true,
      status: true,
      wikiEntryId: true,
    },
  });

  if (!discovery) {
    throw new Error(`Discovery record not found: ${discoveryIdStr}`);
  }

  if (discovery.status !== "approved") {
    throw new Error(
      `Discovery record "${discoveryIdStr}" has status "${discovery.status}", expected "approved".`,
    );
  }

  // 2. Look up the associated WikiEntry(creating)
  if (!discovery.wikiEntryId) {
    throw new Error(`Discovery record "${discoveryIdStr}" has no associated WikiEntry.`);
  }

  const entry = await prisma.wikiEntry.findUnique({
    where: { id: discovery.wikiEntryId },
    select: {
      id: true,
      name: true,
      contentPath: true,
      status: true,
    },
  });

  if (!entry) {
    throw new Error(
      `WikiEntry "${discovery.wikiEntryId}" not found for discovery "${discoveryIdStr}".`,
    );
  }

  if (entry.status !== "creating") {
    throw new Error(`WikiEntry "${entry.id}" has status "${entry.status}", expected "creating".`);
  }

  // 3. Call generateWikiEntry() with term + definition hint + optional context
  const context = discovery.articleSlug || undefined;
  const termLang: "zh" | "en" = (discovery.articleLang as "zh" | "en") || "zh";

  // 3b. Load the effective generate prompt from settings
  const customGeneratePrompt = await loadCustomPrompt("generate");

  const result = await generateWikiEntry(discovery.term, discovery.definition, context, termLang, customGeneratePrompt);

  if (!result.success || !result.entry) {
    const reason = result.reason || "unknown";
    console.warn(`[Worker] Generation failed for term "${discovery.term}": ${reason}`);

    // Update discovery to failed
    await prisma.wikiDiscovery.update({
      where: { id: discoveryIdStr },
      data: {
        status: "failed",
        failedReason: reason,
      },
    });

    return {
      discoveryId: discoveryIdStr,
      term: discovery.term,
      success: false,
      reason,
      message: `AI was unable to generate content for "${discovery.term}": ${reason}.`,
    };
  }

  const gen = result.entry;
  console.log(`[Worker] Successfully generated content for term: "${discovery.term}"`);

  // 4. Read existing WikiEntry file and update with generated content
  const filePath = path.join(process.cwd(), entry.contentPath);
  let existingContent: string;
  try {
    existingContent = await fs.readFile(filePath, "utf-8");
  } catch (err) {
    console.warn(
      `[Worker] Could not read wiki entry file for "${entry.name}", will create new: ${err instanceof Error ? err.message : String(err)}`,
    );
    existingContent = "";
  }

  // Build new file content using buildWikiFileWithMeta
  const { buildWikiFileWithMeta, parseWikiFileWithMeta, slugifyName } =
    await import("./lib/wiki/parser");

  let updatedFileContent: string;

  if (existingContent.trim()) {
    // Update existing file — preserve any human-written content, add AI content
    const parsed = parseWikiFileWithMeta(existingContent);
    updatedFileContent = buildWikiFileWithMeta(
      {
        name: entry.name,
        aliases: gen.aliases,
        language: discovery.articleLang as "zh" | "en",
        tags: gen.tags,
        status: "unreviewed",
        accessGroup: parsed.frontmatter.accessGroup || [],
      },
      {
        // Write the AI-generated definition to the definition block
        definition: gen.definition,
        // Preserve any existing human notes
        human: parsed.blocks.human,
        // Write AI-generated content to the AI block
        ai: gen.content,
        // Preserve any existing references
        ref: parsed.blocks.ref,
      },
    );
  } else {
    // New file (should not happen since approve creates it, but handle gracefully)
    const slug = slugifyName(entry.name);
    updatedFileContent = buildWikiFileWithMeta(
      {
        name: entry.name,
        aliases: gen.aliases,
        language: discovery.articleLang as "zh" | "en",
        tags: gen.tags,
        status: "unreviewed",
        accessGroup: [],
      },
      {
        definition: gen.definition,
        human: "",
        ai: gen.content,
        ref: "",
      },
    );
  }

  // Write updated content to file
  // Ensure directory exists
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, updatedFileContent, "utf-8");
  console.log(`[Worker] Updated wiki entry file: ${entry.contentPath}`);

  // 5. Update WikiEntry DB record — transition to unreviewed with generated data
  await prisma.wikiEntry.update({
    where: { id: entry.id },
    data: {
      status: "unreviewed",
      definition: gen.definition,
      aliases: gen.aliases,
      tags: gen.tags,
    },
  });
  console.log(`[Worker] WikiEntry "${entry.name}" transitioned to unreviewed`);

  // 6. Update WikiDiscovery status to "generated" (link already set)
  await prisma.wikiDiscovery.update({
    where: { id: discoveryIdStr },
    data: {
      status: "generated",
    },
  });
  console.log(`[Worker] Discovery "${discoveryIdStr}" marked as generated`);

  // 7. Return success
  return {
    discoveryId: discoveryIdStr,
    term: discovery.term,
    wikiEntryId: entry.id,
    success: true,
    message: `Successfully generated wiki entry for "${discovery.term}".`,
  };
}

/**
 * Processes an AI term discovery job.
 *
 * Flow:
 * 1. Read article content from file system
 * 2. Call discoverWikiCandidates() which uses the unified chunking pipeline
 *    (splitArticle) for long articles, calls DeepSeek per chunk, deduplicates
 * 3. Store candidates in the WikiDiscovery table
 * 4. Return summary
 *
 * Payload required fields:
 * - `articleId`: ID of the article to scan
 * - `articleSlug`: Slug of the article
 * - `articleLang`: Language code ("zh" | "en")
 */
async function processDiscover(job: Job): Promise<Record<string, unknown>> {
  const payload = (job.data.payload ?? {}) as Record<string, unknown>;
  const { articleId, articleSlug, articleLang } = payload;

  const articleIdStr = String(articleId ?? "");
  const slugStr = String(articleSlug ?? "");
  const langStr = String(articleLang ?? "zh");

  console.log(`[Worker] Processing term discovery for article ${articleIdStr}`);

  if (!articleIdStr) {
    throw new Error("Missing required payload field: articleId");
  }

  // 1. Read article content from DB + file system
  const article = await prisma.article.findUnique({
    where: { id: articleIdStr },
    select: { contentPath: true },
  });

  if (!article) {
    throw new Error(`Article not found: ${articleIdStr}`);
  }

  const filePath = path.join(process.cwd(), article.contentPath);
  let content: string;
  try {
    content = await fs.readFile(filePath, "utf-8");
  } catch (err) {
    throw new Error(
      `Could not read article file: ${article.contentPath} (${err instanceof Error ? err.message : String(err)})`,
    );
  }

  // 2. Perform discovery using the unified chunking pipeline
  // 2b. Load the effective discovery prompt from settings
  const customDiscoveryPrompt = await loadCustomPrompt("discovery");

  const candidates = await discoverWikiCandidates(articleIdStr, langStr, content, customDiscoveryPrompt);

  console.log(
    `[Worker] Discovery found ${candidates.length} candidate terms for article ${articleIdStr}`,
  );

  // 3. Store candidates in the WikiDiscovery table
  let storedCount = 0;
  for (const c of candidates) {
    try {
      await prisma.wikiDiscovery.create({
        data: {
          articleId: articleIdStr,
          articleSlug: slugStr,
          articleLang: langStr as "zh" | "en",
          term: c.term,
          type: c.type,
          definition: c.definition,
          importance: c.importance,
          status: "pending",
        },
      });
      storedCount++;
    } catch (err) {
      // Unique constraint violation (articleId + term) — skip
      console.warn(
        `[Worker] Failed to store candidate "${c.term}": ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  console.log(`[Worker] Discovery complete: ${storedCount}/${candidates.length} candidates stored`);

  // 4. Return summary
  return {
    articleId: articleIdStr,
    discoveredAt: new Date().toISOString(),
    candidateCount: storedCount,
    candidates: candidates.map((c) => ({
      term: c.term,
      type: c.type,
      definition: c.definition,
      importance: c.importance,
    })),
  };
}

async function processScan(job: Job): Promise<Record<string, unknown>> {
  console.log(`[Worker] Processing article scan`);
  await new Promise((resolve) => setTimeout(resolve, 2000));
  return { message: "扫描完成（模拟）", proposals: [] };
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

const HANDLERS: Record<string, (job: Job) => Promise<Record<string, unknown>>> = {
  review: processReview,
  translate: processTranslate,
  discover: processDiscover,
  generate: processGenerate,
  // scan: disabled for now
};

/** Maps task type to its feature flag key in settings */
const FEATURE_FLAGS: Record<string, string> = {
  review: "aiReview",
  translate: "autoTranslate",
  discover: "wikiDiscovery",
  generate: "wikiGenerate",
};

async function processJob(job: Job): Promise<Record<string, unknown>> {
  const { type, taskId } = job.data as {
    type: string;
    taskId: string;
    payload: Record<string, unknown>;
  };

  // Check feature flag before processing
  const featureKey = FEATURE_FLAGS[type];
  if (featureKey) {
    try {
      const settings = await getSettings();
      const enabled = settings.features?.[featureKey];
      if (enabled === false) {
        // Feature disabled — mark task as skipped (completed with no-op)
        console.log(`[Worker] Feature "${featureKey}" is disabled, skipping task ${taskId}`);
        await prisma.aiTask.update({
          where: { id: taskId },
          data: {
            status: "completed",
            output: { skipped: true, reason: `Feature "${featureKey}" is disabled in settings` } as JsonInput,
            completedAt: new Date(),
          },
        });
        return { skipped: true, reason: `Feature "${featureKey}" is disabled` };
      }
    } catch (err) {
      // Settings load failure — log but proceed (don't block on settings error)
      console.warn(`[Worker] Failed to check feature flag for "${type}": ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Mark as processing
  await prisma.aiTask.update({
    where: { id: taskId },
    data: { status: "processing" },
  });

  const handler = HANDLERS[type];
  if (!handler) {
    throw new Error(`Unknown task type: ${type}`);
  }

  return handler(job);
}

// ---------------------------------------------------------------------------
// Worker setup
// ---------------------------------------------------------------------------

const workerQueue = new Queue("ai-tasks", REDIS_URL);

workerQueue.process("*", 1, async (job) => {
  const { taskId } = job.data as { taskId: string };
  try {
    const result = await processJob(job);

    // Mark as completed
    await prisma.aiTask.update({
      where: { id: taskId },
      data: {
        status: "completed",
        output: result as JsonInput,
        completedAt: new Date(),
      },
    });

    console.log(`[Worker] Job ${job.id} (task ${taskId}) completed successfully`);
    return result;
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);

    // Mark as failed
    await prisma.aiTask.update({
      where: { id: taskId },
      data: {
        status: "failed",
        error: errorMessage,
      },
    });

    console.error(`[Worker] Job ${job.id} (task ${taskId}) failed: ${errorMessage}`);
    throw err; // Let Bull handle retry logic
  }
});

workerQueue.on("completed", (job) => {
  console.log(`[Worker] Job ${job.id} completed event`);
});

workerQueue.on("failed", (job, err) => {
  console.error(`[Worker] Job ${job.id} failed after attempts: ${err.message}`);
});

console.log("[Worker] ai-tasks worker started. Waiting for jobs...");

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("[Worker] Shutting down gracefully...");
  await workerQueue.close();
  await prisma.$disconnect();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("[Worker] Shutting down gracefully...");
  await workerQueue.close();
  await prisma.$disconnect();
  process.exit(0);
});
