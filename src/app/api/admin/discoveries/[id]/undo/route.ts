/**
 * @file POST /api/admin/discoveries/[id]/undo
 *
 * Undoes a discovery: deletes the linked WikiEntry (file + DB) if it exists,
 * and moves the discovery back to "pending" status.
 * Supports "generated" and "failed" discoveries.
 *
 * Response: { success: true }
 */

import { NextRequest, NextResponse } from "next/server";
import { unlink } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/db";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const record = await prisma.wikiDiscovery.findUnique({
      where: { id },
    });

    if (!record) {
      return NextResponse.json({ error: "Discovery record not found." }, { status: 404 });
    }

    if (record.status !== "generated" && record.status !== "failed") {
      return NextResponse.json(
        { error: `Discovery record is ${record.status}, not "generated" or "failed".` },
        { status: 409 },
      );
    }

    // Delete linked WikiEntry if it exists
    if (record.wikiEntryId) {
      const wikiEntry = await prisma.wikiEntry.findUnique({
        where: { id: record.wikiEntryId },
      });
      if (wikiEntry) {
        // Delete file on disk
        const filePath = path.join(process.cwd(), wikiEntry.contentPath);
        await unlink(filePath).catch(() => {});
        // Delete DB record
        await prisma.wikiEntry.delete({ where: { id: wikiEntry.id } });
      }
    }

    // Move discovery back to pending
    await prisma.wikiDiscovery.update({
      where: { id },
      data: {
        status: "pending",
        approvedAt: null,
        wikiEntryId: null,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Admin discovery undo error:", error);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
