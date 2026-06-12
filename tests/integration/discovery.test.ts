/**
 * @file Integration tests for Wiki term discovery API.
 *
 * Tests the full lifecycle:
 * 1. Admin API list endpoint (GET /api/admin/discoveries)
 * 2. Batch approve (POST /api/admin/discoveries)
 * 3. Batch reject (POST /api/admin/discoveries)
 * 4. Single approve (POST /api/admin/discoveries/[id]/approve)
 * 5. Single reject (POST /api/admin/discoveries/[id]/reject)
 * 6. Duplicate prevention (unique constraint)
 *
 * Requires: PostgreSQL running, Redis running (for queue, but not needed here)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../../src/lib/db";

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

let articleId: string;
let discoveryIds: string[] = [];

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeAll(async () => {
  // Clean up any leftover test data from previous runs
  await prisma.wikiDiscovery.deleteMany({
    where: { article: { slug: "test-discovery-article" } },
  });
  await prisma.article.deleteMany({
    where: { slug: "test-discovery-article" },
  });

  // Create a test article to satisfy foreign key constraints
  const article = await prisma.article.create({
    data: {
      slug: "test-discovery-article",
      title: "Test Article for Discovery",
      language: "zh",
      contentPath: "content/articles/zh/test-discovery-article.md",
      status: "published",
      accessGroup: [],
      publishedAt: new Date(),
    },
  });
  articleId = article.id;

  // Create test discovery records
  const d1 = await prisma.wikiDiscovery.create({
    data: {
      articleId,
      articleSlug: "test-discovery-article",
      articleLang: "zh",
      term: "TypeScript",
      type: "tech",
      definition: "JavaScript with static typing",
      importance: 0.95,
      status: "pending",
    },
  });
  discoveryIds.push(d1.id);

  const d2 = await prisma.wikiDiscovery.create({
    data: {
      articleId,
      articleSlug: "test-discovery-article",
      articleLang: "zh",
      term: "Closure",
      type: "concept",
      definition: "Function with lexical environment",
      importance: 0.75,
      status: "pending",
    },
  });
  discoveryIds.push(d2.id);

  const d3 = await prisma.wikiDiscovery.create({
    data: {
      articleId,
      articleSlug: "test-discovery-article",
      articleLang: "zh",
      term: "Docker",
      type: "tech",
      definition: "Container platform",
      importance: 0.45,
      status: "pending",
    },
  });
  discoveryIds.push(d3.id);
});

afterAll(async () => {
  // Clean up test data — including WikiEntries created by approve tests
  const article = await prisma.article.findFirst({
    where: { slug: "test-discovery-article" },
  });
  if (article) {
    await prisma.wikiEntry.deleteMany({
      where: { name: { in: ["SingleApprove", "SingleReject"] } },
    });
    await prisma.wikiDiscovery.deleteMany({
      where: { articleId: article.id },
    });
    await prisma.article.delete({ where: { id: article.id } });
  }
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /api/admin/discoveries", () => {
  it("should return pending discoveries by default", async () => {
    const baseUrl = process.env.SITE_URL || "http://localhost:3000";
    const res = await fetch(`${baseUrl}/api/admin/discoveries`, {
      cache: "no-store",
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.discoveries).toBeDefined();
    expect(Array.isArray(body.discoveries)).toBe(true);
    expect(body.total).toBeGreaterThanOrEqual(3);
    expect(body.page).toBe(1);
  });

  it("should filter by articleId", async () => {
    const baseUrl = process.env.SITE_URL || "http://localhost:3000";
    const res = await fetch(
      `${baseUrl}/api/admin/discoveries?articleId=${articleId}`,
      { cache: "no-store" },
    );
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.discoveries.length).toBeGreaterThanOrEqual(3);
    body.discoveries.forEach((d: { articleId: string }) => {
      expect(d.articleId).toBe(articleId);
    });
  });

  it("should filter by status", async () => {
    const baseUrl = process.env.SITE_URL || "http://localhost:3000";
    const res = await fetch(
      `${baseUrl}/api/admin/discoveries?status=approved`,
      { cache: "no-store" },
    );
    expect(res.status).toBe(200);

    const body = await res.json();
    body.discoveries.forEach((d: { status: string }) => {
      expect(d.status).toBe("approved");
    });
  });

  it("should return correct pagination metadata", async () => {
    const baseUrl = process.env.SITE_URL || "http://localhost:3000";
    const res = await fetch(
      `${baseUrl}/api/admin/discoveries?page=1&limit=2`,
      { cache: "no-store" },
    );
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.discoveries.length).toBeLessThanOrEqual(2);
    expect(body.totalPages).toBeGreaterThanOrEqual(1);
  });
});

describe("POST /api/admin/discoveries - batch operations", () => {
  it("should batch approve by ID list", async () => {
    const baseUrl = process.env.SITE_URL || "http://localhost:3000";
    const approveIds = [discoveryIds[0]];

    const res = await fetch(`${baseUrl}/api/admin/discoveries`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: approveIds, action: "approve" }),
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.affectedCount).toBe(1);

    // Verify the record was updated
    const record = await prisma.wikiDiscovery.findUnique({
      where: { id: discoveryIds[0] },
    });
    expect(record?.status).toBe("approved");
    expect(record?.approvedAt).toBeTruthy();
  });

  it("should batch reject by ID list", async () => {
    const baseUrl = process.env.SITE_URL || "http://localhost:3000";
    const rejectIds = [discoveryIds[2]];

    const res = await fetch(`${baseUrl}/api/admin/discoveries`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: rejectIds, action: "reject" }),
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.affectedCount).toBe(1);

    // Verify
    const record = await prisma.wikiDiscovery.findUnique({
      where: { id: discoveryIds[2] },
    });
    expect(record?.status).toBe("rejected");
  });

  it("should batch approve by criteria (minImportance)", async () => {
    const baseUrl = process.env.SITE_URL || "http://localhost:3000";

    // discoveryIds[1] is still pending (0.75 importance)
    const res = await fetch(`${baseUrl}/api/admin/discoveries`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "approve",
        minImportance: 0.7,
        articleId,
      }),
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    // Should have approved discoveryIds[1] (0.75)
    expect(body.affectedCount).toBeGreaterThanOrEqual(1);
  });

  it("should return empty result for non-matching criteria", async () => {
    const baseUrl = process.env.SITE_URL || "http://localhost:3000";

    const res = await fetch(`${baseUrl}/api/admin/discoveries`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "approve",
        minImportance: 0.99,
        articleId,
      }),
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.affectedCount).toBe(0);
  });

  it("should reject invalid action", async () => {
    const baseUrl = process.env.SITE_URL || "http://localhost:3000";

    const res = await fetch(`${baseUrl}/api/admin/discoveries`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "invalid" }),
    });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/admin/discoveries/[id]/approve", () => {
  it("should approve a single pending record", async () => {
    // Create a fresh pending record
    const rec = await prisma.wikiDiscovery.create({
      data: {
        articleId,
        articleSlug: "test-discovery-article",
        articleLang: "zh",
        term: "SingleApprove",
        type: "concept",
        definition: "Test term for single approve",
        importance: 0.5,
        status: "pending",
      },
    });

    const baseUrl = process.env.SITE_URL || "http://localhost:3000";
    const res = await fetch(
      `${baseUrl}/api/admin/discoveries/${rec.id}/approve`,
      { method: "POST" },
    );
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.discovery.status).toBe("approved");

    // Clean up
    await prisma.wikiDiscovery.delete({ where: { id: rec.id } });
  });

  it("should reject if already processed", async () => {
    const baseUrl = process.env.SITE_URL || "http://localhost:3000";

    // discoveryIds[0] is already approved
    const res = await fetch(
      `${baseUrl}/api/admin/discoveries/${discoveryIds[0]}/approve`,
      { method: "POST" },
    );
    expect(res.status).toBe(409);
  });

  it("should return 404 for non-existent id", async () => {
    const baseUrl = process.env.SITE_URL || "http://localhost:3000";

    const res = await fetch(
      `${baseUrl}/api/admin/discoveries/non-existent-id/approve`,
      { method: "POST" },
    );
    expect(res.status).toBe(404);
  });
});

describe("POST /api/admin/discoveries/[id]/reject", () => {
  it("should reject a single pending record", async () => {
    // Create a fresh pending record
    const rec = await prisma.wikiDiscovery.create({
      data: {
        articleId,
        articleSlug: "test-discovery-article",
        articleLang: "zh",
        term: "SingleReject",
        type: "concept",
        definition: "Test term for single reject",
        importance: 0.5,
        status: "pending",
      },
    });

    const baseUrl = process.env.SITE_URL || "http://localhost:3000";
    const res = await fetch(
      `${baseUrl}/api/admin/discoveries/${rec.id}/reject`,
      { method: "POST" },
    );
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.discovery.status).toBe("rejected");

    // Clean up
    await prisma.wikiDiscovery.delete({ where: { id: rec.id } });
  });
});

describe("Unique constraint", () => {
  it("should prevent duplicate (articleId + term)", async () => {
    await expect(
      prisma.wikiDiscovery.create({
        data: {
          articleId,
          articleSlug: "test-discovery-article",
          articleLang: "zh",
          term: "TypeScript", // Already exists from setup
          type: "tech",
          definition: "Duplicate",
          importance: 0.5,
          status: "pending",
        },
      }),
    ).rejects.toThrow();
  });
});
