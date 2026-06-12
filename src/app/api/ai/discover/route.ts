/**
 * @file POST /api/ai/discover
 *
 * Submits an AI term discovery task for an article.
 *
 * Creates a "discover" job that will:
 * 1. Read the article content from its file
 * 2. Scan for potential wiki terms using the unified chunking pipeline
 * 3. Store candidates in the WikiDiscovery table for blogger review
 *
 * Request body:
 *   { articleId } — the ID of the published article to scan
 *
 * Response: { taskId } - for status polling via GET /api/ai/status/[taskId]
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { addJob } from "@/lib/queue/producer";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = (await request.json()) as {
      articleId?: string;
    };

    // --- Validate required fields ---
    if (!body.articleId || typeof body.articleId !== "string") {
      return NextResponse.json(
        { error: "articleId is required and must be a string" },
        { status: 400 },
      );
    }

    // --- Look up the article ---
    const article = await prisma.article.findUnique({
      where: { id: body.articleId },
      select: {
        id: true,
        slug: true,
        language: true,
        status: true,
      },
    });

    if (!article) {
      return NextResponse.json(
        { error: `Article not found: ${body.articleId}` },
        { status: 404 },
      );
    }

    // Only allow discovery on published articles
    if (article.status !== "published") {
      return NextResponse.json(
        { error: "Term discovery is only available for published articles" },
        { status: 400 },
      );
    }

    // --- Create the discover job ---
    // Pass articleId, articleSlug, and articleLang for the worker to use
    const taskId = await addJob("discover", {
      articleId: article.id,
      articleSlug: article.slug,
      articleLang: article.language,
    });

    return NextResponse.json({ taskId }, { status: 201 });
  } catch (error) {
    console.error("Error submitting discover task:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
