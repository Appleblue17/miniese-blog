/**
 * @file POST /api/articles/draft
 *
 * Saves an uploaded file as a draft (creates or updates database record).
 * Uses directory structure: content/articles/drafts/{slugDir}/article.md + images/
 * When title changes, the old directory is cleaned up.
 *
 * Request body: { fileName, fileContent, meta, draftOfId? }
 *   - meta: { title, language, fileType, tags, author, summary }
 *   - If meta is provided, writes file with buildFrontmatter (UI metadata)
 *   - If meta is not provided, writes file as-is (legacy mode)
 *
 * Response: { success: true, draft: { id, slug, url } }
 */

import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir, rm } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/db";
import { buildFrontmatter, generateSlug } from "@/lib/articles/frontmatter";
import type { ArticleMeta } from "@/lib/articles/frontmatter";

const DRAFTS_DIR = path.join(process.cwd(), "content", "articles", "drafts");

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { fileName: _fileName, fileContent, language, draftOfId, draftId, meta } = body;

    if (!fileContent) {
      return NextResponse.json({ error: "fileContent is required." }, { status: 400 });
    }

    const resolvedMeta: ArticleMeta | null = meta || null;

    // Validate language — must be a valid ArticleLanguage value
    let resolvedLang: string = (resolvedMeta?.language || language) as string;
    if (resolvedLang !== "zh" && resolvedLang !== "en") {
      // Default to "zh" when language cannot be determined (e.g. file upload
      // without frontmatter or language suffix). User can change it in editor.
      resolvedLang = "zh";
    }
    const dbLang = resolvedLang as "zh" | "en";

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

    // Generate slug-based directory name
    const slug = generateSlug(title, (data.slug as string) || undefined);
    const dirName = slug || `draft-${Date.now()}`;

    await mkdir(DRAFTS_DIR, { recursive: true });

    let draft;

    // If draftId is provided, update that existing draft directly
    if (draftId) {
      const existingDraft = await prisma.article.findUnique({
        where: { id: draftId },
      });

      if (!existingDraft) {
        return NextResponse.json({ error: "Draft not found." }, { status: 404 });
      }

      // Clean up old draft directory if dir name changed
      if (existingDraft.contentPath) {
        const oldDirName = existingDraft.contentPath.split("/")[3];
        if (oldDirName && oldDirName !== dirName) {
          const oldDir = path.join(DRAFTS_DIR, oldDirName);
          try {
            await rm(oldDir, { recursive: true, force: true });
          } catch {
            // Old dir may not exist
          }
        }
      }

      // Ensure draft directory exists
      const draftDir = path.join(DRAFTS_DIR, dirName);
      await mkdir(draftDir, { recursive: true });
      await mkdir(path.join(draftDir, "images"), { recursive: true });

      const articleFilePath = path.join(draftDir, "article.md");
      await writeFile(articleFilePath, finalContent, "utf-8");

      draft = await prisma.article.update({
        where: { id: draftId },
        data: {
          title,
          contentPath: `content/articles/drafts/${dirName}/article.md`,
          summary,
          tags,
          author,
          language: dbLang,
          status: "draft",
        },
      });
    } else if (draftOfId) {
      // Check for existing draft for this published article
      const existingDraft = await prisma.article.findFirst({
        where: { draftOfId, status: { in: ["draft", "review"] } },
      });

      if (existingDraft) {
        // Clean up old draft directory if dir name changed
        if (existingDraft.contentPath) {
          const oldDirName = existingDraft.contentPath.split("/")[3]; // content/articles/drafts/{dirName}/article.md
          if (oldDirName && oldDirName !== dirName) {
            const oldDir = path.join(DRAFTS_DIR, oldDirName);
            try {
              await rm(oldDir, { recursive: true, force: true });
            } catch {
              // Old dir may not exist
            }
          }
        }

        // Ensure draft directory exists
        const draftDir = path.join(DRAFTS_DIR, dirName);
        await mkdir(draftDir, { recursive: true });
        // Ensure images subdirectory exists
        await mkdir(path.join(draftDir, "images"), { recursive: true });

        const articleFilePath = path.join(draftDir, "article.md");
        await writeFile(articleFilePath, finalContent, "utf-8");

        draft = await prisma.article.update({
          where: { id: existingDraft.id },
          data: {
            title,
            contentPath: `content/articles/drafts/${dirName}/article.md`,
            summary,
            tags,
            author,
            language: dbLang,
            status: "draft",
          },
        });
      } else {
        // Create new draft directory
        const draftDir = path.join(DRAFTS_DIR, dirName);
        await mkdir(draftDir, { recursive: true });
        await mkdir(path.join(draftDir, "images"), { recursive: true });

        const articleFilePath = path.join(draftDir, "article.md");
        await writeFile(articleFilePath, finalContent, "utf-8");

        draft = await prisma.article.create({
          data: {
            slug: `draft-${Date.now()}`,
            title,
            language: dbLang,
            contentPath: `content/articles/drafts/${dirName}/article.md`,
            summary,
            tags,
            status: "draft",
            author,
            draftOfId,
          },
        });
      }
    } else {
      // New article draft — create directory structure
      const draftDir = path.join(DRAFTS_DIR, dirName);
      await mkdir(draftDir, { recursive: true });
      await mkdir(path.join(draftDir, "images"), { recursive: true });

      const articleFilePath = path.join(draftDir, "article.md");
      await writeFile(articleFilePath, finalContent, "utf-8");

      draft = await prisma.article.create({
        data: {
          slug: `draft-${Date.now()}`,
          title,
          language: dbLang,
          contentPath: `content/articles/drafts/${dirName}/article.md`,
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
