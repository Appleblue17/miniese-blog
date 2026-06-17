/**
 * @file GET/PUT/DELETE /api/wiki/[name]
 *
 * GET    — Returns a single wiki entry with all parsed blocks.
 *          Query params: lang (required)
 *          Response: { entry: WikiEntryDetail }
 *
 * PUT    — Updates a wiki entry (full update).
 *          Only entries with status "unreviewed" or "reviewed" can be edited.
 *          Query params: lang (required)
 *          Body: { name?, aliases?, definition?, human?, ai?, ref?, tags?, accessGroup? }
 *          Response: { entry: WikiEntryMeta }
 *
 * DELETE — Deletes a wiki entry (file + DB record).
 *          Query params: lang (required)
 *          Response: { success: true }
 */

import { NextRequest, NextResponse } from "next/server";
import { readFile, writeFile, unlink } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/db";
import { parseWikiFileWithMeta, buildWikiFileWithMeta, slugifyName } from "@/lib/wiki/parser";
import type { WikiBlocks } from "@/lib/wiki/parser";
import type {
  WikiEntryMeta,
  WikiEntryDetail,
  WikiEntryUpdateInput,
  WikiStatus,
} from "@/types/wiki";

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

/**
 * Finds a wiki entry by name or slug, excluding soft-deleted entries.
 */
async function findEntry(name: string, language: "zh" | "en") {
  const slug = slugifyName(name);
  return prisma.wikiEntry.findFirst({
    where: {
      OR: [
        { name, language },
        { name: slug, language },
      ],
      status: { not: "deleted" },
    },
  });
}

/**
 * Reads the wiki file and parses its blocks + frontmatter.
 */
async function readWikiContent(contentPath: string) {
  try {
    const filePath = path.join(process.cwd(), contentPath);
    const content = await readFile(filePath, "utf-8");
    return parseWikiFileWithMeta(content);
  } catch {
    return null;
  }
}

// --- GET /api/wiki/[name] ---

export async function GET(request: NextRequest, { params }: { params: Promise<{ name: string }> }) {
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

    const slug = slugifyName(name);
    if (!slug) {
      return NextResponse.json({ error: "Invalid wiki entry name." }, { status: 400 });
    }

    const entry = await findEntry(name, language);

    if (!entry) {
      return NextResponse.json(
        { error: `Wiki entry not found: "${name}" in language "${language}".` },
        { status: 404 },
      );
    }

    const parsed = await readWikiContent(entry.contentPath);
    const blocks = parsed?.blocks || { definition: "", human: "", ai: "", ref: "" };

    const detail: WikiEntryDetail = {
      ...serializeEntry(entry),
      blocks,
    };

    return NextResponse.json({ entry: detail });
  } catch (error) {
    console.error("Get wiki entry error:", error);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}

// --- PUT /api/wiki/[name] ---

export async function PUT(request: NextRequest, { params }: { params: Promise<{ name: string }> }) {
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

    const body: WikiEntryUpdateInput = await request.json();

    // Find existing entry
    const entry = await findEntry(name, language);

    if (!entry) {
      return NextResponse.json(
        { error: `Wiki entry not found: "${name}" in language "${language}".` },
        { status: 404 },
      );
    }

    // Only unreviewed/reviewed entries can be edited
    if (entry.status !== "unreviewed" && entry.status !== "reviewed") {
      return NextResponse.json(
        {
          error: `Cannot edit entry with status "${entry.status}". Only "unreviewed" or "reviewed" entries can be edited.`,
        },
        { status: 403 },
      );
    }

    // Determine new name (may be updated)
    const newName = body.name?.trim() || entry.name;
    const newSlug = slugifyName(newName);

    // Check uniqueness if name changed
    if (newName !== entry.name) {
      const existing = await prisma.wikiEntry.findUnique({
        where: { name_language: { name: newName, language } },
      });
      if (existing && existing.id !== entry.id) {
        return NextResponse.json(
          { error: `Wiki entry with name "${newName}" and language "${language}" already exists.` },
          { status: 409 },
        );
      }
    }

    // Read existing file to get current blocks
    const parsed = await readWikiContent(entry.contentPath);
    const existingBlocks = parsed?.blocks || {
      definition: "",
      human: "",
      ai: "",
      ref: "",
    };

    // Merge blocks (only update provided fields)
    const blocks: WikiBlocks = {
      definition: body.definition?.trim() ?? existingBlocks.definition,
      human: body.human?.trim() ?? existingBlocks.human,
      ai: body.ai?.trim() ?? existingBlocks.ai,
      ref: body.ref?.trim() ?? existingBlocks.ref,
    };

    // Build new file with frontmatter
    const newAliases = body.aliases ?? entry.aliases;
    const newTags = body.tags ?? entry.tags;
    const newAccessGroup = body.accessGroup ?? entry.accessGroup;
    const newType = body.type ?? entry.type;

    const fileContent = buildWikiFileWithMeta(
      {
        name: newName,
        language: language as "zh" | "en",
        aliases: newAliases,
        tags: newTags,
        type: newType,
        status: entry.status as WikiStatus,
        accessGroup: newAccessGroup,
      },
      blocks,
    );

    // Write file
    const targetDir = path.join(process.cwd(), "content", "wiki", language);
    const fileName = `${newSlug}.md`;
    const newContentPath = `content/wiki/${language}/${fileName}`;
    const filePath = path.join(targetDir, fileName);

    await writeFile(filePath, fileContent, "utf-8");

    // If the slug changed, clean up old file
    if (newSlug !== slugifyName(name) && entry.contentPath !== newContentPath) {
      const oldFilePath = path.join(process.cwd(), entry.contentPath);
      await unlink(oldFilePath).catch(() => {});
    }

    // Update DB record
    const updated = await prisma.wikiEntry.update({
      where: { id: entry.id },
      data: {
        name: newName,
        aliases: newAliases,
        type: newType,
        definition: blocks.definition,
        contentPath: newContentPath,
        tags: newTags,
        accessGroup: newAccessGroup,
      },
    });

    return NextResponse.json({
      entry: serializeEntry(updated),
    });
  } catch (error) {
    console.error("Update wiki entry error:", error);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}

// --- DELETE /api/wiki/[name] ---

export async function DELETE(
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

    const entry = await findEntry(name, language);

    if (!entry) {
      return NextResponse.json(
        { error: `Wiki entry not found: "${name}" in language "${language}".` },
        { status: 404 },
      );
    }

    // Soft-delete: set status to "deleted" instead of physically removing
    const updated = await prisma.wikiEntry.update({
      where: { id: entry.id },
      data: { status: "deleted" },
    });

    // Also mark linked discovery as "rejected" if it exists
    const discovery = await prisma.wikiDiscovery.findFirst({
      where: { wikiEntryId: entry.id },
    });
    if (discovery && discovery.status !== "rejected") {
      await prisma.wikiDiscovery.update({
        where: { id: discovery.id },
        data: { status: "rejected" },
      });
    }

    return NextResponse.json({ success: true, entry: serializeEntry(updated) });
  } catch (error) {
    console.error("Delete wiki entry error:", error);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
