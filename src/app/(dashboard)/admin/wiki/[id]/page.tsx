/**
 * @file /admin/wiki/[id] - Edit an existing wiki entry.
 */

import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import { WikiEntryForm } from "@/components/admin/WikiEntryForm";
import type { WikiStatus } from "@/types/wiki";

interface Props {
  params: Promise<{ id: string }>;
}

interface WikiApiResponse {
  entry: {
    id: string;
    name: string;
    aliases: string[];
    language: string;
    definition: string;
    tags: string[];
    type: string;
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

async function fetchEntry(id: string): Promise<WikiApiResponse["entry"] | null> {
  try {
    // Fetch all entries with all statuses to find by ID
    const baseUrl = process.env.SITE_URL || "http://localhost:3000";
    const allStatuses = ["creating", "unreviewed", "reviewed"];
    const allEntries: Array<{ id: string; name: string; language: string }> = [];

    for (const status of allStatuses) {
      const [zhRes, enRes] = await Promise.all([
        fetch(`${baseUrl}/api/wiki?lang=zh&page=1&limit=1000&status=${status}`, {
          cache: "no-store",
        }),
        fetch(`${baseUrl}/api/wiki?lang=en&page=1&limit=1000&status=${status}`, {
          cache: "no-store",
        }),
      ]);

      if (zhRes.ok) {
        const zh = await zhRes.json();
        allEntries.push(...zh.entries);
      }
      if (enRes.ok) {
        const en = await enRes.json();
        allEntries.push(...en.entries);
      }
    }

    const meta = allEntries.find((e: { id: string }) => e.id === id);
    if (!meta) return null;

    // Now fetch detail to get blocks
    const detailRes = await fetch(
      `${baseUrl}/api/wiki/${encodeURIComponent(meta.name)}?lang=${meta.language}`,
      { cache: "no-store" },
    );
    if (!detailRes.ok) return null;

    const detail = await detailRes.json();
    return detail.entry;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const entry = await fetchEntry(id);

  if (!entry) return { title: "Not Found" };

  return {
    title: `编辑词条: ${entry.name} | Miniese's Blog`,
  };
}

export default async function EditWikiEntryPage({ params }: Props) {
  const { id } = await params;
  const entry = await fetchEntry(id);

  if (!entry) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <div className="mb-6">
        <Link
          href="/admin/wiki"
          className="inline-flex items-center rounded-lg px-3 py-2 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <ArrowLeft className="size-5" />
        </Link>
      </div>
      <h1 className="text-3xl font-bold tracking-tight mb-8">编辑词条: {entry.name}</h1>
      <WikiEntryForm mode="edit" initialData={entry} />
    </div>
  );
}
