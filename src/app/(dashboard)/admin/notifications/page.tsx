/**
 * @file /admin/notifications — Admin notifications page.
 *
 * Displays all system notifications (comments, translation complete,
 * discovery results, etc.) with read/unread state.
 *
 * Features:
 * - Paginated list, newest first
 * - Mark individual notifications as read
 * - Filter: all / unread only
 * - Click notification to navigate to related article (if articleId set)
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Bell, MessageSquare, Globe, Search, AlertTriangle } from "lucide-react";

interface Notification {
  id: string;
  type: string;
  title: string;
  content: string;
  articleId: string | null;
  articleTitle: string | null;
  taskId: string | null;
  isRead: boolean;
  createdAt: string;
}

interface NotificationsResponse {
  notifications: Notification[];
  unreadCount: number;
  total: number;
  page: number;
  totalPages: number;
}

const TYPE_ICONS: Record<string, typeof Bell> = {
  comment: MessageSquare,
  comment_deleted: AlertTriangle,
  translation_complete: Globe,
  task_failed: AlertTriangle,
  discovery: Search,
};

const TYPE_LABELS: Record<string, string> = {
  comment: "评论",
  comment_deleted: "评论删除",
  translation_complete: "翻译完成",
  task_failed: "任务失败",
  discovery: "术语发现",
};

function NotificationIcon({ type }: { type: string }) {
  const Icon = TYPE_ICONS[type] || Bell;
  const colorMap: Record<string, string> = {
    comment: "text-blue-500",
    comment_deleted: "text-red-500",
    translation_complete: "text-green-500",
    task_failed: "text-red-500",
    discovery: "text-purple-500",
  };
  return <Icon className={`size-5 ${colorMap[type] || "text-muted-foreground"}`} />;
}

export default function AdminNotificationsPage() {
  const [data, setData] = useState<NotificationsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  // Mark all notifications as read on page load
  useEffect(() => {
    fetch(`/api/admin/notifications/read-all`, { method: "PUT" }).catch(() => {});
  }, []);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "20" });
      const res = await fetch(`/api/admin/notifications?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as NotificationsResponse;
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const timeAgo = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "刚刚";
    if (mins < 60) return `${mins} 分钟前`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} 小时前`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days} 天前`;
    return new Date(iso).toLocaleDateString("zh-CN");
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
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
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading && !data && (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent mr-2" />
          加载中...
        </div>
      )}

      {!loading && data && data.notifications.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Bell className="mb-4 size-12 opacity-30" />
          <p className="text-lg">暂无通知</p>
        </div>
      )}

      {data && data.notifications.length > 0 && (
        <>
          <div className="space-y-2">
            {data.notifications.map((notification) =>
              notification.taskId ? (
                <Link
                  key={notification.id}
                  href={`/admin/ai-tasks/${notification.taskId}`}
                  className={`block relative rounded-xl border p-4 transition-colors ${
                    notification.isRead
                      ? "border-border bg-card"
                      : "border-primary/20 bg-primary/5"
                  } hover:bg-accent/50 cursor-pointer`}
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 shrink-0">
                      <NotificationIcon type={notification.type} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-muted-foreground">
                          {TYPE_LABELS[notification.type] || notification.type}
                        </span>
                        {!notification.isRead && (
                          <span className="size-2 rounded-full bg-primary" />
                        )}
                        <span className="ml-auto text-xs text-muted-foreground">
                          {timeAgo(notification.createdAt)}
                        </span>
                      </div>
                      <h3 className="mt-1 font-medium">{notification.title}</h3>
                      <p className="mt-0.5 text-sm text-muted-foreground line-clamp-2">
                        {notification.content}
                      </p>
                    </div>
                  </div>
                </Link>
              ) : (
                <div
                  key={notification.id}
                  className={`block relative rounded-xl border p-4 transition-colors ${
                    notification.isRead
                      ? "border-border bg-card"
                      : "border-primary/20 bg-primary/5"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 shrink-0">
                      <NotificationIcon type={notification.type} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-muted-foreground">
                          {TYPE_LABELS[notification.type] || notification.type}
                        </span>
                        {!notification.isRead && (
                          <span className="size-2 rounded-full bg-primary" />
                        )}
                        <span className="ml-auto text-xs text-muted-foreground">
                          {timeAgo(notification.createdAt)}
                        </span>
                      </div>
                      <h3 className="mt-1 font-medium">{notification.title}</h3>
                      <p className="mt-0.5 text-sm text-muted-foreground line-clamp-2">
                        {notification.content}
                      </p>
                    </div>
                  </div>
                </div>
              ),
            )}
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
