/**
 * @file /api/admin/media — Media library API route.
 *
 * GET  /api/admin/media?dir=/images — List files in a directory under public/
 * POST /api/admin/media — Upload a file to public/images/
 * DELETE /api/admin/media?path=/images/foo.png — Delete a file
 */

import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { existsSync } from "fs";

const PUBLIC_DIR = path.join(process.cwd(), "public");

/** Allowed image extensions */
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp", ".ico"]);

/** Check if a filename has an allowed image extension */
function isImageFile(name: string): boolean {
  const ext = path.extname(name).toLowerCase();
  return IMAGE_EXTENSIONS.has(ext);
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const dirParam = searchParams.get("dir") || "/images";

    // Security: prevent directory traversal
    const safeDir = path.normalize(dirParam).replace(/^(\.\.(\/|\\|$))+/, "");
    const fullDir = path.join(PUBLIC_DIR, safeDir);

    // Ensure the directory exists and is within public/
    if (!fullDir.startsWith(PUBLIC_DIR)) {
      return NextResponse.json({ error: "Invalid directory" }, { status: 400 });
    }

    let entries: string[] = [];
    try {
      entries = await fs.readdir(fullDir);
    } catch {
      return NextResponse.json({ files: [], directories: [] });
    }

    const files: { name: string; path: string; size: number; isImage: boolean }[] = [];
    const directories: string[] = [];

    for (const entry of entries) {
      const fullPath = path.join(fullDir, entry);
      try {
        const stat = await fs.stat(fullPath);
        const relativePath = `/${path.relative(PUBLIC_DIR, fullPath)}`;

        if (stat.isDirectory()) {
          directories.push(relativePath);
        } else if (stat.isFile()) {
          files.push({
            name: entry,
            path: relativePath,
            size: stat.size,
            isImage: isImageFile(entry),
          });
        }
      } catch {
        // Skip inaccessible entries
      }
    }

    // Sort: directories first, then files alphabetically
    directories.sort();
    files.sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({ files, directories, currentDir: `/${safeDir}` });
  } catch (err) {
    console.error("[Media API] GET error:", err);
    return NextResponse.json({ error: "Failed to list files" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const dir = (formData.get("dir") as string) || "/images";

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Security: prevent directory traversal
    const safeDir = path.normalize(dir).replace(/^(\.\.(\/|\\|$))+/, "");
    const fullDir = path.join(PUBLIC_DIR, safeDir);

    if (!fullDir.startsWith(PUBLIC_DIR)) {
      return NextResponse.json({ error: "Invalid directory" }, { status: 400 });
    }

    // Ensure target directory exists
    await fs.mkdir(fullDir, { recursive: true });

    // Sanitize filename
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const fullPath = path.join(fullDir, safeName);

    // Write file
    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(fullPath, buffer);

    const relativePath = `/${path.relative(PUBLIC_DIR, fullPath)}`;

    return NextResponse.json({
      success: true,
      file: {
        name: safeName,
        path: relativePath,
        size: buffer.length,
        isImage: isImageFile(safeName),
      },
    });
  } catch (err) {
    console.error("[Media API] POST error:", err);
    return NextResponse.json({ error: "Failed to upload file" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const filePath = searchParams.get("path");

    if (!filePath) {
      return NextResponse.json({ error: "No file path provided" }, { status: 400 });
    }

    // Security: prevent directory traversal
    const safePath = path.normalize(filePath).replace(/^(\.\.(\/|\\|$))+/, "");
    const fullPath = path.join(PUBLIC_DIR, safePath);

    if (!fullPath.startsWith(PUBLIC_DIR)) {
      return NextResponse.json({ error: "Invalid path" }, { status: 400 });
    }

    // Prevent deleting directories via DELETE
    const stat = await fs.stat(fullPath);
    if (stat.isDirectory()) {
      return NextResponse.json({ error: "Cannot delete directories via this endpoint" }, { status: 400 });
    }

    await fs.unlink(fullPath);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[Media API] DELETE error:", err);
    return NextResponse.json({ error: "Failed to delete file" }, { status: 500 });
  }
}
