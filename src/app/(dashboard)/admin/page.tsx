/**
 * @file /admin - Admin dashboard homepage.
 *
 * Shows links to management pages like article publishing.
 */

import Link from "next/link";
import { FileText, PlusCircle, BookOpen, Settings } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "仪表盘 | Miniese's Blog",
};

export default function AdminDashboardPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-bold tracking-tight mb-8">仪表盘</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Link
          href="/admin/articles/new"
          className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card p-8 text-center transition-colors hover:bg-muted"
        >
          <PlusCircle className="size-10 text-primary" />
          <div>
            <h2 className="font-medium text-lg">发布文章</h2>
            <p className="text-sm text-muted-foreground mt-1">
              上传 Markdown 文件并发布为文章
            </p>
          </div>
        </Link>

        <Link
          href="/admin/articles"
          className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card p-8 text-center transition-colors hover:bg-muted"
        >
          <FileText className="size-10 text-primary" />
          <div>
            <h2 className="font-medium text-lg">文章管理</h2>
            <p className="text-sm text-muted-foreground mt-1">
              查看文章列表、编辑或删除
            </p>
          </div>
        </Link>

        <Link
          href="/admin/wiki"
          className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card p-8 text-center transition-colors hover:bg-muted"
        >
          <BookOpen className="size-10 text-primary" />
          <div>
            <h2 className="font-medium text-lg">知识库管理</h2>
            <p className="text-sm text-muted-foreground mt-1">
              管理 Wiki 词条和术语
            </p>
          </div>
        </Link>

        <Link
          href="/admin/settings"
          className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card p-8 text-center transition-colors hover:bg-muted"
        >
          <Settings className="size-10 text-primary" />
          <div>
            <h2 className="font-medium text-lg">站点设置</h2>
            <p className="text-sm text-muted-foreground mt-1">
              配置站点名称、主题色等
            </p>
          </div>
        </Link>
      </div>
    </div>
  );
}
