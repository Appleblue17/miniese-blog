/**
 * @file POST /api/articles/create-draft
 *
 * Creates a draft from an existing published article.
 * Copies the content file to the drafts directory and creates a draft record.
 *
 * Request body: { articleId }
 *
 * Response: { success: true, draft: { id, slug, url } }
 */

import { NextRequest, NextResponse } from "next/server";
import { readFile, writeFile, mkdir } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { articleId } = body;

    if (!articleId) {
      return NextResponse.json({ error: "articleId is required." }, { status: 400 });
    }

    // Find the published article
    const article = await prisma.article.findUnique({
      where: { id: articleId },
      select: {
        id: true,
        slug: true,
        title: true,
        language: true,
        contentPath: true,
        summary: true,
        tags: true,
        author: true,
        status: true,
      },
    });

    if (!article || article.status !== "published") {
      return NextResponse.json({ error: "Published article not found." }, { status: 404 });
    }

    // Check if a draft already exists for this article
    const existingDraft = await prisma.article.findFirst({
      where: { draftOfId: articleId, status: { in: ["draft", "review"] } },
    });

    if (existingDraft) {
      // Draft already exists, return it
      return NextResponse.json({
        success: true,
        draft: {
          id: existingDraft.id,
          slug: existingDraft.slug,
          url: `/admin/articles/${existingDraft.id}/edit`,
        },
      });
    }

    // Read the published content file
    let content = "";
    try {
      content = await readFile(path.join(process.cwd(), article.contentPath), "utf-8");
    } catch {
      return NextResponse.json({ error: "Published article file not found." }, { status: 500 });
    }

    // Write to drafts directory
    const DRAFTS_DIR = path.join(process.cwd(), "content", "articles", "drafts");
    await mkdir(DRAFTS_DIR, { recursive: true });

    const draftFileName = `${article.slug}-draft.md`;
    const filePath = path.join(DRAFTS_DIR, draftFileName);
    await writeFile(filePath, content, "utf-8");

    // Create draft database record
    const draft = await prisma.article.create({
      data: {
        slug: `draft-${Date.now()}`,
        title: article.title,
        language: article.language,
        contentPath: `content/articles/drafts/${draftFileName}`,
        summary: article.summary,
        tags: article.tags,
        status: "draft",
        author: article.author,
        draftOfId: article.id,
      },
    });

    return NextResponse.json({
      success: true,
      draft: {
        id: draft.id,
        slug: draft.slug,
        url: `/admin/articles/${draft.id}/edit`,
      },
    });
  } catch (error) {
    console.error("Create draft error:", error);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
