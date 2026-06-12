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
import { readFile } from "fs/promises";
import path from "path";
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

    // --- Read old source content from file for incremental diff ---
    const sourcePath = path.join(process.cwd(), sourceArticle.contentPath);
    let currentSourceContent: string;
    try {
      currentSourceContent = await readFile(sourcePath, "utf-8");
    } catch {
      return NextResponse.json({ error: "Could not read source article file" }, { status: 500 });
    }

    // --- Get the previous (old) content for diff ---
    // We need the old source content. We try to find it from the latest
    // completed translate task's metadata, but since this is a manual trigger,
    // we pass empty oldSourceContent which will trigger a full translation
    // (the worker will read the file itself for current content).
    // For incremental, the old source content needs to come from the
    // article's previous file content. Since we can't know what changed,
    // we pass an empty string — the worker handles this by using the
    // existing translations from the latest task and treating all content
    // as new (falling back to full translation if none exist).
    const oldSourceContent = "";

    // --- Create the translation job ---
    const taskId = await addJob("translate", {
      articleId: sourceArticle.id,
      targetArticleId: targetArticle.id,
      sourceLanguage,
      targetLanguage,
      oldSourceContent,
    });

    return NextResponse.json({ taskId }, { status: 201 });
  } catch (error) {
    console.error("Error submitting translate task:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
