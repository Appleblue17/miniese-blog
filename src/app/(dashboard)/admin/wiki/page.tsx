/**
 * @file /admin/wiki - Wiki entry management page.
 *
 * Lists wiki entries with status tab switching and pagination.
 * Fetches data per status from the server.
 */

import Link from "next/link";
import { PlusCircle } from "lucide-react";
import type { Metadata } from "next";
import { AdminWikiList } from "@/components/admin/AdminWikiList";
import type { WikiEntryMeta } from "@/types/wiki";

export const metadata: Metadata = {
  title: "知识库管理 | Miniese's Blog",
};

const PAGE_SIZE = 20;

async function fetchStatusData(
  baseUrl: string,
  status: string,
  page: number,
  lang: string,
) {
  try {
    const res = await fetch(
      `${baseUrl}/api/wiki?lang=${lang}&page=${page}&limit=${PAGE_SIZE}&status=${status}`,
      { cache: "no-store" },
    );
    if (!res.ok) return { entries: [], total: 0 };
    return await res.json();
  } catch {
    return { entries: [], total: 0 };
  }
}

export default async function AdminWikiPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const params = await searchParams;
  const activeStatus = params.status || "all";
  const currentPage = Math.max(1, parseInt(params.page || "1", 10));

  const baseUrl = process.env.SITE_URL || "http://localhost:3000";

  // If "all", fetch all statuses (first page only for counting)
  // Otherwise fetch only the active status
  let entries: Array<Record<string, unknown>> = [];
  let total = 0;
  let totalPages = 0;

  if (activeStatus === "all") {
    const statuses = ["proposed", "creating", "unreviewed", "reviewed"];
    for (const status of statuses) {
      const [zhData, enData] = await Promise.all([
        fetchStatusData(baseUrl, status, 1, "zh"),
        fetchStatusData(baseUrl, status, 1, "en"),
      ]);
      entries.push(
        ...zhData.entries.map((e: Record<string, unknown>) => ({ ...e, _statusGroup: status })),
        ...enData.entries.map((e: Record<string, unknown>) => ({ ...e, _statusGroup: status })),
      );
      total += zhData.total + enData.total;
    }
    totalPages = 1;
  } else {
    const [zhData, enData] = await Promise.all([
      fetchStatusData(baseUrl, activeStatus, currentPage, "zh"),
      fetchStatusData(baseUrl, activeStatus, currentPage, "en"),
    ]);
    entries = [
      ...zhData.entries,
      ...enData.entries,
    ];
    total = zhData.total + enData.total;
    // Since we combine two languages, approximate total pages
    totalPages = Math.max(zhData.totalPages || 1, enData.totalPages || 1);
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">知识库管理</h1>
          <p className="text-sm text-muted-foreground mt-1">
            共 {total} 个词条
          </p>
        </div>
        <Link
          href="/admin/wiki/new"
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/80 transition-colors"
        >
          <PlusCircle className="size-4" />
          新建词条
        </Link>
      </div>

      <AdminWikiList
        entries={entries as unknown as WikiEntryMeta[]}
        activeStatus={activeStatus}
        currentPage={currentPage}
        totalPages={totalPages}
      />
    </div>
  );
}
