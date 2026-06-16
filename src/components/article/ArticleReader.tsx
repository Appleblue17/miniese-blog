/**
 * @file ArticleReader - Displays a published article with metadata header, rendered HTML content,
 * TOC sidebar, and footer area (copyright, changelog, comments placeholder).
 *
 * Also includes AI chat button, text selection toolbar, and chat drawer.
 */

"use client";

import { useCallback, useState, useEffect, useRef } from "react";
import {
  Calendar,
  Clock,
  User,
  Tag,
  GitCommit,
  Copyright,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { TableOfContents } from "@/components/article/TableOfContents";
import { WikiPreview } from "@/components/wiki/WikiPreview";
import { CommentSection } from "@/components/article/CommentSection";
import { ChatButton } from "@/components/ai/ChatButton";
import { ChatDrawer } from "@/components/ai/ChatDrawer";
import { TextSelectionToolbar } from "@/components/ai/TextSelectionToolbar";
import { Lightbox } from "@/components/ui/Lightbox";
import type { SelectionInfo } from "@/types/ai";

interface ArticleReaderProps {
  articleId: string;
  title: string;
  author: string;
  publishedAt: string | null;
  updatedAt: string;
  tags: string[];
  summary: string | null;
  html: string;
  viewCount: number;
  likes: number;
  lang: string;
  changelog?: string | null;
  isAITranslated?: boolean;
}

/**
 * Formats a date string to a human-readable format.
 */
function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * Estimates reading time based on text content length.
 */
function estimateReadingTime(html: string, lang: string): string {
  const text = html.replace(/<[^>]*>/g, "");
  const charCount = text.length;
  const minutes = Math.max(1, Math.round(charCount / 500));
  return lang === "zh" ? `${minutes} 分钟阅读` : `${minutes} min read`;
}

export function ArticleReader({
  articleId,
  title,
  author,
  publishedAt,
  updatedAt,
  tags,
  summary,
  html,
  viewCount,
  likes,
  lang,
  changelog,
  isAITranslated,
}: ArticleReaderProps) {
  const [chatOpen, setChatOpen] = useState(false);
  const [chatSelection, setChatSelection] = useState<SelectionInfo | undefined>(undefined);

  // Lightbox state
  const [lightboxImage, setLightboxImage] = useState<{
    src: string;
    alt: string;
    images: { src: string; alt: string }[];
    index: number;
  } | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const langRef = useRef(lang);
  const [captionIgnoreList, setCaptionIgnoreList] = useState<string[]>([]);
  // Keep langRef in sync with the latest lang prop
  langRef.current = lang;

  // Load caption ignore list from settings
  useEffect(() => {
    fetch("/api/admin/settings")
      .then((r) => r.json())
      .then((data) => {
        const list = data?.appearance?.image?.captionIgnoreList;
        if (Array.isArray(list)) setCaptionIgnoreList(list);
      })
      .catch(() => {});
  }, []);

  // When lang changes, re-process failed images to update placeholder text
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    // Only run on lang changes (skip initial mount — error handlers handle that)
    // Find all existing image error placeholders and update their text
    const currentLang = langRef.current;
    const placeholders = el.querySelectorAll<HTMLElement>(
      '[data-img-error-placeholder="true"]',
    );

    for (const ph of placeholders) {
      const errorType = ph.getAttribute("data-error-type") as
        | "not_found"
        | "forbidden"
        | "unknown"
        | null;
      const isLoggedIn = ph.getAttribute("data-user-logged-in") === "true";
      if (!errorType) continue;

      let titleText: string;
      let descHtml = "";

      if (errorType === "not_found") {
        titleText = currentLang === "zh" ? "图片未找到" : "Image not found";
        descHtml = ph.getAttribute("data-alt") || "";
      } else if (errorType === "forbidden") {
        const highlighted = currentLang === "zh" ? "校内" : "school";
        titleText = currentLang === "zh"
          ? `查看本图需要<span class="font-semibold text-amber-600 dark:text-amber-400">${highlighted}</span>权限`
          : `<span class="font-semibold text-amber-600 dark:text-amber-400">${highlighted}</span> access required for this image`;
        if (!isLoggedIn) {
          descHtml = currentLang === "zh"
            ? '请<a href="/login" class="underline underline-offset-2 hover:text-primary/80 font-medium">登录</a>以使用校内账号查看'
            : 'Please <a href="/login" class="underline underline-offset-2 hover:text-primary/80 font-medium">log in</a> with a school account to view';
        } else {
          descHtml = currentLang === "zh"
            ? "此图片需要校内权限"
            : "This image requires school access";
        }
      } else {
        titleText = currentLang === "zh" ? "图片加载失败" : "Image failed to load";
        descHtml = ph.getAttribute("data-alt") || "";
      }

      // Update title paragraph (first <p>)
      const titleP = ph.querySelector("p");
      if (titleP) {
        titleP.innerHTML = titleText;
      }

      // Update desc paragraph — the second <p> if it exists
      const ps = ph.querySelectorAll("p");
      const descP = ps.length > 1 ? ps[1] : null;
      if (descHtml) {
        if (descP) {
          descP.innerHTML = descHtml;
        } else {
          const newDesc = document.createElement("p");
          newDesc.className = "text-xs text-muted-foreground/60 mt-1.5";
          newDesc.innerHTML = descHtml;
          ph.appendChild(newDesc);
        }
      } else {
        if (descP) descP.remove();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  // Fix relative image paths on the client as a fallback
  // (server-side rewrite in /api/articles/[slug] handles the primary case).
  // Uses a MutationObserver to handle images added after the effect runs
  // (e.g. during client-side navigation with React hydration).
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    let observer: MutationObserver | null = null;

    /** Process all <img> elements in the container */
    function processImages() {
      if (!el) return;
      const images = el.querySelectorAll("img");
      for (const img of images) {
        processOneImage(img);
      }
    }

    /** Process a single <img> element: rewrite src, bind error handler */
    function processOneImage(img: HTMLImageElement) {
      // Skip if already processed by this effect
      if (img.getAttribute("data-miniese-processed") === "true") return;
      img.setAttribute("data-miniese-processed", "true");

      const src = img.getAttribute("src");
      if (!src) return;
      // Only rewrite relative paths (no protocol, no leading /, no data URI)
      if (!/^(https?:\/\/|\/|data:)/i.test(src)) {
        img.setAttribute("src", `/api/images/${articleId}/${src}`);
      }

      // Add responsive sizes attribute for better mobile performance
      if (!img.hasAttribute("sizes")) {
        img.setAttribute("sizes", "(max-width: 768px) 100vw, (max-width: 1024px) 60vw, 50vw");
      }
      // Add loading="lazy" if not present
      if (!img.hasAttribute("loading")) {
        img.setAttribute("loading", "lazy");
      }

      // Interactive cursor and dimming on hover
      img.classList.add("lightbox-trigger");

      // Add error handler for image loading failures
      const errorHandler = async function onImgError() {
        img.removeEventListener("error", errorHandler);
        img.style.display = "none";

        // Determine the error type by re-fetching the image with a HEAD request
        let errorType: "not_found" | "forbidden" | "unknown" = "unknown";
        let isLoggedIn = false;
        try {
          const checkRes = await fetch(img.src, { method: "HEAD" });
          if (checkRes.status === 404) {
            errorType = "not_found";
          } else if (checkRes.status === 403) {
            errorType = "forbidden";
          }
        } catch {
          // Fall back to generic message
        }

        // Check login status (independent of HEAD result)
        try {
          const meRes = await fetch("/api/auth/me");
          const meData = await meRes.json();
          isLoggedIn = meData.user !== null && meData.user !== undefined;
        } catch {
          // Fall back — assume not logged in
        }

        // Read current lang from ref (handles language switch)
        const currentLang = langRef.current;
        let titleText: string;
        let descText = "";

        if (errorType === "not_found") {
          titleText = currentLang === "zh" ? "图片未找到" : "Image not found";
          descText = img.getAttribute("alt") || "";
        } else if (errorType === "forbidden") {
          const highlighted = currentLang === "zh" ? "校内" : "school";
          titleText = currentLang === "zh"
            ? `查看本图需要<span class="font-semibold text-amber-600 dark:text-amber-400">${highlighted}</span>权限`
            : `<span class="font-semibold text-amber-600 dark:text-amber-400">${highlighted}</span> access required for this image`;
          if (!isLoggedIn) {
            descText = currentLang === "zh"
              ? '请<a href="/login" class="underline underline-offset-2 hover:text-primary/80 font-medium">登录</a>以使用校内账号查看'
              : 'Please <a href="/login" class="underline underline-offset-2 hover:text-primary/80 font-medium">log in</a> with a school account to view';
          } else {
            descText = currentLang === "zh"
              ? "此图片需要校内权限"
              : "This image requires school access";
          }
        } else {
          titleText = currentLang === "zh" ? "图片加载失败" : "Image failed to load";
          descText = img.getAttribute("alt") || "";
        }

        // Create and insert a placeholder element
        const placeholder = document.createElement("div");
        placeholder.className =
          "flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 p-8 text-center";
        placeholder.setAttribute("data-img-error-placeholder", "true");
        placeholder.setAttribute("data-error-type", errorType);
        placeholder.setAttribute("data-user-logged-in", isLoggedIn ? "true" : "false");
        placeholder.setAttribute("data-alt", img.getAttribute("alt") || "");
        placeholder.innerHTML = `
          <svg class="size-10 mb-3 text-muted-foreground/40" fill="none" viewBox="0 0 24 24" stroke-width="1" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
          </svg>
          <p class="text-sm text-muted-foreground">${titleText}</p>
          ${descText ? `<p class="text-xs text-muted-foreground/60 mt-1.5">${descText}</p>` : ""}
        `;
        img.parentNode?.insertBefore(placeholder, img.nextSibling);
      };

      img.addEventListener("error", errorHandler);

      // If the image has already loaded (or failed) before we bound the
      // handler, check its status now.
      if (img.complete) {
        if (img.naturalWidth === 0) {
          // Already failed — invoke handler immediately
          errorHandler();
        }
        // else: loaded successfully, nothing to do
      }
    }

    // Initial processing
    processImages();

    // Watch for new images added to the container (handles React hydration
    // and client-side navigation where DOM is rebuilt)
    observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const element = node as Element;
            if (element.tagName === "IMG") {
              processOneImage(element as HTMLImageElement);
            } else {
              element.querySelectorAll("img").forEach(processOneImage);
            }
          }
        }
      }
    });

    observer.observe(el, { childList: true, subtree: true });

    return () => {
      if (observer) observer.disconnect();
      // Note: we intentionally do NOT remove event listeners or clear
      // placeholders on cleanup, because in StrictMode the remount will
      // re-process and overwrite. Keeping placeholders avoids flicker.
    };
  }, [html, articleId, lang]);

  // Inject click handlers for images in rendered content
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    const handleImageClick = (e: Event) => {
      const img = e.target as HTMLImageElement;
      if (!img || img.tagName !== "IMG") return;

      // Collect all images in the article for navigation
      const allImages = Array.from(el.querySelectorAll("img"));
      const images = allImages.map((imgEl) => ({
        src: imgEl.getAttribute("src") || "",
        alt: imgEl.getAttribute("alt") || "",
      }));
      const index = images.findIndex((imgInfo) => imgInfo.src === img.getAttribute("src"));
      if (index === -1) return;

      setLightboxImage({
        src: img.getAttribute("src") || "",
        alt: img.getAttribute("alt") || "",
        images,
        index,
      });
    };

    el.addEventListener("click", handleImageClick);
    return () => el.removeEventListener("click", handleImageClick);
  }, [html]);

  const handleLightboxClose = useCallback(() => {
    setLightboxImage(null);
  }, []);

  const handleLightboxPrev = useCallback(() => {
    setLightboxImage((prev) => {
      if (!prev) return null;
      const newIndex = prev.index - 1;
      if (newIndex < 0) return prev;
      return { ...prev, src: prev.images[newIndex].src, alt: prev.images[newIndex].alt, index: newIndex };
    });
  }, []);

  const handleLightboxNext = useCallback(() => {
    setLightboxImage((prev) => {
      if (!prev) return null;
      const newIndex = prev.index + 1;
      if (newIndex >= prev.images.length) return prev;
      return { ...prev, src: prev.images[newIndex].src, alt: prev.images[newIndex].alt, index: newIndex };
    });
  }, []);

  /**
   * Given a text node within the article, compute the heading path
   * (e.g., "Introduction > Getting Started > Installation").
   */
  const getHeadingPath = useCallback(
    (node: Node | null): string => {
      if (!node) return "";
      const article = (node as Element).closest?.("article");
      if (!article) return "";

      const path: string[] = [];
      let current: Element | null = (node as Element).parentElement;

      while (current && current !== article) {
        const tag = current.tagName?.toLowerCase();
        if (tag === "h1" || tag === "h2" || tag === "h3") {
          path.unshift(current.textContent?.trim() || "");
        }
        current = current.parentElement;
      }

      // If no direct heading ancestor found, scan headings from top to determine
      // which section the text falls under
      if (path.length === 0) {
        const allHeadings = article.querySelectorAll("h1, h2, h3");
        const lastPath: string[] = [];
        const parentEl = (node as Element).parentElement;
        const nodeTop = parentEl?.offsetTop ?? 0;

        for (const h of allHeadings) {
          if ((h as HTMLElement).offsetTop <= nodeTop) {
            const level = parseInt(h.tagName[1], 10);
            while (lastPath.length >= level) lastPath.pop();
            lastPath.push(h.textContent?.trim() || "");
          } else {
            break;
          }
        }
        return lastPath.join(" > ");
      }

      return path.join(" > ");
    },
    [],
  );

  /**
   * Get surrounding context: up to 2 paragraphs before and after the selection range.
   */
  const getSurroundingContext = useCallback((range: Range): string => {
    const parts: string[] = [];
    const seen = new Set<Node>();

    // Walk backwards to get previous siblings/ancestors
    let node: Node | null = range.startContainer;
    let count = 0;
    while (node && count < 2) {
      if (
        node.nodeType === Node.ELEMENT_NODE &&
        (node as Element).tagName?.toLowerCase() === "p"
      ) {
        const text = (node as Element).textContent?.trim();
        if (text && !seen.has(node)) {
          parts.unshift(text);
          seen.add(node);
          count++;
        }
      }
      node = node.previousSibling || node.parentElement;
    }

    // The selected text itself
    parts.push(range.toString().trim());

    // Walk forward
    node = range.endContainer;
    count = 0;
    while (node && count < 2) {
      if (
        node.nodeType === Node.ELEMENT_NODE &&
        (node as Element).tagName?.toLowerCase() === "p"
      ) {
        const text = (node as Element).textContent?.trim();
        if (text && !seen.has(node)) {
          parts.push(text);
          seen.add(node);
          count++;
        }
      }
      node = node.nextSibling || node.parentElement?.nextSibling || null;
    }

    return parts.join("\n\n");
  }, []);

  const handleAskQuestion = useCallback(
    (text: string, range?: Range) => {
      const selectionInfo: SelectionInfo = {
        text,
        surroundingContext: range ? getSurroundingContext(range) : text,
        articleTitle: title,
        articleExcerpt: summary || undefined,
        headingPath: range ? getHeadingPath(range.startContainer) : "",
      };
      setChatSelection(selectionInfo);
      setChatOpen(true);
    },
    [title, summary, getSurroundingContext, getHeadingPath],
  );

  return (
    <>
      <WikiPreview lang={lang} />

      {/* Text selection toolbar */}
      <TextSelectionToolbar
        lang={lang}
        articleId={articleId}
        onAskQuestion={handleAskQuestion}
      />

      {/* Chat button */}
      <ChatButton onClick={() => setChatOpen(true)} />

      {/* Chat drawer */}
      <ChatDrawer
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        selection={chatSelection}
        lang={lang}
      />

      {/* Lightbox */}
      {lightboxImage && (
        <Lightbox
          src={lightboxImage.src}
          alt={lightboxImage.alt}
          onClose={handleLightboxClose}
          onPrev={handleLightboxPrev}
          onNext={handleLightboxNext}
          hasPrev={lightboxImage.index > 0}
          hasNext={lightboxImage.index < lightboxImage.images.length - 1}
          currentIndex={lightboxImage.index}
          totalImages={lightboxImage.images.length}
          captionIgnoreList={captionIgnoreList}
        />
      )}

      {/* Main content + TOC sidebar */}
      <div className="flex gap-8">
        <div className="min-w-0 flex-1">
          <article className="flex flex-col gap-8">
            {/* Header section */}
            <header className="flex flex-col gap-4">
              <h1 className="text-3xl font-bold leading-tight tracking-tight">{title}</h1>

              {/* Metadata bar */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                {author && (
                  <span className="inline-flex items-center gap-1.5">
                    <User className="size-3.5" />
                    {author}
                  </span>
                )}
                {publishedAt && (
                  <span className="inline-flex items-center gap-1.5">
                    <Calendar className="size-3.5" />
                    {formatDate(publishedAt)}
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="size-3.5" />
                  {estimateReadingTime(html, lang)}
                </span>
                <span className="text-xs text-muted-foreground/60">
                  {lang === "zh" ? "更新于" : "Updated"} {formatDate(updatedAt)}
                </span>
              </div>

              {/* Tags */}
              {tags.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <Tag className="size-3.5 text-muted-foreground" />
                  {tags.map((tag) => (
                    <Badge
                      key={tag}
                      className="bg-primary-tag/15 text-primary-tag border-primary-tag/25"
                    >
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}

              {/* Divider before summary */}
              {summary && <hr className="border-border" />}

              {/* Summary */}
              {summary && (
                <div className="markdown-body-summary">
                  <p className="text-sm leading-relaxed text-muted-foreground">{summary}</p>
                </div>
              )}

              {/* AI Translation notice */}
              {isAITranslated && (
                <div className="flex items-center gap-2 rounded-lg border border-accent-hsl/30 bg-ai-bg px-4 py-3 text-sm" style={{ color: 'hsl(var(--accent-hue), var(--accent-sat), 80%)' }}>
                  <svg className="size-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 21l5.25-11.25L21 21m-9-3h7.5M3 5.621a48.474 48.474 0 016-.371m0 0c1.12 0 2.233.038 3.334.114M9 5.25V3m3.334 2.364C11.176 10.658 7.69 15.08 3 17.502m9.334-12.138c.896.061 1.785.147 2.666.257m-4.589 8.495a18.023 18.023 0 01-3.827-5.802" />
                  </svg>
                  <span>
                    {lang === "zh"
                      ? "本文由 AI 自动翻译，可能存在不准确之处。"
                      : "This article is AI-translated. Some inaccuracies may exist."}
                  </span>
                </div>
              )}
            </header>

            {/* Rendered content */}
            <div ref={contentRef} className="markdown-body" dangerouslySetInnerHTML={{ __html: html }} />

            {/* Divider before footer */}
            <hr className="border-border" />

            {/* Footer area */}
            <footer className="flex flex-col gap-8 text-sm">
              {/* Copyright */}
              <div className="flex items-start gap-2 text-xs text-muted-foreground/60">
                <Copyright className="size-3 mt-0.5 shrink-0" />
                <p>
                  {new Date().getFullYear()} {author || "Miniese's Blog"}
                  {" · "}
                  CC BY-NC 4.0
                </p>
              </div>

              {/* Changelog */}
              {changelog && (
                <div className="flex items-start gap-3 rounded-lg border border-border p-4">
                  <GitCommit className="size-4 mt-0.5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="font-medium">{lang === "zh" ? "更新记录" : "Changelog"}</p>
                    <p className="text-muted-foreground mt-1 whitespace-pre-wrap break-words">
                      <span className="text-xs text-muted-foreground/60 mr-2">
                        {formatDate(updatedAt)}
                      </span>
                      {changelog}
                    </p>
                  </div>
                </div>
              )}

              {/* Comments section */}
              <CommentSection articleId={articleId} lang={lang} />
            </footer>
          </article>
        </div>

        {/* Desktop TOC sidebar */}
        <TableOfContents html={html} lang={lang} />
      </div>
    </>
  );
}
