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
 * The approve APIs create WikiEntry(creating) + file, then enqueue a generate
 * job. The generate job is async and requires Redis/worker — these tests
 * verify the approve flow up to WikiEntry creation.
 *
 * Requires: PostgreSQL running (Redis is optional; queue enqueue failure
 * is caught and non-fatal for the API).
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFile, rm } from "fs/promises";
import path from "path";
import { toNextRequest } from "./helpers";
import { prisma } from "./db-client";

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

let articleId: string;
const testDiscoveryTerms = [
  "TypeScript",
  "Closure",
  "Docker",
  "SingleApprove",
  "SingleReject",
  "GETTestTerm",
  "BatchReject",
  "BatchReject2",
  "BatchApprove",
  "HighImportance",
  "AlreadyApproved",
  "StatusTransition",
  "StatusFailed",
  "UniqueConstraint",
];

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeAll(async () => {
  // Clean up any leftover test data from previous runs
  await prisma.wikiEntry.deleteMany({
    where: { name: { in: testDiscoveryTerms } },
  });
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
});

afterAll(async () => {
  // Clean up test data — including WikiEntries created by approve tests
  // and files created on disk
  const entries = await prisma.wikiEntry.findMany({
    where: { name: { in: testDiscoveryTerms } },
    select: { contentPath: true },
  });
  for (const entry of entries) {
    try {
      await rm(path.join(process.cwd(), entry.contentPath));
    } catch {
      // File may not exist
    }
  }

  await prisma.wikiEntry.deleteMany({
    where: { name: { in: testDiscoveryTerms } },
  });
  await prisma.wikiDiscovery.deleteMany({
    where: { articleId },
  });
  await prisma.article.delete({ where: { id: articleId } });
});

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Creates a pending discovery record for testing. */
async function createPendingDiscovery(
  term: string,
  importance = 0.5,
): Promise<string> {
  const d = await prisma.wikiDiscovery.create({
    data: {
      articleId,
      articleSlug: "test-discovery-article",
      articleLang: "zh",
      term,
      type: "concept",
      definition: `Definition for ${term}`,
      importance,
      status: "pending",
    },
  });
  return d.id;
}

/** Deletes a discovery record and its associated WikiEntry + file. */
async function cleanupDiscovery(id: string) {
  const rec = await prisma.wikiDiscovery.findUnique({
    where: { id },
    select: { wikiEntry: { select: { id: true, contentPath: true } } },
  });
  if (rec?.wikiEntry) {
    try {
      await rm(path.join(process.cwd(), rec.wikiEntry.contentPath));
    } catch {
      // ignore
    }
    await prisma.wikiEntry.delete({ where: { id: rec.wikiEntry.id } });
  }
  await prisma.wikiDiscovery.delete({ where: { id } });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /api/admin/discoveries", () => {
  let tmpId: string;

  beforeAll(async () => {
    tmpId = await createPendingDiscovery("GETTestTerm", 0.6);
  });

  afterAll(async () => {
    await cleanupDiscovery(tmpId);
  });

  it("should return pending discoveries by default", async () => {
    const { GET } = await import("@/app/api/admin/discoveries/route");
    const request = toNextRequest(
      new Request("http://localhost:3000/api/admin/discoveries"),
    );
    const response = await GET(request);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.discoveries).toBeDefined();
    expect(Array.isArray(body.discoveries)).toBe(true);
    expect(body.total).toBeGreaterThanOrEqual(1);
    expect(body.page).toBe(1);
  });

  it("should filter by articleId", async () => {
    const { GET } = await import("@/app/api/admin/discoveries/route");
    const request = toNextRequest(
      new Request(
        `http://localhost:3000/api/admin/discoveries?articleId=${articleId}`,
      ),
    );
    const response = await GET(request);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.discoveries.length).toBeGreaterThanOrEqual(1);
    body.discoveries.forEach((d: { articleId: string }) => {
      expect(d.articleId).toBe(articleId);
    });
  });

  it("should filter by status (generated, failed)", async () => {
    const { GET } = await import("@/app/api/admin/discoveries/route");

    // Test generated status
    const req1 = toNextRequest(
      new Request(
        "http://localhost:3000/api/admin/discoveries?status=generated",
      ),
    );
    const res1 = await GET(req1);
    expect(res1.status).toBe(200);
    const body1 = await res1.json();
    body1.discoveries.forEach((d: { status: string }) => {
      expect(["generated", "approved"]).toContain(d.status);
    });

    // Test failed status
    const req2 = toNextRequest(
      new Request(
        "http://localhost:3000/api/admin/discoveries?status=failed",
      ),
    );
    const res2 = await GET(req2);
    expect(res2.status).toBe(200);
  });

  it("should return correct pagination metadata", async () => {
    const { GET } = await import("@/app/api/admin/discoveries/route");
    const request = toNextRequest(
      new Request(
        "http://localhost:3000/api/admin/discoveries?page=1&limit=2",
      ),
    );
    const response = await GET(request);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.discoveries.length).toBeLessThanOrEqual(2);
    expect(body.totalPages).toBeGreaterThanOrEqual(1);
  });
});

