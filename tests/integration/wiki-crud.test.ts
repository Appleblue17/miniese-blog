/**
 * Integration tests for wiki CRUD API endpoints.
 *
 * Tests: POST /api/wiki, GET /api/wiki, GET /api/wiki/[name],
 *        PUT /api/wiki/[name], DELETE /api/wiki/[name],
 *        POST /api/wiki/[name]/approve, POST /api/wiki/[name]/review
 *
 * These tests require a running PostgreSQL database.
 * They will be skipped if the database is not available.
 */

import { describe, it, expect, afterAll } from "vitest";
import { unlink } from "fs/promises";
import path from "path";
import { toNextRequest, createJsonRequest } from "./helpers";

import { isDatabaseAvailable } from "./setup";

const isDbAvailable = await isDatabaseAvailable();

const createdEntryIds: string[] = [];

const describeDb = isDbAvailable ? describe : describe.skip;

describeDb("Wiki CRUD API", () => {
  // --- Clean up after all tests ---
  afterAll(async () => {
    if (createdEntryIds.length > 0) {
      const { prisma } = await import("./db-client");
      const entries = await prisma.wikiEntry.findMany({
        where: { id: { in: createdEntryIds } },
      });
      // Delete files
      for (const entry of entries) {
        const filePath = path.join(process.cwd(), entry.contentPath);
        await unlink(filePath).catch(() => {});
      }
      // Delete DB records
      await prisma.wikiEntry.deleteMany({
        where: { id: { in: createdEntryIds } },
      });
    }
  });

  let createdId: string;

  // --- POST /api/wiki ---

  it("creates a new wiki entry (proposed status)", async () => {
    const { POST } = await import("@/app/api/wiki/route");

    const body = {
      name: "Integration Test Entry",
      language: "zh" as const,
    };

    const request = createJsonRequest(
      "http://localhost:3000/api/wiki",
      "POST",
      body,
    );
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.entry).toBeDefined();
    expect(data.entry.name).toBe("Integration Test Entry");
    expect(data.entry.language).toBe("zh");
    expect(data.entry.aliases).toEqual([]);
    expect(data.entry.definition).toBe("");
    expect(data.entry.tags).toEqual([]);
    expect(data.entry.status).toBe("proposed");
    expect(data.entry.contentPath).toContain("content/wiki/zh/");

    createdId = data.entry.id;
    createdEntryIds.push(createdId);
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

  it("returns 409 when entry with same name+language exists", async () => {
    const { POST } = await import("@/app/api/wiki/route");

    const body = {
      name: "Integration Test Entry",
      language: "zh",
    };
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

  // --- POST /api/wiki/[name]/approve ---

  it("approves a proposed entry (proposed → creating)", async () => {
    const { POST } = await import("@/app/api/wiki/[name]/approve/route");

    const request = toNextRequest(
      new Request(
        `http://localhost:3000/api/wiki/${encodeURIComponent("Integration Test Entry")}/approve?lang=zh`,
        { method: "POST" },
      ),
    );
    const response = await POST(request, {
      params: Promise.resolve({ name: "Integration Test Entry" }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.entry).toBeDefined();
    expect(data.entry.status).toBe("creating");
  });

  it("returns 409 approving a non-proposed entry", async () => {
    const { POST } = await import("@/app/api/wiki/[name]/approve/route");

    const request = toNextRequest(
      new Request(
        `http://localhost:3000/api/wiki/${encodeURIComponent("Integration Test Entry")}/approve?lang=zh`,
        { method: "POST" },
      ),
    );
    const response = await POST(request, {
      params: Promise.resolve({ name: "Integration Test Entry" }),
    });
    const data = await response.json();

    expect(response.status).toBe(409);
    expect(data.error).toContain("Cannot approve");
  });

  // --- GET /api/wiki (default: unreviewed + reviewed) ---

  it("lists unreviewed and reviewed entries by default", async () => {
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
        (e: { name: string }) => e.name === "Integration Test Entry",
      ),
    ).toBe(false);
  });

  it("filters by status parameter", async () => {
    const { GET } = await import("@/app/api/wiki/route");

    const request = toNextRequest(
      new Request("http://localhost:3000/api/wiki?lang=zh&status=creating"),
    );
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.entries.length).toBeGreaterThanOrEqual(1);
    expect(data.entries[0].status).toBe("creating");
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
        (e: { name: string }) => e.name === "Integration Test Entry",
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

  // --- GET /api/wiki/[name] ---

  it("gets a wiki entry by name", async () => {
    const { GET } = await import("@/app/api/wiki/[name]/route");

    const request = toNextRequest(
      new Request(
        `http://localhost:3000/api/wiki/${encodeURIComponent("Integration Test Entry")}?lang=zh`,
      ),
    );
    const response = await GET(request, {
      params: Promise.resolve({ name: "Integration Test Entry" }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.entry).toBeDefined();
    expect(data.entry.name).toBe("Integration Test Entry");
    expect(data.entry.status).toBe("creating");
    expect(data.entry.blocks).toBeDefined();
    expect(data.entry.blocks.definition).toBe("");
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

  // --- PUT /api/wiki/[name] ---

  it("returns 403 when editing a non-editable entry (creating)", async () => {
    const { PUT } = await import("@/app/api/wiki/[name]/route");

    const body = {
      definition: "Updated definition.",
    };

    const request = createJsonRequest(
      `http://localhost:3000/api/wiki/${encodeURIComponent("Integration Test Entry")}?lang=zh`,
      "PUT",
      body,
    );
    const response = await PUT(request, {
      params: Promise.resolve({ name: "Integration Test Entry" }),
    });
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toContain("Cannot edit");
  });

  // --- Simulate marking as unreviewed (by manually updating status) ---

  it("allows editing after status change to unreviewed", async () => {
    const { prisma } = await import("./db-client");

    // Manually update the entry status to unreviewed (simulating AI filling completion)
    await prisma.wikiEntry.update({
      where: { id: createdId },
      data: { status: "unreviewed" },
    });

    // Also update file frontmatter
    const entry = await prisma.wikiEntry.findUnique({ where: { id: createdId } });
    const { readFile, writeFile } = await import("fs/promises");
    const { buildWikiFileWithMeta, parseWikiFileWithMeta } = await import(
      "@/lib/wiki/parser"
    );
    const filePath = path.join(process.cwd(), entry!.contentPath);
    const content = await readFile(filePath, "utf-8");
    const parsed = parseWikiFileWithMeta(content);
    const updatedFile = buildWikiFileWithMeta(
      { ...parsed.frontmatter, status: "unreviewed" },
      parsed.blocks,
    );
    await writeFile(filePath, updatedFile, "utf-8");

    // Now try to update
    const { PUT } = await import("@/app/api/wiki/[name]/route");

    const body = {
      definition: "Updated definition for testing.",
      human: "# Updated Notes\n\nNew content here.",
      tags: ["test", "updated"],
    };

    const request = createJsonRequest(
      `http://localhost:3000/api/wiki/${encodeURIComponent("Integration Test Entry")}?lang=zh`,
      "PUT",
      body,
    );
    const response = await PUT(request, {
      params: Promise.resolve({ name: "Integration Test Entry" }),
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
        `http://localhost:3000/api/wiki/${encodeURIComponent("Integration Test Entry")}?lang=zh`,
      ),
    );
    const response = await GET(request, {
      params: Promise.resolve({ name: "Integration Test Entry" }),
    });
    const data = await response.json();

    expect(data.entry.blocks.definition).toBe(
      "Updated definition for testing.",
    );
    expect(data.entry.blocks.human).toContain("Updated Notes");
  });

  // --- POST /api/wiki/[name]/review ---

  it("reviews an unreviewed entry (unreviewed → reviewed)", async () => {
    const { POST } = await import("@/app/api/wiki/[name]/review/route");

    const request = toNextRequest(
      new Request(
        `http://localhost:3000/api/wiki/${encodeURIComponent("Integration Test Entry")}/review?lang=zh`,
        { method: "POST" },
      ),
    );
    const response = await POST(request, {
      params: Promise.resolve({ name: "Integration Test Entry" }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.entry.status).toBe("reviewed");
  });

  it("returns 409 reviewing a non-unreviewed entry", async () => {
    const { POST } = await import("@/app/api/wiki/[name]/review/route");

    const request = toNextRequest(
      new Request(
        `http://localhost:3000/api/wiki/${encodeURIComponent("Integration Test Entry")}/review?lang=zh`,
        { method: "POST" },
      ),
    );
    const response = await POST(request, {
      params: Promise.resolve({ name: "Integration Test Entry" }),
    });
    const data = await response.json();

    expect(response.status).toBe(409);
    expect(data.error).toContain("Cannot review");
  });

  // --- DELETE /api/wiki/[name] ---

  it("deletes a wiki entry", async () => {
    const { DELETE } = await import("@/app/api/wiki/[name]/route");

    const request = toNextRequest(
      new Request(
        `http://localhost:3000/api/wiki/${encodeURIComponent("Integration Test Entry")}?lang=zh`,
      ),
    );
    const response = await DELETE(request, {
      params: Promise.resolve({ name: "Integration Test Entry" }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
  });

  it("verifies the entry is gone", async () => {
    const { GET } = await import("@/app/api/wiki/[name]/route");

    const request = toNextRequest(
      new Request(
        `http://localhost:3000/api/wiki/${encodeURIComponent("Integration Test Entry")}?lang=zh`,
      ),
    );
    const response = await GET(request, {
      params: Promise.resolve({ name: "Integration Test Entry" }),
    });

    expect(response.status).toBe(404);
  });
});
