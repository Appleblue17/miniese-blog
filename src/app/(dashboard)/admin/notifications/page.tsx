/**
 * @file /admin/notifications — Admin notifications page.
 *
 * Displays all system notifications with read/unread state.
 *
 * Features:
 * - Paginated list, newest first
 * - Filter: all / unread only (via Tab)
 * - 🔴🟡 notifications require manual mark-as-read (single or "mark all")
 * - 🔵 notifications (autoRead=true) are auto-read on page load
 * - Click notification with taskId → task detail; with articleId → article (TODO)
 * - article_published type supported
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  Bell,
  MessageSquare,
  Globe,
  Search,
  AlertTriangle,
  Check,
  FileText,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Notification {
  id: string;
  type: string;
  title: string;
  content: string;
  articleId: string | null;
  articleTitle: string | null;
  taskId: string | null;
  isRead: boolean;
  autoRead: boolean;
  severity: string;
  createdAt: string;
}

interface NotificationsResponse {
  notifications: Notification[];
  unreadCount: number;
  total: number;
  page: number;
  totalPages: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

type FilterMode = "all" | "unread";

const TYPE_ICONS: Record<string, typeof Bell> = {
  comment: MessageSquare,
  comment_deleted: AlertTriangle,
  translation_complete: Globe,
  task_failed: AlertTriangle,
  discovery: Search,
  article_published: FileText,
};

const TYPE_LABELS: Record<string, string> = {
  comment: "评论",
  comment_deleted: "评论隐藏",
  translation_complete: "翻译完成",
  task_failed: "任务失败",
  discovery: "词条发现",
  article_published: "文章发布",
};

const TYPE_COLORS: Record<string, string> = {
  comment: "text-blue-500",
  comment_deleted: "text-red-500",
  translation_complete: "text-green-500",
  task_failed: "text-red-500",
  discovery: "text-purple-500",
  article_published: "text-amber-500",
};

function NotificationIcon({ type }: { type: string }) {
  const Icon = TYPE_ICONS[type] || Bell;
  return <Icon className={`size-5 ${TYPE_COLORS[type] || "text-muted-foreground"}`} />;
}

// ─── Severity Dot ────────────────────────────────────────────────────────────

const SEVERITY_DOT: Record<string, string> = {
  important: "bg-red-500",
  normal: "bg-amber-400",
  notice: "bg-blue-400",
};

const SEVERITY_LABEL: Record<string, string> = {
  important: "重要",
  normal: "普通",
  notice: "提示",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "刚刚";
  if (mins < 60) return `${mins} 分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天前`;
  return new Date(iso).toLocaleDateString("zh-CN");
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function AdminNotificationsPage() {
  const [data, setData] = useState<NotificationsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<FilterMode>("all");

  // ── Auto-read 🔵 notifications on page load ───────────────────────────────
  useEffect(() => {
    // Mark all 🔵 (autoRead) unread notifications as read in background
    fetch(`/api/admin/notifications/read-all-auto`, { method: "PUT" }).catch(() => {});
  }, []);

  // ── Fetch notifications ────────────────────────────────────────────────────
  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: "20",
      });
      if (filter === "unread") params.set("unreadOnly", "true");

      const res = await fetch(`/api/admin/notifications?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as NotificationsResponse;
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [page, filter]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // ── Single mark as read ────────────────────────────────────────────────────
  const markAsRead = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`/api/admin/notifications/${id}/read`, {
          method: "PUT",
        });
        if (!res.ok) return;
        // Optimistic update
        setData((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            notifications: prev.notifications.map((n) =>
              n.id === id ? { ...n, isRead: true } : n,
            ),
          };
        });
      } catch {
        // ignore
      }
    },
    [],
  );

  // ── Mark all as read (🔴🟡 only) ──────────────────────────────────────────
  const markAllAsRead = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/notifications/read-all`, {
        method: "PUT",
      });
      if (!res.ok) return;
      // Refetch to get updated state
      await fetchNotifications();
    } catch {
      // ignore
    }
  }, [fetchNotifications]);

  // ── Unread count for the "unread" tab badge ───────────────────────────────
  const hasUnread =
    data?.notifications.some((n) => !n.isRead) ?? false;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/admin"
            className="inline-flex items-center justify-center rounded-lg p-2 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors -ml-2"
            aria-label="返回仪表盘"
          >
            <ChevronLeft className="size-5" />
          </Link>
          <Bell className="size-6 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight">通知中心</h1>
        </div>

        {/* Mark all as read — only show when there are unread non-autoRead notifications */}
        {data && hasUnread && (
          <button
            onClick={markAllAsRead}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <Check className="size-3.5" />
            全部标记已读
          </button>
        )}
      </div>

      {/* Filter tabs */}
      <div className="mb-4 flex gap-1">
        {[
          { key: "all" as FilterMode, label: "全部" },
          { key: "unread" as FilterMode, label: "未读" },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => {
              setFilter(tab.key);
              setPage(1);
            }}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              filter === tab.key
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-accent"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && !data && (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent mr-2" />
          加载中...
        </div>
      )}

      {/* Empty */}
      {!loading && data && data.notifications.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Bell className="mb-4 size-12 opacity-30" />
          <p className="text-lg">
            {filter === "unread" ? "暂无未读通知" : "暂无通知"}
          </p>
        </div>
      )}

      {/* List */}
      {data && data.notifications.length > 0 && (
        <>
          <div className="space-y-2">
            {data.notifications.map((notification) => {
              const isUnread = !notification.isRead;
              const cardContent = (
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 shrink-0">
                    <NotificationIcon type={notification.type} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-block size-2 rounded-full shrink-0 ${SEVERITY_DOT[notification.severity] || "bg-primary"} ${isUnread ? "" : "opacity-30"}`}
                        title={SEVERITY_LABEL[notification.severity] || notification.severity}
                      />
                      <span className="text-xs font-medium text-muted-foreground">
                        {TYPE_LABELS[notification.type] || notification.type}
                      </span>
                      <span className="ml-auto text-xs text-muted-foreground">
                        {timeAgo(notification.createdAt)}
                      </span>
                    </div>
                    <h3
                      className={`mt-1 font-medium ${
                        isUnread ? "text-foreground" : "text-muted-foreground/80"
                      }`}
                    >
                      {notification.title}
                    </h3>
                    <p
                      className={`mt-0.5 text-sm line-clamp-2 ${
                        isUnread
                          ? "text-muted-foreground"
                          : "text-muted-foreground/60"
                      }`}
                    >
                      {notification.content}
                    </p>
                  </div>
                </div>
              );

              // If notification has a taskId, the whole card is a link to the task detail
              const card = notification.taskId ? (
                <Link
                  href={`/admin/ai-tasks/${notification.taskId}`}
                  className="block"
                >
                  {cardContent}
                </Link>
              ) : (
                <div>{cardContent}</div>
              );

              return (
                <div
                  key={notification.id}
                  className={`group relative rounded-xl border p-4 transition-colors ${
                    isUnread
                      ? "border-primary/20 bg-primary/5"
                      : "border-border bg-card opacity-70"
                  } hover:bg-accent/50`}
                >
                  {card}

                  {/* Single mark-as-read button — only visible for unread non-autoRead */}
                  {isUnread && !notification.autoRead && (
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        markAsRead(notification.id);
                      }}
                      className="absolute top-4 right-4 flex size-7 items-center justify-center rounded-md border border-border bg-background/80 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-accent"
                      title="标记已读"
                      aria-label="标记已读"
                    >
                      <Check className="size-3.5 text-muted-foreground" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {data.totalPages > 1 && (
            <div className="mt-6 flex items-center justify-center gap-4">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-sm disabled:opacity-40 hover:bg-muted transition-colors"
              >
                <ChevronLeft className="size-4" />
                上一页
              </button>
              <span className="text-sm text-muted-foreground">
                {page} / {data.totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
                disabled={page >= data.totalPages}
                className="flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-sm disabled:opacity-40 hover:bg-muted transition-colors"
              >
                下一页
                <ChevronRight className="size-4" />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
