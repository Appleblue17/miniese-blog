/**
 * @file GET /api/articles/images/[id]/verify
 *
 * Validates that all images referenced in the draft article's Markdown content
 * exist in the draft's images/ directory.
 *
 * Query params:
 *   content - The Markdown content to validate (URL-encoded, optional).
 *             If not provided, reads from the draft's contentPath on disk.
 *
 * Response: { valid: boolean, referenced: string[], missing: string[] }
 */

import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/db";
import {
  extractImageReferences,
  validateImageReferences,
} from "@/lib/articles/images";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const article = await prisma.article.findUnique({
      where: { id },
      select: { contentPath: true, status: true },
    });

    if (!article) {
      return NextResponse.json({ error: "Article not found." }, { status: 404 });
    }

    const articleDir = path.dirname(
      path.join(process.cwd(), article.contentPath),
    );

    // Get content to validate
    const { searchParams } = new URL(request.url);
    let content = searchParams.get("content");

    if (!content) {
      // Read from file
      const filePath = path.join(articleDir, "article.md");
      try {
        content = await readFile(filePath, "utf-8");
      } catch {
        return NextResponse.json({ valid: true, referenced: [], missing: [] });
      }
    }

    if (!content.trim()) {
      return NextResponse.json({ valid: true, referenced: [], missing: [] });
    }

    const result = await validateImageReferences(content, articleDir);

    return NextResponse.json(result);
  } catch (error) {
    console.error("Verify images error:", error);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
