/**
 * @file /{lang} - Homepage.
 *
 * Full-screen Hero section (first screen) + content area (second screen)
 * with three columns: recent articles, popular articles, and activity timeline.
 */

import type { Metadata } from "next";
import { getSettings } from "../../../../config/settings";
import { HeroSection } from "@/components/home/HeroSection";
import { LatestArticles } from "@/components/home/LatestArticles";
import { PopularArticles } from "@/components/home/PopularArticles";
import { ActivityTimeline } from "@/components/home/ActivityTimeline";

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
  const settings = await getSettings();
  const hp = settings.site.homepage;

  return (
    <>
      {/* First screen: full-screen Hero */}
      <HeroSection lang={lang} />

      {/* Second screen: content showcase */}
      <section className="relative z-10 mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20 lg:py-24">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 lg:gap-10">
            <LatestArticles lang={lang} count={hp.latestCount} />
            <PopularArticles lang={lang} count={hp.popularCount} />
            <ActivityTimeline lang={lang} count={hp.timelineCount} />
          </div>
        </div>
      </section>
    </>
  );
}
