/**
 * @file /{lang}/about - About page.
 *
 * Displays project introduction, Miniese character, tech stack, and AIGC disclaimer.
 * Desktop: right image (Miniese full-body) + left text.
 * Mobile: image collapses to top.
 */

import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { FiGithub } from "react-icons/fi";

interface Props {
  params: Promise<{ lang: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang } = await params;
  return {
    title: lang === "zh" ? "关于" : "About",
    description:
      lang === "zh"
        ? "了解 Miniese's Blog 的背景、定位与技术栈"
        : "Learn about Miniese's Blog — its background, vision, and tech stack",
  };
}

/* ── Types ──────────────────────────────────────────────────────────────── */

interface TechStackGroup {
  label: string;
  sublabel?: string;
  items: string[];
}

interface AboutContent {
  title: string;
  body: string[];
  bodyWithLink: true;
  techStackGroups: TechStackGroup[];
  aigcDisclaimer: string;
}

/* ── Content ───────────────────────────────────────────────────────────── */

const zhContent: AboutContent = {
  title: "关于本博客",
  body: [
    "本博客是一个实验性的项目，始于一个简单的想法：把散落在本地文件夹里的知识碎片，变成一张相互连接的网。让它们不再是孤立的文档，而是相互关联、可以检索、可以对话的有机体。",
    "与传统博客的止于「单向发布」不同，这里更像一个活的个人文库。每篇文章不仅是静态的记录，还会被 Miniese（本博客的 AI 助手）自动审查、翻译，创建与填充词条，并与知识库中的词条相互链接。当一篇文章提到某个概念时，读者可以悬停查看定义，或点击跳转到完整的词条页面，于是零散的知识点串联成可检索、可关联的知识库。",
    "这个项目的核心探索，是让 LLM 真正融入博客的生态——无论是作为开发辅助工具，还是成为博客内容管理、知识组织和读者交互的一部分，甚至未来可能成为独立的博文创作者。",
    "本项目为开源项目，欢迎访问 GitHub 仓库 了解更多和参与贡献。如果你感兴趣，也欢迎部署自己的 Miniese's Blog，或者在现有的基础上进行二次开发。",
  ],
  bodyWithLink: true,
  techStackGroups: [
    {
      label: "前端",
      items: ["Next.js", "TypeScript", "Tailwind CSS", "Lucide"],
    },
    {
      label: "后端与数据",
      items: ["PostgreSQL", "Redis", "Prisma", "Bull"],
    },
    {
      label: "其他",
      sublabel: "AI 集成 · 邮件通知",
      items: ["DeepSeek API", "Resend"],
    },
  ],
  aigcDisclaimer:
    "本站部分内容由 AI 辅助生成，所有 AI 生成内容均已明确标注。AI 助手形象「Miniese」由 AI 生成，仅供本项目和本人非商业使用。",
};

const enContent: AboutContent = {
  title: "About This Blog",
  body: [
    "This blog is an experimental project that began with a simple idea: turning scattered knowledge fragments in local folders into an interconnected web. Instead of isolated documents, they become an organic, cross-referenced, searchable, and conversational body of knowledge.",
    "Unlike traditional blogs that stop at one-way publishing, this is more like a living personal library. Every article is not just a static record — it is automatically reviewed, translated, and enriched by Miniese (the AI assistant of this blog), which creates and populates wiki entries and links them to the knowledge base. When an article mentions a concept, readers can hover to see its definition or click through to the full wiki entry, connecting scattered pieces of knowledge into a searchable, linked knowledge base.",
    "The core exploration of this project is to truly integrate LLMs into the blog ecosystem — whether as a development aid, as part of content management, knowledge organization, and reader interaction, or even potentially as an independent blog content creator in the future.",
    "This project is open source. Feel free to visit the GitHub repository to learn more or contribute. If you are interested, you are welcome to deploy your own Miniese's Blog or build upon it.",
  ],
  bodyWithLink: true,
  techStackGroups: [
    {
      label: "Frontend",
      items: ["Next.js", "TypeScript", "Tailwind CSS", "Lucide"],
    },
    {
      label: "Backend & Data",
      items: ["PostgreSQL", "Redis", "Prisma", "Bull"],
    },
    {
      label: "Other",
      sublabel: "AI Integration · Email Notifications",
      items: ["DeepSeek API", "Resend"],
    },
  ],
  aigcDisclaimer:
    'Some content on this site is AI-assisted. All AI-generated content is clearly marked. The AI assistant character "Miniese" is AI-generated and used solely for this project and personal non-commercial purposes.',
};

/* ── Page Component ────────────────────────────────────────────────────── */

