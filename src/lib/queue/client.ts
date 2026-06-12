/**
 * @file Bull queue initialization.
 *
 * Provides a lazily-initialized `ai-tasks` Bull queue instance.
 * Redis connection is configured via the `REDIS_URL` environment variable.
 *
 * The queue is created lazily to allow safe module imports in test
 * environments without Redis, and to prevent eager connections during
 * Next.js SSR / API route loading.
 */

import Queue from "bull";

let _queue: Queue.Queue | null = null;

function getRedisUrl(): string {
  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error("REDIS_URL environment variable is required");
  }
  return url;
}

/**
 * Returns (and creates on first call) the shared `ai-tasks` Bull queue instance.
 *
 * The queue is lazily initialized so that importing this module does not
 * immediately throw if REDIS_URL is unset — only when the queue is actually
 * used (e.g. when a job is added or the worker connects).
 *
 * Usage:
 * ```ts
 * import { getQueue } from "@/lib/queue/client";
 * const queue = getQueue();
 * await queue.add("review", { ... });
 * ```
 *
 * Used by producers to add jobs and by workers to process them.
 */
export function getQueue(): Queue.Queue {
  if (!_queue) {
    const redisUrl = getRedisUrl();
    _queue = new Queue("ai-tasks", redisUrl, {
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 2000,
        },
        removeOnComplete: 100,
        removeOnFail: 50,
      },
    });
  }
  return _queue;
}
