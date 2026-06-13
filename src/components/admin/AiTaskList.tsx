/**
 * @file AiTaskList - AI 任务列表客户端组件
 *
 * 展示 AI 任务列表，支持：
 * - 按类型切换筛选
 * - 每个任务可删除/重试（失败/跳过状态）
 * - 失败和跳过的任务单独折叠栏
 * - 批量重试和批量删除
 */

"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Bot,
  Globe,
  Sparkles,
  Trash2,
  RotateCcw,
  Loader2,
  AlertCircle,
  SkipForward,
} from "lucide-react";
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
  { key: "discover", label: "词条发现", icon: <Sparkles className="size-3.5" /> },
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

// --- Status badge ---

function isSkipped(task: AiTaskItem): boolean {
  return (
    task.status === "skipped" ||
    (task.status === "completed" &&
      task.output !== null &&
      typeof task.output === "object" &&
      (task.output as Record<string, unknown>).skipped === true)
  );
}

function TaskStatusBadge({ task }: { task: AiTaskItem }) {
  if (isSkipped(task)) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">
        <SkipForward className="size-2.5" />
        跳过
      </span>
    );
  }

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

  const c = config[task.status] ?? {
    label: task.status,
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
    case "discover":
      return <Sparkles className="size-4 text-amber-500" />;
    default:
      return <Bot className="size-4 text-muted-foreground" />;
  }
}

function TaskTypeLabel(type: string) {
  switch (type) {
    case "review":
      return "审查";
    case "translate":
      return "翻译";
    case "generate":
      return "生成词条";
    case "discover":
      return "词条发现";
    default:
      return type;
  }
}

function getTaskSummary(task: AiTaskItem): string | null {
  if (task.status !== "completed" || !task.output || isSkipped(task)) return null;

  switch (task.type) {
    case "review": {
      const summary = (task.output as Record<string, unknown>)?.summary as
        | Record<string, unknown>
        | undefined;
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
    case "discover": {
      const count = (task.output as Record<string, unknown>)?.candidateCount;
      if (typeof count === "number") {
        return `${count} 个候选词条`;
      }
      return null;
    }
    default:
      return null;
  }
}

// --- Type Tab Bar ---

function TypeTabBar({ tabs, activeKey }: { tabs: TypeTabDef[]; activeKey: string }) {
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

// --- Action Buttons ---

function TaskActions({
  task,
  onDelete,
  onRetry,
  busy,
}: {
  task: AiTaskItem;
  onDelete: (id: string) => void;
  onRetry: (id: string) => void;
  busy: boolean;
}) {
  const canRetry = task.status === "failed" || isSkipped(task);
  const canDelete = true;

  return (
    <div className="flex items-center gap-1 shrink-0">
      {canRetry && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onRetry(task.id);
          }}
          disabled={busy}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-amber-600 hover:bg-amber-50 transition-colors disabled:opacity-40 dark:text-amber-400 dark:hover:bg-amber-950"
          title="重试"
        >
          <RotateCcw className="size-3" />
          重试
        </button>
      )}
      {canDelete && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onDelete(task.id);
          }}
          disabled={busy}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40 dark:text-red-400 dark:hover:bg-red-950"
          title="删除"
        >
          <Trash2 className="size-3" />
          删除
        </button>
      )}
    </div>
  );
}

// --- Task Row ---

function TaskRow({
  task,
  onDelete,
  onRetry,
  busy,
}: {
  task: AiTaskItem;
  onDelete: (id: string) => void;
  onRetry: (id: string) => void;
  busy: boolean;
}) {
  const summary = getTaskSummary(task);
  const skipped = isSkipped(task);

  return (
    <Link
      key={task.id}
      href={`/admin/ai-tasks/${task.id}`}
      className={`flex items-center justify-between rounded-lg border px-4 py-3 transition-colors hover:bg-muted ${
        skipped
          ? "border-amber-200 bg-amber-50/30 dark:border-amber-900 dark:bg-amber-950/20"
          : task.status === "failed"
            ? "border-red-200 bg-red-50/30 dark:border-red-900 dark:bg-red-950/20"
            : "border-border bg-card"
      }`}
    >
      <div className="flex flex-col gap-1 min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <TaskTypeIcon type={task.type} />
          <span className="font-medium truncate text-sm">{task.articleTitle ?? "未知文章"}</span>
          <TaskStatusBadge task={task} />
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>{TaskTypeLabel(task.type)}</span>
          <span>创建 {formatDate(task.createdAt)}</span>
          {task.completedAt && <span>完成 {formatDate(task.completedAt)}</span>}
          {summary && <span>{summary}</span>}
          {task.error && <span className="text-destructive">错误: {task.error}</span>}
          {skipped && (
            <span className="text-amber-600 dark:text-amber-400">
              功能已关闭，可手动重试
            </span>
          )}
        </div>
      </div>
      <TaskActions task={task} onDelete={onDelete} onRetry={onRetry} busy={busy} />
    </Link>
  );
}

