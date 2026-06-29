/**
 * @file CommentSection - Article comments with expandable input.
 *
 * Shows a compact input bar at the bottom of the article. Clicking it expands
 * into a full comment form. Existing comments are listed above the input.
 *
 * Requires `articleId` to fetch and post comments via `/api/comments`.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MessageSquare, Send, User, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CommentItem {
  id: string;
  authorName: string;
  content: string;
  createdAt: string;
}

interface CommentSectionProps {
  articleId: string;
  lang: string;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHour = Math.floor(diffMs / 3_600_000);
  const diffDay = Math.floor(diffMs / 86_400_000);

  if (diffMin < 1) return "刚刚";
  if (diffMin < 60) return `${diffMin} 分钟前`;
  if (diffHour < 24) return `${diffHour} 小时前`;
  if (diffDay < 7) return `${diffDay} 天前`;

  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}

export function CommentSection({ articleId, lang }: CommentSectionProps) {
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<{ id: string } | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Fetch comments + check session
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [commentsRes, meRes] = await Promise.all([
          fetch(`/api/comments?articleId=${encodeURIComponent(articleId)}`),
          fetch("/api/auth/me"),
        ]);

        if (commentsRes.ok) {
          const data = await commentsRes.json();
          if (!cancelled) setComments(data);
        }

        if (meRes.ok) {
          const data = await meRes.json();
          if (!cancelled) setUser(data.user);
        }
      } catch {
        // silently ignore
      } finally {
        if (!cancelled) {
          setLoading(false);
          setSessionChecked(true);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [articleId]);

  // Focus textarea when expanded
  useEffect(() => {
    if (expanded && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [expanded]);

  const handleRedirectToLogin = useCallback(() => {
    window.location.href = `/login?callbackUrl=${encodeURIComponent(window.location.pathname)}`;
  }, []);

  const handleSubmit = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed) return;

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ articleId, content: trimmed }),
      });

      if (res.status === 401) {
        handleRedirectToLogin();
        return;
      }

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "提交失败");
        return;
      }

      // Add new comment to list
      setComments((prev) => [
        ...prev,
        {
          id: data.id,
          authorName: data.authorName,
          content: data.content,
          createdAt: data.createdAt,
        },
      ]);
      setText("");
      setExpanded(false);
    } catch {
      setError("提交失败，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  }, [text, articleId, handleRedirectToLogin]);

  const t = (zh: string, en: string) => (lang === "zh" ? zh : en);

  return (
    <div className="flex flex-col gap-6">
      {/* Section header */}
      <div className="flex items-center gap-2">
        <MessageSquare className="size-4 text-muted-foreground" />
        <span className="font-medium text-sm">{t("评论", "Comments")}</span>
        {!loading && (
          <span className="text-xs text-muted-foreground/60">
            ({comments.length})
          </span>
        )}
      </div>

      {/* Comment list */}
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="size-5 animate-spin text-muted-foreground/40" />
        </div>
      ) : comments.length > 0 ? (
        <div className="flex flex-col gap-4">
          {comments.map((c) => (
            <div key={c.id} className="flex gap-3">
              <div className="size-8 shrink-0 rounded-full bg-muted flex items-center justify-center">
                <User className="size-4 text-muted-foreground/60" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{c.authorName}</span>
                  <span className="text-xs text-muted-foreground/50">{formatDate(c.createdAt)}</span>
                </div>
                <p className="text-sm text-foreground mt-1 whitespace-pre-wrap break-words">
                  {c.content}
                </p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground/60 py-2">
          {t("暂无评论", "No comments yet.")}
        </p>
      )}

      {/* Compact input bar / expanded form */}
      {!sessionChecked ? null : !user ? (
        <button
          onClick={handleRedirectToLogin}
          className="w-full flex items-center gap-2 rounded-lg border border-dashed border-muted-foreground/30 px-4 py-2.5 text-sm text-muted-foreground/50 hover:text-muted-foreground hover:border-muted-foreground/50 hover:bg-accent/30 transition-colors text-left cursor-pointer"
        >
          <MessageSquare className="size-4 shrink-0" />
          {t("登录后发表评论", "Log in to comment")}
        </button>
      ) : !expanded ? (
        <button
          onClick={() => setExpanded(true)}
          className="w-full flex items-center gap-2 rounded-lg border border-dashed border-muted-foreground/30 px-4 py-2.5 text-sm text-muted-foreground/50 hover:text-muted-foreground hover:border-muted-foreground/50 hover:bg-accent/30 transition-colors text-left cursor-pointer"
        >
          <MessageSquare className="size-4 shrink-0" />
          {t("写评论...", "Write a comment...")}
        </button>
      ) : (
        <div className="card-base flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t("输入你的评论...", "Write your comment...")}
            rows={3}
            className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />

          {error && (
            <div className="flex items-center gap-2 text-xs text-destructive">
              <AlertCircle className="size-3" />
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setExpanded(false); setText(""); setError(null); }}
              disabled={submitting}
            >
              {t("取消", "Cancel")}
            </Button>
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={!text.trim() || submitting}
            >
              {submitting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
              {t("发送", "Send")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
