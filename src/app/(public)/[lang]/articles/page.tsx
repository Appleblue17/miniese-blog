/**
 * @file /{lang}/articles - Article list page.
 *
 * Displays paginated list of published articles for the given language.
 */

import { ArticleList } from "@/components/article/ArticleList";
import type { Metadata } from "next";

interface Props {
  params: Promise<{ lang: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang } = await params;
  return {
    title: lang === "zh" ? "文章" : "Articles",
    description: lang === "zh" ? "浏览所有已发布的文章" : "Browse all published articles",
  };
}

export default async function ArticlesPage({ params }: Props) {
  const { lang } = await params;

  // Validate language
  if (lang !== "zh" && lang !== "en") {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
        <h1 className="text-2xl font-bold">404</h1>
        <p className="mt-2">{lang === "zh" ? "页面未找到" : "Page not found"}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto px-4 py-8" style={{ maxWidth: "var(--body-width, 48rem)" }}>
      <ArticleList lang={lang} />
    </div>
  );
}
