/**
 * @file GET /api/wiki/content
 *
 * Returns the raw Markdown content of a wiki entry by name and lang.
 *
 * Query params:
 *   name  - Wiki entry name (required)
 *   lang  - Language code "zh" or "en" (required)
 *   download - Set to "1" to download as attachment (optional)
 *
 * Response (normal): { content: string, fileName: string }
 * Response (download): raw file with Content-Disposition: attachment
 */

import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/db";
import { slugifyName } from "@/lib/wiki/parser";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const name = searchParams.get("name");
    const language = searchParams.get("lang");
    const isDownload = searchParams.get("download") === "1";

    if (!name || (language !== "zh" && language !== "en")) {
      return NextResponse.json(
        { error: "name and lang (zh|en) query parameters are required." },
        { status: 400 },
      );
    }

    const slug = slugifyName(name);
    const entry = await prisma.wikiEntry.findFirst({
      where: {
        OR: [
          { name, language },
          { name: slug, language },
        ],
        status: { not: "deleted" },
      },
      select: { contentPath: true, name: true },
    });

    if (!entry) {
      return NextResponse.json({ error: "Wiki entry not found." }, { status: 404 });
    }

    const filePath = path.join(process.cwd(), entry.contentPath);
    let content: string;
    try {
      content = await readFile(filePath, "utf-8");
    } catch {
      content = "";
    }

    const fileName = `${entry.name.replace(/[\/\\?%*:|"<>]/g, "_").trim() || "wiki"}.md`;

    if (isDownload) {
      const asciiName = fileName.replace(/[^\x20-\x7E]/g, "_");
      return new NextResponse(content, {
        status: 200,
        headers: {
          "Content-Type": "text/markdown; charset=utf-8",
          "Content-Disposition": `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        },
      });
    }

    return NextResponse.json({ content, fileName });
  } catch (error) {
    console.error("Get wiki content error:", error);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
