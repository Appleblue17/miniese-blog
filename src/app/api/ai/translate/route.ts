/**
 * @file POST /api/ai/translate
 *
 * Submits an AI translation task for an article.
 *
 * Creates a translate job that will:
 * 1. Read the source article content
 * 2. Detect changes since last translation
 * 3. Incrementally translate changed paragraphs
 * 4. Write translated content to the target article file
 * 5. Update the isAITranslated flag
 *
 * Request body (manual mode):
 *   { articleId, sourceLanguage, targetLanguage }
 *
 * The target article is found by looking up a sibling article
 * with the same slug in the target language.
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
      sourceLanguage?: string;
      targetLanguage?: string;
    };

    // --- Validate required fields ---
    if (!body.articleId || typeof body.articleId !== "string") {
      return NextResponse.json(
        { error: "articleId is required and must be a string" },
        { status: 400 },
      );
    }

    const sourceLanguage = body.sourceLanguage || "zh";
    const targetLanguage = body.targetLanguage || "en";

    if (!["zh", "en"].includes(sourceLanguage)) {
      return NextResponse.json({ error: "sourceLanguage must be 'zh' or 'en'" }, { status: 400 });
    }

    if (!["zh", "en"].includes(targetLanguage)) {
      return NextResponse.json({ error: "targetLanguage must be 'zh' or 'en'" }, { status: 400 });
    }

    if (sourceLanguage === targetLanguage) {
      return NextResponse.json(
        { error: "sourceLanguage and targetLanguage must be different" },
        { status: 400 },
      );
    }

    // --- Look up source article ---
    const sourceArticle = await prisma.article.findUnique({
      where: { id: body.articleId },
      select: {
        id: true,
        slug: true,
        language: true,
        contentPath: true,
      },
    });

    if (!sourceArticle) {
      return NextResponse.json({ error: `Article not found: ${body.articleId}` }, { status: 404 });
    }

    // --- Look up target article (sibling with same slug) ---
    const targetArticle = await prisma.article.findUnique({
      where: {
        slug_language: {
          slug: sourceArticle.slug,
          language: targetLanguage as "zh" | "en",
        },
      },
      select: { id: true },
    });

    if (!targetArticle) {
      return NextResponse.json(
        {
          error:
            `No ${targetLanguage === "zh" ? "Chinese" : "English"} version found for article "${sourceArticle.slug}". ` +
            `Create a ${targetLanguage === "zh" ? "Chinese" : "English"} version first.`,
        },
        { status: 404 },
      );
    }

    // --- Create the translation job ---
    // The worker handles incremental diff internally by loading the previous
    // translate task's contentSnapshot from the DB, so we don't need to
    // pass oldSourceContent as a payload parameter anymore.
    let taskId: string;
    try {
      taskId = await addJob("translate", {
        articleId: sourceArticle.id,
        targetArticleId: targetArticle.id,
        sourceLanguage,
        targetLanguage,
      });
    } catch (err) {
      // Redis may not be available (e.g. in test environment).
      // Create the DB record directly without queue.
      const task = await prisma.aiTask.create({
        data: {
          type: "translate",
          status: "pending",
          input: {
            articleId: sourceArticle.id,
            targetArticleId: targetArticle.id,
            sourceLanguage,
            targetLanguage,
          },
          articleId: sourceArticle.id,
        },
      });
      taskId = task.id;
      console.warn("Translate task created without queue (Redis unavailable):", taskId);
    }

    return NextResponse.json({ taskId }, { status: 201 });
  } catch (error) {
    console.error("Error submitting translate task:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
