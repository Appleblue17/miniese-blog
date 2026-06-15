/**
 * @file /{lang}/wiki/{name} - Wiki entry reading page.
 *
 * Displays a single wiki entry with all its blocks:
 * - Title area: main name + alias list (as badges)
 * - Definition block
 * - Human notes block
 * - AI content block (placeholder if empty)
 * - Article references (placeholder)
 * - Backlinks (placeholder)
 */

import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { readFile } from "fs/promises";
import path from "path";
import type { Metadata } from "next";
import { WikiReader } from "@/components/wiki/WikiReader";
import { prisma } from "@/lib/db";
import { parseWikiFileWithMeta, slugifyName } from "@/lib/wiki/parser";
import type { WikiStatus, WikiEntryDetail } from "@/types/wiki";

/**
 * URLs may pass route params as percent-encoded strings (e.g. %E6%96%87%E6%A1%A3).
 * This helper decodes them so we can match against the database.
 */
function decodeParam(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

interface Props {
  params: Promise<{ lang: string; name: string }>;
}

async function fetchEntry(lang: string, rawName: string): Promise<WikiEntryDetail | null> {
  const name = decodeParam(rawName);
  const slug = slugifyName(name);

  if (!slug) {
    return null;
  }

  const entries = await prisma.wikiEntry.findMany({
    where: {
      OR: [
        { name, language: lang as "zh" | "en" },
        { name: slug, language: lang as "zh" | "en" },
      ],
    },
    take: 2,
  });

  const entry = entries.find((e) => e.status !== "deleted") || entries[0] || null;

  if (!entry) {
    return null;
  }

  // Read and parse wiki file for blocks
  const filePath = path.join(process.cwd(), entry.contentPath);
  const content = await readFile(filePath, "utf-8");
  const parsed = parseWikiFileWithMeta(content);
  const blocks = parsed?.blocks || { definition: "", human: "", ai: "", ref: "" };

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
    blocks,
  };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang, name: rawName } = await params;
  const name = decodeParam(rawName);

  const entry = await fetchEntry(lang, name);
  if (!entry) return { title: "Not Found" };

  return {
    title: `${entry.name} | Miniese's Blog`,
    description: entry.definition || undefined,
  };
}

export default async function WikiEntryPage({ params }: Props) {
  const resolved = await params;
  const { lang, name: rawName } = resolved;
  const name = decodeParam(rawName);

  // Validate language
  if (lang !== "zh" && lang !== "en") {
    notFound();
  }

  const entry = await fetchEntry(lang, name);
  if (!entry) {
    notFound();
  }

  return (
    <div
      className="mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-12"
      style={{ maxWidth: "var(--body-width, 48rem)" }}
    >
      <div className="flex items-start gap-3">
        <Link
          href={`/${lang}/wiki`}
          className="hidden xl:inline-flex items-center justify-center rounded-lg -ml-12 mt-1 size-9 shrink-0 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          aria-label={lang === "zh" ? "返回知识库" : "Back to wiki"}
        >
          <ArrowLeft className="size-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="lg:ml-0 ml-12 xl:hidden mb-4">
            <Link
              href={`/${lang}/wiki`}
              className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              aria-label={lang === "zh" ? "返回知识库" : "Back to wiki"}
            >
              <ArrowLeft className="size-4" />
              {lang === "zh" ? "返回" : "Back"}
            </Link>
          </div>
          <WikiReader entry={entry} lang={lang} />
        </div>
      </div>
    </div>
  );
}
