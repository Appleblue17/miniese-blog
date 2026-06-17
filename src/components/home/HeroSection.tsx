/**
 * @file HeroSection — Full-screen hero area for the homepage.
 *
 * Displays a background image (light/dark variant), title, rotating subtitle,
 * entry cards, and a scroll indicator. Fetches settings to customize copy
 * and image paths.
 */

import Link from "next/link";
import { FileText, BookOpen, Sparkles } from "lucide-react";
import { getSettings } from "../../../config/settings";
import { HeroCarousel } from "./HeroCarousel";
import { ScrollIndicator } from "./ScrollIndicator";

interface HeroSectionProps {
  lang: string;
}

export async function HeroSection({ lang }: HeroSectionProps) {
  const settings = await getSettings();
  const { heroTitle, heroSubtitles, heroSubtitlesEn, heroSubtitleMode, heroSubtitleIntervalMs, heroImageLight, heroImageDark } = settings.site;
  const subtitles = lang === "en" && heroSubtitlesEn?.length ? heroSubtitlesEn : heroSubtitles;

  return (
    <section className="relative h-screen w-full overflow-hidden flex items-center">
      {/* Light mode background */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={heroImageLight || "/images/miniese/hero/hero-light.png"}
        alt=""
        className="absolute inset-0 w-full h-full object-cover block dark:hidden"
        aria-hidden="true"
      />
      {/* Dark mode background */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={heroImageDark || "/images/miniese/hero/hero-dark.png"}
        alt=""
        className="absolute inset-0 w-full h-full object-cover hidden dark:block"
        aria-hidden="true"
      />

      {/* Overlay gradient for readability */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(to right, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.3) 50%, rgba(0,0,0,0.1) 100%)",
        }}
      />

      {/* Content layer */}
      <div className="relative z-10 mx-auto px-6 sm:px-10 lg:px-16 w-full max-w-7xl">
        <div className="max-w-2xl">
          <h1
            className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight text-white mb-4"
            style={{ textShadow: "0 2px 20px rgba(0,0,0,0.4)" }}
          >
            {heroTitle}
          </h1>

          <div className="min-h-[3rem] sm:min-h-[3.5rem] mb-10">
            <HeroCarousel
              subtitles={subtitles || []}
              mode={heroSubtitleMode || "sequential"}
              interval={heroSubtitleIntervalMs || 5000}
            />
          </div>

          {/* Entry cards */}
          <div className="flex flex-wrap gap-4">
            <HeroCard
              href={`/${lang}/articles`}
              icon={<FileText className="size-6" />}
              label={lang === "zh" ? "文章" : "Articles"}
              description={
                lang === "zh" ? "浏览所有已发布的文章" : "Browse published articles"
              }
            />
            <HeroCard
              href={`/${lang}/wiki`}
              icon={<BookOpen className="size-6" />}
              label={lang === "zh" ? "知识库" : "Wiki"}
              description={
                lang === "zh" ? "查阅术语和概念" : "Browse terms and concepts"
              }
            />
            <HeroCard
              href={`/${lang}/about`}
              icon={<Sparkles className="size-6" />}
              label={lang === "zh" ? "关于" : "About"}
              description={lang === "zh" ? "了解这个项目" : "Learn about this project"}
            />
          </div>
        </div>
      </div>

      <ScrollIndicator />
    </section>
  );
}

/** Internal card component for Hero entry links */
function HeroCard({
  href,
  icon,
  label,
  description,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-xl border border-white/20 bg-white/10 backdrop-blur-md px-5 py-3 text-white transition-all hover:bg-white/20 hover:scale-105"
    >
      {icon}
      <div>
        <div className="font-medium text-sm sm:text-base">{label}</div>
        <div className="text-xs text-white/70">{description}</div>
      </div>
    </Link>
  );
}
