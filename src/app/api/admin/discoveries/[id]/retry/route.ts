/**
 * @file POST /api/admin/discoveries/[id]/retry
 *
 * Retries generation for a failed discovery record.
 * Re-enqueues a generate job and resets status from "failed" to "approved".
 *
 * Response: { success: true, generateTaskId: string | null }
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { addJob } from "@/lib/queue/producer";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const record = await prisma.wikiDiscovery.findUnique({
      where: { id },
    });

    if (!record) {
      return NextResponse.json(
        { error: "Discovery record not found." },
        { status: 404 },
      );
    }

    if (record.status !== "failed") {
      return NextResponse.json(
        { error: `Discovery record is ${record.status}, not "failed".` },
        { status: 409 },
      );
    }

    // Reset to approved and clear failed reason
    await prisma.wikiDiscovery.update({
      where: { id },
      data: { status: "approved", failedReason: null },
    });

    // If there's a linked WikiEntry, reset it to "creating"
    if (record.wikiEntryId) {
      await prisma.wikiEntry.update({
        where: { id: record.wikiEntryId },
        data: { status: "creating" },
      });
    }

    // Enqueue generate job
    let taskId: string | null = null;
    try {
      taskId = await addJob("generate", { discoveryId: id });
    } catch (err) {
      console.error(
        `[Retry] Failed to enqueue generate job for discovery ${id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    return NextResponse.json({ success: true, generateTaskId: taskId });
  } catch (error) {
    console.error("Admin discovery retry error:", error);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 },
    );
  }
}
