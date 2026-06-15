/**
 * Integration tests for POST /api/articles/upload
 */

import { describe, it, expect, beforeEach } from "vitest";
import { cleanDraftsDir } from "./setup";
import { existsSync } from "fs";
import path from "path";
import { toNextRequest } from "./helpers";

const DRAFTS_DIR = path.join(process.cwd(), "content", "articles", "drafts");
const API_PREFIX = "http://localhost:3000";

beforeEach(async () => {
  await cleanDraftsDir();
});

describe("POST /api/articles/upload", () => {
  it("uploads a valid .md file and returns filePath", async () => {
    const { POST } = await import("@/app/api/articles/upload/route");

    const formData = new FormData();
    const file = new File(
      ["# Hello World\n\nContent body."],
      "test-article.md",
      { type: "text/markdown" },
    );
    formData.append("file", file);

    const request = toNextRequest(
      new Request(`${API_PREFIX}/api/articles/upload`, {
        method: "POST",
        body: formData,
      }),
    );

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.fileName).toBe("test-article.md");

    // Verify the file was actually written using the new directory structure
    const articleDir = path.join(DRAFTS_DIR, "test-article");
    const filePath = path.join(articleDir, "article.md");
    expect(existsSync(filePath)).toBe(true);
    // Also verify images directory was created
    expect(existsSync(path.join(articleDir, "images"))).toBe(true);
  });

  it("returns 400 when no file is provided", async () => {
    const { POST } = await import("@/app/api/articles/upload/route");

    const formData = new FormData();
    const request = toNextRequest(
      new Request(`${API_PREFIX}/api/articles/upload`, {
        method: "POST",
        body: formData,
      }),
    );

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("No file provided");
  });

  it("returns 400 when file is not .md", async () => {
    const { POST } = await import("@/app/api/articles/upload/route");

    const formData = new FormData();
    const file = new File(["not markdown"], "test.txt", {
      type: "text/plain",
    });
    formData.append("file", file);

    const request = toNextRequest(
      new Request(`${API_PREFIX}/api/articles/upload`, {
        method: "POST",
        body: formData,
      }),
    );

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain(".md");
  });

  it("returns 400 when file is empty", async () => {
    const { POST } = await import("@/app/api/articles/upload/route");

    const formData = new FormData();
    const file = new File([""], "empty.md", {
      type: "text/markdown",
    });
    formData.append("file", file);

    const request = toNextRequest(
      new Request(`${API_PREFIX}/api/articles/upload`, {
        method: "POST",
        body: formData,
      }),
    );

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("empty");
  });
});
