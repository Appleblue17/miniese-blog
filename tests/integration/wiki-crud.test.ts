/**
 * Integration tests for wiki API endpoints (new flow).
 *
 * The new wiki lifecycle is:
 * 1. POST /api/wiki      → Creates WikiDiscovery (status: pending)
 * 2. POST /api/admin/discoveries/[id]/approve → Creates WikiEntry (status: creating) + file
 * 3. POST /api/wiki/[name]/complete → creating → unreviewed (manual or AI-filled)
 * 4. PUT /api/wiki/[name]  → Edit entries (unreviewed or reviewed)
 * 5. POST /api/wiki/[name]/review → unreviewed → reviewed
 * 6. GET /api/wiki         → List entries (default: unreviewed + reviewed)
 * 7. GET /api/wiki/[name]  → Get single entry with blocks
 * 8. DELETE /api/wiki/[name] → Delete entry + file
 *
 * POST /api/wiki/[name]/approve is deprecated (returns 410).
 *
 * Requires: PostgreSQL running (Redis optional; queue enqueue failure is non-fatal).
 */

import { describe, it, expect, afterAll } from "vitest";
import { unlink } from "fs/promises";
import path from "path";
import { toNextRequest, createJsonRequest } from "./helpers";

import { isDatabaseAvailable } from "./setup";

const isDbAvailable = await isDatabaseAvailable();

/** Tracks created WikiEntry IDs for cleanup. */
const createdEntryIds: string[] = [];
/** Tracks created WikiDiscovery IDs for cleanup. */
const createdDiscoveryIds: string[] = [];

const describeDb = isDbAvailable ? describe : describe.skip;

