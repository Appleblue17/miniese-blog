/**
 * @file POST /api/admin/ai-tasks/batch
 *
 * Batch operations on AI tasks.
 *
 * Body: { action: "retry" | "delete", taskIds: string[] }
 *
 * Response: { success: true, affectedCount: number }
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { addJob } from "@/lib/queue/producer";
import { getQueue } from "@/lib/queue/client";
import type { AiTaskType } from "@/types/ai";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      action?: string;
      taskIds?: string[];
    };

    const { action, taskIds } = body;

    if (!action || !["retry", "delete"].includes(action)) {
      return NextResponse.json(
        { error: "action must be 'retry' or 'delete'" },
        { status: 400 },
      );
    }

    if (!Array.isArray(taskIds) || taskIds.length === 0) {
      return NextResponse.json(
        { error: "taskIds must be a non-empty array" },
        { status: 400 },
      );
    }

    if (action === "delete") {
      // Remove Bull queue jobs first, then DB records
      for (const id of taskIds) {
        try {
          const queue = getQueue();
          const job = await queue.getJob(id);
          if (job) {
            await job.remove();
          }
        } catch {
          // best-effort
        }
      }
      const result = await prisma.aiTask.deleteMany({
        where: { id: { in: taskIds } },
      });
      return NextResponse.json({ success: true, affectedCount: result.count });
    }

    if (action === "retry") {
      const tasks = await prisma.aiTask.findMany({
        where: { id: { in: taskIds } },
      });

      let retriedCount = 0;
      for (const task of tasks) {
        const isSkipped =
          task.status === "completed" &&
          task.output !== null &&
          typeof task.output === "object" &&
          (task.output as Record<string, unknown>).skipped === true;

        if (task.status !== "failed" && !isSkipped) continue;

        try {
          const payload = (task.input ?? {}) as Record<string, unknown>;
          await addJob(task.type as AiTaskType, payload);
          await prisma.aiTask.delete({ where: { id: task.id } });
          retriedCount++;
        } catch (err) {
          console.warn(
            `[Batch retry] Failed to retry task ${task.id}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }

      return NextResponse.json({ success: true, affectedCount: retriedCount });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("Batch AI task operation error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
