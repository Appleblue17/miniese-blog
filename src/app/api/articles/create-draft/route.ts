/**
 * @file POST /api/articles/create-draft
 *
 * Creates a draft from an existing published article.
 * Copies the entire article directory (including images/) to drafts/.
 *
 * Request body: { articleId }
 *
 * Response: { success: true, draft: { id, slug, url } }
 */

import { NextRequest, NextResponse } from "next/server";
import { readFile, writeFile, mkdir, cp } from "fs/promises";
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
        defaultImageAccessGroup: true,
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

    // Copy entire article directory (with images/) to drafts/
    const DRAFTS_DIR = path.join(process.cwd(), "content", "articles", "drafts");
    await mkdir(DRAFTS_DIR, { recursive: true });

    // Source: content/articles/{lang}/{slug}/
    // Dest: content/articles/drafts/{slug}-draft/
    const sourceDir = path.dirname(path.join(process.cwd(), article.contentPath));
    const draftDirName = `${article.slug}-draft`;
    const draftDir = path.join(DRAFTS_DIR, draftDirName);

    try {
      await cp(sourceDir, draftDir, { recursive: true });
    } catch {
      return NextResponse.json(
        { error: "Published article directory not found." },
        { status: 500 },
      );
    }

    const contentPath = `content/articles/drafts/${draftDirName}/article.md`;

    // Create draft database record
    const draft = await prisma.article.create({
      data: {
        slug: `draft-${Date.now()}`,
        title: article.title,
        language: article.language,
        contentPath,
        summary: article.summary,
        tags: article.tags,
        status: "draft",
        author: article.author,
        draftOfId: article.id,
        defaultImageAccessGroup: article.defaultImageAccessGroup || [],
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