describeDb("Wiki CRUD API (new flow)", () => {
  // --- Clean up after all tests ---
  afterAll(async () => {
    const { prisma } = await import("./db-client");

    // Delete WikiEntry files
    if (createdEntryIds.length > 0) {
      const entries = await prisma.wikiEntry.findMany({
        where: { id: { in: createdEntryIds } },
      });
      for (const entry of entries) {
        const filePath = path.join(process.cwd(), entry.contentPath);
        await unlink(filePath).catch(() => {});
      }
    }

    // Delete WikiEntry DB records
    await prisma.wikiEntry.deleteMany({
      where: { id: { in: createdEntryIds } },
    }).catch(() => {});

    // Delete WikiDiscovery DB records
    await prisma.wikiDiscovery.deleteMany({
      where: { id: { in: createdDiscoveryIds } },
    }).catch(() => {});

    // Clean up the article used for discovery (if any were created)
    await prisma.wikiDiscovery.deleteMany({
      where: { article: { slug: "test-wiki-crud-article" } },
    }).catch(() => {});
    await prisma.article.deleteMany({
      where: { slug: "test-wiki-crud-article" },
    }).catch(() => {});
  });

  // --- POST /api/wiki (creates WikiDiscovery) ---

  it("creates a new wiki discovery (pending status)", async () => {
    const { POST } = await import("@/app/api/wiki/route");

    const body = { name: "CRUD Test Term", language: "zh" };
    const request = createJsonRequest(
      "http://localhost:3000/api/wiki",
      "POST",
      body,
    );
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.discovery).toBeDefined();
    expect(data.discovery.term).toBe("CRUD Test Term");
    expect(data.discovery.status).toBe("pending");
    expect(data.discovery.id).toBeTruthy();

    createdDiscoveryIds.push(data.discovery.id);
  });

  it("returns 400 when name is missing", async () => {
    const { POST } = await import("@/app/api/wiki/route");

    const body = { language: "zh" };
    const request = createJsonRequest(
      "http://localhost:3000/api/wiki",
      "POST",
      body,
    );
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("name");
  });

  it("returns 400 when language is invalid", async () => {
    const { POST } = await import("@/app/api/wiki/route");

    const body = { name: "Test", language: "fr" };
    const request = createJsonRequest(
      "http://localhost:3000/api/wiki",
      "POST",
      body,
    );
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("language");
  });

  it("returns 409 when same pending discovery already exists", async () => {
    const { POST } = await import("@/app/api/wiki/route");

    const body = { name: "CRUD Test Term", language: "zh" };
    const request = createJsonRequest(
      "http://localhost:3000/api/wiki",
      "POST",
      body,
    );
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(409);
    expect(data.error).toContain("already exists");
  });

  // --- Approve via admin API (creates WikiEntry) ---

  it("approves a discovery and creates WikiEntry(creating)", async () => {
    const { prisma } = await import("./db-client");

    // Get the discovery ID we created earlier
    const discovery = await prisma.wikiDiscovery.findFirst({
      where: { term: "CRUD Test Term", status: "pending" },
    });
    expect(discovery).toBeDefined();
    const discoveryId = discovery!.id;

    // Approve it
    const { POST } = await import(
      "@/app/api/admin/discoveries/[id]/approve/route"
    );
    const request = toNextRequest(
      new Request(
        `http://localhost:3000/api/admin/discoveries/${discoveryId}/approve`,
        { method: "POST" },
      ),
    );
    const response = await POST(request, {
      params: Promise.resolve({ id: discoveryId }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.discovery.status).toBe("approved");
    expect(data.wikiEntry).toBeDefined();
    expect(data.wikiEntry.status).toBe("creating");

    createdEntryIds.push(data.wikiEntry.id);
  });

  it("returns 409 when approving already-approved discovery", async () => {
    const { prisma } = await import("./db-client");

    const discovery = await prisma.wikiDiscovery.findFirst({
      where: { term: "CRUD Test Term", status: "approved" },
    });
    expect(discovery).toBeDefined();

    const { POST } = await import(
      "@/app/api/admin/discoveries/[id]/approve/route"
    );
    const request = toNextRequest(
      new Request(
        `http://localhost:3000/api/admin/discoveries/${discovery!.id}/approve`,
        { method: "POST" },
      ),
    );
    const response = await POST(request, {
      params: Promise.resolve({ id: discovery!.id }),
    });
    expect(response.status).toBe(409);
  });

  // --- GET /api/wiki (list) ---

  it("does NOT list creating entries by default (only unreviewed+reviewed)", async () => {
    const { GET } = await import("@/app/api/wiki/route");

    const request = toNextRequest(
      new Request("http://localhost:3000/api/wiki?lang=zh&page=1&limit=20"),
    );
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.entries).toBeInstanceOf(Array);
    // The entry is "creating" status, so it should NOT appear in default list
    expect(
      data.entries.some(
        (e: { name: string }) => e.name === "CRUD Test Term",
      ),
    ).toBe(false);
  });

  it("filters by status parameter (creating)", async () => {
    const { GET } = await import("@/app/api/wiki/route");

    const request = toNextRequest(
      new Request("http://localhost:3000/api/wiki?lang=zh&status=creating"),
    );
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.entries.length).toBeGreaterThanOrEqual(1);
    data.entries.forEach((e: { status: string }) => {
      expect(e.status).toBe("creating");
    });
  });

  it("filters entries by language", async () => {
    const { GET } = await import("@/app/api/wiki/route");

    const request = toNextRequest(
      new Request("http://localhost:3000/api/wiki?lang=en&status=creating"),
    );
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    // The created entry is zh, so en list should not include it
    expect(
      data.entries.some(
        (e: { name: string }) => e.name === "CRUD Test Term",
      ),
    ).toBe(false);
  });

  it("returns 400 when lang parameter is missing", async () => {
    const { GET } = await import("@/app/api/wiki/route");

    const request = toNextRequest(
      new Request("http://localhost:3000/api/wiki?page=1"),
    );
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("lang");
  });

  it("returns 400 when status is invalid", async () => {
    const { GET } = await import("@/app/api/wiki/route");

    const request = toNextRequest(
      new Request("http://localhost:3000/api/wiki?lang=zh&status=invalid"),
    );
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("Invalid status");
  });

  // --- GET /api/wiki/[name] (detail) ---

  it("gets a wiki entry by name", async () => {
    const { GET } = await import("@/app/api/wiki/[name]/route");

    const request = toNextRequest(
      new Request(
        `http://localhost:3000/api/wiki/${encodeURIComponent("CRUD Test Term")}?lang=zh`,
      ),
    );
    const response = await GET(request, {
      params: Promise.resolve({ name: "CRUD Test Term" }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.entry).toBeDefined();
    expect(data.entry.name).toBe("CRUD Test Term");
    expect(data.entry.status).toBe("creating");
    expect(data.entry.blocks).toBeDefined();
    // Definition is AI-refined (via refineTerm), so it should be a string
    // (may be empty if AI API call fails)
    expect(typeof data.entry.blocks.definition).toBe("string");
    expect(data.entry.blocks.human).toBe("");
    expect(data.entry.blocks.ai).toBe("");
    expect(data.entry.blocks.ref).toBe("");
  });

  it("returns 404 for non-existent entry", async () => {
    const { GET } = await import("@/app/api/wiki/[name]/route");

    const request = toNextRequest(
      new Request("http://localhost:3000/api/wiki/nonexistent?lang=zh"),
    );
    const response = await GET(request, {
      params: Promise.resolve({ name: "nonexistent" }),
    });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toContain("not found");
  });

  // --- PUT /api/wiki/[name] (edit) ---

  it("returns 403 when editing a creating entry", async () => {
    const { PUT } = await import("@/app/api/wiki/[name]/route");

    const body = { definition: "Updated definition." };
    const request = createJsonRequest(
      `http://localhost:3000/api/wiki/${encodeURIComponent("CRUD Test Term")}?lang=zh`,
      "PUT",
      body,
    );
    const response = await PUT(request, {
      params: Promise.resolve({ name: "CRUD Test Term" }),
    });
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toContain("Cannot edit");
  });

  // --- POST /api/wiki/[name]/complete (creating → unreviewed) ---

  it("completes a creating entry (creating → unreviewed)", async () => {
    const { POST } = await import("@/app/api/wiki/[name]/complete/route");

    const request = toNextRequest(
      new Request(
        `http://localhost:3000/api/wiki/${encodeURIComponent("CRUD Test Term")}/complete?lang=zh`,
        { method: "POST" },
      ),
    );
    const response = await POST(request, {
      params: Promise.resolve({ name: "CRUD Test Term" }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.entry).toBeDefined();
    expect(data.entry.status).toBe("unreviewed");
  });

  it("returns 409 when completing a non-creating entry", async () => {
    const { POST } = await import("@/app/api/wiki/[name]/complete/route");

    const request = toNextRequest(
      new Request(
        `http://localhost:3000/api/wiki/${encodeURIComponent("CRUD Test Term")}/complete?lang=zh`,
        { method: "POST" },
      ),
    );
    const response = await POST(request, {
      params: Promise.resolve({ name: "CRUD Test Term" }),
    });
    const data = await response.json();

    expect(response.status).toBe(409);
    expect(data.error).toContain("Cannot complete");
  });

  // --- PUT /api/wiki/[name] (now allowed since entry is unreviewed) ---

  it("allows editing after status is unreviewed", async () => {
    const { PUT } = await import("@/app/api/wiki/[name]/route");

    const body = {
      definition: "Updated definition for testing.",
      human: "# Updated Notes\n\nNew content here.",
      tags: ["test", "updated"],
    };

    const request = createJsonRequest(
      `http://localhost:3000/api/wiki/${encodeURIComponent("CRUD Test Term")}?lang=zh`,
      "PUT",
      body,
    );
    const response = await PUT(request, {
      params: Promise.resolve({ name: "CRUD Test Term" }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.entry).toBeDefined();
    expect(data.entry.definition).toBe("Updated definition for testing.");
    expect(data.entry.tags).toContain("updated");
    expect(data.entry.status).toBe("unreviewed");
  });

  it("verifies the update persisted", async () => {
    const { GET } = await import("@/app/api/wiki/[name]/route");

    const request = toNextRequest(
      new Request(
        `http://localhost:3000/api/wiki/${encodeURIComponent("CRUD Test Term")}?lang=zh`,
      ),
    );
    const response = await GET(request, {
      params: Promise.resolve({ name: "CRUD Test Term" }),
    });
    const data = await response.json();

    expect(data.entry.blocks.definition).toBe(
      "Updated definition for testing.",
    );
    expect(data.entry.blocks.human).toContain("Updated Notes");
  });

  // --- POST /api/wiki/[name]/review (unreviewed → reviewed) ---

  it("reviews an unreviewed entry (unreviewed → reviewed)", async () => {
    const { POST } = await import("@/app/api/wiki/[name]/review/route");

    const request = toNextRequest(
      new Request(
        `http://localhost:3000/api/wiki/${encodeURIComponent("CRUD Test Term")}/review?lang=zh`,
        { method: "POST" },
      ),
    );
    const response = await POST(request, {
      params: Promise.resolve({ name: "CRUD Test Term" }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.entry.status).toBe("reviewed");
  });

  it("returns 409 reviewing a non-unreviewed entry", async () => {
    const { POST } = await import("@/app/api/wiki/[name]/review/route");

    const request = toNextRequest(
      new Request(
        `http://localhost:3000/api/wiki/${encodeURIComponent("CRUD Test Term")}/review?lang=zh`,
        { method: "POST" },
      ),
    );
    const response = await POST(request, {
      params: Promise.resolve({ name: "CRUD Test Term" }),
    });
    const data = await response.json();

    expect(response.status).toBe(409);
    expect(data.error).toContain("Cannot review");
  });

  // --- POST /api/wiki/[name]/approve (deprecated) ---

  it("returns 410 on deprecated approve endpoint", async () => {
    const { POST } = await import("@/app/api/wiki/[name]/approve/route");

    const request = toNextRequest(
      new Request(
        `http://localhost:3000/api/wiki/${encodeURIComponent("CRUD Test Term")}/approve?lang=zh`,
        { method: "POST" },
      ),
    );
    const response = await POST(request, {
      params: Promise.resolve({ name: "CRUD Test Term" }),
    });
    expect(response.status).toBe(410);
  });

  // --- GET /api/wiki now shows the entry since it's reviewed ---

  it("now lists the entry (reviewed appears in default list)", async () => {
    const { GET } = await import("@/app/api/wiki/route");

    const request = toNextRequest(
      new Request("http://localhost:3000/api/wiki?lang=zh"),
    );
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(
      data.entries.some(
        (e: { name: string }) => e.name === "CRUD Test Term",
      ),
    ).toBe(true);
    const entry = data.entries.find(
      (e: { name: string }) => e.name === "CRUD Test Term",
    );
    expect(entry.status).toBe("reviewed");
  });

  // --- DELETE /api/wiki/[name] ---

  it("deletes a wiki entry", async () => {
    const { DELETE } = await import("@/app/api/wiki/[name]/route");

    const request = toNextRequest(
      new Request(
        `http://localhost:3000/api/wiki/${encodeURIComponent("CRUD Test Term")}?lang=zh`,
      ),
    );
    const response = await DELETE(request, {
      params: Promise.resolve({ name: "CRUD Test Term" }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
  });

  it("verifies the entry is gone", async () => {
    const { GET } = await import("@/app/api/wiki/[name]/route");

    const request = toNextRequest(
      new Request(
        `http://localhost:3000/api/wiki/${encodeURIComponent("CRUD Test Term")}?lang=zh`,
      ),
    );
    const response = await GET(request, {
      params: Promise.resolve({ name: "CRUD Test Term" }),
    });

    expect(response.status).toBe(404);
  });
});
