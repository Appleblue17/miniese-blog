/**
 * @file /admin/wiki/new - Create a new wiki entry.
 */

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import { WikiEntryForm } from "@/components/admin/WikiEntryForm";

export const metadata: Metadata = {
  title: "新建词条 | Miniese's Blog",
};

export default function NewWikiEntryPage() {
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
      <h1 className="text-3xl font-bold tracking-tight mb-8">新建词条</h1>
      <WikiEntryForm mode="create" />
    </div>
  );
}
