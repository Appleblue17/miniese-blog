/**
 * @file GET/POST /api/wiki
 *
 * GET  — Returns a paginated list of wiki entries.
 *        Query params: lang (required), page, limit, tag, status (admin only; defaults to "unreviewed,reviewed")
 * POST — Creates a new wiki entry (simple: only name + language).
 *        Body: { name, language }
 *        Status is set to "proposed".
 */

import { NextRequest, NextResponse } from "next/server";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/db";
import { buildWikiFileWithMeta, slugifyName } from "@/lib/wiki/parser";
import type { WikiBlocks } from "@/lib/wiki/parser";
import type { WikiEntryMeta, WikiEntryCreateInput, WikiStatus } from "@/types/wiki";

// --- Helpers ---

const WIKI_DIR = (lang: string) => path.join(process.cwd(), "content", "wiki", lang);

const VALID_STATUSES: WikiStatus[] = ["proposed", "creating", "unreviewed", "reviewed"];

/**
 * Serializes a Prisma WikiEntry to a WikiEntryMeta response object.
 */
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

// --- GET /api/wiki ---

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get("limit") || "20", 10)),
    );
    const tag = searchParams.get("tag");
    const language = searchParams.get("lang");
    const statusParam = searchParams.get("status");

    if (language !== "zh" && language !== "en") {
      return NextResponse.json(
        { error: "lang query parameter is required. Must be 'zh' or 'en'." },
        { status: 400 },
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = { language };

    if (tag) {
      where.tags = { has: tag };
    }

    // Default: show unreviewed + reviewed entries to public
    if (statusParam) {
      if (!VALID_STATUSES.includes(statusParam as WikiStatus)) {
        return NextResponse.json(
          { error: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}` },
          { status: 400 },
        );
      }
      where.status = statusParam;
    } else {
      where.status = { in: ["unreviewed", "reviewed"] };
    }

    const [entries, total] = await Promise.all([
      prisma.wikiEntry.findMany({
        where,
        orderBy: { name: "asc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.wikiEntry.count({ where }),
    ]);

    return NextResponse.json({
      entries: entries.map(serializeEntry),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error("List wiki entries error:", error);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 },
    );
  }
}

// --- POST /api/wiki ---

export async function POST(request: NextRequest) {
  try {
    const body: WikiEntryCreateInput = await request.json();

    // --- Validation ---

    if (!body.name || !body.name.trim()) {
      return NextResponse.json(
        { error: "name is required." },
        { status: 400 },
      );
    }

    if (body.language !== "zh" && body.language !== "en") {
      return NextResponse.json(
        { error: "language must be 'zh' or 'en'." },
        { status: 400 },
      );
    }

    const name = body.name.trim();
    const language = body.language;
    const slug = slugifyName(name);

    if (!slug) {
      return NextResponse.json(
        { error: "Could not generate a valid slug from the name." },
        { status: 400 },
      );
    }

    // --- Check uniqueness ---

    const existing = await prisma.wikiEntry.findUnique({
      where: { name_language: { name, language } },
    });
    if (existing) {
      return NextResponse.json(
        { error: `Wiki entry with name "${name}" and language "${language}" already exists.` },
        { status: 409 },
      );
    }

    // --- Build file with frontmatter (status: proposed) ---

    const blocks: WikiBlocks = {
      definition: "",
      human: "",
      ai: "",
      ref: "",
    };

    const fileContent = buildWikiFileWithMeta(
      {
        name,
        language,
        aliases: [],
        tags: [],
        status: "proposed",
        accessGroup: [],
      },
      blocks,
    );

    // --- Write file ---

    const targetDir = WIKI_DIR(language);
    await mkdir(targetDir, { recursive: true });
    const fileName = `${slug}.md`;
    const contentPath = `content/wiki/${language}/${fileName}`;
    const filePath = path.join(process.cwd(), contentPath);
    await writeFile(filePath, fileContent, "utf-8");

    // --- Create DB record (status: proposed) ---

    const entry = await prisma.wikiEntry.create({
      data: {
        name,
        aliases: [],
        language,
        definition: "",
        contentPath,
        tags: [],
        accessGroup: [],
        status: "proposed",
      },
    });

    return NextResponse.json(
      { entry: serializeEntry(entry) },
      { status: 201 },
    );
  } catch (error) {
    console.error("Create wiki entry error:", error);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 },
    );
  }
}
