/**
 * @file AdminArticleSearch — Client-side search and tag filter bar for admin articles page.
 *
 * Uses URL search params (q, tagFilter, tagExclude) to persist filters.
 * Navigates via router.push() to trigger server re-render with filtered data.
 */

"use client";

import { useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SearchFilters } from "@/components/ui/SearchFilters";

interface AdminArticleSearchProps {
  q: string;
  tagFilter: string;
  tagExclude: string;
  allTags: string[];
}

export function AdminArticleSearch({
  q,
  tagFilter,
  tagExclude,
  allTags,
}: AdminArticleSearchProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const tagFilterArray = tagFilter ? tagFilter.split(",").filter(Boolean) : [];
  const tagExcludeArray = tagExclude ? tagExclude.split(",").filter(Boolean) : [];

  const updateParams = useCallback(
    (newQ: string, newTagFilter: string[], newTagExclude: string[]) => {
      const params = new URLSearchParams();
      if (newQ) params.set("q", newQ);
      if (newTagFilter.length > 0) params.set("tagFilter", newTagFilter.join(","));
      if (newTagExclude.length > 0) params.set("tagExclude", newTagExclude.join(","));
      params.set("page", "1"); // Reset to first page on filter change
      const qs = params.toString();
      startTransition(() => {
        router.push(`/admin/articles${qs ? `?${qs}` : ""}`);
      });
    },
    [router],
  );

  const handleSearch = useCallback(
    (newQ: string) => {
      updateParams(newQ, tagFilterArray, tagExcludeArray);
    },
    [updateParams, tagFilterArray, tagExcludeArray],
  );

  const handleTagFilter = useCallback(
    (tags: string[]) => {
      updateParams(q, tags, tagExcludeArray);
    },
    [updateParams, q, tagExcludeArray],
  );

  const handleTagExclude = useCallback(
    (tags: string[]) => {
      updateParams(q, tagFilterArray, tags);
    },
    [updateParams, q, tagFilterArray],
  );

  return (
    <div className="mb-6">
      <SearchFilters
        q={q}
        tagFilter={tagFilterArray}
        tagExclude={tagExcludeArray}
        allTags={allTags}
        onSearch={handleSearch}
        onTagFilter={handleTagFilter}
        onTagExclude={handleTagExclude}
        lang="zh"
      />
    </div>
  );
}
