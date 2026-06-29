/**
 * @file /admin - Admin dashboard homepage.
 *
 * Shows links to management pages like article publishing,
 * with notification badge indicating unread count.
 */

import Link from "next/link";
import { FileText, PlusCircle, Library, Settings, Bot, MessageSquare, Bell, Images } from "lucide-react";
import type { Metadata } from "next";
import { prisma } from "@/lib/db";

export const metadata: Metadata = {
  title: "仪表盘 | Miniese's Blog",
};

export default async function AdminDashboardPage() {
  // Fetch unread notification count on the server
  let unreadCount = 0;
  try {
    unreadCount = await prisma.notification.count({ where: { isRead: false } });
  } catch {
    // DB not available — silently fall back to 0
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-bold tracking-tight mb-8">仪表盘</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Link
          href="/admin/articles/new"
          className="card-base flex flex-col items-center gap-3 rounded-xl border border-border bg-card p-8 text-center hover:bg-muted"
        >
          <PlusCircle className="size-10 text-primary" />
          <div>
            <h2 className="font-medium text-lg">发布文章</h2>
            <p className="text-sm text-muted-foreground mt-1">上传 Markdown 文件并发布为文章</p>
          </div>
        </Link>

        <Link
          href="/admin/articles"
          className="card-base flex flex-col items-center gap-3 rounded-xl border border-border bg-card p-8 text-center hover:bg-muted"
        >
          <FileText className="size-10 text-primary" />
          <div>
            <h2 className="font-medium text-lg">文章管理</h2>
            <p className="text-sm text-muted-foreground mt-1">查看文章列表、编辑或删除</p>
          </div>
        </Link>

        <Link
          href="/admin/ai-tasks"
          className="card-base flex flex-col items-center gap-3 rounded-xl border border-border bg-card p-8 text-center hover:bg-muted"
        >
          <Bot className="size-10 text-primary" />
          <div>
            <h2 className="font-medium text-lg">助手任务</h2>
            <p className="text-sm text-muted-foreground mt-1">
              查看 AI 审查、翻译和词条生成任务记录
            </p>
          </div>
        </Link>

        <Link
          href="/admin/wiki"
          className="card-base flex flex-col items-center gap-3 rounded-xl border border-border bg-card p-8 text-center hover:bg-muted"
        >
          <Library className="size-10 text-primary" />
          <div>
            <h2 className="font-medium text-lg">知识库管理</h2>
            <p className="text-sm text-muted-foreground mt-1">管理 Wiki 词条和术语</p>
          </div>
        </Link>

        <Link
          href="/admin/interactions"
          className="card-base flex flex-col items-center gap-3 rounded-xl border border-border bg-card p-8 text-center hover:bg-muted"
        >
          <MessageSquare className="size-10 text-primary" />
          <div>
            <h2 className="font-medium text-lg">交互管理</h2>
            <p className="text-sm text-muted-foreground mt-1">管理评论、用户和词条申请</p>
          </div>
        </Link>

        <Link
          href="/admin/notifications"
          className="relative card-base flex flex-col items-center gap-3 rounded-xl border border-border bg-card p-8 text-center transition-colors hover:bg-muted"
        >
          <div className="relative">
            <Bell className="size-10 text-primary" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 flex size-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </div>
          <div>
            <h2 className="font-medium text-lg">通知中心</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {unreadCount > 0
                ? `${unreadCount} 条未读通知`
                : "查看系统通知和任务状态"}
            </p>
          </div>
        </Link>

        <Link
          href="/admin/media"
          className="card-base flex flex-col items-center gap-3 rounded-xl border border-border bg-card p-8 text-center hover:bg-muted"
        >
          <Images className="size-10 text-primary" />
          <div>
            <h2 className="font-medium text-lg">媒体库</h2>
            <p className="text-sm text-muted-foreground mt-1">管理上传的图片和文件</p>
          </div>
        </Link>

        <Link
          href="/admin/settings"
          className="card-base flex flex-col items-center gap-3 rounded-xl border border-border bg-card p-8 text-center hover:bg-muted"
        >
          <Settings className="size-10 text-primary" />
          <div>
            <h2 className="font-medium text-lg">站点设置</h2>
            <p className="text-sm text-muted-foreground mt-1">配置站点名称、主题色等</p>
          </div>
        </Link>
      </div>
    </div>
  );
}
