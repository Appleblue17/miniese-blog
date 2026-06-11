/**
 * @file POST /api/wiki/[name]/approve
 *
 * Approves a proposed wiki entry, moving it from "proposed" to "creating" status.
 *
 * In Phase 3, this is a simple state transition. AI filling (creating → unreviewed)
 * will be implemented in a later phase.
 *
 * Query params: lang (required)
 * Body: none
 * Response: { entry: WikiEntryMeta }
 */

import { NextRequest, NextResponse } from "next/server";
import { readFile, writeFile } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/db";
import { parseWikiFileWithMeta, buildWikiFileWithMeta, slugifyName } from "@/lib/wiki/parser";
import type { WikiEntryMeta, WikiStatus } from "@/types/wiki";

// --- Helpers ---

function serializeEntry(entry: {
  id: string;
  name: string;
  aliases: string[];
  language: string;
  definition: string;
  contentPath: string;
  tags: string[];
  accessGroup: string[];
  status: string;
  createdAt: Date;
  updatedAt: Date;
}): WikiEntryMeta {
  return {
    id: entry.id,
    name: entry.name,
    aliases: entry.aliases,
    language: entry.language as "zh" | "en",
    definition: entry.definition,
    contentPath: entry.contentPath,
    tags: entry.tags,
    accessGroup: entry.accessGroup,
    status: entry.status as WikiStatus,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  };
}

// --- POST /api/wiki/[name]/approve ---

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> },
) {
  try {
    const { name } = await params;
    const { searchParams } = new URL(request.url);
    const language = searchParams.get("lang");

    if (language !== "zh" && language !== "en") {
      return NextResponse.json(
        { error: "lang query parameter is required. Must be 'zh' or 'en'." },
        { status: 400 },
      );
    }

    // Find entry
    const slug = slugifyName(name);
    const entry = await prisma.wikiEntry.findFirst({
      where: {
        OR: [
          { name, language },
          { name: slug, language },
        ],
      },
    });

    if (!entry) {
      return NextResponse.json(
        { error: `Wiki entry not found: "${name}" in language "${language}".` },
        { status: 404 },
      );
    }

    // Only proposed entries can be approved
    if (entry.status !== "proposed") {
      return NextResponse.json(
        { error: `Cannot approve entry with status "${entry.status}". Only "proposed" entries can be approved.` },
        { status: 409 },
      );
    }

    // Read existing file and update frontmatter status
    const filePath = path.join(process.cwd(), entry.contentPath);
    let fileContent: string;
    try {
      fileContent = await readFile(filePath, "utf-8");
    } catch {
      return NextResponse.json(
        { error: "Entry file not found on disk." },
        { status: 500 },
      );
    }

    const parsed = parseWikiFileWithMeta(fileContent);
    const updatedFile = buildWikiFileWithMeta(
      {
        ...parsed.frontmatter,
        status: "creating",
      },
      parsed.blocks,
    );

    await writeFile(filePath, updatedFile, "utf-8");

    // Update DB record
    const updated = await prisma.wikiEntry.update({
      where: { id: entry.id },
      data: { status: "creating" },
    });

    return NextResponse.json({
      entry: serializeEntry(updated),
    });
  } catch (error) {
    console.error("Approve wiki entry error:", error);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 },
    );
  }
}
