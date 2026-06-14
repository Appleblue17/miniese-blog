/**
 * @file POST /api/articles/draft
 *
 * Saves an uploaded file as a draft (creates or updates database record).
 * File is named after the article slug (derived from meta.title), not the
 * upload filename. When title changes, the old file is cleaned up.
 *
 * Request body: { fileName, fileContent, meta, draftOfId? }
 *   - meta: { title, language, fileType, tags, author, summary }
 *   - If meta is provided, writes file with buildFrontmatter (UI metadata)
 *   - If meta is not provided, writes file as-is (legacy mode)
 *
 * Response: { success: true, draft: { id, slug, url } }
 */

import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir, unlink } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/db";
import { buildFrontmatter, generateSlug } from "@/lib/articles/frontmatter";
import type { ArticleMeta } from "@/lib/articles/frontmatter";

const DRAFTS_DIR = path.join(process.cwd(), "content", "articles", "drafts");

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { fileName: _fileName, fileContent, language, draftOfId, meta } = body;

    if (!fileContent) {
      return NextResponse.json({ error: "fileContent is required." }, { status: 400 });
    }

    const resolvedMeta: ArticleMeta | null = meta || null;

    // Validate language — must be a valid ArticleLanguage value
    const resolvedLang = (resolvedMeta?.language || language) as string;
    if (resolvedLang !== "zh" && resolvedLang !== "en") {
      return NextResponse.json(
        { error: "language must be 'zh' or 'en'." },
        { status: 400 },
      );
    }

    // Build file content with frontmatter from metadata
    const finalContent = resolvedMeta ? buildFrontmatter(fileContent, resolvedMeta) : fileContent;

    // Parse frontmatter for DB fields
    const { default: matter } = await import("gray-matter");
    const parsed = matter(finalContent);
    const data = parsed.data as Record<string, unknown>;

    const title = (data.title as string) || "未命名文章";
    const summary = (data.summary as string) || null;
    const tags = (data.tags as string[]) || [];
    const author = (data.author as string) || "博主";

    // Generate slug-based filename
    const slug = generateSlug(title, (data.slug as string) || undefined);
    const draftFileName = slug ? `${slug}.md` : `draft-${Date.now()}.md`;

    // Save file to drafts directory
    await mkdir(DRAFTS_DIR, { recursive: true });
    const filePath = path.join(DRAFTS_DIR, draftFileName);
    await writeFile(filePath, finalContent, "utf-8");

    let draft;

    if (draftOfId) {
      // Check for existing draft for this published article
      const existingDraft = await prisma.article.findFirst({
        where: { draftOfId, status: { in: ["draft", "review"] } },
      });

      if (existingDraft) {
        // Clean up old draft file if filename changed
        if (existingDraft.contentPath) {
          const oldFileName = existingDraft.contentPath.split("/").pop();
          if (oldFileName && oldFileName !== draftFileName) {
            try {
              await unlink(path.join(DRAFTS_DIR, oldFileName));
            } catch {
              // Old file may not exist
            }
          }
        }

        draft = await prisma.article.update({
          where: { id: existingDraft.id },
          data: {
            title,
            contentPath: `content/articles/drafts/${draftFileName}`,
            summary,
            tags,
            author,
            language: resolvedLang,
            status: "draft",
          },
        });
      } else {
        draft = await prisma.article.create({
          data: {
            slug: `draft-${Date.now()}`,
            title,
            language: resolvedLang,
            contentPath: `content/articles/drafts/${draftFileName}`,
            summary,
            tags,
            status: "draft",
            author,
            draftOfId,
          },
        });
      }
    } else {
      // New article draft
      draft = await prisma.article.create({
        data: {
          slug: `draft-${Date.now()}`,
          title,
          language: resolvedLang,
          contentPath: `content/articles/drafts/${draftFileName}`,
          summary,
          tags,
          status: "draft",
          author,
        },
      });
    }

    return NextResponse.json({
      success: true,
      draft: {
        id: draft.id,
        slug: draft.slug,
        url: `/admin/articles/${draft.id}/edit`,
      },
    });
  } catch (error) {
    console.error("Save draft error:", error);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
