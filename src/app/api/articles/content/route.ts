/**
 * @file GET /api/articles/content
 *
 * Returns the raw Markdown content of an article by ID.
 * Used by the confirm step to generate diffs.
 *
 * Query params: id - Article ID
 *
 * Response (normal): { content: string, fileName: string }
 * Response (download): raw file with Content-Disposition: attachment
 */

import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const isDownload = searchParams.get("download") === "1";

    if (!id) {
      return NextResponse.json({ error: "id query parameter is required." }, { status: 400 });
    }

    const article = await prisma.article.findUnique({
      where: { id },
      select: { contentPath: true, title: true },
    });

    if (!article) {
      return NextResponse.json({ error: "Article not found." }, { status: 404 });
    }

    const filePath = path.join(process.cwd(), article.contentPath);
    let content: string;
    try {
      content = await readFile(filePath, "utf-8");
    } catch {
      content = "";
    }

    // Use article title as the download filename for better readability
    const safeTitle = article.title.replace(/[\/\\?%*:|"<>]/g, "_").trim() || "article";
    const fileName = `${safeTitle}.md`;

    // Download mode: return file as attachment
    if (isDownload) {
      // Use filename* (RFC 5987) for proper UTF-8 filename display
      const asciiName = fileName.replace(/[^\x20-\x7E]/g, "_");
      return new NextResponse(content, {
        status: 200,
        headers: {
          "Content-Type": "text/markdown; charset=utf-8",
          "Content-Disposition": `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        },
      });
    }

    return NextResponse.json({ content, fileName });
  } catch (error) {
    console.error("Get article content error:", error);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
