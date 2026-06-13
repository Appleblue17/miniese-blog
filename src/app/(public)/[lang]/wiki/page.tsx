/**
 * @file /{lang}/wiki - Wiki entry list page.
 *
 * Displays paginated list of wiki entries for the given language.
 * Uses the same layout patterns as the article list page.
 */

import { WikiList } from "@/components/wiki/WikiList";
import type { Metadata } from "next";

interface Props {
  params: Promise<{ lang: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang } = await params;
  return {
    title: lang === "zh" ? "知识库" : "Wiki",
    description: lang === "zh" ? "浏览所有知识库词条" : "Browse all wiki entries",
  };
}

export default async function WikiListPage({ params }: Props) {
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
      <WikiList lang={lang} />
    </div>
  );
}
