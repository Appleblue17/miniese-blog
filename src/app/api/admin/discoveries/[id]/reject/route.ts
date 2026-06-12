/**
 * @file POST /api/admin/discoveries/[id]/reject
 *
 * Rejects a single discovery record (marks it as "rejected").
 */

import { NextRequest, NextResponse } from "next/server";
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

    if (record.status !== "pending") {
      return NextResponse.json(
        { error: `Discovery record is already ${record.status}.` },
        { status: 409 },
      );
    }

    const updated = await prisma.wikiDiscovery.update({
      where: { id },
      data: {
        status: "rejected",
      },
    });

    return NextResponse.json({
      success: true,
      discovery: {
        id: updated.id,
        term: updated.term,
        status: updated.status,
      },
    });
  } catch (error) {
    console.error("Admin discovery reject error:", error);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
