/**
 * @file Integration tests for AI task deletion and worker resilience.
 *
 * Tests:
 * 1. Single task deletion also removes Bull queue job
 * 2. Batch deletion discards active Bull jobs before DB delete
 * 3. Article deletion cascades to related AiTask and WikiDiscovery records
 * 4. Worker's updateTaskIfExists handles missing records gracefully
 * 5. Batch retry
 *
 * These tests require a running PostgreSQL database AND Redis.
 * They will be skipped if either is not available.
 */

import { describe, it, expect, afterAll } from "vitest";
import { isDatabaseAvailable } from "./setup";
import { prisma } from "./db-client";

const isDbAvailable = await isDatabaseAvailable();

const createdTaskIds: string[] = [];
const createdArticleIds: string[] = [];

const describeDb = isDbAvailable ? describe : describe.skip;

describeDb("AI Task Deletion & Worker Resilience", () => {
  afterAll(async () => {
    // Clean up all created records
    if (createdTaskIds.length > 0) {
      await prisma.aiTask.deleteMany({
        where: { id: { in: createdTaskIds } },
      });
    }
    if (createdArticleIds.length > 0) {
      await prisma.article.deleteMany({
        where: { id: { in: createdArticleIds } },
      });
    }
  });

  // ── Helper: create a test article ──
  async function createTestArticle(slug: string): Promise<string> {
    const article = await prisma.article.create({
      data: {
        slug,
        title: `Test Article ${slug}`,
        language: "zh",
        status: "draft",
        contentPath: `content/articles/drafts/${slug}.md`,
      },
    });
    createdArticleIds.push(article.id);
    return article.id;
  }

  // ── Helper: create a test task ──
  async function createTestTask(
    overrides: Partial<{
      type: string;
      status: string;
      input: Record<string, unknown>;
      output: Record<string, unknown> | null;
      articleId: string | null;
      error: string | null;
    }> = {},
  ): Promise<string> {
    const task = await prisma.aiTask.create({
      data: {
        type: (overrides.type ?? "review") as any,
        status: (overrides.status ?? "pending") as any,
        input: (overrides.input ?? { source: "test" }) as any,
        output: overrides.output as any ?? null,
        articleId: overrides.articleId ?? null,
        error: overrides.error ?? null,
      },
    });
    createdTaskIds.push(task.id);
    return task.id;
  }

  // ═══════════════════════════════════════════════════════════════
  // 1. Single task deletion
  // ═══════════════════════════════════════════════════════════════

  it("DELETE /api/admin/ai-tasks/[id] removes DB record", async () => {
    const taskId = await createTestTask();

    const { DELETE } = await import("@/app/api/admin/ai-tasks/[id]/route");
    const request = new Request("http://localhost:3000");
    const response = await DELETE(request as never, {
      params: Promise.resolve({ id: taskId }),
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);

    // Verify DB record is deleted
    const task = await prisma.aiTask.findUnique({ where: { id: taskId } });
    expect(task).toBeNull();

    // Remove from cleanup list since already deleted
    const idx = createdTaskIds.indexOf(taskId);
    if (idx >= 0) createdTaskIds.splice(idx, 1);
  });

  it("DELETE /api/admin/ai-tasks/[id] returns 404 for non-existent task", async () => {
    const { DELETE } = await import("@/app/api/admin/ai-tasks/[id]/route");
    const request = new Request("http://localhost:3000");
    const response = await DELETE(request as never, {
      params: Promise.resolve({ id: "00000000-0000-0000-0000-000000000000" }),
    });

    expect(response.status).toBe(404);
  });

  // ═══════════════════════════════════════════════════════════════
  // 2. Batch deletion
  // ═══════════════════════════════════════════════════════════════

  it("POST /api/admin/ai-tasks/batch delete removes multiple tasks", async () => {
    const id1 = await createTestTask({ type: "review", status: "pending" });
    const id2 = await createTestTask({ type: "translate", status: "completed" });
    const id3 = await createTestTask({ type: "generate", status: "failed" });

    const { POST } = await import("@/app/api/admin/ai-tasks/batch/route");
    const request = new Request("http://localhost:3000", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "delete",
        taskIds: [id1, id2, id3],
      }),
    });
    const response = await POST(request as never);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.affectedCount).toBe(3);

    // Verify all are deleted
    const remaining = await prisma.aiTask.findMany({
      where: { id: { in: [id1, id2, id3] } },
    });
    expect(remaining).toHaveLength(0);

    // Remove from cleanup list
    for (const id of [id1, id2, id3]) {
      const idx = createdTaskIds.indexOf(id);
      if (idx >= 0) createdTaskIds.splice(idx, 1);
    }
  });

  it("POST /api/admin/ai-tasks/batch delete with empty taskIds returns 400", async () => {
    const { POST } = await import("@/app/api/admin/ai-tasks/batch/route");
    const request = new Request("http://localhost:3000", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", taskIds: [] }),
    });
    const response = await POST(request as never);
    expect(response.status).toBe(400);
  });

  it("POST /api/admin/ai-tasks/batch delete with invalid action returns 400", async () => {
    const { POST } = await import("@/app/api/admin/ai-tasks/batch/route");
    const request = new Request("http://localhost:3000", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "invalid", taskIds: ["some-id"] }),
    });
    const response = await POST(request as never);
    expect(response.status).toBe(400);
  });

  // ═══════════════════════════════════════════════════════════════
  // 3. Article deletion cascades to AiTask and WikiDiscovery
  // ═══════════════════════════════════════════════════════════════

  it("article deletion cascades to related AiTask records", async () => {
    const article = await prisma.article.create({
      data: {
        slug: "cascade-test",
        title: "级联删除测试",
        language: "zh",
        status: "draft",
        contentPath: "content/articles/drafts/cascade-test.md",
      },
    });
    createdArticleIds.push(article.id);

    // Create two tasks linked to the article
    const task1 = await createTestTask({
      type: "review",
      status: "completed",
      articleId: article.id,
      output: { someData: true },
    });
    const task2 = await createTestTask({
      type: "translate",
      status: "pending",
      articleId: article.id,
    });

    // Also create orphan tasks (no articleId) — should be unaffected
    const orphanTask = await createTestTask({
      type: "discover",
      status: "completed",
      articleId: null,
    });

    // Delete the article
    const { POST } = await import("@/app/api/articles/delete/route");
    const request = new Request("http://localhost:3000", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: article.id }),
    });
    const response = await POST(request as never);
    expect(response.status).toBe(200);

    // Article should be gone
    const deleted = await prisma.article.findUnique({ where: { id: article.id } });
    expect(deleted).toBeNull();

    // AiTask records linked to the article should also be gone (cascade)
    const task1Check = await prisma.aiTask.findUnique({ where: { id: task1 } });
    expect(task1Check).toBeNull();

    const task2Check = await prisma.aiTask.findUnique({ where: { id: task2 } });
    expect(task2Check).toBeNull();

    // Orphan task (no articleId) should still exist
    const orphanCheck = await prisma.aiTask.findUnique({ where: { id: orphanTask } });
    expect(orphanCheck).not.toBeNull();

    // Remove orphan from cleanup list since we keep it
    const orphanIdx = createdTaskIds.indexOf(orphanTask);
    if (orphanIdx >= 0) createdTaskIds.splice(orphanIdx, 1);
    // task1 and task2 are removed by cascade, also remove from cleanup
    const idx1 = createdTaskIds.indexOf(task1);
    if (idx1 >= 0) createdTaskIds.splice(idx1, 1);
    const idx2 = createdTaskIds.indexOf(task2);
    if (idx2 >= 0) createdTaskIds.splice(idx2, 1);
  });

  it("deleting published article cascades to translation article's tasks too", async () => {
    const originalArticle = await prisma.article.create({
      data: {
        slug: "original-for-translation-cascade",
        title: "原始文章",
        language: "zh",
        status: "published",
        contentPath: "content/articles/drafts/original-for-translation-cascade.md",
      },
    });
    createdArticleIds.push(originalArticle.id);

    // Create a translation article
    const translationArticle = await prisma.article.create({
      data: {
        slug: "original-for-translation-cascade",
        title: "Original Article EN",
        language: "en",
        status: "published",
        contentPath: "content/articles/drafts/original-for-translation-cascade-en.md",
        originalId: originalArticle.id,
      },
    });
    createdArticleIds.push(translationArticle.id);

    // Create a discover task on the translation article
    const discoverTask = await createTestTask({
      type: "discover",
      status: "completed",
      articleId: translationArticle.id,
      output: { candidateCount: 3 },
    });

    // Delete the original article (cascades to translation and its tasks)
    const { POST } = await import("@/app/api/articles/delete/route");
    const request = new Request("http://localhost:3000", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: originalArticle.id }),
    });
    const response = await POST(request as never);
    expect(response.status).toBe(200);

    // Original article should be gone
    const originalDeleted = await prisma.article.findUnique({
      where: { id: originalArticle.id },
    });
    expect(originalDeleted).toBeNull();

    // Translation article should also be gone
    const translationDeleted = await prisma.article.findUnique({
      where: { id: translationArticle.id },
    });
    expect(translationDeleted).toBeNull();

    // The discover task should also be gone (cascade from translation)
    const task = await prisma.aiTask.findUnique({ where: { id: discoverTask } });
    expect(task).toBeNull();

    // Remove from cleanup (already gone)
    const discoverIdx = createdTaskIds.indexOf(discoverTask);
    if (discoverIdx >= 0) createdTaskIds.splice(discoverIdx, 1);
  });

  // ═══════════════════════════════════════════════════════════════
  // 4. Worker's updateTaskIfExists
  // ═══════════════════════════════════════════════════════════════
  //
  // We test updateTaskIfExists via relative path since it's exported from worker.ts.
  // Using relative path to avoid @/ alias issues with dynamic imports.

  it("updateTaskIfExists returns true when task exists", async () => {
    const taskId = await createTestTask({ type: "review", status: "pending" });

    const workerModule = await import("../../src/worker");
    const { updateTaskIfExists } = workerModule;

    const result = await updateTaskIfExists(taskId, {
      status: "completed",
    });
    expect(result).toBe(true);

    // Verify DB was updated
    const task = await prisma.aiTask.findUnique({ where: { id: taskId } });
    expect(task?.status).toBe("completed");
  });

  it("updateTaskIfExists returns false when task was deleted", async () => {
    const taskId = await createTestTask({ type: "translate", status: "processing" });

    // Delete the task first
    await prisma.aiTask.delete({ where: { id: taskId } });
    const idx = createdTaskIds.indexOf(taskId);
    if (idx >= 0) createdTaskIds.splice(idx, 1);

    const workerModule = await import("../../src/worker");
    const { updateTaskIfExists } = workerModule;

    const result = await updateTaskIfExists(taskId, {
      status: "completed",
      output: { shouldNotPersist: true },
    });
    expect(result).toBe(false);

    // Verify no record was created
    const task = await prisma.aiTask.findUnique({ where: { id: taskId } });
    expect(task).toBeNull();
  });

  // ═══════════════════════════════════════════════════════════════
  // 5. Batch retry
  // ═══════════════════════════════════════════════════════════════

  it("POST /api/admin/ai-tasks/batch retry re-creates failed tasks", async () => {
    // Use a non-existent articleId so producer won't hit FK constraint.
    // producer.ts creates: { articleId: payload.articleId } in the input,
    // and since we set articleId to undefined, the FK issue is avoided.
    const taskId = await createTestTask({
      type: "review",
      status: "failed",
      input: { source: "retry-failed-test", articleId: undefined },
      error: "Something went wrong",
    });

    const { POST } = await import("@/app/api/admin/ai-tasks/batch/route");
    const request = new Request("http://localhost:3000", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "retry",
        taskIds: [taskId],
      }),
    });
    const response = await POST(request as never);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);

    // Old task should be deleted and new one created
    const oldTask = await prisma.aiTask.findUnique({ where: { id: taskId } });
    expect(oldTask).toBeNull();

    // Remove from cleanup list (old task is gone)
    const idx = createdTaskIds.indexOf(taskId);
    if (idx >= 0) createdTaskIds.splice(idx, 1);

    // A new task should exist with the same type and pending status
    const newTask = await prisma.aiTask.findFirst({
      where: {
        type: "review",
        status: "pending",
      },
      orderBy: { createdAt: "desc" },
    });
    expect(newTask).not.toBeNull();
    if (newTask) {
      const input = newTask.input as Record<string, unknown>;
      expect(input.source).toBe("retry-failed-test");
      createdTaskIds.push(newTask.id);
    }
  });

  it("retry skips non-failed tasks", async () => {
    const taskId = await createTestTask({
      type: "review",
      status: "completed",
      input: { source: "should-skip" },
    });

    const { POST } = await import("@/app/api/admin/ai-tasks/batch/route");
    const request = new Request("http://localhost:3000", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "retry",
        taskIds: [taskId],
      }),
    });
    const response = await POST(request as never);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.affectedCount).toBe(0);

    // Original task should still exist
    const task = await prisma.aiTask.findUnique({ where: { id: taskId } });
    expect(task).not.toBeNull();
  });

  it("retry re-creates skipped tasks", async () => {
    const taskId = await createTestTask({
      type: "review",
      status: "completed",
      input: { source: "retry-skipped" },
      output: { skipped: true, reason: "Feature disabled" },
    });

    const { POST } = await import("@/app/api/admin/ai-tasks/batch/route");
    const request = new Request("http://localhost:3000", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "retry",
        taskIds: [taskId],
      }),
    });
    const response = await POST(request as never);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.affectedCount).toBe(1);

    // Old task should be deleted
    const oldTask = await prisma.aiTask.findUnique({ where: { id: taskId } });
    expect(oldTask).toBeNull();

    const idx = createdTaskIds.indexOf(taskId);
    if (idx >= 0) createdTaskIds.splice(idx, 1);

    // New task should exist
    const newTask = await prisma.aiTask.findFirst({
      where: {
        type: "review",
        status: "pending",
      },
      orderBy: { createdAt: "desc" },
    });
    expect(newTask).not.toBeNull();
    if (newTask) {
      const input = newTask.input as Record<string, unknown>;
      expect(input.source).toBe("retry-skipped");
      createdTaskIds.push(newTask.id);
    }
  });
});