describe("POST /api/admin/discoveries - batch operations", () => {
  it("should batch reject by ID list", async () => {
    const tmpId = await createPendingDiscovery("BatchReject");
    const d2Id = await createPendingDiscovery("BatchReject2");

    const { POST } = await import("@/app/api/admin/discoveries/route");
    const request = toNextRequest(
      new Request("http://localhost:3000/api/admin/discoveries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [tmpId, d2Id], action: "reject" }),
      }),
    );
    const response = await POST(request);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.affectedCount).toBe(2);

    // Verify
    for (const id of [tmpId, d2Id]) {
      const record = await prisma.wikiDiscovery.findUnique({ where: { id } });
      expect(record?.status).toBe("rejected");
      await cleanupDiscovery(id);
    }
  });

  it("should batch approve by ID list and create WikiEntry", async () => {
    const tmpId = await createPendingDiscovery("BatchApprove");

    const { POST } = await import("@/app/api/admin/discoveries/route");
    const request = toNextRequest(
      new Request("http://localhost:3000/api/admin/discoveries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [tmpId], action: "approve" }),
      }),
    );
    const response = await POST(request);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.affectedCount).toBe(1);

    // Verify the discovery record was updated
    const record = await prisma.wikiDiscovery.findUnique({
      where: { id: tmpId },
      include: { wikiEntry: true },
    });
    expect(record?.status).toBe("approved");
    expect(record?.approvedAt).toBeTruthy();
    // WikiEntry should have been created
    expect(record?.wikiEntry).toBeDefined();
    expect(record?.wikiEntry?.name).toBe("BatchApprove");
    expect(record?.wikiEntry?.status).toBe("creating");
    // The file should exist on disk
    const filePath = path.join(process.cwd(), record!.wikiEntry!.contentPath);
    const content = await readFile(filePath, "utf-8");
    expect(content).toContain("BatchApprove");
    expect(content).toContain("DEF_START");
    expect(content).toContain("AI_START");
    expect(content).toContain("AI_END");

    await cleanupDiscovery(tmpId);
  });

  it("should batch approve by criteria (minImportance)", async () => {
    const tmpId = await createPendingDiscovery("HighImportance", 0.8);

    const { POST } = await import("@/app/api/admin/discoveries/route");
    const request = toNextRequest(
      new Request("http://localhost:3000/api/admin/discoveries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "approve",
          minImportance: 0.7,
          articleId,
        }),
      }),
    );
    const response = await POST(request);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);

    await cleanupDiscovery(tmpId);
  });

  it("should return empty result for non-matching criteria", async () => {
    const { POST } = await import("@/app/api/admin/discoveries/route");
    const request = toNextRequest(
      new Request("http://localhost:3000/api/admin/discoveries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "approve",
          minImportance: 0.99,
          articleId,
        }),
      }),
    );
    const response = await POST(request);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.affectedCount).toBe(0);
  });

  it("should reject invalid action", async () => {
    const { POST } = await import("@/app/api/admin/discoveries/route");
    const request = toNextRequest(
      new Request("http://localhost:3000/api/admin/discoveries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "invalid" }),
      }),
    );
    const response = await POST(request);
    expect(response.status).toBe(400);
  });
});

