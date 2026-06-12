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
import { splitArticle } from "./lib/ai/chunker/chunker";
import { buildReviewPrompt } from "./lib/ai/prompts/review";
import { callDeepSeek } from "./lib/ai/client";
import { parseReviewReport, parseGenerateResponse } from "./lib/ai/parsers";
import { incrementalTranslate, type TranslationMap } from "./lib/ai/translator2";
import { buildGenerateSystemPrompt, buildGenerateUserPrompt } from "./lib/ai/prompts/generate";
import { renderMarkdown } from "./lib/markdown/renderer";
import { detectWikiLinks } from "./lib/markdown/linkDetector";
import { parseFrontmatter } from "./lib/articles/frontmatter";
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
 * 2. Split content into chunks (by headings/paragraphs)
 * 3. Review each chunk serially via DeepSeek API
 * 4. Merge chunk reports into a single output
 * 5. Return merged report (stored in AiTask.output)
 */
async function processReview(job: Job): Promise<Record<string, unknown>> {
  const { articleId, version } = (job.data.payload ?? {}) as Record<
    string,
    unknown
  >;

  console.log(
    `[Worker] Processing review for article ${String(articleId)} (version ${String(version ?? "latest")})`,
  );

  // 1. Read article content from DB + file system
  const article = await prisma.article.findUnique({
    where: { id: String(articleId) },
    select: { contentPath: true, slug: true, title: true },
  });

  if (!article) {
    throw new Error(`Article not found: ${articleId}`);
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

  // 2. Split content into chunks
  const chunks = splitArticle(content);
  console.log(
    `[Worker] Article split into ${chunks.length} chunks for review`,
  );

  if (chunks.length === 0) {
    return {
      articleId,
      version: version ?? "latest",
      reviewedAt: new Date().toISOString(),
      chunks: [],
      summary: { totalIssues: 0, errors: 0, warnings: 0, suggestions: 0 },
    };
  }

  // 3. Review each chunk serially, updating progress after each
  const chunkReports: Array<{
    chunkId: number;
    chunkTitle: string;
    startLine: number;
    endLine: number;
    sections: Array<Record<string, unknown>>;
  }> = [];

  let chunkFailures = 0;

  // Store total chunk count immediately so the UI can show it
  const { taskId } = job.data as { taskId: string };
  await prisma.aiTask.update({
    where: { id: taskId },
    data: {
      output: {
        progress: { totalChunks: chunks.length, processedChunks: 0 },
      } as JsonInput,
    },
  });

  for (const chunk of chunks) {
    console.log(
      `[Worker] Reviewing chunk ${chunk.id + 1}/${chunks.length}: "${chunk.title}"`,
    );

    const prompt = buildReviewPrompt(chunk.content);

    try {
      const response = await callDeepSeek({
        prompt,
        responseFormat: "json",
        temperature: 0.3,
        maxTokens: 4096,
      });

      const report = parseReviewReport(response.content);

      if (report) {
        chunkReports.push({
          chunkId: chunk.id,
          chunkTitle: chunk.title,
          startLine: chunk.startLine,
          endLine: chunk.endLine,
          sections: report.sections as unknown as Array<Record<string, unknown>>,
        });
      } else {
        console.warn(
          `[Worker] Chunk ${chunk.id} review returned unparseable response`,
        );
        chunkReports.push({
          chunkId: chunk.id,
          chunkTitle: chunk.title,
          startLine: chunk.startLine,
          endLine: chunk.endLine,
          sections: [],
        });
      }
    } catch (err) {
      chunkFailures++;
      console.error(
        `[Worker] Chunk ${chunk.id} review failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      // Continue with next chunk even if one fails
      chunkReports.push({
        chunkId: chunk.id,
        chunkTitle: chunk.title,
        startLine: chunk.startLine,
        endLine: chunk.endLine,
        sections: [],
      });
    }

    // Update progress after each chunk (fire-and-forget, don't block on failure)
    prisma.aiTask.update({
      where: { id: taskId },
      data: {
        output: {
          progress: { totalChunks: chunks.length, processedChunks: chunkReports.length },
        } as JsonInput,
      },
    }).catch((err) => {
      console.warn(`[Worker] Failed to update progress: ${err instanceof Error ? err.message : String(err)}`);
    });
  }

  // If ALL chunks failed, propagate the error to mark the task as failed
  if (chunkFailures === chunks.length) {
    throw new Error(
      `All ${chunks.length} chunk(s) failed during AI review. Check API key and network connectivity.`,
    );
  }

  // If some chunks failed, warn but continue with partial results
  if (chunkFailures > 0) {
    console.warn(
      `[Worker] ${chunkFailures}/${chunks.length} chunk(s) failed. Returning partial results.`,
    );
  }

  // 4. Compute summary stats (exclude "ok" items — they're not issues)
  let totalIssues = 0;
  let errors = 0;
  let warnings = 0;
  let suggestions = 0;

  for (const cr of chunkReports) {
    for (const section of cr.sections) {
      const items = (section as { items?: Array<{ severity?: string }> }).items ?? [];
      for (const item of items) {
        if (item.severity === "ok") continue;
        totalIssues++;
        if (item.severity === "error") errors++;
        else if (item.severity === "warning") warnings++;
        else if (item.severity === "suggestion") suggestions++;
      }
    }
  }

  console.log(
    `[Worker] Review complete: ${totalIssues} issues found (${errors} errors, ${warnings} warnings, ${suggestions} suggestions)`,
  );

  // 5. Return merged report
  return {
    articleId,
    version: version ?? "latest",
    reviewedAt: new Date().toISOString(),
    chunks: chunkReports,
    summary: { totalIssues, errors, warnings, suggestions },
  };
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
 * 10. Return translation stats
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
  const oldSourceContent =
    typeof rawOldContent === "string" ? rawOldContent : "";

  // 4. Load existing translations from the latest completed translate task
  const existingTranslationMap = await loadExistingTranslations(
    articleIdStr,
    targetLang,
  );

  // 5. Detect source/target language names for prompts
  const sourceLangName = sourceLang === "zh" ? "Chinese" : "English";
  const targetLangName = targetLang === "en" ? "English" : "Chinese";

  // 6. Perform incremental translation (or full translation if forced)
  const result = await incrementalTranslate(
    oldSourceContent,
    currentSourceContent,
    existingTranslationMap,
    sourceLangName,
    targetLangName,
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
  console.log(`[Worker] Target article DB record updated: title="${translatedTitle || "(kept original)"}", language=${targetLang}`);

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

    console.log(
      `[Worker] Rendered content updated for article ${targetArticleIdStr}`,
    );
  } catch (err) {
    // Rendering is a best-effort step — don't fail the whole task
    console.warn(
      `[Worker] Failed to re-render translated article: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // 11. Return result including the full translation map for future incremental runs
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
 * Flow:
 * 1. Read article content from file system
 * 2. Fetch existing wiki terms for the article's language (to avoid duplicates)
 * 3. Build prompt and call DeepSeek API
 * 4. Parse the response to extract candidate terms
 * 5. Create wiki entries (status: proposed) in DB and file system
 * 6. Return summary of generated terms
 *
 * Payload required fields:
 * - `articleId`: ID of the article to analyze
 */
async function processGenerate(job: Job): Promise<Record<string, unknown>> {
  const payload = (job.data.payload ?? {}) as Record<string, unknown>;
  const { articleId } = payload;

  const articleIdStr = String(articleId ?? "");

  console.log(`[Worker] Processing term generation for article ${articleIdStr}`);

  if (!articleIdStr) {
    throw new Error("Missing required payload field: articleId");
  }

  // 1. Read article content from DB + file system
  const article = await prisma.article.findUnique({
    where: { id: articleIdStr },
    select: { contentPath: true, slug: true, title: true, language: true },
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

  // 2. Fetch existing wiki terms for this language (to avoid duplicates)
  const existingEntries = await prisma.wikiEntry.findMany({
    where: { language: article.language },
    select: { name: true },
  });
  const existingTermNames = existingEntries.map((e) => e.name);

  // 3. Build prompt and call DeepSeek
  // Note: callDeepSeek doesn't support separate systemPrompt, so we prepend
  // the system instructions to the user prompt
  const systemPrompt = buildGenerateSystemPrompt();
  const userPrompt = buildGenerateUserPrompt(
    content,
    article.title,
    existingTermNames,
  );

  const combinedPrompt = `${systemPrompt}\n\n${userPrompt}`;

  console.log(
    `[Worker] Calling DeepSeek for term generation (article: "${article.title}")`,
  );

  const response = await callDeepSeek({
    prompt: combinedPrompt,
    responseFormat: "json",
    temperature: 0.3,
    maxTokens: 4096,
  });

  // 4. Parse the response
  const generateResult = parseGenerateResponse(response.content);

  if (!generateResult) {
    console.warn(
      `[Worker] Term generation returned unparseable response for article ${articleIdStr}`,
    );
    return {
      articleId: articleIdStr,
      generatedAt: new Date().toISOString(),
      termsCount: 0,
      terms: [],
      message: "AI returned unparseable response.",
    };
  }

  console.log(
    `[Worker] AI suggested ${generateResult.terms.length} candidate terms`,
  );

  // 5. Create wiki entries (status: proposed) in DB and file system
  const createdTerms: Array<{
    name: string;
    definition: string;
    tags: string[];
    aliases: string[];
    id: string;
  }> = [];

  for (const term of generateResult.terms) {
    try {
      // Check for duplicate one more time (race condition guard)
      const existing = await prisma.wikiEntry.findUnique({
        where: {
          name_language: {
            name: term.name,
            language: article.language,
          },
        },
      });

      if (existing) {
        console.log(
          `[Worker] Term "${term.name}" already exists, skipping`,
        );
        continue;
      }

      // Build content file path
      const slug = term.name
        .replace(/[^a-zA-Z0-9\u4e00-\u9fff_-]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "")
        .toLowerCase() || term.name.toLowerCase();

      const fileName = `${slug}.md`;
      const contentPath = `content/wiki/${article.language}/${fileName}`;
      const fullDir = path.join(process.cwd(), `content/wiki/${article.language}`);
      const fullPath = path.join(fullDir, fileName);

      // Write wiki file with basic frontmatter
      const fileContent = [
        "---",
        `name: "${term.name}"`,
        `language: ${article.language}`,
        `status: proposed`,
        `aliases: [${term.aliases.map((a) => `"${a}"`).join(", ")}]`,
        `tags: [${term.tags.map((t) => `"${t}"`).join(", ")}]`,
        "---",
        "",
        term.definition,
      ].join("\n");

      await fs.mkdir(fullDir, { recursive: true });
      await fs.writeFile(fullPath, fileContent, "utf-8");

      // Create DB record
      const entry = await prisma.wikiEntry.create({
        data: {
          name: term.name,
          language: article.language,
          definition: term.definition,
          contentPath,
          tags: term.tags,
          aliases: term.aliases,
          status: "proposed",
          accessGroup: [],
        },
      });

      createdTerms.push({
        name: entry.name,
        definition: entry.definition,
        tags: entry.tags,
        aliases: entry.aliases,
        id: entry.id,
      });

      console.log(
        `[Worker] Created proposed wiki entry: "${term.name}"`,
      );
    } catch (err) {
      console.warn(
        `[Worker] Failed to create wiki entry "${term.name}": ${err instanceof Error ? err.message : String(err)}`,
      );
      // Continue with next term
    }
  }

  console.log(
    `[Worker] Term generation complete: ${createdTerms.length}/${generateResult.terms.length} terms created`,
  );

  // 6. Return summary
  return {
    articleId: articleIdStr,
    generatedAt: new Date().toISOString(),
    termsCount: createdTerms.length,
    terms: createdTerms,
    message: createdTerms.length > 0
      ? `Successfully generated ${createdTerms.length} wiki term(s).`
      : "No new terms were generated (all suggestions already exist or failed).",
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

const HANDLERS: Record<
  string,
  (job: Job) => Promise<Record<string, unknown>>
> = {
  review: processReview,
  translate: processTranslate,
  // generate: disabled for now
  // scan: disabled for now
};

async function processJob(job: Job): Promise<Record<string, unknown>> {
  const { type, taskId } = job.data as {
    type: string;
    taskId: string;
    payload: Record<string, unknown>;
  };

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

    console.log(
      `[Worker] Job ${job.id} (task ${taskId}) completed successfully`,
    );
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

    console.error(
      `[Worker] Job ${job.id} (task ${taskId}) failed: ${errorMessage}`,
    );
    throw err; // Let Bull handle retry logic
  }
});

workerQueue.on("completed", (job) => {
  console.log(`[Worker] Job ${job.id} completed event`);
});

workerQueue.on("failed", (job, err) => {
  console.error(
    `[Worker] Job ${job.id} failed after attempts: ${err.message}`,
  );
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
