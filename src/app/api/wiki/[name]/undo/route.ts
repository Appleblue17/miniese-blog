/**
 * @file POST /api/wiki/[name]/undo
 *
 * Undoes a wiki entry based on its current status:
 *
 * - "creating": deletes the WikiEntry record and file, moves linked discovery back to "pending"
 * - "unreviewed": deletes the WikiEntry record and file, moves linked discovery back to "pending"
 * - "reviewed": moves the entry back to "unreviewed" (撤销审查)
 *
 * Query params: lang (required), mode (optional, "unreview" to only move reviewed → unreviewed)
 * Response: { success: true }
 */

import { NextRequest, NextResponse } from "next/server";
import { readFile, writeFile, unlink } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/db";
import { parseWikiFileWithMeta, buildWikiFileWithMeta, slugifyName } from "@/lib/wiki/parser";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ name: string }> },
) {
  try {
    const { name } = await params;
    const { searchParams } = new URL(_request.url);
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

    // --- Handle "reviewed" → "unreviewed" (撤销审查) ---
    if (entry.status === "reviewed") {
      // Update file frontmatter
      const filePath = path.join(process.cwd(), entry.contentPath);
      const fileContent = await readFile(filePath, "utf-8").catch(() => null);
      if (fileContent !== null) {
        const parsed = parseWikiFileWithMeta(fileContent);
        const updatedFile = buildWikiFileWithMeta(
          { ...parsed.frontmatter, status: "unreviewed" },
          parsed.blocks,
        );
        await writeFile(filePath, updatedFile, "utf-8");
      }

      // Update DB record
      await prisma.wikiEntry.update({
        where: { id: entry.id },
        data: { status: "unreviewed" },
      });

      return NextResponse.json({ success: true });
    }

    // --- Handle "creating" or "unreviewed" → delete + move discovery back to pending ---
    if (entry.status !== "creating" && entry.status !== "unreviewed") {
      return NextResponse.json(
        {
          error: `Cannot undo entry with status "${entry.status}". Only "creating" or "unreviewed" entries can be undone via deletion.`,
        },
        { status: 409 },
      );
    }

    // Find linked discovery
    const discovery = await prisma.wikiDiscovery.findFirst({
      where: { wikiEntryId: entry.id },
    });

    // Delete file on disk
    const filePath = path.join(process.cwd(), entry.contentPath);
    await unlink(filePath).catch(() => {});

    // Delete WikiEntry record
    await prisma.wikiEntry.delete({ where: { id: entry.id } });

    // Move discovery back to pending
    if (discovery) {
      await prisma.wikiDiscovery.update({
        where: { id: discovery.id },
        data: {
          status: "pending",
          approvedAt: null,
          wikiEntryId: null,
        },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Undo wiki entry error:", error);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
