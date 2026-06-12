/**
 * @file POST /api/wiki/[name]/undo
 *
 * Undoes a "creating" wiki entry: deletes the WikiEntry record and file,
 * and moves the linked discovery back to "pending" status.
 *
 * Query params: lang (required)
 * Response: { success: true }
 */

import { NextRequest, NextResponse } from "next/server";
import { unlink } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/db";
import { slugifyName } from "@/lib/wiki/parser";

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

    // Only "creating" entries can be undone
    if (entry.status !== "creating") {
      return NextResponse.json(
        { error: `Cannot undo entry with status "${entry.status}". Only "creating" entries can be undone.` },
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
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 },
    );
  }
}
