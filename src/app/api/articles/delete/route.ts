/**
 * @file POST /api/articles/delete
 *
 * Deletes an article (published or draft) and its associated file.
 * If deleting a published article, also deletes:
 *   - Any linked draft records and their files
 *   - Related wiki links (cascaded by Prisma)
 *   - Related comments (cascaded by Prisma)
 *
 * Request body: { id }
 *
 * Response: { success: true }
 */

import { NextRequest, NextResponse } from "next/server";
import { unlink } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json(
        { error: "id is required." },
        { status: 400 },
      );
    }

    // Find the article
    const article = await prisma.article.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        contentPath: true,
      },
    });

    if (!article) {
      return NextResponse.json(
        { error: "Article not found." },
        { status: 404 },
      );
    }

    // If deleting a published article, also delete its linked drafts
    if (article.status === "published") {
      const drafts = await prisma.article.findMany({
        where: { draftOfId: id },
        select: { id: true, contentPath: true },
      });

      // Delete linked draft files
      for (const draft of drafts) {
        if (draft.contentPath) {
          const filePath = path.join(process.cwd(), draft.contentPath);
          try {
            await unlink(filePath);
          } catch {
            // File may not exist
          }
        }
      }

      // Delete linked draft records (cascade will handle wikiLinks and comments on the main article)
      await prisma.article.deleteMany({
        where: { draftOfId: id },
      });
    }

    // Delete the article's own file
    if (article.contentPath) {
      const filePath = path.join(process.cwd(), article.contentPath);
      try {
        await unlink(filePath);
      } catch {
        // File may not exist
      }
    }

    // Delete the article (cascade will handle wikiLinks and comments)
    await prisma.article.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete article error:", error);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 },
    );
  }
}
