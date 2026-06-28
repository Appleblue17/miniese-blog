/**
 * @file POST /api/articles/delete
 *
 * Deletes an article (published or draft) and its associated file.
 * If deleting a published article, also deletes:
 *   - Any linked translation records and their files
 *   - Any linked draft records and their files
 *   - Related wiki links (cascaded by Prisma)
 *   - Related comments (cascaded by Prisma)
 *   - Related AiTask records (cascaded by Prisma)
 *   - Related WikiDiscovery records (cascaded by Prisma)
 *
 * Request body: { id }
 *
 * Response: { success: true }
 */

import { NextRequest, NextResponse } from "next/server";
import { rm } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json({ error: "id is required." }, { status: 400 });
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
      return NextResponse.json({ error: "Article not found." }, { status: 404 });
    }

    // If deleting a published article, also delete its linked translations and drafts
    if (article.status === "published") {
      // --- Delete linked translations ---
      const translations = await prisma.article.findMany({
        where: { originalId: id },
        select: { id: true, contentPath: true },
      });

      for (const t of translations) {
        if (t.contentPath) {
          const articleDir = path.dirname(path.join(process.cwd(), t.contentPath));
          try {
            await rm(articleDir, { recursive: true, force: true });
          } catch {
            // May not exist
          }
        }
      }

      await prisma.article.deleteMany({
        where: { originalId: id },
      });

      // --- Delete linked drafts ---
      const drafts = await prisma.article.findMany({
        where: { draftOfId: id },
        select: { id: true, contentPath: true },
      });

      for (const draft of drafts) {
        if (draft.contentPath) {
          const articleDir = path.dirname(path.join(process.cwd(), draft.contentPath));
          try {
            await rm(articleDir, { recursive: true, force: true });
          } catch {
            // May not exist
          }
        }
      }

      await prisma.article.deleteMany({
        where: { draftOfId: id },
      });
    }

    // Delete the article's own directory (with images/)
    if (article.contentPath) {
      const articleDir = path.dirname(path.join(process.cwd(), article.contentPath));
      try {
        await rm(articleDir, { recursive: true, force: true });
      } catch {
        // May not exist
      }
    }

    // Delete the article (cascade will handle AiTask, WikiDiscovery, wikiLinks, comments)
    await prisma.article.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete article error:", error);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
