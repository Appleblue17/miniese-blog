/**
 * @file POST /api/articles/upload
 *
 * Accepts a .md file upload, parses frontmatter, saves the file to drafts
 * directory, and creates/updates a database record.
 *
 * Two modes:
 * - saveAsDraft=true: save as draft status, return draft ID
 * - saveAsDraft=false (default): just parse and upload, return parsed data
 *
 * Request: multipart/form-data with "file" field
 *   + optional: saveAsDraft (string "true"/"false")
 *   + optional: draftOfId (string, if editing existing article)
 *
 * Response: { success, fileName, fileContent, language, frontmatter, draftId? }
 */

import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/db";
import { parseFrontmatter } from "@/lib/articles/frontmatter";

const DRAFTS_DIR = path.join(process.cwd(), "content", "articles", "drafts");

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const saveAsDraft = formData.get("saveAsDraft") === "true";
    const draftOfId = formData.get("draftOfId") as string | null;

    if (!file) {
      return NextResponse.json(
        { error: "No file provided. Use form-data with a 'file' field." },
        { status: 400 },
      );
    }

    if (!file.name.endsWith(".md")) {
      return NextResponse.json({ error: "Only .md files are accepted." }, { status: 400 });
    }

    if (file.size === 0) {
      return NextResponse.json({ error: "File is empty." }, { status: 400 });
    }

    // Read file content and parse frontmatter
    const buffer = Buffer.from(await file.arrayBuffer());
    const raw = buffer.toString("utf-8");
    const { frontmatter } = parseFrontmatter(raw);

    // Extract language from frontmatter or default to zh
    const language = frontmatter.language === "en" ? "en" : "zh";

    // Extract metadata for UI
    const meta = {
      title: frontmatter.title || "",
      language,
      fileType: frontmatter.fileType || frontmatter.contentType || "markdown",
      tags: frontmatter.tags || [],
      author: frontmatter.author || "博主",
      summary: frontmatter.summary || "",
    };

    // Collect extra frontmatter fields (not managed by UI)
    const extraFrontmatter: Record<string, unknown> = {};
    const managedKeys = new Set([
      "title",
      "language",
      "fileType",
      "contentType",
      "tags",
      "author",
      "summary",
      "slug",
      "accessGroup",
      "changelog",
    ]);
    for (const [key, value] of Object.entries(frontmatter)) {
      if (!managedKeys.has(key)) {
        extraFrontmatter[key] = value;
      }
    }

    // Save file to drafts directory — use directory structure
    // content/articles/drafts/{slug}/article.md
    await mkdir(DRAFTS_DIR, { recursive: true });

    // Generate a directory name from file name (strip .md)
    const dirName = file.name.replace(/\.md$/i, "");
    const draftDir = path.join(DRAFTS_DIR, dirName);
    await mkdir(draftDir, { recursive: true });

    const articleFilePath = path.join(draftDir, "article.md");
    await writeFile(articleFilePath, buffer);

    // Create images directory
    const imagesDir = path.join(draftDir, "images");
    await mkdir(imagesDir, { recursive: true });

    // The contentPath stored in DB — no leading slash
    const contentPath = `content/articles/drafts/${dirName}/article.md`;

    let draftId: string | undefined;

    // If saving as draft, create/update database record
    if (saveAsDraft) {
      // Check existing draft for this published article
      if (draftOfId) {
        const existingDraft = await prisma.article.findFirst({
          where: { draftOfId, status: { in: ["draft", "review"] } },
        });
        if (existingDraft) {
          // Update existing draft
          await prisma.article.update({
            where: { id: existingDraft.id },
            data: {
              title: frontmatter.title || existingDraft.title,
              contentPath,
              summary: frontmatter.summary || existingDraft.summary,
              tags: frontmatter.tags || existingDraft.tags,
              author: frontmatter.author || existingDraft.author,
              language,
              status: "draft",
            },
          });
          draftId = existingDraft.id;
        } else {
          // Create new draft linked to published article
          const draft = await prisma.article.create({
            data: {
              slug: `draft-${Date.now()}`,
              title: frontmatter.title || "未命名文章",
              language,
              contentPath,
              summary: frontmatter.summary || null,
              tags: frontmatter.tags || [],
              status: "draft",
              accessGroup: frontmatter.accessGroup || [],
              author: frontmatter.author || "博主",
              draftOfId,
            },
          });
          draftId = draft.id;
        }
      } else {
        // New article draft (no published article yet)
        const draft = await prisma.article.create({
          data: {
            slug: `draft-${Date.now()}`,
            title: frontmatter.title || "未命名文章",
            language,
            contentPath,
            summary: frontmatter.summary || null,
            tags: frontmatter.tags || [],
            status: "draft",
            accessGroup: frontmatter.accessGroup || [],
            author: frontmatter.author || "博主",
          },
        });
        draftId = draft.id;
      }
    }

    return NextResponse.json({
      success: true,
      fileName: file.name,
      fileContent: raw,
      meta,
      extraFrontmatter,
      ...(draftId ? { draftId } : {}),
    });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
