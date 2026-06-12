/**
 * @file /admin/wiki - Wiki management page.
 *
 * Merged WikiEntry + WikiDiscovery management.
 * Tab structure:
 *   - 全部 (all): WikiEntry unreviewed + reviewed
 *   - 申请中 (pending): WikiDiscovery pending
 *   - 已驳回 (rejected): WikiDiscovery rejected
 *   - 生成中 (creating): WikiEntry creating
 *   - 待审查 (unreviewed): WikiEntry unreviewed
 *   - 已审查 (reviewed): WikiEntry reviewed
 *
 * Data fetching is handled client-side via AdminWikiList.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { PlusCircle } from "lucide-react";
import { AdminWikiList } from "@/components/admin/AdminWikiList";

export const metadata: Metadata = {
  title: "知识库管理 | Miniese's Blog",
};

export default async function AdminWikiPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const params = await searchParams;
  const activeStatus = params.status || "all";
  const currentPage = Math.max(1, parseInt(params.page || "1", 10));

  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">知识库管理</h1>
          <p className="text-sm text-muted-foreground mt-1">管理词条和候选术语</p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/admin/wiki/new"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/80 transition-colors"
          >
            <PlusCircle className="size-4" />
            新建词条
          </Link>
        </div>
      </div>

      <AdminWikiList activeStatus={activeStatus} currentPage={currentPage} />
    </div>
  );
}
