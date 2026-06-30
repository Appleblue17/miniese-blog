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
import { discoverWikiCandidates, incrementalDiscover } from "./lib/ai/discovery";
import type { DiscoveryCandidate } from "./lib/ai/discovery";
import { stripFrontmatter } from "./lib/ai/chunker/chunker";
import { loadCustomPrompt } from "./lib/ai/promptLoader";
import { getSettings } from "../config/settings";
import { notifyAndMail } from "./lib/notifications";
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
// AiUsageLog helper
// ---------------------------------------------------------------------------

/**
 * Records token usage to the AiUsageLog table.
 * Fire-and-forget: failures are logged but not thrown.
 */
async function recordAiUsage(
  type: "review" | "translate" | "generate" | "discover" | "chat",
  promptTokens: number,
  completionTokens: number,
  totalTokens: number,
): Promise<void> {
  try {
    await prisma.aiUsageLog.create({
      data: {
        type,
        promptTokens,
        completionTokens,
        totalTokens,
      },
    });
  } catch (err) {
    console.warn(
      `[Worker] Failed to record AiUsageLog: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
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

  // Record token usage
  recordAiUsage(
    "review",
    result.totalTokensUsed, // approximate: we don't have prompt vs completion from incrementalReview
    0,
    result.totalTokensUsed,
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
 * 1. Read current source content from file
 * 2. Load old source content FROM DB (previous translate task's contentSnapshot)
 * 3. Load existing paragraph-level translations from the latest completed task
 * 4. Detect paragraph-level changes (diff) and perform incremental translation
 * 5. Translate frontmatter metadata (title, summary) via DeepSeek
 * 6. Rebuild frontmatter with translated title/summary and updated language
 * 7. Write translated content to the target language file
 * 8. Compute charCount from translated content
 * 9. Update article's DB record (title, language, isAITranslated, charCount)
 * 10. Re-render the target article to HTML
 * 11. Return translation stats including contentSnapshot for next incremental run
 *
 * Payload required fields:
 * - `articleId`: ID of the source article (the one being translated FROM)
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

  // 3. Load old source content from the latest completed translate task's
  //    contentSnapshot (for incremental diff). If none exists, pass empty string
  //    which triggers a full translation.
  //
  //    This mirrors the approach used by processReview, removing the need
  //    for publish API to pass oldSourceContent in the payload.
  let oldSourceContent = "";
  {
    const latestTranslate = await prisma.aiTask.findFirst({
      where: {
        articleId: articleIdStr,
        type: "translate",
        status: "completed",
      },
      orderBy: { completedAt: "desc" },
      select: { output: true },
    });

    if (latestTranslate?.output && typeof latestTranslate.output === "object") {
      const output = latestTranslate.output as Record<string, unknown>;
      if (typeof output.contentSnapshot === "string") {
        oldSourceContent = output.contentSnapshot;
      }
    }
  }

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
      } else if (key === "changelog") {
        // Skip changelog in translated file — synced from source at DB level
        continue;
      } else if (Array.isArray(value)) {
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

  // 9. Compute charCount from the translated content
  //    (excluding frontmatter and whitespace, CJK chars = 2 bytes, ASCII = 1 byte)
  let translatedCharCount = 0;
  try {
    const writtenContent = await fs.readFile(targetPath, "utf-8");
    const { content: mdBody } = parseFrontmatter(writtenContent);
    translatedCharCount = [...mdBody.replace(/\s/g, "")].reduce(
      (acc, ch) => acc + (/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/.test(ch) ? 2 : 1),
      0,
    );
  } catch (err) {
    console.warn(
      `[Worker] Failed to compute charCount: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // 10. Update target article's DB record (title, language, isAITranslated, charCount, summary, changelog)
  const dbUpdateData: Record<string, unknown> = {
    isAITranslated: true,
    language: targetLang,
    charCount: translatedCharCount,
  };
  if (translatedTitle) {
    dbUpdateData.title = translatedTitle;
  }
  if (translatedSummary) {
    dbUpdateData.summary = translatedSummary;
  }
  // Sync changelog from source article, translating only the latest entry (first line).
  // Historical entries (lines 2+) are kept in original language.
  // If no changelog exists, skip.
  try {
    const sourceArticleFull = await prisma.article.findUnique({
      where: { id: articleIdStr },
      select: { changelog: true },
    });
    if (sourceArticleFull?.changelog) {
      const lines = sourceArticleFull.changelog.split("\n");
      if (lines.length > 0) {
        // Translate only the first line (latest entry)
        const firstLine = lines[0];
        const match = firstLine.match(/^(\[.+?\])\s*(.*)/);
        if (match) {
          const datePrefix = match[1];
          const entryText = match[2];
          if (entryText.trim()) {
            const changelogPrompt =
              `Translate the following changelog entry from ${sourceLangName} to ${targetLangName}. ` +
              `Return ONLY the translated text, nothing else.\n\n${entryText}`;
            const changelogResult = await callDeepSeek({
              prompt: changelogPrompt,
              responseFormat: "text",
              temperature: 0.3,
            });
            const translatedEntry = changelogResult.content.trim();
            // Rebuild: keep date prefix + translated text for first line, rest unchanged
            const translatedLines = [`${datePrefix} ${translatedEntry}`, ...lines.slice(1)];
            dbUpdateData.changelog = translatedLines.join("\n");
            console.log(
              `[Worker] Translated latest changelog entry: "${entryText}" → "${translatedEntry}"`,
            );
          } else {
            // Entry text is empty — keep as-is
            dbUpdateData.changelog = sourceArticleFull.changelog;
          }
        } else {
          // No date prefix match — keep as-is
          dbUpdateData.changelog = sourceArticleFull.changelog;
        }
      }
    }
  } catch {
    // Non-fatal
  }
  await prisma.article.update({
    where: { id: targetArticleIdStr },
    data: dbUpdateData,
  });
  console.log(
    `[Worker] Target article DB record updated: title="${translatedTitle || "(kept original)"}", ` +
      `language=${targetLang}, charCount=${translatedCharCount}${translatedSummary ? `, summary="${translatedSummary}"` : ""}`,
  );

  // 11. Re-render the target article's Markdown content to HTML
  //    The public page reads `renderedContent` from the database,
  //    so we need to update it after writing the translated file.
  //    Use the source article's contentType — the content format
  //    (Notesaw vs Markdown) is preserved through translation.
  try {
    const sourceArticleFull = await prisma.article.findUnique({
      where: { id: articleIdStr },
      select: { contentType: true },
    });

    const renderedContent = await fs.readFile(targetPath, "utf-8");
    const { content: mdBody } = parseFrontmatter(renderedContent);
    const pipeline = (sourceArticleFull?.contentType as "markdown" | "notesaw") || "markdown";

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

  // 12. Notify admin about translation completion (fire-and-forget)
  notifyAndMail({
    type: "translation_complete",
    title: "翻译完成",
    content: `文章《${sourceArticle.title}》已由 ${sourceLangName} 翻译为 ${targetLangName}，共翻译 ${result.translatedCount} 段`,
    articleId: targetArticleIdStr,
    articleTitle: translatedTitle || sourceArticle.title,
    taskId: translateTaskId,
  }).catch((err) => {
    console.warn(
      `[Worker] Failed to send translation notification: ${err instanceof Error ? err.message : String(err)}`,
    );
  });

  // Record token usage for incremental translation
  recordAiUsage(
    "translate",
    result.totalTokensUsed,
    0,
    result.totalTokensUsed,
  );

  // Also record usage from metadata translation calls (title, summary, changelog)
  // These are tracked separately since we don't store their individual usage.
  // For now, only the main incremental translation usage is recorded.

  // 13. Return result including the full translation map for future incremental runs
  //     and translatedGroups for the detail page display, plus contentSnapshot
  //     for the next incremental diff.
  
  // Read current source content again for contentSnapshot
  let contentSnapshot = "";
  try {
    contentSnapshot = await fs.readFile(sourcePath, "utf-8");
  } catch {
    contentSnapshot = currentSourceContent;
  }
  const bodyForSnapshot = stripFrontmatter(contentSnapshot);

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
    contentSnapshot: bodyForSnapshot,
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
  const { taskId: generateTaskId } = job.data as { taskId: string };

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

  // 6b. Notify admin about term generation completion (fire-and-forget)
  notifyAndMail({
    type: "discovery",
    title: "词条生成完成",
    content: `术语「${discovery.term}」的 Wiki 词条已由 AI 生成，请前往审核`,
    articleTitle: entry.name,
    taskId: generateTaskId,
  }).catch((err) => {
    console.warn(
      `[Worker] Failed to send generation notification: ${err instanceof Error ? err.message : String(err)}`,
    );
  });

  // Record token usage
  if (result.totalTokensUsed) {
    recordAiUsage("generate", 0, 0, result.totalTokensUsed);
  }

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
 * 2. Load last discovery's contentSnapshot + existingCandidates from DB
 * 3. Call incrementalDiscover() using the unified diff pipeline
 *    (detectChanges + splitRange + buildContext)
 * 4. Store new candidates in the WikiDiscovery table
 * 5. Return summary including contentSnapshot for next incremental run
 *
 * Payload required fields:
 * - `articleId`: ID of the article to scan
 * - `articleSlug`: Slug of the article
 * - `articleLang`: Language code ("zh" | "en")
 */
async function processDiscover(job: Job): Promise<Record<string, unknown>> {
  const payload = (job.data.payload ?? {}) as Record<string, unknown>;
  const { taskId: discoverTaskId } = job.data as { taskId: string };
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

  // 2. Load old source content + existing candidates from the latest completed
  //    discover task's output (for incremental diff). If none exists, pass
  //    empty oldSourceContent which triggers a full scan.
  let oldSourceContent = "";
  let existingCandidatesMap: Record<string, DiscoveryCandidate[]> = {};

  {
    const latestDiscover = await prisma.aiTask.findFirst({
      where: {
        articleId: articleIdStr,
        type: "discover",
        status: "completed",
      },
      orderBy: { completedAt: "desc" },
      select: { output: true },
    });

    if (latestDiscover?.output && typeof latestDiscover.output === "object") {
      const output = latestDiscover.output as Record<string, unknown>;
      if (typeof output.contentSnapshot === "string") {
        oldSourceContent = output.contentSnapshot;
      }
      if (
        output.existingCandidates &&
        typeof output.existingCandidates === "object" &&
        !Array.isArray(output.existingCandidates)
      ) {
        existingCandidatesMap = output.existingCandidates as Record<string, DiscoveryCandidate[]>;
      }
    }
  }

  // 2b. Load the effective discovery prompt from settings
  const customDiscoveryPrompt = await loadCustomPrompt("discovery");

  // 3. Perform incremental discovery using the unified diff pipeline
  const result = await incrementalDiscover(
    oldSourceContent,
    content,
    existingCandidatesMap,
    langStr,
    articleIdStr,
    customDiscoveryPrompt,
  );

  console.log(
    `[Worker] Discovery found ${result.candidates.length} candidate terms for article ${articleIdStr}`,
  );

  // 4. Store candidates in the WikiDiscovery table
  let storedCount = 0;
  for (const c of result.candidates) {
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

  console.log(`[Worker] Discovery complete: ${storedCount}/${result.candidates.length} candidates stored`);

  // 5. Compute body-only content snapshot for next incremental run.
  //    We use stripFrontmatter here so the snapshot is the body only,
  //    matching what incrementalDiscover returns.
  const contentSnapshot = stripFrontmatter(content);

  // 6. Notify admin about discovery completion (fire-and-forget)
  notifyAndMail({
    type: "discovery",
    title: "术语发现完成",
    content: `文章发现 ${storedCount} 个候选术语，请前往审核`,
    articleId: articleIdStr,
    articleTitle: slugStr,
    taskId: discoverTaskId,
  }).catch((err) => {
    console.warn(
      `[Worker] Failed to send discovery notification: ${err instanceof Error ? err.message : String(err)}`,
    );
  });

  // Record token usage
  if (result.totalTokensUsed) {
    recordAiUsage("discover", 0, 0, result.totalTokensUsed);
  }

  // 7. Return summary including contentSnapshot + existingCandidatesMap
  //    for the next incremental run. incrementalBuilds the map
  //    keyed by sub-chunk content → candidates found.
  return {
    articleId: articleIdStr,
    discoveredAt: new Date().toISOString(),
    candidateCount: storedCount,
    candidates: result.candidates.map((c) => ({
      term: c.term,
      type: c.type,
      definition: c.definition,
      importance: c.importance,
    })),
    contentSnapshot,
    existingCandidates: result.existingCandidatesMap,
  };
}

async function processScan(job: Job): Promise<Record<string, unknown>> {
  console.log(`[Worker] Processing article scan`);
  await new Promise((resolve) => setTimeout(resolve, 2000));
  return { message: "扫描完成（模拟）", proposals: [] };
}

/**
 * Processes an auto-link job — re-renders articles whose wiki links are stale.
 *
 * This job type does NOT call DeepSeek; it purely re-renders Markdown/Notesaw
 * content to update wiki link references. It exists as a queue task so that:
 * 1. External cron triggers can enqueue it without blocking
 * 2. The result is tracked in the AiTask table for observability
 * 3. Feature flag (`features.autoLink`) enforcement is centralized
 *
 * Logic:
 * 1. Fetch all published original articles
 * 2. Check each article's link staleness via ArticleWikiLink table
 * 3. Re-render only stale articles (never detected or > 7 days old)
 * 4. Update renderedContent in DB
 *
 * Payload: none (operates on all published articles)
 */
async function processAutoLink(_job: Job): Promise<Record<string, unknown>> {
  console.log(`[Worker] Processing auto-link`);

  // 1. Fetch all published original articles (not translations)
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

  // 2. Batch query link detection timestamps from ArticleWikiLink
  const linkRecords = await prisma.articleWikiLink.groupBy({
    by: ["articleId"],
    _max: { detectedAt: true },
    where: { articleId: { in: articles.map((a) => a.id) } },
  });
  const lastDetectedMap = new Map(
    linkRecords.map((r) => [r.articleId, r._max.detectedAt]),
  );

  // 3. Count wiki entries per language
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
  const staleThresholdMs = 7 * 24 * 60 * 60 * 1000; // 7 days

  const toRender: Array<{
    id: string;
    slug: string;
    language: string;
    contentPath: string;
    contentType: string;
  }> = [];

  for (const article of articles) {
    const langWikiCount = wikiCountByLang[article.language] || 0;
    if (langWikiCount === 0) continue;

    const lastDetected = lastDetectedMap.get(article.id) ?? null;
    if (!lastDetected) {
      toRender.push(article);
    } else {
      const age = now.getTime() - new Date(lastDetected).getTime();
      if (age > staleThresholdMs) {
        toRender.push(article);
      }
    }
  }

  // 4. Re-render stale articles
  const errors: string[] = [];
  let reRendered = 0;

  for (const article of toRender) {
    try {
      const filePath = path.join(process.cwd(), article.contentPath);
      const rawContent = await fs.readFile(filePath, "utf-8");

      const { content: mdBody } = parseFrontmatter(rawContent);
      const pipeline: "markdown" | "notesaw" =
        (article.contentType as "markdown" | "notesaw") || "markdown";

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

  console.log(
    `[Worker] Auto-link complete: ${reRendered}/${toRender.length} articles re-rendered` +
      (errors.length > 0 ? `, ${errors.length} errors` : ""),
  );

  return {
    total: articles.length,
    needsUpdate: toRender.length,
    reRendered,
    errors: errors.length > 0 ? errors : undefined,
  };
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

const HANDLERS: Record<string, (job: Job) => Promise<Record<string, unknown>>> = {
  review: processReview,
  translate: processTranslate,
  discover: processDiscover,
  generate: processGenerate,
  auto_link: processAutoLink,
  // scan: disabled for now
};

/** Maps task type to its feature flag key in settings */
const FEATURE_FLAGS: Record<string, string> = {
  review: "aiReview",
  translate: "autoTranslate",
  discover: "wikiDiscovery",
  generate: "wikiGenerate",
};

/**
 * Safely updates an AiTask record only if it still exists.
 * Returns true if the record was updated, false if it no longer exists.
 *
 * @internal Exported for testing purposes.
 */
export async function updateTaskIfExists(
  taskId: string,
  data: Prisma.AiTaskUpdateInput,
): Promise<boolean> {
  try {
    const result = await prisma.aiTask.updateMany({
      where: { id: taskId },
      data,
    });
    return result.count > 0;
  } catch {
    return false;
  }
}

async function processJob(job: Job): Promise<Record<string, unknown>> {
  const { type, taskId } = job.data as {
    type: string;
    taskId: string;
    payload: Record<string, unknown>;
  };

  // Check if the task record still exists (may have been deleted by user)
  const existing = await prisma.aiTask.findUnique({
    where: { id: taskId },
    select: { id: true },
  });
  if (!existing) {
    console.warn(`[Worker] Task ${taskId} not found in DB (deleted by user), skipping job`);
    return { skipped: true, reason: "Task deleted by user" };
  }

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

    // Mark as completed (only if record still exists)
    const updated = await updateTaskIfExists(taskId, {
      status: "completed",
      output: result as JsonInput,
      completedAt: new Date(),
    });

    if (!updated) {
      console.warn(`[Worker] Job ${job.id} (task ${taskId}) completed but record was deleted`);
      return result;
    }

    console.log(`[Worker] Job ${job.id} (task ${taskId}) completed successfully`);
    return result;
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);

    // Mark as failed (only if record still exists)
    const updated = await updateTaskIfExists(taskId, {
      status: "failed",
      error: errorMessage,
    });

    if (!updated) {
      console.warn(`[Worker] Job ${job.id} (task ${taskId}) failed but record was deleted: ${errorMessage}`);
      return { error: errorMessage };
    }

    console.error(`[Worker] Job ${job.id} (task ${taskId}) failed: ${errorMessage}`);

    // Notify admin about task failure (fire-and-forget)
    const failedType = (job.data as Record<string, unknown>).type || "unknown";
    notifyAndMail({
      type: "task_failed",
      title: "AI 任务执行失败",
      content: `任务 ${failedType} (${taskId}) 执行失败：${errorMessage}`,
      taskId,
    }).catch((e) => {
      console.warn(`[Worker] Failed to send task_failed notification: ${e instanceof Error ? e.message : String(e)}`);
    });

    throw err; // Let Bull handle retry logic
  }
});

workerQueue.on("completed", (job) => {
  console.log(`[Worker] Job ${job.id} completed event`);
});

workerQueue.on("failed", (job, err) => {
  console.error(`[Worker] Job ${job.id} failed after attempts: ${err.message}`);
});

// ---------------------------------------------------------------------------
// Auto-link scheduler
// ---------------------------------------------------------------------------

/**
 * Checks settings and optionally starts a setInterval for auto-link scanning.
 * Cancelled on graceful shutdown.
 */
let autoLinkTimer: ReturnType<typeof setInterval> | null = null;

async function startAutoLinkScheduler(): Promise<void> {
  try {
    const settings = await getSettings();
    const autoLinkCfg = settings.features?.autoLink;
    const enabled = typeof autoLinkCfg === "object" ? autoLinkCfg.enabled : Boolean(autoLinkCfg);
    const intervalDays =
      typeof autoLinkCfg === "object" && typeof autoLinkCfg.intervalDays === "number"
        ? autoLinkCfg.intervalDays
        : 7;

    if (!enabled) {
      console.log("[Worker] Auto-link scheduler: disabled (feature flag off)");
      return;
    }

    const intervalMs = Math.max(intervalDays, 1) * 24 * 60 * 60 * 1000;

    console.log(
      `[Worker] Auto-link scheduler: enabled, scanning every ${intervalDays} day(s) (${intervalMs} ms)`,
    );

    // Run once immediately on startup
    processAutoLink({} as Job).catch((err) =>
      console.warn(`[Worker] Initial auto-link scan failed: ${err instanceof Error ? err.message : String(err)}`),
    );

    // Then schedule
    autoLinkTimer = setInterval(() => {
      processAutoLink({} as Job).catch((err) =>
        console.warn(`[Worker] Scheduled auto-link scan failed: ${err instanceof Error ? err.message : String(err)}`),
      );
    }, intervalMs);
  } catch (err) {
    console.warn(
      `[Worker] Failed to start auto-link scheduler: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

// Start the scheduler after worker is ready
startAutoLinkScheduler();

console.log("[Worker] ai-tasks worker started. Waiting for jobs...");

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("[Worker] Shutting down gracefully...");
  if (autoLinkTimer) clearInterval(autoLinkTimer);
  await workerQueue.close();
  await prisma.$disconnect();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("[Worker] Shutting down gracefully...");
  if (autoLinkTimer) clearInterval(autoLinkTimer);
  await workerQueue.close();
  await prisma.$disconnect();
  process.exit(0);
});
