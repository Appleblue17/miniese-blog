/**
 * @file Task producer for AI queue.
 *
 * Provides `addJob()` to create a new AI task:
 * 1. Inserts a record in the `AiTask` database table.
 * 2. Adds the job to the Bull `ai-tasks` queue.
 * 3. Returns the `taskId` for frontend polling.
 *
 * Feature flag checking is handled by the worker at processing time.
 */

import { getQueue } from "./client";
import { prisma } from "../db";
import type { AiTaskType } from "../../types/ai";
import type { Prisma } from "../../generated/prisma/client";

/** Input JSON type used by Prisma for Json fields */
type JsonInput = Prisma.InputJsonValue;

/**
 * Data payload for an AI task job.
 */
export interface JobData {
  /** The AI task type */
  type: AiTaskType;
  /** Arbitrary parameters passed to the worker */
  payload: Record<string, unknown>;
}

/**
 * Delete old AiTask records beyond the configured retain count.
 * Runs best-effort (catches errors silently).
 */
async function pruneOldTasks(): Promise<void> {
  try {
    const { getSettings } = await import("../../../config/settings");
    const settings = await getSettings();
    const maxCount = settings.ai.taskRetainCount;

    const total = await prisma.aiTask.count();

    if (total > maxCount) {
      const keep = await prisma.aiTask.findMany({
        orderBy: { createdAt: "desc" },
        take: maxCount,
        select: { id: true },
      });

      if (keep.length > 0) {
        const keepIds = new Set(keep.map((t) => t.id));
        await prisma.aiTask.deleteMany({
          where: { id: { notIn: [...keepIds] } },
        });
      }
    }
  } catch (err) {
    console.error("[Task Producer] Failed to prune old tasks:", err);
  }
}

/**
 * Creates a new AI task and enqueues it for processing.
 *
 * @param type - The type of AI task (review, translate, generate, scan).
 * @param payload - Task parameters (e.g. `{ articleId }`).
 * @param retries - Number of retries on failure (default: 2).
 * @returns The `taskId` (database record ID) for status polling.
 *
 * The payload must include `articleId` so the task can be linked
 * to its article. If present, it is also stored in AiTask.articleId
 * for direct relational queries.
 */
export async function addJob(
  type: AiTaskType,
  payload: Record<string, unknown>,
  retries = 2,
): Promise<string> {
  const articleId = typeof payload.articleId === "string" ? payload.articleId : undefined;

  // 1. Create database record
  const task = await prisma.aiTask.create({
    data: {
      type,
      status: "pending",
      input: payload as JsonInput,
      ...(articleId ? { articleId } : {}),
    },
  });

  // Prune old task records in the background
  await pruneOldTasks();

  // 2. Enqueue the job (with retries)
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const queue = await getQueue();
      await queue.add(
        type,
        { taskId: task.id, type, payload },
        {
          jobId: task.id,
        },
      );
      return task.id;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < retries) {
        // Wait before retrying (exponential backoff)
        await new Promise((resolve) => setTimeout(resolve, 500 * Math.pow(2, attempt)));
      }
    }
  }

  // All attempts failed — clean up the DB record
  try {
    await prisma.aiTask.delete({ where: { id: task.id } });
  } catch {
    // Best-effort cleanup
  }

  throw lastError || new Error("Failed to enqueue job after retries");
}
