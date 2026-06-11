/**
 * @file Bull queue initialization.
 *
 * Creates and exports the `ai-tasks` queue instance.
 * Redis connection is configured via the `REDIS_URL` environment variable.
 */

import Queue from "bull";

const REDIS_URL = process.env.REDIS_URL;

if (!REDIS_URL) {
  throw new Error("REDIS_URL environment variable is required");
}

/**
 * The shared `ai-tasks` Bull queue instance.
 * Used by producers to add jobs and by workers to process them.
 */
export const aiTaskQueue = new Queue("ai-tasks", REDIS_URL, {
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
