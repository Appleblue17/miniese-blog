/**
 * @file Worker entry point.
 *
 * Separate Node.js process that consumes jobs from the `ai-tasks` Bull queue.
 * Dispatches to type-specific handler functions and updates the database.
 *
 * Usage: `npx tsx src/worker.ts`
 */

import "dotenv/config";
import Queue from "bull";
import { prisma } from "./lib/db";
import type { Job } from "bull";
import type { Prisma } from "./generated/prisma/client";

/** Input JSON type used by Prisma for Json fields */
type JsonInput = Prisma.InputJsonValue;
type JsonNullableInput = Prisma.NullableJsonNullValueInput | JsonInput;

/** Redis connection URL */
const REDIS_URL = process.env.REDIS_URL;
if (!REDIS_URL) {
  throw new Error("REDIS_URL environment variable is required");
}

// ---------------------------------------------------------------------------
// Placeholder handlers (Phase 4 — logging + simulated delay)
// ---------------------------------------------------------------------------

async function processReview(job: Job): Promise<Record<string, unknown>> {
  const { articleId } = (job.data.payload ?? {}) as Record<string, unknown>;
  console.log(`[Worker] Processing review for article ${String(articleId)}`);
  await new Promise((resolve) => setTimeout(resolve, 2000));
  return { message: "审查完成（模拟）", issues: [] };
}

async function processTranslate(job: Job): Promise<Record<string, unknown>> {
  const { articleId } = (job.data.payload ?? {}) as Record<string, unknown>;
  console.log(`[Worker] Processing translation for article ${String(articleId)}`);
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

const HANDLERS: Record<string, (job: Job) => Promise<Record<string, unknown>>> = {
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
