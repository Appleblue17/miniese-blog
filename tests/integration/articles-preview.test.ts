/**
 * Integration tests for POST /api/articles/preview
 */

import { describe, it, expect } from "vitest";
import { toNextRequest } from "./helpers";

const API_PREFIX = "http://localhost:3000";

describe("POST /api/articles/preview", () => {
  it("renders standard Markdown to HTML", async () => {
    const { POST } = await import("@/app/api/articles/preview/route");

    const request = toNextRequest(
      new Request(`${API_PREFIX}/api/articles/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "# Hello\n\nWorld." }),
      }),
    );

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.html).toContain("<h1 id=\"hello\">Hello</h1>");
    expect(data.html).toContain("<p>World.</p>");
    expect(data.metadata.title).toBeNull();
    expect(data.metadata.tags).toEqual([]);
  });

  it("extracts frontmatter metadata", async () => {
    const { POST } = await import("@/app/api/articles/preview/route");

    const content = `---
title: "Test Article"
tags: [test, demo]
summary: "A test summary"
---

# Body here.`;

    const request = toNextRequest(
      new Request(`${API_PREFIX}/api/articles/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      }),
    );

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.metadata.title).toBe("Test Article");
    expect(data.metadata.tags).toEqual(["test", "demo"]);
    expect(data.metadata.summary).toBe("A test summary");
  });

  it("renders Notesaw content when contentType is 'notesaw'", async () => {
    const { POST } = await import("@/app/api/articles/preview/route");

    const request = toNextRequest(
      new Request(`${API_PREFIX}/api/articles/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: "@def Foo {\n    bar\n}",
          contentType: "notesaw",
        }),
      }),
    );

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.html).toContain("block-container");
    expect(data.metadata.contentType).toBe("notesaw");
  });

  it("returns 400 when content is missing", async () => {
    const { POST } = await import("@/app/api/articles/preview/route");

    const request = toNextRequest(
      new Request(`${API_PREFIX}/api/articles/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
    );

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("Content is required");
  });

  it("returns 400 when content is not a string", async () => {
    const { POST } = await import("@/app/api/articles/preview/route");

    const request = toNextRequest(
      new Request(`${API_PREFIX}/api/articles/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: 123 }),
      }),
    );

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("Content is required");
  });

  it("handles empty content string", async () => {
    const { POST } = await import("@/app/api/articles/preview/route");

    const request = toNextRequest(
      new Request(`${API_PREFIX}/api/articles/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "" }),
      }),
    );

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("Content is required");
  });
});

