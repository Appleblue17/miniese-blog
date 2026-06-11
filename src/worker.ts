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
import { splitArticle } from "./lib/ai/chunker";
import { buildReviewPrompt } from "./lib/ai/prompts/review";
import { callDeepSeek } from "./lib/ai/client";
import { parseReviewReport } from "./lib/ai/parsers";
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
// Placeholder handlers (translate, generate, scan)
// ---------------------------------------------------------------------------

async function processTranslate(job: Job): Promise<Record<string, unknown>> {
  const { articleId } = (job.data.payload ?? {}) as Record<string, unknown>;
  console.log(
    `[Worker] Processing translation for article ${String(articleId)}`,
  );
  await new Promise((resolve) => setTimeout(resolve, 2000));
  return { message: "翻译完成（模拟）", targetLanguage: "en" };
}

async function processGenerate(job: Job): Promise<Record<string, unknown>> {
  console.log(`[Worker] Processing term generation`);
  await new Promise((resolve) => setTimeout(resolve, 2000));
  return { message: "词条生成完成（模拟）", terms: [] };
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
  generate: processGenerate,
  scan: processScan,
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
