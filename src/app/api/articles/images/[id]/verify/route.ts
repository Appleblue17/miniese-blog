/**
 * @file POST /api/articles/images/[id]/verify (also supports GET)
 *
 * Validates that all images referenced in the draft article's Markdown content
 * exist in the draft's images/ directory.
 *
 * Request body (POST): { content: string }
 * Query params (GET):  ?content=<url-encoded-content>
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

async function getContent(
  request: NextRequest,
  articleDir: string,
): Promise<string> {
  // Try POST body first
  if (request.method === "POST") {
    try {
      const body = await request.json();
      if (body.content) return body.content;
    } catch {
      // Fall through
    }
  }

  // Try query param
  const { searchParams } = new URL(request.url);
  const queryContent = searchParams.get("content");
  if (queryContent) return queryContent;

  // Read from file
  const filePath = path.join(articleDir, "article.md");
  try {
    return await readFile(filePath, "utf-8");
  } catch {
    return "";
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return handleVerify(request, params);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return handleVerify(request, params);
}

async function handleVerify(
  request: NextRequest,
  paramsPromise: Promise<{ id: string }>,
) {
  try {
    const { id } = await paramsPromise;

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

    const content = await getContent(request, articleDir);

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
