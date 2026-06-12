/**
 * @file POST /api/ai/review
 *
 * Submits an AI review task for an article.
 * Enqueues the job and returns a taskId for status polling.
 */

import { NextRequest, NextResponse } from "next/server";
import { addJob } from "@/lib/queue/producer";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = (await request.json()) as { articleId?: string };

    if (!body.articleId || typeof body.articleId !== "string") {
      return NextResponse.json(
        { error: "articleId is required and must be a string" },
        { status: 400 },
      );
    }

    const taskId = await addJob("review", { articleId: body.articleId });

    return NextResponse.json({ taskId }, { status: 201 });
  } catch (error) {
    console.error("Error submitting review task:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
