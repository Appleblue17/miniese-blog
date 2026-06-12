/**
 * @file POST /api/wiki/[name]/approve
 *
 * NOTE: This endpoint is deprecated. WikiDiscovery entries use
 * POST /api/admin/discoveries/[id]/approve instead.
 *
 * This endpoint is kept for backward compatibility but will always
 * return an error, since WikiEntry no longer has "proposed" status.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { slugifyName } from "@/lib/wiki/parser";
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
  type: string;
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
    type: entry.type,
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

    // Only proposed entries can be approved — but "proposed" no longer exists
    return NextResponse.json(
      { error: "This endpoint is deprecated. Use POST /api/admin/discoveries/[id]/approve instead." },
      { status: 410 },
    );
  } catch (error) {
    console.error("Approve wiki entry error:", error);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 },
    );
  }
}
