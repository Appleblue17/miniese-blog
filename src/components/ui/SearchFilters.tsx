/**
 * @file SearchFilters — Reusable search and tag filter bar.
 *
 * Features:
 * - Search input with debounce (300ms)
 * - Tag include selector (multi-select)
 * - Tag exclude selector (multi-select)
 * - Active filter chips with remove buttons
 * - Responsive: collapses on mobile
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Search, X, Filter, ChevronDown, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SearchFiltersProps {
  /** Current search query */
  q?: string;
  /** Currently included tags */
  tagFilter?: string[];
  /** Currently excluded tags */
  tagExclude?: string[];
  /** All available tags for the dropdown */
  allTags: string[];
  /** Called when search query changes (debounced, empty string = cleared) */
  onSearch: (q: string) => void;
  /** Called when tag include filter changes */
  onTagFilter: (tags: string[]) => void;
  /** Called when tag exclude filter changes */
  onTagExclude: (tags: string[]) => void;
  /** Language for UI text */
  lang?: string;
}

export function SearchFilters({
  q = "",
  tagFilter = [],
  tagExclude = [],
  allTags,
  onSearch,
  onTagFilter,
  onTagExclude,
  lang = "zh",
}: SearchFiltersProps) {
  const [inputValue, setInputValue] = useState(q);
  const [showFilters, setShowFilters] = useState(false);
  const [showIncludeDropdown, setShowIncludeDropdown] = useState(false);
  const [showExcludeDropdown, setShowExcludeDropdown] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const includeRef = useRef<HTMLDivElement>(null);
  const excludeRef = useRef<HTMLDivElement>(null);

  const t = (zh: string, en: string) => (lang === "zh" ? zh : en);

  // Sync external q changes
  useEffect(() => {
    setInputValue(q);
  }, [q]);

  // Debounced search
  const handleInputChange = useCallback(
    (value: string) => {
      setInputValue(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        onSearch(value.trim());
      }, 300);
    },
    [onSearch],
  );

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (includeRef.current && !includeRef.current.contains(e.target as Node)) {
        setShowIncludeDropdown(false);
      }
      if (excludeRef.current && !excludeRef.current.contains(e.target as Node)) {
        setShowExcludeDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const availableIncludeTags = allTags.filter((tag) => !tagFilter.includes(tag));
  const availableExcludeTags = allTags.filter((tag) => !tagExclude.includes(tag));

  const hasActiveFilters = tagFilter.length > 0 || tagExclude.length > 0;

  return (
    <div className="flex flex-col gap-2">
      {/* Search row */}
      <div className="flex items-center gap-2">
        {/* Search input */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground/50 pointer-events-none" />
          <input
            type="text"
            value={inputValue}
            onChange={(e) => handleInputChange(e.target.value)}
            placeholder={t("搜索标题、标签...", "Search title, tags...")}
            className="w-full rounded-lg border border-input bg-background pl-9 pr-9 py-2.5 text-sm ring-offset-background placeholder:text-muted-foreground/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors"
          />
          {inputValue && (
            <button
              type="button"
              onClick={() => {
                setInputValue("");
                onSearch("");
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-foreground transition-colors"
              aria-label={t("清除搜索", "Clear search")}
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        {/* Filter toggle (mobile) */}
        <Button
          variant={hasActiveFilters ? "default" : "outline"}
          size="icon"
          onClick={() => setShowFilters(!showFilters)}
          className="shrink-0 md:hidden size-[42px]"
          aria-label={t("筛选", "Filter")}
        >
          <Filter className="size-4" />
        </Button>

        {/* Filter controls (desktop) */}
        <div className="hidden md:flex items-center gap-2">
          {/* Include tag dropdown */}
          <div className="relative" ref={includeRef}>
            <button
              type="button"
              onClick={() => {
                setShowIncludeDropdown(!showIncludeDropdown);
                setShowExcludeDropdown(false);
              }}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2.5 text-sm transition-colors ${
                tagFilter.length > 0
                  ? "border-primary/40 bg-primary/5 text-foreground"
                  : "border-input text-muted-foreground hover:text-foreground hover:bg-accent"
              }`}
            >
              <Tag className="size-3.5" />
              <span className="text-xs whitespace-nowrap">
                {tagFilter.length > 0
                  ? t(`包含 ${tagFilter.length} 个标签`, `Include ${tagFilter.length}`)
                  : t("包含标签", "Include tags")}
              </span>
              <ChevronDown className="size-3 text-muted-foreground/60" />
            </button>

            {showIncludeDropdown && (
              <div className="absolute right-0 top-full mt-1 z-50 w-56 rounded-lg border border-border bg-background shadow-lg p-2 max-h-60 overflow-y-auto">
                {availableIncludeTags.length === 0 ? (
                  <p className="px-2 py-3 text-xs text-muted-foreground text-center">
                    {t("没有更多可选标签", "No more tags available")}
                  </p>
                ) : (
                  <div className="flex flex-col gap-0.5">
                    {availableIncludeTags.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => {
                          onTagFilter([...tagFilter, tag]);
                          setShowIncludeDropdown(false);
                        }}
                        className="flex items-center gap-2 rounded-md px-3 py-2 text-xs text-left hover:bg-accent transition-colors"
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Exclude tag dropdown */}
          <div className="relative" ref={excludeRef}>
            <button
              type="button"
              onClick={() => {
                setShowExcludeDropdown(!showExcludeDropdown);
                setShowIncludeDropdown(false);
              }}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2.5 text-sm transition-colors ${
                tagExclude.length > 0
                  ? "border-destructive/40 bg-destructive/5 text-foreground"
                  : "border-input text-muted-foreground hover:text-foreground hover:bg-accent"
              }`}
            >
              <X className="size-3.5" />
              <span className="text-xs whitespace-nowrap">
                {tagExclude.length > 0
                  ? t(`排除 ${tagExclude.length} 个标签`, `Exclude ${tagExclude.length}`)
                  : t("排除标签", "Exclude tags")}
              </span>
              <ChevronDown className="size-3 text-muted-foreground/60" />
            </button>

            {showExcludeDropdown && (
              <div className="absolute right-0 top-full mt-1 z-50 w-56 rounded-lg border border-border bg-background shadow-lg p-2 max-h-60 overflow-y-auto">
                {availableExcludeTags.length === 0 ? (
                  <p className="px-2 py-3 text-xs text-muted-foreground text-center">
                    {t("没有更多可选标签", "No more tags available")}
                  </p>
                ) : (
                  <div className="flex flex-col gap-0.5">
                    {availableExcludeTags.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => {
                          onTagExclude([...tagExclude, tag]);
                          setShowExcludeDropdown(false);
                        }}
                        className="flex items-center gap-2 rounded-md px-3 py-2 text-xs text-left hover:bg-accent transition-colors"
                      >
                        <X className="size-3 text-destructive/60" />
                        {tag}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Filter panel (mobile) */}
      {showFilters && (
        <div className="md:hidden flex flex-col gap-2 p-3 rounded-lg border border-border bg-muted/30">
          <p className="text-xs font-medium text-muted-foreground">{t("标签筛选", "Tag Filters")}</p>
          <div className="flex flex-wrap gap-2">
            {/* Include tags */}
            <div className="flex-1 min-w-0">
              <label className="block text-[10px] text-muted-foreground/60 mb-1">
                {t("包含标签", "Include tags")}
              </label>
              <div className="flex flex-wrap gap-1">
                {tagFilter.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary text-[10px] px-2 py-0.5"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => onTagFilter(tagFilter.filter((t) => t !== tag))}
                      className="hover:text-destructive transition-colors"
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
                {allTags
                  .filter((t) => !tagFilter.includes(t))
                  .slice(0, 10)
                  .map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => onTagFilter([...tagFilter, tag])}
                      className="text-[10px] px-2 py-0.5 rounded-full border border-border text-muted-foreground hover:bg-accent transition-colors"
                    >
                      +{tag}
                    </button>
                  ))}
              </div>
            </div>

            {/* Exclude tags */}
            <div className="flex-1 min-w-0">
              <label className="block text-[10px] text-muted-foreground/60 mb-1">
                {t("排除标签", "Exclude tags")}
              </label>
              <div className="flex flex-wrap gap-1">
                {tagExclude.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 rounded-full bg-destructive/10 text-destructive text-[10px] px-2 py-0.5"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => onTagExclude(tagExclude.filter((t) => t !== tag))}
                      className="hover:text-destructive/80 transition-colors"
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
                {allTags
                  .filter((t) => !tagExclude.includes(t))
                  .slice(0, 10)
                  .map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => onTagExclude([...tagExclude, tag])}
                      className="text-[10px] px-2 py-0.5 rounded-full border border-border text-muted-foreground hover:bg-accent transition-colors"
                    >
                      -{tag}
                    </button>
                  ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Active filter chips */}
      {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-1.5">
          {(inputValue || q) && (
            <span
              className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary text-[10px] px-2 py-0.5"
            >
              {t("搜索", "Search")}: &ldquo;{q}&rdquo;
              <button
                type="button"
                onClick={() => {
                  setInputValue("");
                  onSearch("");
                }}
                className="hover:text-destructive transition-colors"
              >
                <X className="size-3" />
              </button>
            </span>
          )}
          {tagFilter.map((tag) => (
            <span
              key={`inc-${tag}`}
              className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary text-[10px] px-2 py-0.5"
            >
              <Tag className="size-2.5" />
              {tag}
              <button
                type="button"
                onClick={() => onTagFilter(tagFilter.filter((t) => t !== tag))}
                className="hover:text-destructive transition-colors"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
          {tagExclude.map((tag) => (
            <span
              key={`exc-${tag}`}
              className="inline-flex items-center gap-1 rounded-full bg-destructive/10 text-destructive text-[10px] px-2 py-0.5"
            >
              <X className="size-2.5" />
              {tag}
              <button
                type="button"
                onClick={() => onTagExclude(tagExclude.filter((t) => t !== tag))}
                className="hover:text-destructive/80 transition-colors"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}

          {/* Clear all */}
          <button
            type="button"
            onClick={() => {
              setInputValue("");
              onSearch("");
              onTagFilter([]);
              onTagExclude([]);
            }}
            className="text-[10px] text-muted-foreground hover:text-foreground underline transition-colors ml-1"
          >
            {t("清除全部", "Clear all")}
          </button>
        </div>
      )}
    </div>
  );
}
