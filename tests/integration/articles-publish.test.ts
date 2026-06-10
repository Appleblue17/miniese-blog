/**
 * Integration tests for POST /api/articles/publish
 *
 * These tests require a running PostgreSQL database.
 * They will be skipped if the database is not available.
 */

import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { cleanDraftsDir, createTestDraft, removeTestDraft, isDatabaseAvailable } from "./setup";
import { toNextRequest, skipIfNoDb } from "./helpers";

let isDbAvailable = false;
let cleanupFns: (() => Promise<void>)[] = [];

// Synchronous check at module load time
isDbAvailable = await isDatabaseAvailable();

beforeEach(async () => {
  await cleanDraftsDir();
  cleanupFns = [];
  if (isDbAvailable) {
    const { prisma } = await import("./db-client");
    // Clean up any articles created by previous test runs
    await prisma.article.deleteMany({
      where: { slug: { startsWith: "test-" } },
    }).catch(() => {});
    await prisma.article.deleteMany({
      where: { slug: "duplicate-test" },
    }).catch(() => {});
  }
});

afterAll(async () => {
  await cleanDraftsDir();
  for (const fn of cleanupFns) {
    await fn().catch(() => {});
  }
});

const describeDb = isDbAvailable ? describe : describe.skip;

describeDb("POST /api/articles/publish", () => {
  it("publishes a valid draft and creates database record", async () => {
    const fileContent = `---
title: "Test Article"
language: zh
tags: [test]
slug: test-article
---

# Hello World

This is a test article.`;

    await createTestDraft("test-article.md", fileContent);

    const { POST } = await import("@/app/api/articles/publish/route");

    const request = toNextRequest(
      new Request("http://localhost:3000/api/articles/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          language: "zh",
          meta: {
            title: "Test Article",
            language: "zh",
            fileType: "markdown",
            tags: ["test"],
            author: "博主",
            summary: "",
          },
          fileContent,
        }),
      }),
    );

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.article.slug).toBe("test-article");
    expect(data.article.url).toContain("/zh/articles/test-article");

    // Verify database record
    const { prisma } = await import("./db-client");
    const article = await prisma.article.findUnique({
      where: { slug_language: { slug: "test-article", language: "zh" } },
    });
    expect(article).not.toBeNull();
    expect(article!.title).toBe("Test Article");
    expect(article!.status).toBe("published");
    expect(article!.renderedContent).toContain("<h1>Hello World</h1>");

    // Queue cleanup
    cleanupFns.push(async () => {
      const { unlink } = await import("fs/promises");
      const path = await import("path");
      await unlink(
        path.join(process.cwd(), "content", "articles", "zh", "test-article.md"),
      ).catch(() => {});
      await prisma.article.delete({
        where: { id: article!.id },
      }).catch(() => {});
    });
  });

  it("returns 400 when fileContent is missing", async () => {
    const { POST } = await import("@/app/api/articles/publish/route");

    const request = toNextRequest(
      new Request("http://localhost:3000/api/articles/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language: "zh" }),
      }),
    );

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("fileContent");
  });

  it("returns 400 when language is invalid", async () => {
    const { POST } = await import("@/app/api/articles/publish/route");

    const request = toNextRequest(
      new Request("http://localhost:3000/api/articles/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          language: "fr",
          fileContent: "# Hello",
          meta: {
            title: "Test",
            language: "zh",
            fileType: "markdown",
            tags: [],
            author: "博主",
            summary: "",
          },
        }),
      }),
    );

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("language");
  });

  it("returns 404 when draft file does not exist (legacy path)", async () => {
    const { POST } = await import("@/app/api/articles/publish/route");

    const request = toNextRequest(
      new Request("http://localhost:3000/api/articles/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: "nonexistent.md",
          language: "zh",
        }),
      }),
    );

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toContain("not found");
  });

  it("returns 409 when slug+language combination already exists", async () => {
    const fileContent = `---
title: "Duplicate"
language: en
slug: duplicate-test
---

Body`;

    const { POST } = await import("@/app/api/articles/publish/route");
    const { prisma } = await import("./db-client");

    // First publish
    const req1 = toNextRequest(
      new Request("http://localhost:3000/api/articles/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          language: "en",
          meta: {
            title: "Duplicate",
            language: "en",
            fileType: "markdown",
            tags: [],
            author: "博主",
            summary: "",
          },
          fileContent,
        }),
      }),
    );
    const res1 = await POST(req1);
    expect(res1.status).toBe(200);
    const data1 = await res1.json();
    const firstId = data1.article.id;

    // Try to publish with same slug
    const req2 = toNextRequest(
      new Request("http://localhost:3000/api/articles/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          language: "en",
          slug: "duplicate-test",
          meta: {
            title: "Duplicate 2",
            language: "en",
            fileType: "markdown",
            tags: [],
            author: "博主",
            summary: "",
          },
          fileContent: `---
title: "Duplicate 2"
language: en
slug: duplicate-test
---

Body 2`,
        }),
      }),
    );
    const res2 = await POST(req2);
    expect(res2.status).toBe(409);
    const data2 = await res2.json();
    expect(data2.error).toContain("already exists");

    // Cleanup
    cleanupFns.push(async () => {
      const { unlink } = await import("fs/promises");
      const path = await import("path");
      await unlink(
        path.join(
          process.cwd(),
          "content",
          "articles",
          "en",
          "duplicate-test.md",
        ),
      ).catch(() => {});
      await prisma.article
        .delete({ where: { id: firstId } })
        .catch(() => {});
    });
  });
});
