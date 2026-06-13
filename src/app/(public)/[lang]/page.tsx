/**
 * @file /{lang} - Homepage.
 *
 * Displays a welcome message, recent articles, and site overview.
 */

import Link from "next/link";
import { FileText, BookOpen, Sparkles } from "lucide-react";
import type { Metadata } from "next";

interface Props {
  params: Promise<{ lang: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang } = await params;
  return {
    title: lang === "zh" ? "Miniese's Blog" : "Miniese's Blog",
    description:
      lang === "zh"
        ? "个人博客与知识库，AI 驱动的写作助手"
        : "A personal blog and knowledge base with AI-powered content assistance",
  };
}

export default async function HomePage({ params }: Props) {
  const { lang } = await params;

  return (
    <div className="mx-auto px-4 py-12" style={{ maxWidth: "var(--body-width, 48rem)" }}>
      {/* Hero */}
      <section className="mb-12">
        <h1 className="text-4xl font-bold tracking-tight">
          {lang === "zh" ? "Miniese's Blog" : "Miniese's Blog"}
        </h1>
        <p className="mt-3 text-lg text-muted-foreground">
          {lang === "zh"
            ? "个人博客与知识库，AI 驱动的写作助手"
            : "A personal blog and knowledge base with AI-powered content assistance"}
        </p>
      </section>

      {/* Quick links */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Link
          href={`/${lang}/articles`}
          className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card p-6 text-center transition-colors hover:bg-muted"
        >
          <FileText className="size-8 text-primary" />
          <div>
            <h2 className="font-medium">{lang === "zh" ? "文章" : "Articles"}</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {lang === "zh" ? "浏览所有已发布的文章" : "Browse published articles"}
            </p>
          </div>
        </Link>

        <Link
          href={`/${lang}/wiki`}
          className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card p-6 text-center transition-colors hover:bg-muted"
        >
          <BookOpen className="size-8 text-primary" />
          <div>
            <h2 className="font-medium">{lang === "zh" ? "知识库" : "Wiki"}</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {lang === "zh" ? "查阅术语和概念" : "Browse terms and concepts"}
            </p>
          </div>
        </Link>

        <Link
          href={`/${lang}/about`}
          className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card p-6 text-center transition-colors hover:bg-muted"
        >
          <Sparkles className="size-8 text-primary" />
          <div>
            <h2 className="font-medium">{lang === "zh" ? "关于" : "About"}</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {lang === "zh" ? "了解这个项目" : "Learn about this project"}
            </p>
          </div>
        </Link>
      </section>
    </div>
  );
}
