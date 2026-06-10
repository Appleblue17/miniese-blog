/**
 * @file GET /api/articles/content
 *
 * Returns the raw Markdown content of an article by ID.
 * Used by the confirm step to generate diffs.
 *
 * Query params: id - Article ID
 *
 * Response: { content: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "id query parameter is required." },
        { status: 400 },
      );
    }

    const article = await prisma.article.findUnique({
      where: { id },
      select: { contentPath: true, status: true },
    });

    if (!article) {
      return NextResponse.json(
        { error: "Article not found." },
        { status: 404 },
      );
    }

    const filePath = path.join(process.cwd(), article.contentPath);
    let content: string;
    try {
      content = await readFile(filePath, "utf-8");
    } catch {
      content = "";
    }

    return NextResponse.json({ content });
  } catch (error) {
    console.error("Get article content error:", error);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 },
    );
  }
}
