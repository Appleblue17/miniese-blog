import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import { readFileSync } from "fs";
import path from "path";
import "./globals.css";

import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { Navbar } from "@/components/layout/Navbar";
import { ActionBar } from "@/components/layout/ActionBar";
import { Footer } from "@/components/layout/Footer";
import { SettingsApplier } from "@/components/layout/SettingsApplier";

const featherSprite = (() => {
  try {
    return readFileSync(path.join(process.cwd(), "public", "icon", "feather-sprite.svg"), "utf-8");
  } catch {
    return "";
  }
})();

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.SITE_URL || "http://localhost:3000"),
  title: {
    default: process.env.SITE_NAME || "Miniese's Blog",
    template: `%s | ${process.env.SITE_NAME || "Miniese's Blog"}`,
  },
  description:
    "A personal blog and knowledge base built with Next.js, featuring AI-powered content assistance.",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-192x192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  manifest: "/manifest.json",
  openGraph: {
    title: "Miniese's Blog",
    description: "个人博客与知识库，AI 驱动的写作助手",
    type: "website",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Miniese's Blog",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    images: ["/og-image.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh"
      suppressHydrationWarning
      data-theme="light"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/* KaTeX styles for math rendering */}
        <link rel="stylesheet" href="/styles/katex.min.css" />

        {/* Notesaw block styles */}
        <link rel="stylesheet" href="/styles/note.css" />

        {/* GitHub Markdown theme styles */}
        <link rel="stylesheet" href="/styles/github-markdown.css" />
      </head>
      <body className="min-h-full bg-background text-foreground">
        {/* Prevent FOUC: set dark class and data-theme before React hydrates */}
        <Script
          id="theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var theme = localStorage.getItem('theme');
                  var isDark = theme === 'dark' || (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches);
                  if (isDark) {
                    document.documentElement.classList.add('dark');
                    document.documentElement.setAttribute('data-theme', 'dark');
                  } else {
                    document.documentElement.classList.remove('dark');
                    document.documentElement.setAttribute('data-theme', 'light');
                  }
                } catch(e) {}
              })();
            `,
          }}
        />

        {/* Feather SVG sprite for Notesaw icons (hidden, referenced by <use href="#icon-name"/>) */}
        <div style={{ display: "none" }} dangerouslySetInnerHTML={{ __html: featherSprite }} />

        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <SettingsApplier />
          <Navbar />
          <ActionBar />
          <div className="xl:pl-56 flex flex-col min-h-full">
            <main className="flex-1">{children}</main>
            <Footer />
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
