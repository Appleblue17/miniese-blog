/**
 * @file /admin/ai-tasks - AI 助手任务列表
 *
 * 直接使用 Prisma 查询 AI 任务列表（避免 Server Component fetch 自身 API 的间接调用）。
 */

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import { queryTasks, validateTaskType } from "@/lib/ai/task-utils";
import { AiTaskList } from "@/components/admin/AiTaskList";

export const metadata: Metadata = {
  title: "助手任务 | Miniese's Blog",
};

const PAGE_SIZE = 20;

export default async function AdminAiTasksPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; page?: string }>;
}) {
  const params = await searchParams;
  const activeType = validateTaskType(params.type ?? null) ?? "all";
  const currentPage = Math.max(1, parseInt(params.page || "1", 10));

  const { tasks: mapped, total, totalPages } = await queryTasks({
    type: activeType !== "all" ? activeType : undefined,
    page: currentPage,
    limit: PAGE_SIZE,
  });

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <div className="flex items-center gap-4 mb-6">
        <Link
          href="/admin"
          className="inline-flex items-center rounded-lg px-3 py-2 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">助手任务</h1>
          <p className="text-sm text-muted-foreground mt-1">共 {total} 个任务</p>
        </div>
      </div>

      <AiTaskList
        tasks={mapped}
        activeType={activeType}
        currentPage={currentPage}
        totalPages={totalPages}
      />
    </div>
  );
}
