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
import type { Metadata } from "next";
import { WikiReader } from "@/components/wiki/WikiReader";
import type { WikiStatus } from "@/types/wiki";

interface Props {
  params: Promise<{ lang: string; name: string }>;
}

interface WikiApiResponse {
  entry: {
    id: string;
    name: string;
    aliases: string[];
    language: string;
    definition: string;
    tags: string[];
    accessGroup: string[];
    status: WikiStatus;
    createdAt: string;
    updatedAt: string;
    blocks: {
      definition: string;
      human: string;
      ai: string;
      ref: string;
    };
  };
}

async function fetchEntry(
  lang: string,
  name: string,
): Promise<WikiApiResponse | null> {
  try {
    const baseUrl = process.env.SITE_URL || "http://localhost:3000";
    const url = `${baseUrl}/api/wiki/${encodeURIComponent(name)}?lang=${lang}`;
    const res = await fetch(url, { cache: "no-store" });

    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang, name } = await params;

  const data = await fetchEntry(lang, name);
  if (!data) return { title: "Not Found" };

  return {
    title: `${data.entry.name} | Miniese's Blog`,
    description: data.entry.definition || undefined,
  };
}

export default async function WikiEntryPage({ params }: Props) {
  const { lang, name } = await params;

  // Validate language
  if (lang !== "zh" && lang !== "en") {
    notFound();
  }

  const data = await fetchEntry(lang, name);
  if (!data) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <WikiReader entry={data.entry} lang={lang} />
    </div>
  );
}