describe("POST /api/admin/discoveries/[id]/approve", () => {
  it("should approve a single pending record and create WikiEntry(creating)", async () => {
    const tmpId = await createPendingDiscovery("SingleApprove");

    const { POST } = await import(
      "@/app/api/admin/discoveries/[id]/approve/route"
    );
    const request = toNextRequest(
      new Request(
        `http://localhost:3000/api/admin/discoveries/${tmpId}/approve`,
        { method: "POST" },
      ),
    );
    const response = await POST(request, {
      params: Promise.resolve({ id: tmpId }),
    });
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.discovery.status).toBe("approved");

    // Verify WikiEntry was created
    expect(body.wikiEntry).toBeDefined();
    expect(body.wikiEntry.status).toBe("creating");
    expect(body.wikiEntry.name).toBe("SingleApprove");

    // Verify DB
    const record = await prisma.wikiDiscovery.findUnique({
      where: { id: tmpId },
      select: { status: true, wikiEntryId: true },
    });
    expect(record?.status).toBe("approved");
    expect(record?.wikiEntryId).toBe(body.wikiEntry.id);

    // Verify file on disk
    const entry = await prisma.wikiEntry.findUnique({
      where: { id: body.wikiEntry.id },
      select: { contentPath: true },
    });
    const filePath = path.join(process.cwd(), entry!.contentPath);
    const content = await readFile(filePath, "utf-8");
    expect(content).toContain("SingleApprove");
    expect(content).toContain("DEF_START");
    expect(content).toContain("AI_START");

    await cleanupDiscovery(tmpId);
  });

  it("should reject if already processed", async () => {
    const tmpId = await createPendingDiscovery("AlreadyApproved");

    const { POST } = await import(
      "@/app/api/admin/discoveries/[id]/approve/route"
    );

    // First approve should work
    const req1 = toNextRequest(
      new Request(
        `http://localhost:3000/api/admin/discoveries/${tmpId}/approve`,
        { method: "POST" },
      ),
    );
    const res1 = await POST(req1, {
      params: Promise.resolve({ id: tmpId }),
    });
    expect(res1.status).toBe(200);

    // Second approve should fail
    const req2 = toNextRequest(
      new Request(
        `http://localhost:3000/api/admin/discoveries/${tmpId}/approve`,
        { method: "POST" },
      ),
    );
    const res2 = await POST(req2, {
      params: Promise.resolve({ id: tmpId }),
    });
    expect(res2.status).toBe(409);

    await cleanupDiscovery(tmpId);
  });

  it("should return 404 for non-existent id", async () => {
    const { POST } = await import(
      "@/app/api/admin/discoveries/[id]/approve/route"
    );
    const request = toNextRequest(
      new Request(
        "http://localhost:3000/api/admin/discoveries/non-existent-id/approve",
        { method: "POST" },
      ),
    );
    const response = await POST(request, {
      params: Promise.resolve({ id: "non-existent-id" }),
    });
    expect(response.status).toBe(404);
  });
});

describe("POST /api/admin/discoveries/[id]/reject", () => {
  it("should reject a single pending record", async () => {
    const tmpId = await createPendingDiscovery("SingleReject");

    const { POST } = await import(
      "@/app/api/admin/discoveries/[id]/reject/route"
    );
    const request = toNextRequest(
      new Request(
        `http://localhost:3000/api/admin/discoveries/${tmpId}/reject`,
        { method: "POST" },
      ),
    );
    const response = await POST(request, {
      params: Promise.resolve({ id: tmpId }),
    });
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.discovery.status).toBe("rejected");

    await cleanupDiscovery(tmpId);
  });
});

describe("Discovery status transitions", () => {
  it("should support pending → approved → generated transition in schema", async () => {
    // Create a pending discovery
    const tmpId = await createPendingDiscovery("StatusTransition");

    // Approve it
    const { POST } = await import(
      "@/app/api/admin/discoveries/[id]/approve/route"
    );
    const request = toNextRequest(
      new Request(
        `http://localhost:3000/api/admin/discoveries/${tmpId}/approve`,
        { method: "POST" },
      ),
    );
    const approveRes = await POST(request, {
      params: Promise.resolve({ id: tmpId }),
    });
    expect(approveRes.status).toBe(200);

    // Manually simulate what the worker would do (set to generated)
    await prisma.wikiDiscovery.update({
      where: { id: tmpId },
      data: { status: "generated" },
    });

    const record = await prisma.wikiDiscovery.findUnique({
      where: { id: tmpId },
    });
    expect(record?.status).toBe("generated");

    // Test failed status too
    const tmpId2 = await createPendingDiscovery("StatusFailed");
    await prisma.wikiDiscovery.update({
      where: { id: tmpId2 },
      data: { status: "failed", failedReason: "ai_error" },
    });
    const record2 = await prisma.wikiDiscovery.findUnique({
      where: { id: tmpId2 },
    });
    expect(record2?.status).toBe("failed");
    expect(record2?.failedReason).toBe("ai_error");

    await cleanupDiscovery(tmpId);
    await cleanupDiscovery(tmpId2);
  });
});

describe("Unique constraint", () => {
  it("should prevent duplicate (articleId + term)", async () => {
    const tmpId = await createPendingDiscovery("UniqueConstraint");
    await expect(
      prisma.wikiDiscovery.create({
        data: {
          articleId,
          articleSlug: "test-discovery-article",
          articleLang: "zh",
          term: "UniqueConstraint", // Already exists
          type: "tech",
          definition: "Duplicate",
          importance: 0.5,
          status: "pending",
        },
      }),
    ).rejects.toThrow();

    await cleanupDiscovery(tmpId);
  });
});
