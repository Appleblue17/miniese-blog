/**
 * Integration tests for GET /api/articles
 *
 * These tests require a running PostgreSQL database.
 * They will be skipped if the database is not available.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { toNextRequest } from "./helpers";

let isDbAvailable = false;
let createdArticleIds: string[] = [];

beforeAll(async () => {
  try {
    const { isDatabaseAvailable } = await import("./setup");
    isDbAvailable = await isDatabaseAvailable();
  } catch {
    isDbAvailable = false;
  }

  // Seed test data if DB is available
  if (isDbAvailable) {
    const { prisma } = await import("@/lib/db");

    // Clean up any leftover test data
    await prisma.article.deleteMany({
      where: { slug: { in: ["list-test-1", "list-test-2", "list-test-3"] } },
    });

    const now = new Date();
    const articles: { id: string }[] = await Promise.all([
      prisma.article.create({
        data: {
          slug: "list-test-1",
          title: "First Article",
          language: "zh",
          contentPath: "content/articles/zh/list-test-1.md",
          tags: ["tech", "react"],
          status: "published",
          publishedAt: new Date(now.getTime() - 10000),
        },
      }),
      prisma.article.create({
        data: {
          slug: "list-test-2",
          title: "Second Article",
          language: "en",
          contentPath: "content/articles/en/list-test-2.md",
          tags: ["tech", "node"],
          status: "published",
          publishedAt: new Date(now.getTime() - 5000),
        },
      }),
      prisma.article.create({
        data: {
          slug: "list-test-3",
          title: "Draft Article",
          language: "zh",
          contentPath: "content/articles/drafts/list-test-3.md",
          tags: ["draft"],
          status: "draft",
          publishedAt: null,
        },
      }),
    ]);
    createdArticleIds = articles.map((a) => a.id);
  }
});

afterAll(async () => {
  if (isDbAvailable && createdArticleIds.length > 0) {
    const { prisma } = await import("@/lib/db");
    await prisma.article.deleteMany({
      where: { id: { in: createdArticleIds } },
    });
  }
});

function describeIfDb(condition: boolean) {
  return condition ? describe : describe.skip;
}

describeIfDb(isDbAvailable)("GET /api/articles", () => {
  it("returns published articles with pagination", async () => {
    const { GET } = await import("@/app/api/articles/route");

    const request = toNextRequest(
      new Request("http://localhost:3000/api/articles?page=1&limit=10"),
    );
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.articles).toBeInstanceOf(Array);
    expect(data.total).toBeGreaterThanOrEqual(2);
    expect(data.page).toBe(1);
    expect(data.totalPages).toBeGreaterThanOrEqual(1);
  });

  it("filters by tag", async () => {
    const { GET } = await import("@/app/api/articles/route");

    const request = toNextRequest(
      new Request("http://localhost:3000/api/articles?tag=react"),
    );
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(
      data.articles.every((a: { tags: string[] }) => a.tags.includes("react")),
    ).toBe(true);
  });

  it("filters by language", async () => {
    const { GET } = await import("@/app/api/articles/route");

    const request = toNextRequest(
      new Request("http://localhost:3000/api/articles?lang=en"),
    );
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(
      data.articles.every(
        (a: { language: string }) => a.language === "en",
      ),
    ).toBe(true);
  });

  it("only returns published articles", async () => {
    const { GET } = await import("@/app/api/articles/route");

    const request = toNextRequest(
      new Request("http://localhost:3000/api/articles"),
    );
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    // Draft articles should not appear in published list
    expect(
      data.articles.some((a: { slug: string }) => a.slug === "list-test-3"),
    ).toBe(false);
  });

  it("paginates correctly with page and limit", async () => {
    const { GET } = await import("@/app/api/articles/route");

    const request = toNextRequest(
      new Request("http://localhost:3000/api/articles?page=1&limit=1"),
    );
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.articles.length).toBeLessThanOrEqual(1);
    expect(data.totalPages).toBeGreaterThanOrEqual(2);
  });

  it("returns empty array when page exceeds total pages", async () => {
    const { GET } = await import("@/app/api/articles/route");

    const request = toNextRequest(
      new Request("http://localhost:3000/api/articles?page=9999&limit=10"),
    );
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.articles).toEqual([]);
    expect(data.total).toBe(0);
  });

  it("returns empty array when tag matches no articles", async () => {
    const { GET } = await import("@/app/api/articles/route");

    const request = toNextRequest(
      new Request(
        "http://localhost:3000/api/articles?tag=nonexistent-tag-xyz",
      ),
    );
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.articles).toEqual([]);
    expect(data.total).toBe(0);
  });
});
