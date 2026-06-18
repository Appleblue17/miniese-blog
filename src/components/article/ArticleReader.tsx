/**
 * @file ArticleReader — Displays article metadata header and manages global
 * interactive features (chat, text selection, image processing, lightbox).
 *
 * The article body + TOC is streamed via ArticleContent + Suspense.
 * Image processing (relative path rewrite, error placeholders, lightbox click)
 * runs in useEffect via MutationObserver on the [data-article-body] container.
 */

"use client";

import { useCallback, useState, useEffect, useRef } from "react";
import { Calendar, User, Tag, GitCommit } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { ChatButton } from "@/components/ai/ChatButton";
import { ChatDrawer } from "@/components/ai/ChatDrawer";
import { TextSelectionToolbar } from "@/components/ai/TextSelectionToolbar";
import { Lightbox } from "@/components/ui/Lightbox";
import type { SelectionInfo } from "@/types/ai";

interface ArticleReaderProps {
  articleId?: string;
  title?: string;
  author?: string;
  publishedAt?: string | null;
  updatedAt?: string;
  tags?: string[];
  summary?: string | null;
  lang: string;
  changelog?: string | null;
  isAITranslated?: boolean;
  /**
   * When true, renders skeleton placeholders instead of actual content.
   * Used during the initial meta fetch so the title area is visible immediately
   * and transitions smoothly to real content when ready.
   */
  loading?: boolean;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function ArticleReader({
  articleId,
  title,
  author,
  publishedAt,
  updatedAt,
  tags,
  summary,
  lang,
  changelog,
  isAITranslated,
  loading = false,
}: ArticleReaderProps) {
  const [chatOpen, setChatOpen] = useState(false);
  const [chatSelection, setChatSelection] = useState<SelectionInfo | undefined>(undefined);
  const [lightboxImage, setLightboxImage] = useState<{
    src: string;
    alt: string;
    images: { src: string; alt: string }[];
    index: number;
  } | null>(null);
  const [captionIgnoreList, setCaptionIgnoreList] = useState<string[]>([]);
  const langRef = useRef(lang);
  const articleIdRef = useRef(articleId);
  langRef.current = lang;
  articleIdRef.current = articleId;

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

  // Image processing — runs on the server-rendered content once it's in the DOM.
  // Uses document-level MutationObserver to catch [data-article-body] when it appears
  // (streamed via Suspense). Then processes images and sets up lightbox clicks.
  useEffect(() => {
    const currentId = articleIdRef.current;

    function processOneImage(img: HTMLImageElement) {
      if (img.getAttribute("data-miniese-processed") === "true") return;
      img.setAttribute("data-miniese-processed", "true");

      const src = img.getAttribute("src");
      if (!src) return;

      // Rewrite relative paths
      if (!/^(https?:\/\/|\/|data:)/i.test(src)) {
        img.setAttribute("src", `/api/images/${currentId}/${src}`);
      }

      if (!img.hasAttribute("sizes")) {
        img.setAttribute("sizes", "(max-width: 768px) 100vw, (max-width: 1024px) 60vw, 50vw");
      }
      if (!img.hasAttribute("loading")) {
        img.setAttribute("loading", "lazy");
      }

      img.classList.add("lightbox-trigger");

      const errorHandler = async function onImgError() {
        img.removeEventListener("error", errorHandler);
        img.style.display = "none";

        let errorType: "not_found" | "forbidden" | "unknown" = "unknown";
        let isLoggedIn = false;
        try {
          const checkRes = await fetch(img.src, { method: "HEAD" });
          if (checkRes.status === 404) errorType = "not_found";
          else if (checkRes.status === 403) errorType = "forbidden";
        } catch {}

        try {
          const meRes = await fetch("/api/auth/me");
          const meData = await meRes.json();
          isLoggedIn = meData.user !== null && meData.user !== undefined;
        } catch {}

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
            descText = currentLang === "zh" ? "此图片需要校内权限" : "This image requires school access";
          }
        } else {
          titleText = currentLang === "zh" ? "图片加载失败" : "Image failed to load";
          descText = img.getAttribute("alt") || "";
        }

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

      if (img.complete && img.naturalWidth === 0) {
        errorHandler();
      }
    }

    function scanForImages(root: HTMLElement | Document) {
      const images = root.querySelectorAll("img");
      for (const img of images) {
        processOneImage(img);
      }
    }

    function setupLightboxClick(root: HTMLElement) {
      const handler = (e: Event) => {
        const img = e.target as HTMLImageElement;
        if (!img || img.tagName !== "IMG") return;

        const allImages = Array.from(root.querySelectorAll("img"));
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
      root.addEventListener("click", handler);
      return () => root.removeEventListener("click", handler);
    }

    // Watch for [data-article-body] to appear (streamed via Suspense)
    let cleanupLightbox: (() => void) | null = null;
    let observer: MutationObserver | null = null;

    function tryAttach() {
      const body = document.querySelector<HTMLElement>("[data-article-body]");
      if (body) {
        // Initial scan
        scanForImages(body);
        // Set up lightbox
        if (cleanupLightbox) cleanupLightbox();
        cleanupLightbox = setupLightboxClick(body);
        return true;
      }
      return false;
    }

    // Check immediately in case body is already rendered
    const alreadyAttached = tryAttach();

    // If not yet in DOM, observe document for it
    if (!alreadyAttached) {
      observer = new MutationObserver((_mutations) => {
        if (tryAttach()) {
          // Once attached, we can stop watching — lightbox click covers new images
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }

    // Also watch for new images added to the body (even after initial attach)
    const imageObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const el = node as Element;
            if (el.tagName === "IMG") processOneImage(el as HTMLImageElement);
            else el.querySelectorAll("img").forEach(processOneImage);
          }
        }
      }
    });

    // Start watching document.body for new images
    imageObserver.observe(document.body, { childList: true, subtree: true });

    return () => {
      if (observer) observer.disconnect();
      if (imageObserver) imageObserver.disconnect();
      if (cleanupLightbox) cleanupLightbox();
    };
  }, [articleId]);

  // When lang changes, re-process UI text in error placeholders
  useEffect(() => {
    const placeholders = document.querySelectorAll<HTMLElement>(
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

      const currentLang = langRef.current;
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

      const titleP = ph.querySelector("p");
      if (titleP) titleP.innerHTML = titleText;

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
  }, [lang]);

  const getHeadingPath = useCallback((node: Node | null): string => {
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
        } else break;
      }
      return lastPath.join(" > ");
    }

    return path.join(" > ");
  }, []);

  const getSurroundingContext = useCallback((range: Range): string => {
    const parts: string[] = [];
    const seen = new Set<Node>();

    let node: Node | null = range.startContainer;
    let count = 0;
    while (node && count < 2) {
      if (node.nodeType === Node.ELEMENT_NODE && (node as Element).tagName?.toLowerCase() === "p") {
        const text = (node as Element).textContent?.trim();
        if (text && !seen.has(node)) {
          parts.unshift(text);
          seen.add(node);
          count++;
        }
      }
      node = node.previousSibling || node.parentElement;
    }

    parts.push(range.toString().trim());

    node = range.endContainer;
    count = 0;
    while (node && count < 2) {
      if (node.nodeType === Node.ELEMENT_NODE && (node as Element).tagName?.toLowerCase() === "p") {
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
        articleTitle: title || "",
        articleExcerpt: summary || undefined,
        headingPath: range ? getHeadingPath(range.startContainer) : "",
      };
      setChatSelection(selectionInfo);
      setChatOpen(true);
    },
    [title, summary, getSurroundingContext, getHeadingPath],
  );

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

  return (
    <>
      <TextSelectionToolbar
        lang={lang}
        articleId={articleId}
        onAskQuestion={handleAskQuestion}
      />

      <ChatButton onClick={() => setChatOpen(true)} />

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

      {/* Article header — renders skeleton while loading, real content when ready */}
      <article className="flex flex-col gap-8">
        <header className="flex flex-col gap-4">
          {loading ? (
            <>
              {/* Skeleton title */}
              <div className="h-8 bg-muted rounded animate-pulse w-3/4" />
              {/* Skeleton author & date */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="h-4 bg-muted rounded animate-pulse w-20" />
                <div className="h-4 bg-muted rounded animate-pulse w-36" />
                <div className="h-3 bg-muted rounded animate-pulse w-28" />
              </div>
              {/* Skeleton tags */}
              <div className="flex flex-wrap gap-2">
                <div className="h-5 bg-muted rounded-full animate-pulse w-14" />
                <div className="h-5 bg-muted rounded-full animate-pulse w-20" />
                <div className="h-5 bg-muted rounded-full animate-pulse w-16" />
              </div>
              {/* Skeleton divider */}
              <div className="h-px bg-border" />
              {/* Skeleton summary */}
              {/* <div className="h-4 bg-muted rounded animate-pulse w-full" />
              <div className="h-4 bg-muted rounded animate-pulse w-5/6" /> */}
            </>
          ) : (
            <>
              <h1 className="text-3xl font-bold leading-tight tracking-tight">{title}</h1>

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
                <span className="text-xs text-muted-foreground/60">
                  {lang === "zh" ? "更新于" : "Updated"} {updatedAt ? formatDate(updatedAt) : ""}
                </span>
              </div>

              {tags && tags.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <Tag className="size-3.5 text-muted-foreground" />
                  {tags.map((tag) => (
                    <Badge key={tag} className="bg-primary-tag/15 text-primary-tag border-primary-tag/25">
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}

              {summary && <hr className="border-border" />}

              {summary && (
                <div className="markdown-body-summary">
                  <p className="text-sm leading-relaxed text-muted-foreground">{summary}</p>
                </div>
              )}

              {isAITranslated && (
                <div
                  className="flex items-center gap-2 rounded-lg border border-accent-hsl/30 bg-ai-bg px-4 py-3 text-sm"
                  style={{ color: "hsl(var(--accent-hue), var(--accent-sat), 80%)" }}
                >
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
            </>
          )}
        </header>

        {!loading && changelog && (
          <>
            <hr className="border-border" />
            <div className="flex items-start gap-3 rounded-lg border border-border p-4">
              <GitCommit className="size-4 mt-0.5 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <p className="font-medium">{lang === "zh" ? "更新记录" : "Changelog"}</p>
                <p className="text-muted-foreground mt-1 whitespace-pre-wrap break-words">
                  <span className="text-xs text-muted-foreground/60 mr-2">{updatedAt ? formatDate(updatedAt) : ""}</span>
                  {changelog}
                </p>
              </div>
            </div>
          </>
        )}
      </article>
    </>
  );
}
