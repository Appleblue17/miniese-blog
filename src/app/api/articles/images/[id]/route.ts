/**
 * @file /api/articles/images/[id]
 *
 * Image management API for articles.
 *
 * GET    /api/articles/images/[id] — List images + defaultAccessGroup + per-image overrides
 * POST   /api/articles/images/[id] — Upload an image file
 * PATCH  /api/articles/images/[id] — Update image access override or article defaultAccessGroup
 * DELETE /api/articles/images/[id]?filename=xxx — Delete an image
 *
 * Authentication: Requires admin password (via session or header)
 *
 * The images are stored in the article's directory:
 *   Draft:     content/articles/drafts/{dirName}/images/{filename}
 *   Published: content/articles/{lang}/{slug}/images/{filename}
 */

import { NextRequest, NextResponse } from "next/server";
import { readdir, writeFile, mkdir, unlink, stat } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/db";

// Allowed image MIME types
const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "image/avif",
]);

const ALLOWED_EXTENSIONS = new Set([
  ".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".avif",
]);

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

/**
 * GET — List images in the article's images/ directory.
 *
 * Returns image metadata along with access permission info:
 *   - defaultAccessGroup: the article's default image access group
 *   - overrides: map of filename -> image-specific access group override
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const article = await prisma.article.findUnique({
      where: { id },
      select: {
        contentPath: true,
        defaultImageAccessGroup: true,
      },
    });

    if (!article) {
      return NextResponse.json({ error: "Article not found." }, { status: 404 });
    }

    // Fetch per-image access overrides
    const overrides = await prisma.articleImageOverride.findMany({
      where: { articleId: id },
      select: { filename: true, accessGroup: true },
    });
    const overrideMap: Record<string, string[]> = {};
    for (const ov of overrides) {
      overrideMap[ov.filename] = ov.accessGroup;
    }

    const articleDir = path.dirname(path.join(process.cwd(), article.contentPath));
    const imagesDir = path.join(articleDir, "images");

    let files: string[] = [];
    try {
      files = await readdir(imagesDir);
    } catch {
      // images/ directory does not exist yet
      return NextResponse.json({ images: [], defaultAccessGroup: article.defaultImageAccessGroup || [] });
    }

    // Filter to image files and get metadata with access info
    const images = await Promise.all(
      files
        .filter((f) => {
          const ext = path.extname(f).toLowerCase();
          return ALLOWED_EXTENSIONS.has(ext);
        })
        .map(async (filename) => {
          let size = 0;
          try {
            const stats = await stat(path.join(imagesDir, filename));
            size = stats.size;
          } catch {
            // ignore
          }
          return {
            filename,
            size,
            // Use per-image override if present, otherwise inherit default
            accessGroup: overrideMap[filename] ?? null,
          };
        }),
    );

    // Sort by filename
    images.sort((a, b) => a.filename.localeCompare(b.filename));

    return NextResponse.json({
      images,
      defaultAccessGroup: article.defaultImageAccessGroup || [],
    });
  } catch (error) {
    console.error("List images error:", error);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}

/**
 * POST — Upload an image file to the article's images/ directory.
 * Accepts multipart/form-data with a "file" field.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const article = await prisma.article.findUnique({
      where: { id },
      select: { id: true, contentPath: true, status: true },
    });

    if (!article) {
      return NextResponse.json({ error: "Article not found." }, { status: 404 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "No file provided. Use form-data with a 'file' field." },
        { status: 400 },
      );
    }

    // Validate file type
    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      return NextResponse.json(
        {
          error: `Unsupported file type "${file.type}". Supported: ${Array.from(ALLOWED_MIME_TYPES).join(", ")}`,
        },
        { status: 400 },
      );
    }

    // Validate file extension
    const ext = path.extname(file.name).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return NextResponse.json(
        {
          error: `Unsupported file extension "${ext}". Supported: ${Array.from(ALLOWED_EXTENSIONS).join(", ")}`,
        },
        { status: 400 },
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024} MB.` },
        { status: 400 },
      );
    }

    if (file.size === 0) {
      return NextResponse.json({ error: "File is empty." }, { status: 400 });
    }

    // Sanitize filename — only allow safe characters
    const safeFilename = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");

    // Ensure images directory exists
    const articleDir = path.dirname(path.join(process.cwd(), article.contentPath));
    const imagesDir = path.join(articleDir, "images");
    await mkdir(imagesDir, { recursive: true });

    // Write file
    const buffer = Buffer.from(await file.arrayBuffer());
    const filePath = path.join(imagesDir, safeFilename);
    await writeFile(filePath, buffer);

    // Return image info
    return NextResponse.json({
      success: true,
      image: {
        filename: safeFilename,
        size: buffer.length,
        url: `/api/images/${id}/${encodeURIComponent(safeFilename)}`,
      },
    });
  } catch (error) {
    console.error("Upload image error:", error);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}

/**
 * PATCH — Update access settings for the article or a single image.
 *
 * Two modes:
 *   1. Per-image override: { filename: string, accessGroup: string[] }
 *      Setting accessGroup to an empty array removes the override.
 *   2. Default access group: { defaultImageAccessGroup: string[] }
 *      Updates the article's default image access group.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { filename, accessGroup, defaultImageAccessGroup } = body;

    // Validate that the article exists
    const article = await prisma.article.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!article) {
      return NextResponse.json({ error: "Article not found." }, { status: 404 });
    }

    // Mode 1: Update per-image access override
    if (filename !== undefined) {
      if (!filename) {
        return NextResponse.json({ error: "filename is required." }, { status: 400 });
      }

      if (!Array.isArray(accessGroup)) {
        return NextResponse.json({ error: "accessGroup must be an array of strings." }, { status: 400 });
      }

      const safeFilename = path.basename(filename);

      if (accessGroup.length === 0) {
        // Remove override — inherit default
        try {
          await prisma.articleImageOverride.delete({
            where: { articleId_filename: { articleId: id, filename: safeFilename } },
          });
        } catch {
          // Override may not exist — that's fine
        }
      } else {
        // Upsert override
        await prisma.articleImageOverride.upsert({
          where: { articleId_filename: { articleId: id, filename: safeFilename } },
          update: { accessGroup },
          create: { articleId: id, filename: safeFilename, accessGroup },
        });
      }

      return NextResponse.json({ success: true });
    }

    // Mode 2: Update article's default image access group
    if (defaultImageAccessGroup !== undefined) {
      if (!Array.isArray(defaultImageAccessGroup)) {
        return NextResponse.json({ error: "defaultImageAccessGroup must be an array of strings." }, { status: 400 });
      }

      await prisma.article.update({
        where: { id },
        data: { defaultImageAccessGroup },
      });

      return NextResponse.json({ success: true, defaultImageAccessGroup });
    }

    return NextResponse.json({ error: "Provide either 'filename' or 'defaultImageAccessGroup'." }, { status: 400 });
  } catch (error) {
    console.error("Update access error:", error);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}

/**
 * DELETE — Delete an image from the article's images/ directory.
 * Query param: filename (required)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const filename = searchParams.get("filename");

    if (!filename) {
      return NextResponse.json(
        { error: "filename query parameter is required." },
        { status: 400 },
      );
    }

    const article = await prisma.article.findUnique({
      where: { id },
      select: { contentPath: true },
    });

    if (!article) {
      return NextResponse.json({ error: "Article not found." }, { status: 404 });
    }

    // Sanitize filename to prevent directory traversal
    const safeFilename = path.basename(filename);
    const articleDir = path.dirname(path.join(process.cwd(), article.contentPath));
    const filePath = path.join(articleDir, "images", safeFilename);

    // Verify file exists
    try {
      await stat(filePath);
    } catch {
      return NextResponse.json({ error: "Image not found." }, { status: 404 });
    }

    await unlink(filePath);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete image error:", error);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
