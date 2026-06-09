/**
 * @file POST /api/articles/upload
 *
 * Accepts a .md file upload and saves it to the drafts directory.
 * Only accepts files with the .md extension.
 *
 * Request: multipart/form-data with a "file" field
 * Response: { success: true, filePath: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

const DRAFTS_DIR = path.join(process.cwd(), "content", "articles", "drafts");

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "No file provided. Use form-data with a 'file' field." },
        { status: 400 },
      );
    }

    if (!file.name.endsWith(".md")) {
      return NextResponse.json(
        { error: "Only .md files are accepted." },
        { status: 400 },
      );
    }

    if (file.size === 0) {
      return NextResponse.json(
        { error: "File is empty." },
        { status: 400 },
      );
    }

    // Ensure the drafts directory exists
    await mkdir(DRAFTS_DIR, { recursive: true });

    const fileName = file.name;
    const filePath = path.join(DRAFTS_DIR, fileName);

    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(filePath, buffer);

    return NextResponse.json({
      success: true,
      filePath: `content/articles/drafts/${fileName}`,
    });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 },
    );
  }
}
