/**
 * @file POST /api/wiki/[name]/retry
 *
 * Re-generates AI content for a wiki entry that is in "creating" or "unreviewed" status.
 * Re-enqueues a generate job and resets content to placeholder.
 *
 * Query params: lang (required)
 * Response: { success: true, generateTaskId: string | null }
 */

import { NextRequest, NextResponse } from "next/server";
import { readFile, writeFile } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/db";
import { parseWikiFileWithMeta, buildWikiFileWithMeta, slugifyName } from "@/lib/wiki/parser";
import { addJob } from "@/lib/queue/producer";

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

    // Find linked discovery
    const discovery = await prisma.wikiDiscovery.findFirst({
      where: { wikiEntryId: entry.id },
    });

    if (!discovery) {
      return NextResponse.json(
        { error: "No linked discovery record found for this entry." },
        { status: 404 },
      );
    }

    // Reset discovery to "approved" so it can be generated again
    await prisma.wikiDiscovery.update({
      where: { id: discovery.id },
      data: { status: "approved", failedReason: null },
    });

    // Reset WikiEntry status to "creating" and clear AI content
    await prisma.wikiEntry.update({
      where: { id: entry.id },
      data: { status: "creating" },
    });

    // Clear AI block in file
    const filePath = path.join(process.cwd(), entry.contentPath);
    let fileContent: string | undefined;
    try {
      fileContent = await readFile(filePath, "utf-8");
    } catch {
      // File might not exist, proceed with DB update only
    }

    if (fileContent) {
      const parsed = parseWikiFileWithMeta(fileContent);
      const updatedFile = buildWikiFileWithMeta(
        { ...parsed.frontmatter, status: "creating" },
        { ...parsed.blocks, ai: "" },
      );
      await writeFile(filePath, updatedFile, "utf-8");
    }

    // Enqueue generate job
    let taskId: string | null = null;
    try {
      taskId = await addJob("generate", { discoveryId: discovery.id });
    } catch (err) {
      console.error(
        `[Retry] Failed to enqueue generate job for discovery ${discovery.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    return NextResponse.json({ success: true, generateTaskId: taskId });
  } catch (error) {
    console.error("Retry wiki entry error:", error);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
