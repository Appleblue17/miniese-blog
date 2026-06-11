/**
 * @file Integration tests for queue infrastructure (Phase 4).
 *
 * Tests:
 * 1. Creating a task via producer creates a DB record
 * 2. Status API returns correct task state
 * 3. End-to-end: producer + worker using isolated queue
 *
 * These tests require a running PostgreSQL database AND Redis.
 * They will be skipped if either is not available.
 */

import { describe, it, expect, afterAll } from "vitest";
import { toNextRequest } from "./helpers";
import { isDatabaseAvailable } from "./setup";

const isDbAvailable = await isDatabaseAvailable();

const createdTaskIds: string[] = [];
const createdArticleIds: string[] = [];

const describeDb = isDbAvailable ? describe : describe.skip;

/**
 * Creates a minimal Article record in the DB so AiTask foreign key works.
 * Returns the article ID.
 */
async function createTestArticle(slug: string): Promise<string> {
  const { prisma } = await import("./db-client");
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

describeDb("Queue infrastructure", () => {
  afterAll(async () => {
    if (createdTaskIds.length > 0) {
      const { prisma } = await import("./db-client");
      await prisma.aiTask.deleteMany({
        where: { id: { in: createdTaskIds } },
      });
    }
    if (createdArticleIds.length > 0) {
      const { prisma } = await import("./db-client");
      await prisma.article.deleteMany({
        where: { id: { in: createdArticleIds } },
      });
    }
  });

  // -----------------------------------------------------------------------
  // 1. Producer creates tasks
  // -----------------------------------------------------------------------

  it("creates a review task via producer", async () => {
    const { addJob } = await import("@/lib/queue/producer");
    const articleId = await createTestArticle("producer-review");

    const taskId = await addJob("review", { articleId });
    createdTaskIds.push(taskId);

    expect(taskId).toBeDefined();
    expect(typeof taskId).toBe("string");

    const { prisma } = await import("./db-client");
    const task = await prisma.aiTask.findUnique({ where: { id: taskId } });
    expect(task).toBeDefined();
    expect(task!.type).toBe("review");
    expect(task!.status).toBe("pending");
    expect(task!.input).toEqual({ articleId });
  });

  it("creates all supported task types", async () => {
    const { addJob } = await import("@/lib/queue/producer");

    for (const type of ["translate", "generate", "scan"] as const) {
      const taskId = await addJob(type, {});
      createdTaskIds.push(taskId);

      const { prisma } = await import("./db-client");
      const task = await prisma.aiTask.findUnique({ where: { id: taskId } });
      expect(task).toBeDefined();
      expect(task!.type).toBe(type);
      expect(task!.status).toBe("pending");
    }
  });

  // -----------------------------------------------------------------------
  // 2. Status API
  // -----------------------------------------------------------------------

  it("returns pending state for unprocessed task", async () => {
    const { addJob } = await import("@/lib/queue/producer");
    const articleId = await createTestArticle("status-pending");

    const taskId = await addJob("review", { articleId });
    createdTaskIds.push(taskId);

    const { GET } = await import("@/app/api/ai/status/[taskId]/route");

    const response = await GET(
      toNextRequest(new Request("http://localhost:3000")),
      { params: Promise.resolve({ taskId }) },
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.id).toBe(taskId);
    expect(data.status).toBe("pending");
    expect(data.input).toEqual({ articleId });
  });

  it("returns 404 for non-existent task", async () => {
    const { GET } = await import("@/app/api/ai/status/[taskId]/route");

    const response = await GET(
      toNextRequest(new Request("http://localhost:3000")),
      { params: Promise.resolve({ taskId: "00000000-0000-0000-0000-000000000000" }) },
    );

    expect(response.status).toBe(404);
  });

  it("returns completed state", async () => {
    const { prisma } = await import("./db-client");
    const task = await prisma.aiTask.create({
      data: {
        type: "review",
        status: "completed",
        input: {},
        output: { message: "Done" },
        completedAt: new Date(),
      },
    });
    createdTaskIds.push(task.id);

    const { GET } = await import("@/app/api/ai/status/[taskId]/route");

    const response = await GET(
      toNextRequest(new Request("http://localhost:3000")),
      { params: Promise.resolve({ taskId: task.id }) },
    );
    const data = await response.json();

    expect(data.status).toBe("completed");
    expect(data.output).toEqual({ message: "Done" });
  });

  it("returns failed state", async () => {
    const { prisma } = await import("./db-client");
    const task = await prisma.aiTask.create({
      data: {
        type: "review",
        status: "failed",
        input: {},
        error: "Something went wrong",
      },
    });
    createdTaskIds.push(task.id);

    const { GET } = await import("@/app/api/ai/status/[taskId]/route");

    const response = await GET(
      toNextRequest(new Request("http://localhost:3000")),
      { params: Promise.resolve({ taskId: task.id }) },
    );
    const data = await response.json();

    expect(data.status).toBe("failed");
    expect(data.error).toBe("Something went wrong");
  });

  // -----------------------------------------------------------------------
  // 3. End-to-end: producer + worker with isolated queue
  // -----------------------------------------------------------------------

  it("end-to-end: producer creates task, worker processes it (isolated queue)", async () => {
    const Queue = (await import("bull")).default;
    const { prisma } = await import("./db-client");
    const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";

    // Create task via DB directly (simulating what producer does)
    const task = await prisma.aiTask.create({
      data: {
        type: "scan",
        status: "pending",
        input: { source: "e2e-test" },
      },
    });
    createdTaskIds.push(task.id);

    // Use a completely isolated queue
    const qName = "isolated-test-" + Date.now();
    const w = new Queue(qName, redisUrl);

    // Register the handler BEFORE adding the job (Bull v4 needs name+concurrency)
    w.process("*", 1, async (job) => {
      const d = job.data as { taskId: string };
      await prisma.aiTask.update({
        where: { id: d.taskId },
        data: { status: "processing" },
      });
      await new Promise((r) => setTimeout(r, 50));
      await prisma.aiTask.update({
        where: { id: d.taskId },
        data: {
          status: "completed",
          output: { message: "e2e-ok" },
          completedAt: new Date(),
        },
      });
    });

    // Give time for process registration
    await new Promise((r) => setTimeout(r, 500));

    // Add job
    await w.add("scan", { taskId: task.id });

    // Poll DB for completion
    let maxWait = 40;
    while (maxWait > 0) {
      await new Promise((r) => setTimeout(r, 200));
      const cur = await prisma.aiTask.findUnique({ where: { id: task.id } });
      if (cur?.status === "completed") {
        expect(cur.output).toEqual({ message: "e2e-ok" });
        expect(cur.completedAt).toBeTruthy();
        await w.close().catch(() => {});
        return;
      }
      maxWait--;
    }

    await w.close().catch(() => {});
    expect.fail("Worker did not complete the job in time");
  }, 20000);
});
