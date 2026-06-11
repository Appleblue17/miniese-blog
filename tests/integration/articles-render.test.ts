/**
 * Integration tests for POST /api/articles/render
 *
 * These tests require a running PostgreSQL database.
 * They will be skipped if the database is not available.
 */

import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { cleanDraftsDir, isDatabaseAvailable } from "./setup";
import { toNextRequest } from "./helpers";
import { buildWikiFileWithMeta } from "@/lib/wiki/parser";
import { mkdir, writeFile, unlink } from "fs/promises";
import path from "path";

let isDbAvailable = false;
let cleanupFns: (() => Promise<void>)[] = [];

isDbAvailable = await isDatabaseAvailable();

beforeEach(async () => {
  await cleanDraftsDir();
  cleanupFns = [];
  if (isDbAvailable) {
    const { prisma } = await import("./db-client");
    await prisma.article.deleteMany({
      where: { slug: { startsWith: "test-" } },
    }).catch(() => {});
    await prisma.wikiEntry.deleteMany({
      where: { name: { in: ["DFS", "量子计算"] } },
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

describeDb("POST /api/articles/render", () => {
  it("re-renders an article and updates renderedContent", async () => {
    const { prisma } = await import("./db-client");

    // First publish an article via the publish API
    const { POST: publish } = await import("@/app/api/articles/publish/route");

    const fileContent = `---
title: "Render Test"
language: zh
tags: [test]
slug: test-render
---

# Render Test

DFS is used for graph traversal.`;

    const publishReq = toNextRequest(
      new Request("http://localhost:3000/api/articles/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          language: "zh",
          meta: {
            title: "Render Test",
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

    const publishRes = await publish(publishReq);
    expect(publishRes.status).toBe(200);
    const publishData = await publishRes.json();
    const articleId = publishData.article.id;

    // Now seed a wiki entry
    const wikiFileContent = buildWikiFileWithMeta(
      {
        name: "DFS",
        language: "zh",
        aliases: [],
        tags: ["算法"],
        status: "reviewed",
        accessGroup: [],
      },
      {
        definition: "深度优先搜索算法",
        human: "",
        ai: "",
        ref: "",
      },
    );

    const wikiDir = path.join(process.cwd(), "content", "wiki", "zh");
    await mkdir(wikiDir, { recursive: true });
    await writeFile(path.join(wikiDir, "dfs.md"), wikiFileContent, "utf-8");

    await prisma.wikiEntry.create({
      data: {
        name: "DFS",
        aliases: [],
        language: "zh",
        definition: "深度优先搜索算法",
        contentPath: "content/wiki/zh/dfs.md",
        tags: ["算法"],
        accessGroup: [],
        status: "reviewed",
      },
    });

    // Verify the article did NOT have wiki links before re-render
    const articleBefore = await prisma.article.findUnique({
      where: { id: articleId },
    });
    expect(articleBefore!.renderedContent).not.toContain('data-wiki-name="DFS"');

    // Now call the render API
    const { POST: render } = await import("@/app/api/articles/render/route");

    const renderReq = toNextRequest(
      new Request("http://localhost:3000/api/articles/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          articleId,
          lang: "zh",
        }),
      }),
    );

    const renderRes = await render(renderReq);
    expect(renderRes.status).toBe(200);
    const renderData = await renderRes.json();
    expect(renderData.success).toBe(true);

    // Verify the article now has wiki links
    const articleAfter = await prisma.article.findUnique({
      where: { id: articleId },
    });
    expect(articleAfter!.renderedContent).toContain(
      '<a href="/zh/wiki/DFS" data-wiki-name="DFS">DFS</a>',
    );

    // Cleanup
    cleanupFns.push(async () => {
      await unlink(
        path.join(process.cwd(), "content", "articles", "zh", "test-render.md"),
      ).catch(() => {});
      await prisma.article.delete({ where: { id: articleId } }).catch(() => {});
      await unlink(path.join(wikiDir, "dfs.md")).catch(() => {});
      await prisma.wikiEntry.deleteMany({ where: { name: "DFS" } }).catch(() => {});
    });
  });

  it("returns 400 when articleId is missing", async () => {
    const { POST } = await import("@/app/api/articles/render/route");

    const request = toNextRequest(
      new Request("http://localhost:3000/api/articles/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lang: "zh" }),
      }),
    );

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("articleId");
  });

  it("returns 400 when lang is invalid", async () => {
    const { POST } = await import("@/app/api/articles/render/route");

    const request = toNextRequest(
      new Request("http://localhost:3000/api/articles/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ articleId: "test", lang: "fr" }),
      }),
    );

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("lang");
  });

  it("returns 404 when article does not exist", async () => {
    const { POST } = await import("@/app/api/articles/render/route");

    const request = toNextRequest(
      new Request("http://localhost:3000/api/articles/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          articleId: "00000000-0000-0000-0000-000000000000",
          lang: "zh",
        }),
      }),
    );

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toContain("not found");
  });
});