export default async function AboutPage({ params }: Props) {
  const { lang } = await params;

  // Validate language
  if (lang !== "zh" && lang !== "en") {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
        <h1 className="text-2xl font-bold">404</h1>
        <p className="mt-2">Page not found</p>
      </div>
    );
  }

  const content = lang === "zh" ? zhContent : enContent;

  return (
    <div className="mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 lg:py-16">
      <div className="relative mx-auto" style={{ maxWidth: "var(--body-width, 48rem)" }}>
        {/* Glass background overlay for readability against fixed background image */}
        <div
          className="absolute inset-0 -z-10 rounded-2xl"
          style={{
            backgroundColor: `color-mix(in srgb, var(--background) 70%, transparent)`,
          }}
        />
        <div className="px-6 sm:px-8 lg:px-10 py-8 sm:py-10">
          {/* ── Title Row ──────────────────────────────────────────────── */}
          <div className="flex items-center gap-3 mb-8 sm:mb-10">
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
              {content.title}
            </h1>
            <Link
              href="https://github.com/Appleblue17/miniese-blog"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-foreground/70 hover:text-foreground transition-colors border-2 border-foreground/20 hover:border-foreground/40 rounded-full px-3 py-1"
            >
              <FiGithub className="size-4" />
              GitHub
            </Link>
          </div>

          {/* ── Main Content: Image + Text ─────────────────────────────── */}
          <div className="flex flex-col-reverse md:flex-row md:gap-8 lg:gap-12">
            {/* Left: Text */}
            <div className="flex-1 space-y-5 text-base sm:text-lg leading-relaxed">
              {content.body.map((paragraph, i) => {
                // The last paragraph has a GitHub link embedded
                if (content.bodyWithLink && i === content.body.length - 1) {
                  // Split at "GitHub 仓库" or "GitHub repository"
                  const parts =
                    lang === "zh"
                      ? paragraph.split("GitHub 仓库")
                      : paragraph.split("GitHub repository");

                  if (parts.length === 2) {
                    return (
                      <p key={i}>
                        {parts[0]}
                        <Link
                          href="https://github.com/Appleblue17/miniese-blog"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary-hsl underline underline-offset-2 hover:opacity-80 transition-opacity"
                        >
                          {lang === "zh" ? "GitHub 仓库" : "GitHub repository"}
                        </Link>
                        {parts[1]}
                      </p>
                    );
                  }
                }
                return <p key={i}>{paragraph}</p>;
              })}
            </div>

            {/* Right: Miniese full-body illustration */}
            <div className="w-full md:w-[35%] lg:w-[40%] shrink-0 mb-6 md:mb-0 flex justify-center">
              <Image
                src="/images/miniese/inset/about.png"
                alt="Miniese"
                width={768}
                height={1024}
                priority
                className="w-full max-w-[280px] sm:max-w-[320px] md:max-w-full h-auto object-contain"
                style={{
                  filter: "drop-shadow(0 8px 24px rgba(0,0,0,0.12))",
                }}
              />
            </div>
          </div>

          {/* ── Divider ────────────────────────────────────────────────── */}
          <hr className="my-12 border-border" />

          {/* ── Tech Stack ─────────────────────────────────────────────── */}
          <section className="mb-12">
            <h2 className="text-xl sm:text-2xl font-semibold mb-6 tracking-tight">
              {lang === "zh" ? "技术栈" : "Tech Stack"}
            </h2>
            <div className="space-y-6">
              {content.techStackGroups.map((group) => (
                <div key={group.label}>
                  <div className="flex items-baseline gap-2 mb-3">
                    <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                      {group.label}
                    </h3>
                    {group.sublabel && (
                      <span className="text-xs text-muted-foreground">
                        {group.sublabel}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {group.items.map((name) => (
                      <span
                        key={name}
                        className="inline-flex items-center px-3 py-1.5 rounded-lg border text-sm font-medium bg-muted"
                      >
                        {name}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* ── AIGC Disclaimer ────────────────────────────────────────── */}
          <div className="border-t border-border pt-6 pb-2 space-y-2">
            <p className="text-sm text-muted-foreground leading-relaxed">
              {content.aigcDisclaimer}
            </p>
            <p className="text-xs text-muted-foreground/60 leading-relaxed">
              {lang === "zh" ? (
                <>AI 助手形象插图基于以下模型生成：{" "}
                  <Link
                    href="https://civitai.com/models/934764/miaomiao-harem"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline underline-offset-2 hover:text-foreground transition-colors"
                  >
                    MiaoMiao Harem v1.3
                  </Link>
                </>
              ) : (
                <>The AI assistant image is generated by:{" "}
                  <Link
                    href="https://civitai.com/models/934764/miaomiao-harem"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline underline-offset-2 hover:text-foreground transition-colors"
                  >
                    MiaoMiao Harem v1.3
                  </Link>
                </>
              )}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
