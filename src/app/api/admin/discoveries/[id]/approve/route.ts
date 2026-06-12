/**
 * @file POST /api/admin/discoveries/[id]/approve
 *
 * Approves a single discovery record and auto-creates a WikiEntry(creating).
 *
 * Flow:
 * 1. Update discovery status to "approved"
 * 2. Create a WikiEntry with status "creating"
 * 3. Create the .md file on disk with frontmatter
 */

import { NextRequest, NextResponse } from "next/server";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/db";
import { buildWikiFileWithMeta, slugifyName } from "@/lib/wiki/parser";
import type { WikiBlocks } from "@/lib/wiki/parser";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    // --- Find the discovery record ---

    const record = await prisma.wikiDiscovery.findUnique({
      where: { id },
    });

    if (!record) {
      return NextResponse.json(
        { error: "Discovery record not found." },
        { status: 404 },
      );
    }

    if (record.status !== "pending") {
      return NextResponse.json(
        { error: `Discovery record is already ${record.status}.` },
        { status: 409 },
      );
    }

    // --- Check that WikiEntry doesn't already exist ---

    const existingEntry = await prisma.wikiEntry.findUnique({
      where: {
        name_language: { name: record.term, language: record.articleLang },
      },
    });

    if (existingEntry) {
      return NextResponse.json(
        { error: `Wiki entry "${record.term}" (${record.articleLang}) already exists.` },
        { status: 409 },
      );
    }

    // --- Create the .md file on disk ---

    const slug = slugifyName(record.term);
    if (!slug) {
      return NextResponse.json(
        { error: "Could not generate a valid slug from the term." },
        { status: 400 },
      );
    }

    const blocks: WikiBlocks = {
      definition: record.definition || "",
      human: "",
      ai: "",
      ref: "",
    };

    const fileContent = buildWikiFileWithMeta(
      {
        name: record.term,
        language: record.articleLang,
        aliases: [],
        tags: [],
        status: "creating",
        accessGroup: [],
      },
      blocks,
    );

    const targetDir = path.join(
      process.cwd(),
      "content",
      "wiki",
      record.articleLang,
    );
    await mkdir(targetDir, { recursive: true });
    const fileName = `${slug}.md`;
    const contentPath = `content/wiki/${record.articleLang}/${fileName}`;
    const filePath = path.join(process.cwd(), contentPath);
    await writeFile(filePath, fileContent, "utf-8");

    // --- Update discovery status ---

    const updated = await prisma.wikiDiscovery.update({
      where: { id },
      data: {
        status: "approved",
        approvedAt: new Date(),
      },
    });

    // --- Create WikiEntry with status "creating" ---

    const entry = await prisma.wikiEntry.create({
      data: {
        name: record.term,
        aliases: [],
        language: record.articleLang,
        definition: record.definition || "",
        contentPath,
        tags: [],
        accessGroup: [],
        status: "creating",
      },
    });

    return NextResponse.json({
      success: true,
      discovery: {
        id: updated.id,
        term: updated.term,
        status: updated.status,
        approvedAt: updated.approvedAt?.toISOString() ?? null,
      },
      wikiEntry: {
        id: entry.id,
        name: entry.name,
        language: entry.language,
        status: entry.status,
      },
    });
  } catch (error) {
    console.error("Admin discovery approve error:", error);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 },
    );
  }
}
