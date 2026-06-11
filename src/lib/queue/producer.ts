/**
 * @file Task producer for AI queue.
 *
 * Provides `addJob()` to create a new AI task:
 * 1. Inserts a record in the `AiTask` database table.
 * 2. Adds the job to the Bull `ai-tasks` queue.
 * 3. Returns the `taskId` for frontend polling.
 */

import { aiTaskQueue } from "./client";
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
 * Creates a new AI task and enqueues it for processing.
 *
 * @param type - The type of AI task (review, translate, generate, scan).
 * @param payload - Task parameters (e.g. `{ articleId }`).
 * @returns The `taskId` (database record ID) for status polling.
 */
export async function addJob(
  type: AiTaskType,
  payload: Record<string, unknown>,
): Promise<string> {
  // 1. Create database record
  const task = await prisma.aiTask.create({
    data: {
      type,
      status: "pending",
      input: payload as JsonInput,
    },
  });

  // 2. Enqueue the job
  await aiTaskQueue.add(
    type,
    { taskId: task.id, type, payload },
    {
      jobId: task.id,
    },
  );

  return task.id;
}