// --- Batch Actions Bar ---

function BatchActionsBar({
  selectedIds,
  onBatchRetry,
  onBatchDelete,
  busy,
}: {
  selectedIds: string[];
  onBatchRetry: (ids: string[]) => void;
  onBatchDelete: (ids: string[]) => void;
  busy: boolean;
}) {
  if (selectedIds.length === 0) return null;

  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-4 py-2">
      <span className="text-sm text-muted-foreground">
        已选择 {selectedIds.length} 个任务
      </span>
      <div className="flex-1" />
      <button
        type="button"
        onClick={() => onBatchRetry(selectedIds)}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 transition-colors disabled:opacity-50"
      >
        {busy ? <Loader2 className="size-3 animate-spin" /> : <RotateCcw className="size-3" />}
        批量重试
      </button>
      <button
        type="button"
        onClick={() => onBatchDelete(selectedIds)}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 transition-colors disabled:opacity-50"
      >
        {busy ? <Loader2 className="size-3 animate-spin" /> : <Trash2 className="size-3" />}
        批量删除
      </button>
    </div>
  );
}

// --- Failed/Skipped Section ---

function CollapsibleSection({
  label,
  icon,
  tasks,
  defaultOpen,
  onDelete,
  onRetry,
  busy,
  onSelect,
  selectedIds,
}: {
  label: string;
  icon: React.ReactNode;
  tasks: AiTaskItem[];
  defaultOpen: boolean;
  onDelete: (id: string) => void;
  onRetry: (id: string) => void;
  busy: boolean;
  onSelect: (id: string, checked: boolean) => void;
  selectedIds: string[];
}) {
  const [open, setOpen] = useState(defaultOpen);

  if (tasks.length === 0) return null;

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full px-4 py-2.5 bg-muted/50 text-sm font-medium hover:bg-muted transition-colors"
      >
        <ChevronDown
          className={`size-4 text-muted-foreground transition-transform ${open ? "" : "-rotate-90"}`}
        />
        {icon}
        <span>{label}</span>
        <span className="text-xs text-muted-foreground ml-1">({tasks.length})</span>
      </button>
      {open && (
        <div className="flex flex-col gap-1 p-3">
          {/* Select all checkbox */}
          <label className="flex items-center gap-2 px-1 py-1 text-xs text-muted-foreground cursor-pointer hover:text-foreground">
            <input
              type="checkbox"
              checked={tasks.every((t) => selectedIds.includes(t.id))}
              onChange={(e) => {
                for (const t of tasks) onSelect(t.id, e.target.checked);
              }}
              className="rounded border-border"
            />
            全选
          </label>
          {tasks.map((task) => (
            <div key={task.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={selectedIds.includes(task.id)}
                onChange={(e) => onSelect(task.id, e.target.checked)}
                className="rounded border-border shrink-0"
              />
              <div className="flex-1 min-w-0">
                <TaskRow
                  task={task}
                  onDelete={onDelete}
                  onRetry={onRetry}
                  busy={busy}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
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
    for (
      let i = Math.max(2, currentPage - 1);
      i <= Math.min(totalPages - 1, currentPage + 1);
      i++
    ) {
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

export function AiTaskList({ tasks, activeType, currentPage, totalPages }: AiTaskListProps) {
  const [busy, setBusy] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const baseParams = new URLSearchParams();
  if (activeType !== "all") baseParams.set("type", activeType);

  const normalTasks = tasks.filter((t) => t.status !== "failed" && !isSkipped(t) && t.articleTitle !== null);
  const unknownTasks = tasks.filter((t) => t.status !== "failed" && !isSkipped(t) && t.articleTitle === null);
  const failedTasks = tasks.filter((t) => t.status === "failed");
  const skippedTasks = tasks.filter((t) => isSkipped(t));

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm("确定删除此任务？")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/ai-tasks/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      // 使用 location.reload 确保获取最新数据，避免 RSC 缓存导致的分页偏移问题
      window.location.reload();
    } catch (err) {
      console.error("Delete failed:", err);
      alert("删除失败");
    } finally {
      setBusy(false);
    }
  }, []);

  const handleRetry = useCallback(async (id: string) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/ai-tasks/${id}/retry`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || "Retry failed");
      }
      window.location.reload();
    } catch (err) {
      console.error("Retry failed:", err);
      alert(`重试失败: ${err instanceof Error ? err.message : "未知错误"}`);
    } finally {
      setBusy(false);
    }
  }, []);

  const handleBatchRetry = useCallback(async (ids: string[]) => {
    if (!confirm(`确定重试 ${ids.length} 个任务？`)) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/ai-tasks/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "retry", taskIds: ids }),
      });
      if (!res.ok) throw new Error("Batch retry failed");
      setSelectedIds(new Set());
      window.location.reload();
    } catch (err) {
      console.error("Batch retry failed:", err);
      alert("批量重试失败");
    } finally {
      setBusy(false);
    }
  }, []);

  const handleBatchDelete = useCallback(async (ids: string[]) => {
    if (!confirm(`确定删除 ${ids.length} 个任务？此操作不可撤销。`)) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/ai-tasks/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", taskIds: ids }),
      });
      if (!res.ok) throw new Error("Batch delete failed");
      setSelectedIds(new Set());
      window.location.reload();
    } catch (err) {
      console.error("Batch delete failed:", err);
      alert("批量删除失败");
    } finally {
      setBusy(false);
    }
  }, []);

  const handleSelect = useCallback((id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <TypeTabBar tabs={TYPE_TABS} activeKey={activeType} />

      {/* Failed tasks section */}
      <CollapsibleSection
        label="失败任务"
        icon={<AlertCircle className="size-4 text-red-500" />}
        tasks={failedTasks}
        defaultOpen={failedTasks.length > 0}
        onDelete={handleDelete}
        onRetry={handleRetry}
        busy={busy}
        onSelect={handleSelect}
        selectedIds={[...selectedIds]}
      />

      {/* Skipped tasks section */}
      <CollapsibleSection
        label="已跳过的任务"
        icon={<SkipForward className="size-4 text-amber-500" />}
        tasks={skippedTasks}
        defaultOpen={skippedTasks.length > 0}
        onDelete={handleDelete}
        onRetry={handleRetry}
        busy={busy}
        onSelect={handleSelect}
        selectedIds={[...selectedIds]}
      />

      {/* Batch actions bar */}
      <BatchActionsBar
        selectedIds={[...selectedIds]}
        onBatchRetry={handleBatchRetry}
        onBatchDelete={handleBatchDelete}
        busy={busy}
      />

      {/* Unknown tasks section (no article association) */}
      <CollapsibleSection
        label="其他任务（无关联文章）"
        icon={<Bot className="size-4 text-muted-foreground" />}
        tasks={unknownTasks}
        defaultOpen={unknownTasks.length > 0}
        onDelete={handleDelete}
        onRetry={handleRetry}
        busy={busy}
        onSelect={handleSelect}
        selectedIds={[...selectedIds]}
      />

      {/* Normal tasks */}
      {normalTasks.length === 0 && failedTasks.length === 0 && skippedTasks.length === 0 && unknownTasks.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
          <Bot className="size-12 opacity-40" />
          <p className="text-lg">暂无任务</p>
          <p className="text-sm">还没有 AI 任务记录。</p>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {normalTasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              onDelete={handleDelete}
              onRetry={handleRetry}
              busy={busy}
            />
          ))}
        </div>
      )}

      <Pagination currentPage={currentPage} totalPages={totalPages} baseParams={baseParams} />
    </div>
  );
}
