/**
 * @file POST /api/ai/generate
 *
 * Manually triggers AI term generation for an article.
 * Scans the article content via DeepSeek, discovers potential wiki terms,
 * and creates proposed wiki entries.
 *
 * Body: { articleId: string }
 * Response (201): { taskId: string }
 * Response (400): { error: string }
 * Response (404): { error: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { addJob } from "@/lib/queue/producer";

export async function POST(request: NextRequest) {
  try {
    const body: { articleId?: string } = await request.json();
    const { articleId } = body;

    // --- Validation ---

    if (!articleId || typeof articleId !== "string" || !articleId.trim()) {
      return NextResponse.json({ error: "articleId is required." }, { status: 400 });
    }

    const article = await prisma.article.findUnique({
      where: { id: articleId.trim() },
      select: { id: true, slug: true, title: true, language: true },
    });

    if (!article) {
      return NextResponse.json({ error: `Article not found: ${articleId}` }, { status: 404 });
    }

    // --- Create task ---

    const taskId = await addJob("generate", {
      articleId: article.id,
    });

    return NextResponse.json({ taskId }, { status: 201 });
  } catch (error) {
    console.error("Term generation trigger error:", error);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
