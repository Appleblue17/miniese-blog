/**
 * @file /admin/interactions — Admin interaction management.
 *
 * Three tabs:
 * - 评论管理: List, hide/show, delete comments
 * - 用户管理: List users, promote to admin
 * - 词条申请: List pending wiki term proposals, approve/reject
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  MessageSquare,
  Users,
  BookPlus,
  Eye,
  EyeOff,
  Trash2,
  Shield,
  Check,
  X,
  Loader2,
  Search,
  AlertCircle,
  KeyRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

// ── Types ──

interface CommentItem {
  id: string;
  articleId: string;
  articleTitle: string;
  articleSlug: string;
  articleLang: string;
  authorName: string;
  authorEmail: string | null;
  userId: string | null;
  content: string;
  isHidden: boolean;
  createdAt: string;
}

interface UserItem {
  id: string;
  username: string | null;
  email: string | null;
  name: string | null;
  roles: string[];
  createdAt: string;
}

interface ProposalItem {
  id: string;
  name: string;
  sourceArticleId: string | null;
  sourceContext: string | null;
  status: string;
  createdAt: string;
  user: { name: string | null; email: string | null } | null;
  article: { slug: string; title: string; language: string } | null;
}

// ── Helpers ──

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + "..." : text;
}

// ── Tabs ──

type Tab = "comments" | "users" | "proposals";

const TABS: { id: Tab; label: string; icon: typeof MessageSquare }[] = [
  { id: "comments", label: "评论管理", icon: MessageSquare },
  { id: "users", label: "用户管理", icon: Users },
  { id: "proposals", label: "词条申请", icon: BookPlus },
];

// ── Component ──

export default function AdminInteractionsPage() {
  const [activeTab, setActiveTab] = useState<Tab>("comments");

  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Link
          href="/admin"
          className="inline-flex items-center rounded-lg px-3 py-2 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">交互管理</h1>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b border-border mb-6">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors cursor-pointer ${
                activeTab === tab.id
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="size-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {activeTab === "comments" && <CommentsTab />}
      {activeTab === "users" && <UsersTab />}
      {activeTab === "proposals" && <ProposalsTab />}
    </div>
  );
}

// ── Comments Tab ──

function CommentsTab() {
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchComments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/comments?limit=100");
      if (!res.ok) throw new Error("加载失败");
      const data = await res.json();
      setComments(data.comments);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchComments(); }, [fetchComments]);

  const handleDelete = async (id: string) => {
    if (!confirm("确定删除此评论？")) return;
    setActionLoading(id);
    try {
      const res = await fetch(`/api/admin/comments/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("删除失败");
      setComments((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleToggleHide = async (id: string, currentHidden: boolean) => {
    setActionLoading(id);
    try {
      const res = await fetch(`/api/admin/comments/${id}/hide`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hidden: !currentHidden }),
      });
      if (!res.ok) throw new Error("操作失败");
      setComments((prev) =>
        prev.map((c) => (c.id === id ? { ...c, isHidden: !currentHidden } : c)),
      );
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="size-6 animate-spin text-muted-foreground/40" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-destructive">
        <AlertCircle className="size-4" />
        {error}
      </div>
    );
  }

  if (comments.length === 0) {
    return <p className="text-sm text-muted-foreground/60 py-8">暂无评论</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left py-2 pr-4 font-medium text-muted-foreground">文章</th>
            <th className="text-left py-2 pr-4 font-medium text-muted-foreground">评论者</th>
            <th className="text-left py-2 pr-4 font-medium text-muted-foreground">内容</th>
            <th className="text-left py-2 pr-4 font-medium text-muted-foreground">时间</th>
            <th className="text-right py-2 font-medium text-muted-foreground">操作</th>
          </tr>
        </thead>
        <tbody>
          {comments.map((c) => (
            <tr key={c.id} className="border-b border-border/50 hover:bg-accent/20 transition-colors">
              <td className="py-3 pr-4">
                <Link
                  href={`/${c.articleLang}/articles/${c.articleSlug}`}
                  className="text-primary hover:underline"
                  target="_blank"
                >
                  {truncate(c.articleTitle, 30)}
                </Link>
              </td>
              <td className="py-3 pr-4">
                <div className="text-foreground">{c.authorName}</div>
                {c.authorEmail && (
                  <div className="text-xs text-muted-foreground/60">{c.authorEmail}</div>
                )}
              </td>
              <td className="py-3 pr-4 max-w-xs">
                <span className={c.isHidden ? "text-muted-foreground/40 italic" : ""}>
                  {truncate(c.content, 80)}
                </span>
                {c.isHidden && (
                  <Badge variant="outline" className="ml-2 text-[10px] text-muted-foreground/50">
                    已隐藏
                  </Badge>
                )}
              </td>
              <td className="py-3 pr-4 text-muted-foreground/60 whitespace-nowrap">
                {formatDate(c.createdAt)}
              </td>
              <td className="py-3 text-right">
                <div className="flex items-center justify-end gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    onClick={() => handleToggleHide(c.id, c.isHidden)}
                    disabled={actionLoading === c.id}
                    title={c.isHidden ? "显示" : "隐藏"}
                  >
                    {actionLoading === c.id ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : c.isHidden ? (
                      <Eye className="size-4" />
                    ) : (
                      <EyeOff className="size-4" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 text-destructive hover:text-destructive"
                    onClick={() => handleDelete(c.id)}
                    disabled={actionLoading === c.id}
                    title="删除"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Users Tab ──

function UsersTab() {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Reset password modal state
  const [resetModal, setResetModal] = useState<{
    user: UserItem;
    tempPassword: string | null;
    loading: boolean;
    error: string;
  } | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/users?limit=100");
      if (!res.ok) throw new Error("加载失败");
      const data = await res.json();
      setUsers(data.users);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const handleToggleAdmin = async (userId: string, isAdmin: boolean) => {
    setActionLoading(userId);
    try {
      const res = await fetch(`/api/admin/users/${userId}/role`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: isAdmin ? "remove" : "add",
          role: "admin",
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "操作失败");
      }
      const data = await res.json();
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, roles: data.roles } : u)),
      );
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleResetPassword = async (user: UserItem) => {
    setResetModal({ user, tempPassword: null, loading: false, error: "" });

    // Confirm
    if (!confirm(`确定重置用户 "${user.username || user.email}" 的密码？`)) {
      setResetModal(null);
      return;
    }

    setResetModal({ user, tempPassword: null, loading: true, error: "" });

    try {
      const res = await fetch(`/api/admin/users/${user.id}/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "重置失败");
      }

      setResetModal({
        user,
        tempPassword: data.temporaryPassword,
        loading: false,
        error: "",
      });
    } catch (err) {
      setResetModal({
        user,
        tempPassword: null,
        loading: false,
        error: (err as Error).message,
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="size-6 animate-spin text-muted-foreground/40" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-destructive">
        <AlertCircle className="size-4" />
        {error}
      </div>
    );
  }

  return (
    <>
      {resetModal && !resetModal.loading && resetModal.tempPassword && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-lg space-y-4">
            <h3 className="text-lg font-semibold">密码已重置</h3>
            <p className="text-sm text-muted-foreground">
              用户 <strong>{resetModal.user.username || resetModal.user.email}</strong> 的密码已重置。
            </p>
            <div className="rounded-lg border border-border bg-muted/50 p-3">
              <p className="text-xs text-muted-foreground mb-1">临时密码：</p>
              <p className="text-lg font-mono font-bold tracking-wider select-all">
                {resetModal.tempPassword}
              </p>
            </div>
            <p className="text-xs text-yellow-600 dark:text-yellow-400">
              请将临时密码告知用户，建议用户登录后立即修改密码。
            </p>
            <button
              onClick={() => setResetModal(null)}
              className="w-full rounded-lg bg-foreground text-background px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity"
            >
              关闭
            </button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-2 pr-4 font-medium text-muted-foreground">用户名</th>
              <th className="text-left py-2 pr-4 font-medium text-muted-foreground">邮箱</th>
              <th className="text-left py-2 pr-4 font-medium text-muted-foreground">昵称</th>
              <th className="text-left py-2 pr-4 font-medium text-muted-foreground">角色</th>
              <th className="text-left py-2 pr-4 font-medium text-muted-foreground">注册时间</th>
              <th className="text-right py-2 font-medium text-muted-foreground">操作</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const isAdmin = u.roles.includes("admin");
              return (
                <tr key={u.id} className="border-b border-border/50 hover:bg-accent/20 transition-colors">
                  <td className="py-3 pr-4 font-medium">{u.username || "—"}</td>
                  <td className="py-3 pr-4 text-muted-foreground">{u.email || "未绑定"}</td>
                  <td className="py-3 pr-4 text-muted-foreground">{u.name || "-"}</td>
                  <td className="py-3 pr-4">
                    <div className="flex flex-wrap gap-1">
                      {u.roles.map((role) => (
                        <Badge
                          key={role}
                          variant={role === "admin" ? "default" : "outline"}
                          className="text-[11px]"
                        >
                          {role === "admin" ? "管理员" : role}
                        </Badge>
                      ))}
                    </div>
                  </td>
                  <td className="py-3 pr-4 text-muted-foreground/60 whitespace-nowrap">
                    {formatDate(u.createdAt)}
                  </td>
                  <td className="py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleResetPassword(u)}
                        disabled={actionLoading === u.id}
                        className="text-xs"
                        title="重置密码"
                      >
                        {actionLoading === u.id ? (
                          <Loader2 className="size-3 animate-spin mr-1" />
                        ) : (
                          <KeyRound className="size-3 mr-1" />
                        )}
                        重置密码
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleToggleAdmin(u.id, isAdmin)}
                        disabled={actionLoading === u.id}
                        className="text-xs"
                      >
                        {actionLoading === u.id ? (
                          <Loader2 className="size-3 animate-spin mr-1" />
                        ) : (
                          <Shield className="size-3 mr-1" />
                        )}
                        {isAdmin ? "取消管理" : "设为管理员"}
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ── Proposals Tab ──

function ProposalsTab() {
  const [proposals, setProposals] = useState<ProposalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchProposals = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/wiki/proposals?limit=100");
      if (!res.ok) throw new Error("加载失败");
      const data = await res.json();
      setProposals(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchProposals(); }, [fetchProposals]);

  const handleApprove = async (id: string) => {
    setActionLoading(id);
    try {
      const res = await fetch(`/api/admin/proposals/${id}/approve`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "操作失败");
      }
      setProposals((prev) =>
        prev.map((p) => (p.id === id ? { ...p, status: "approved" } : p)),
      );
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (id: string) => {
    setActionLoading(id);
    try {
      const res = await fetch(`/api/admin/proposals/${id}/reject`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "操作失败");
      }
      setProposals((prev) =>
        prev.map((p) => (p.id === id ? { ...p, status: "rejected" } : p)),
      );
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="size-6 animate-spin text-muted-foreground/40" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-destructive">
        <AlertCircle className="size-4" />
        {error}
      </div>
    );
  }

  const pendingProposals = proposals.filter((p) => p.status === "pending");
  const otherProposals = proposals.filter((p) => p.status !== "pending");

  return (
    <div className="space-y-6">
      {/* Pending proposals */}
      {pendingProposals.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-3">
            待处理 ({pendingProposals.length})
          </h3>
          <div className="space-y-2">
            {pendingProposals.map((p) => (
              <div
                key={p.id}
                className="flex items-start justify-between rounded-lg border border-border p-4"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{p.name}</span>
                    <Badge variant="outline" className="text-[10px]">
                      pending
                    </Badge>
                  </div>
                  {p.sourceContext && (
                    <p className="text-xs text-muted-foreground/60 mt-1 line-clamp-2">
                      {p.sourceContext}
                    </p>
                  )}
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground/50">
                    {p.user && <span>来自: {p.user.name || p.user.email}</span>}
                    {p.article && (
                      <span>
                        文章:{" "}
                        <Link
                          href={`/${p.article.language}/articles/${p.article.slug}`}
                          className="text-primary hover:underline"
                          target="_blank"
                        >
                          {p.article.title}
                        </Link>
                      </span>
                    )}
                    <span>{formatDate(p.createdAt)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 ml-4 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 text-green-600 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-950"
                    onClick={() => handleApprove(p.id)}
                    disabled={actionLoading === p.id}
                    title="同意"
                  >
                    {actionLoading === p.id ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Check className="size-4" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 text-destructive hover:text-destructive"
                    onClick={() => handleReject(p.id)}
                    disabled={actionLoading === p.id}
                    title="驳回"
                  >
                    <X className="size-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Other proposals (approved/rejected) */}
      {otherProposals.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-3">
            已处理 ({otherProposals.length})
          </h3>
          <div className="space-y-2">
            {otherProposals.map((p) => (
              <div
                key={p.id}
                className="flex items-start justify-between rounded-lg border border-border/50 p-3 opacity-60"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{p.name}</span>
                    <Badge
                      variant={p.status === "approved" ? "default" : "outline"}
                      className="text-[10px]"
                    >
                      {p.status === "approved" ? "已同意" : "已驳回"}
                    </Badge>
                  </div>
                  {p.user && (
                    <p className="text-xs text-muted-foreground/50 mt-0.5">
                      来自: {p.user.name || p.user.email} · {formatDate(p.createdAt)}
                    </p>
                  )}
                  {p.status === "approved" && (
                    <Link
                      href="/admin/wiki?status=pending"
                      className="text-xs text-primary hover:underline mt-1 inline-block"
                    >
                      查看候选词条 →
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {proposals.length === 0 && (
        <p className="text-sm text-muted-foreground/60 py-8">暂无词条申请</p>
      )}
    </div>
  );
}
