/**
 * @file /admin/ai-tasks - AI 助手任务列表
 *
 * 展示所有 AI 任务（审查、翻译、生成词条等），支持按类型筛选。
 * 顶部切换栏样式与知识库管理统一。
 */

import Link from "next/link";
import { ChevronLeft, ChevronRight, Bot } from "lucide-react";
import type { Metadata } from "next";
import { AiTaskList } from "@/components/admin/AiTaskList";
import type { AiTaskItem } from "@/app/api/admin/ai-tasks/route";

export const metadata: Metadata = {
  title: "助手任务 | Miniese's Blog",
};

const PAGE_SIZE = 20;

interface AiTasksResponse {
  tasks: AiTaskItem[];
  total: number;
  page: number;
  totalPages: number;
}

async function fetchData(
  type: string,
  page: number,
): Promise<AiTasksResponse> {
  try {
    const baseUrl = process.env.SITE_URL || "http://localhost:3000";
    const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
    if (type && type !== "all") params.set("type", type);
    const res = await fetch(`${baseUrl}/api/admin/ai-tasks?${params.toString()}`, {
      cache: "no-store",
    });
    if (!res.ok) return { tasks: [], total: 0, page: 1, totalPages: 0 };
    return res.json();
  } catch {
    return { tasks: [], total: 0, page: 1, totalPages: 0 };
  }
}

export default async function AdminAiTasksPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; page?: string }>;
}) {
  const params = await searchParams;
  const activeType = params.type || "all";
  const currentPage = Math.max(1, parseInt(params.page || "1", 10));

  const { tasks, total } = await fetchData(activeType, currentPage);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE)) || 1;

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <div className="flex items-center gap-4 mb-6">
        <Link
          href="/admin"
          className="inline-flex items-center rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <ChevronLeft className="size-4" />
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">助手任务</h1>
          <p className="text-sm text-muted-foreground mt-1">
            共 {total} 个任务
          </p>
        </div>
      </div>

      <AiTaskList
        tasks={tasks}
        activeType={activeType}
        currentPage={currentPage}
        totalPages={totalPages}
      />
    </div>
  );
}
