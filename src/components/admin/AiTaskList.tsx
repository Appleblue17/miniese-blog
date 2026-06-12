/**
 * @file AiTaskList - AI 任务列表客户端组件
 *
 * 展示 AI 任务列表，支持按类型切换筛选，与知识库管理样式统一。
 */

"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight, Bot, Globe, Sparkles } from "lucide-react";
import type { AiTaskItem } from "@/app/api/admin/ai-tasks/route";

interface AiTaskListProps {
  tasks: AiTaskItem[];
  activeType: string;
  currentPage: number;
  totalPages: number;
}

interface TypeTabDef {
  key: string;
  label: string;
  icon: React.ReactNode;
}

const TYPE_TABS: TypeTabDef[] = [
  { key: "all", label: "全部", icon: null },
  { key: "review", label: "审查", icon: <Bot className="size-3.5" /> },
  { key: "translate", label: "翻译", icon: <Globe className="size-3.5" /> },
  { key: "generate", label: "生成词条", icon: <Sparkles className="size-3.5" /> },
];

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
}

function TaskStatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; color: string }> = {
    pending: {
      label: "等待中",
      color: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
    },
    processing: {
      label: "处理中",
      color: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
    },
    completed: {
      label: "已完成",
      color: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
    },
    failed: {
      label: "失败",
      color: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
    },
  };

  const c = config[status] ?? {
    label: status,
    color: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${c.color}`}
    >
      {c.label}
    </span>
  );
}

function TaskTypeIcon({ type }: { type: string }) {
  switch (type) {
    case "review":
      return <Bot className="size-4 text-muted-foreground" />;
    case "translate":
      return <Globe className="size-4 text-blue-500" />;
    case "generate":
      return <Sparkles className="size-4 text-purple-500" />;
    default:
      return <Bot className="size-4 text-muted-foreground" />;
  }
}

function TaskTypeLabel(type: string) {
  switch (type) {
    case "review": return "审查";
    case "translate": return "翻译";
    case "generate": return "生成词条";
    default: return type;
  }
}

function getTaskSummary(task: AiTaskItem): string | null {
  if (task.status !== "completed" || !task.output) return null;

  switch (task.type) {
    case "review": {
      const summary = (task.output as Record<string, unknown>)?.summary as Record<string, unknown> | undefined;
      if (summary && typeof summary.totalIssues === "number") {
        return `${summary.totalIssues} 个问题`;
      }
      return null;
    }
    case "translate": {
      const count = (task.output as Record<string, unknown>)?.translatedCount;
      if (typeof count === "number") {
        return `${count} 段翻译`;
      }
      return null;
    }
    case "generate": {
      const count = (task.output as Record<string, unknown>)?.termsCount;
      if (typeof count === "number") {
        return `${count} 个词条`;
      }
      return null;
    }
    default:
      return null;
  }
}

// --- Type Tab Bar ---

function TypeTabBar({
  tabs,
  activeKey,
}: {
  tabs: TypeTabDef[];
  activeKey: string;
}) {
  return (
    <div className="flex items-center gap-1 rounded-xl bg-muted p-1" role="tablist">
      {tabs.map((tab) => {
        const params = new URLSearchParams();
        if (tab.key !== "all") params.set("type", tab.key);
        params.set("page", "1");
        const href = tab.key === "all" ? "/admin/ai-tasks" : `/admin/ai-tasks?${params.toString()}`;

        return (
          <Link
            key={tab.key}
            href={href}
            role="tab"
            aria-selected={tab.key === activeKey}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              tab.key === activeKey
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.icon}
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}

// --- Task Row ---

function TaskRow({ task }: { task: AiTaskItem }) {
  const summary = getTaskSummary(task);

  return (
    <Link
      key={task.id}
      href={`/admin/ai-tasks/${task.id}`}
      className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3 transition-colors hover:bg-muted"
    >
      <div className="flex flex-col gap-1 min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <TaskTypeIcon type={task.type} />
          <span className="font-medium truncate text-sm">
            {task.articleTitle ?? "未知文章"}
          </span>
          <TaskStatusBadge status={task.status} />
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>{TaskTypeLabel(task.type)}</span>
          <span>创建 {formatDate(task.createdAt)}</span>
          {task.completedAt && (
            <span>完成 {formatDate(task.completedAt)}</span>
          )}
          {summary && <span>{summary}</span>}
          {task.error && (
            <span className="text-destructive">错误: {task.error}</span>
          )}
        </div>
      </div>
      <ChevronRight className="size-4 text-muted-foreground shrink-0 ml-4" />
    </Link>
  );
}

// --- Pagination ---

function Pagination({
  currentPage,
  totalPages,
  baseParams,
}: {
  currentPage: number;
  totalPages: number;
  baseParams: URLSearchParams;
}) {
  if (totalPages <= 1) return null;

  const pages: (number | "...")[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (currentPage > 3) pages.push("...");
    for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) {
      pages.push(i);
    }
    if (currentPage < totalPages - 2) pages.push("...");
    pages.push(totalPages);
  }

  const pageHref = (page: number) => {
    const p = new URLSearchParams(baseParams);
    p.set("page", String(page));
    return `/admin/ai-tasks?${p.toString()}`;
  };

  return (
    <nav className="flex items-center justify-center gap-1 mt-6" aria-label="分页">
      <Link
        href={currentPage > 1 ? pageHref(currentPage - 1) : "#"}
        className={`inline-flex items-center rounded-md px-3 py-1.5 text-sm ${
          currentPage <= 1
            ? "text-muted-foreground/40 pointer-events-none"
            : "text-muted-foreground hover:bg-accent"
        }`}
      >
        <ChevronLeft className="size-4" />
      </Link>
      {pages.map((p, i) =>
        p === "..." ? (
          <span key={`ellipsis-${i}`} className="px-2 text-sm text-muted-foreground/60">
            ...
          </span>
        ) : (
          <Link
            key={p}
            href={pageHref(p)}
            className={`inline-flex items-center justify-center rounded-md px-3 py-1.5 text-sm font-medium ${
              p === currentPage
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent"
            }`}
          >
            {p}
          </Link>
        ),
      )}
      <Link
        href={currentPage < totalPages ? pageHref(currentPage + 1) : "#"}
        className={`inline-flex items-center rounded-md px-3 py-1.5 text-sm ${
          currentPage >= totalPages
            ? "text-muted-foreground/40 pointer-events-none"
            : "text-muted-foreground hover:bg-accent"
        }`}
      >
        <ChevronRight className="size-4" />
      </Link>
    </nav>
  );
}

// --- Main Component ---

export function AiTaskList({
  tasks,
  activeType,
  currentPage,
  totalPages,
}: AiTaskListProps) {
  const baseParams = new URLSearchParams();
  if (activeType !== "all") baseParams.set("type", activeType);

  return (
    <div className="flex flex-col gap-4">
      <TypeTabBar tabs={TYPE_TABS} activeKey={activeType} />

      {tasks.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
          <Bot className="size-12 opacity-40" />
          <p className="text-lg">暂无任务</p>
          <p className="text-sm">还没有 AI 任务记录。</p>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {tasks.map((task) => (
            <TaskRow key={task.id} task={task} />
          ))}
        </div>
      )}

      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        baseParams={baseParams}
      />
    </div>
  );
}
