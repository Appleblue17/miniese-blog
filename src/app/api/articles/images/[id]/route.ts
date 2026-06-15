/**
 * @file /api/articles/images/[id]
 *
 * Image management API for articles.
 *
 * GET  /api/articles/images/[id] — List images in the article's images/ directory
 * POST /api/articles/images/[id] — Upload an image file
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
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const article = await prisma.article.findUnique({
      where: { id },
      select: { contentPath: true },
    });

    if (!article) {
      return NextResponse.json({ error: "Article not found." }, { status: 404 });
    }

    const articleDir = path.dirname(path.join(process.cwd(), article.contentPath));
    const imagesDir = path.join(articleDir, "images");

    let files: string[] = [];
    try {
      files = await readdir(imagesDir);
    } catch {
      // images/ directory does not exist yet
      return NextResponse.json({ images: [] });
    }

    // Filter to image files and get metadata
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
          return { filename, size };
        }),
    );

    // Sort by filename
    images.sort((a, b) => a.filename.localeCompare(b.filename));

    return NextResponse.json({ images });
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
