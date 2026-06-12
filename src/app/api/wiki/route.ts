/**
 * @file GET/POST /api/wiki
 *
 * GET  — Returns a paginated list of wiki entries.
 *        Query params: lang (required), page, limit, tag, status (admin only; defaults to "unreviewed,reviewed")
 * POST — Creates a new WikiDiscovery (manual entry).
 *        Body: { name, language, overrideDefinition?: string }
 *        If overrideDefinition is provided, skips AI refinement and uses it directly.
 *        Otherwise, calls AI to refine type/definition/importance synchronously.
 *        Creates a WikiDiscovery record with status "pending".
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { refineTerm } from "@/lib/ai/refineTerm";
import type { WikiEntryMeta, WikiStatus } from "@/types/wiki";

// --- Helpers ---

const VALID_STATUSES: WikiStatus[] = ["creating", "unreviewed", "reviewed"];

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

/**
 * Response shape for a created WikiDiscovery.
 */
interface CreateDiscoveryResponse {
  discovery: {
    id: string;
    term: string;
    type: string;
    definition: string;
    importance: number;
    status: string;
    createdAt: string;
  };
  refined: boolean;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, language, overrideDefinition } = body as {
      name?: string;
      language?: string;
      overrideDefinition?: string;
    };

    // --- Validation ---

    if (!name || !name.trim()) {
      return NextResponse.json(
        { error: "name is required." },
        { status: 400 },
      );
    }

    if (language !== "zh" && language !== "en") {
      return NextResponse.json(
        { error: "language must be 'zh' or 'en'." },
        { status: 400 },
      );
    }

    const termName = name.trim();
    const lang = language as "zh" | "en";

    // --- Check uniqueness (against existing WikiEntry) ---

    const existingEntry = await prisma.wikiEntry.findUnique({
      where: { name_language: { name: termName, language: lang } },
    });
    if (existingEntry) {
      return NextResponse.json(
        { error: `Wiki entry with name "${termName}" and language "${lang}" already exists.` },
        { status: 409 },
      );
    }

    // --- Check uniqueness (against pending WikiDiscovery) ---

    const existingDiscovery = await prisma.wikiDiscovery.findFirst({
      where: {
        term: termName,
        articleLang: lang,
        status: "pending",
      },
    });
    if (existingDiscovery) {
      return NextResponse.json(
        { error: `A pending discovery for "${termName}" (${lang}) already exists.` },
        { status: 409 },
      );
    }

    // --- Determine type/definition/importance ---
    // If overrideDefinition is provided (from preview step), skip AI and use defaults.
    // Otherwise, call AI to refine the term.

    let type = "concept";
    let definition = "";
    let importance = 0.5;
    let refined = false;

    if (overrideDefinition !== undefined) {
      // Preview step already called AI — just use the user-confirmed values
      // We store the user's edited definition as-is
      definition = overrideDefinition.trim();
      importance = 0.5; // Preview step shows importance visually, not critical to preserve
      type = "concept";
      refined = true;
    } else {
      try {
        const refinedResult = await refineTerm(termName, lang);
        type = refinedResult.type;
        definition = refinedResult.definition;
        importance = refinedResult.importance;
        refined = true;
      } catch (err) {
        console.warn(
          `[POST /api/wiki] AI refinement failed for "${termName}": ${err instanceof Error ? err.message : String(err)}`,
        );
        // Continue with defaults
      }
    }

    // --- Create WikiDiscovery record ---

    const discovery = await prisma.wikiDiscovery.create({
      data: {
        articleId: null,        // No associated article for manual entries
        articleSlug: "",        // No associated article
        articleLang: lang,
        term: termName,
        type,
        definition,
        importance,
        status: "pending",
      },
    });

    const response: CreateDiscoveryResponse = {
      discovery: {
        id: discovery.id,
        term: discovery.term,
        type: discovery.type,
        definition: discovery.definition,
        importance: discovery.importance,
        status: discovery.status,
        createdAt: discovery.createdAt.toISOString(),
      },
      refined,
    };

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    console.error("Create wiki discovery error:", error);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 },
    );
  }
}
