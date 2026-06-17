/**
 * @file /api/admin/media — Media library API route.
 *
 * GET    /api/admin/media?dir=/images — List files in a directory under public/
 * POST   /api/admin/media — Upload a file to public/images/
 * PUT    /api/admin/media — Create a new folder (body: { dir: "/images/subdir" })
 * PATCH  /api/admin/media — Rename a file or folder (body: { path: "/images/old", newName: "new-name" })
 * DELETE /api/admin/media?path=/images/foo.png — Delete a file or folder
 */

import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { existsSync } from "fs";
import sharp from "sharp";

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

    const files: { name: string; path: string; size: number; isImage: boolean; width?: number; height?: number }[] = [];
    const directories: string[] = [];

    for (const entry of entries) {
      const fullPath = path.join(fullDir, entry);
      try {
        const stat = await fs.stat(fullPath);
        const relativePath = `/${path.relative(PUBLIC_DIR, fullPath)}`;

        if (stat.isDirectory()) {
          directories.push(relativePath);
        } else if (stat.isFile()) {
          const fileInfo: { name: string; path: string; size: number; isImage: boolean; width?: number; height?: number } = {
            name: entry,
            path: relativePath,
            size: stat.size,
            isImage: isImageFile(entry),
          };
          // Get image dimensions for image files
          if (fileInfo.isImage) {
            try {
              const metadata = await sharp(fullPath).metadata();
              fileInfo.width = metadata.width ?? undefined;
              fileInfo.height = metadata.height ?? undefined;
            } catch {
              // Ignore metadata errors
            }
          }
          files.push(fileInfo);
        }
      } catch {
        // Skip inaccessible entries
      }
    }

    // Sort: directories first, then files alphabetically
    directories.sort();
    files.sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({ files, directories, currentDir: safeDir });
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

    const stat = await fs.stat(fullPath);
    if (stat.isDirectory()) {
      await fs.rm(fullPath, { recursive: true, force: true });
    } else {
      await fs.unlink(fullPath);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[Media API] DELETE error:", err);
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const dir = body.dir as string;

    if (!dir) {
      return NextResponse.json({ error: "No directory path provided" }, { status: 400 });
    }

    // Security: prevent directory traversal
    const safeDir = path.normalize(dir).replace(/^(\.\.(\/|\\|$))+/, "");
    const fullDir = path.join(PUBLIC_DIR, safeDir);

    if (!fullDir.startsWith(PUBLIC_DIR)) {
      return NextResponse.json({ error: "Invalid directory" }, { status: 400 });
    }

    // Check if already exists
    if (existsSync(fullDir)) {
      return NextResponse.json({ error: "文件夹已存在", code: "EXISTS" }, { status: 409 });
    }

    await fs.mkdir(fullDir, { recursive: true });

    const relativePath = `/${path.relative(PUBLIC_DIR, fullDir)}`;
    return NextResponse.json({ success: true, path: relativePath });
  } catch (err) {
    console.error("[Media API] PUT error:", err);
    return NextResponse.json({ error: "Failed to create folder" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const targetPath = body.path as string;
    const newName = body.newName as string;

    if (!targetPath || !newName) {
      return NextResponse.json({ error: "Missing path or newName" }, { status: 400 });
    }

    // Validate new name
    if (!/^[a-zA-Z0-9._\-\u4e00-\u9fff]+$/.test(newName)) {
      return NextResponse.json({ error: "名称包含非法字符" }, { status: 400 });
    }

    // Security: prevent directory traversal
    const safePath = path.normalize(targetPath).replace(/^(\.\.(\/|\\|$))+/, "");
    const fullPath = path.join(PUBLIC_DIR, safePath);

    if (!fullPath.startsWith(PUBLIC_DIR)) {
      return NextResponse.json({ error: "Invalid path" }, { status: 400 });
    }

    const parentDir = path.dirname(fullPath);
    const newFullPath = path.join(parentDir, newName);

    // Check if target already exists
    if (existsSync(newFullPath)) {
      return NextResponse.json({ error: "目标名称已存在", code: "EXISTS" }, { status: 409 });
    }

    await fs.rename(fullPath, newFullPath);

    const relativePath = `/${path.relative(PUBLIC_DIR, newFullPath)}`;
    return NextResponse.json({ success: true, path: relativePath });
  } catch (err) {
    console.error("[Media API] PATCH error:", err);
    return NextResponse.json({ error: "Failed to rename" }, { status: 500 });
  }
}
