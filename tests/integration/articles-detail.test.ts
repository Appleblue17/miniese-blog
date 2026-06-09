/**
 * Integration tests for GET /api/articles/[slug]
 *
 * These tests require a running PostgreSQL database.
 * They will be skipped if the database is not available.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { toNextRequest } from "./helpers";

import { isDatabaseAvailable } from "./setup";

let isDbAvailable = false;
let testArticleId: string | null = null;

// Synchronous check at module load time
isDbAvailable = await isDatabaseAvailable();

if (isDbAvailable) {
  const { prisma } = await import("./db-client");

  // Clean up any leftover test data
  await prisma.article.deleteMany({
    where: { slug: { in: ["detail-test"] } },
  });

  // Create a test article
  const article = await prisma.article.create({
    data: {
      slug: "detail-test",
      title: "Detail Test Article",
      language: "zh",
      contentPath: "content/articles/zh/detail-test.md",
      renderedContent:
        "<h1>Detail Test</h1>\n<p>This is the detail content.</p>",
      tags: ["test", "detail"],
      summary: "A test article for detail endpoint",
      status: "published",
      publishedAt: new Date(),
    },
  });
  testArticleId = article.id;
}

afterAll(async () => {
  if (isDbAvailable && testArticleId) {
    const { prisma } = await import("./db-client");
    await prisma.article.delete({ where: { id: testArticleId } });
  }
});

const describeDb = isDbAvailable ? describe : describe.skip;

describeDb("GET /api/articles/[slug]", () => {
  it("returns article detail with rendered HTML", async () => {
    const { GET } = await import(
      "@/app/api/articles/[slug]/route"
    );

    const request = toNextRequest(
      new Request(
        "http://localhost:3000/api/articles/detail-test?lang=zh",
      ),
    );

    // Next.js App Router passes { params } to the handler
    const response = await GET(request, {
      params: Promise.resolve({ slug: "detail-test" }),
    } as any);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.article.slug).toBe("detail-test");
    expect(data.article.title).toBe("Detail Test Article");
    expect(data.article.language).toBe("zh");
    expect(data.html).toContain("<h1>Detail Test</h1>");
    expect(data.article.tags).toEqual(["test", "detail"]);
    expect(data.article.summary).toBe("A test article for detail endpoint");
  });

  it("returns 404 when slug does not exist", async () => {
    const { GET } = await import(
      "@/app/api/articles/[slug]/route"
    );

    const request = toNextRequest(
      new Request(
        "http://localhost:3000/api/articles/nonexistent-slug?lang=zh",
      ),
    );

    const response = await GET(request, {
      params: Promise.resolve({ slug: "nonexistent-slug" }),
    } as any);

    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error).toContain("not found");
  });

  it("returns 404 when language does not match", async () => {
    const { GET } = await import(
      "@/app/api/articles/[slug]/route"
    );

    const request = toNextRequest(
      new Request(
        "http://localhost:3000/api/articles/detail-test?lang=en",
      ),
    );

    const response = await GET(request, {
      params: Promise.resolve({ slug: "detail-test" }),
    } as any);

    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error).toContain("not found");
  });

  it("defaults to zh language when lang param is not provided", async () => {
    const { GET } = await import(
      "@/app/api/articles/[slug]/route"
    );

    const request = toNextRequest(
      new Request("http://localhost:3000/api/articles/detail-test"),
    );

    const response = await GET(request, {
      params: Promise.resolve({ slug: "detail-test" }),
    } as any);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.article.slug).toBe("detail-test");
  });
});
