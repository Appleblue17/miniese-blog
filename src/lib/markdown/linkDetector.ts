/**
 * @file Wiki link detector for Markdown content.
 *
 * Scans Markdown content for wiki entry names and aliases, replacing them with
 * anchor links to the corresponding wiki pages. The detection happens BEFORE
 * rendering, so the transformed Markdown is then passed to the renderer.
 *
 * Exclusions:
 * - Code blocks (```...```)
 * - Inline code (`...`)
 * - Math formulas ($$...$$ and $...$)
 * - Existing Markdown links ([text](url))
 * - Existing HTML anchor tags (<a ...>...</a>)
 *
 * Matching strategy:
 * - Longest match first (to avoid short name overwriting longer alias)
 * - Case-sensitive matching
 * - Whole-word matching (boundary-aware)
 */

import { prisma } from "@/lib/db";

// --- Types ---

export interface WikiLinkEntry {
  id: string;
  name: string;
  aliases: string[];
  language: string;
}

/**
 * Options for the wiki link detector.
 */
export interface LinkDetectorOptions {
  /** The language of the current article ('zh' | 'en') */
  lang: string;
  /** The raw Markdown content of the article (without frontmatter) */
  content: string;
}

/**
 * Represents a region of text that should be excluded from matching.
 */
interface ExcludedRegion {
  start: number;
  end: number;
}

// --- Public API ---

/**
 * Fetches all wiki entries for a given language from the database.
 * Returns only the fields needed for matching (id, name, aliases, language).
 *
 * @param lang - The language to filter by ('zh' | 'en')
 * @returns A promise that resolves to an array of wiki entries
 *
 * @example
 * ```ts
 * const entries = await findWikiEntriesForLang("zh");
 * // => [{ id: "1", name: "DFS", aliases: ["深度优先搜索"], language: "zh" }, ...]
 * ```
 */
export async function findWikiEntriesForLang(lang: string): Promise<WikiLinkEntry[]> {
  return prisma.wikiEntry.findMany({
    where: { language: lang as "zh" | "en" },
    select: { id: true, name: true, aliases: true, language: true },
  }) as Promise<WikiLinkEntry[]>;
}

/**
 * Scans Markdown content and replaces wiki entry names/aliases with anchor links.
 *
 * The function:
 * 1. Fetches all wiki entries for the given language from the database
 * 2. Builds a matching dictionary (name + all aliases)
 * 3. Identifies excluded regions (code blocks, formulas, existing links)
 * 4. Matches entry names in non-excluded regions (longest match first)
 * 5. Replaces matched text with `<a href="/{lang}/wiki/{name}" data-wiki-name="{name}">`
 *
 * @param options - The detection options (lang and content)
 * @returns A promise resolving to the Markdown content with wiki links injected
 *
 * @example
 * ```ts
 * const result = await detectWikiLinks({
 *   lang: "zh",
 *   content: "DFS 是一种重要的算法。",
 * });
 * // => '<a href="/zh/wiki/DFS" data-wiki-name="DFS">DFS</a> 是一种重要的算法。'
 * ```
 */
export async function detectWikiLinks(options: LinkDetectorOptions): Promise<string> {
  const { lang, content } = options;

  if (!content) {
    return "";
  }

  // 1. Fetch wiki entries for this language
  const entries = await findWikiEntriesForLang(lang);

  if (entries.length === 0) {
    return content;
  }

  // 2. Build matching dictionary
  // Map from search text (name or alias) to the wiki entry name
  const matchMap = new Map<string, string>();

  for (const entry of entries) {
    // Add the main name
    if (!matchMap.has(entry.name)) {
      matchMap.set(entry.name, entry.name);
    }

    // Add all aliases
    for (const alias of entry.aliases) {
      if (!matchMap.has(alias)) {
        matchMap.set(alias, entry.name);
      }
    }
  }

  // 3. Build sorted match keys (longest first) for greedy matching
  const matchKeys = Array.from(matchMap.keys()).sort((a, b) => b.length - a.length);

  // If no match keys, return content as-is
  if (matchKeys.length === 0) {
    return content;
  }

  // 4. Identify excluded regions
  const excludedRegions = findExcludedRegions(content);

  // 5. Scan and replace
  return replaceMatches(content, matchKeys, matchMap, excludedRegions, lang);
}

// --- Internal helpers ---

/**
 * Finds all regions in the content that should be excluded from matching.
 *
 * Excluded regions include:
 * - Code blocks (```...```)
 * - Inline code (`...`)
 * - Math blocks ($$...$$)
 * - Inline math ($...$)
 * - Existing Markdown links ([text](url))
 * - Existing HTML anchor tags (<a ...>...</a>)
 *
 * @param content - The full Markdown content
 * @returns An array of excluded regions (sorted by start index)
 */
function findExcludedRegions(content: string): ExcludedRegion[] {
  const regions: ExcludedRegion[] = [];

  // Multi-line patterns
  const multiPatterns: RegExp[] = [
    // Code blocks: ```...```
    /```[\s\S]*?```/g,
    // Math blocks: $$...$$
    /\$\$[\s\S]*?\$\$/g,
  ];

  for (const pattern of multiPatterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
      regions.push({ start: match.index, end: match.index + match[0].length });
    }
  }

  // Inline patterns (single-line)
  const inlinePatterns: RegExp[] = [
    // Inline code: `...` (but not `` ` `` inside $$...$$ already handled above)
    /`[^`]*`/g,
    // Inline math: $...$ (not $$, which is handled above)
    /\$(?!\$)[^$]*\$(?!\$)/g,
    // Markdown links: [text](url)
    /\[([^\[\]]*)\]\([^)]*\)/g,
    // HTML anchor tags: <a ...>...</a>
    /<a\s[^>]*>.*?<\/a>/g,
  ];

  for (const pattern of inlinePatterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
      regions.push({ start: match.index, end: match.index + match[0].length });
    }
  }

  // Sort by start position and merge overlapping regions
  regions.sort((a, b) => a.start - b.start);

  const merged: ExcludedRegion[] = [];
  for (const region of regions) {
    if (merged.length > 0 && region.start <= merged[merged.length - 1].end) {
      // Merge overlapping regions
      merged[merged.length - 1].end = Math.max(merged[merged.length - 1].end, region.end);
    } else {
      merged.push({ ...region });
    }
  }

  return merged;
}

/**
 * Finds the excluded region that contains the given position, if any.
 *
 * @param pos - The character position to check
 * @param regions - The sorted array of excluded regions
 * @returns The containing region, or null if position is not in any excluded region
 */
function findExcludedRegionAt(pos: number, regions: ExcludedRegion[]): ExcludedRegion | null {
  // Binary search for efficiency
  let low = 0;
  let high = regions.length - 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const region = regions[mid];

    if (pos < region.start) {
      high = mid - 1;
    } else if (pos >= region.end) {
      low = mid + 1;
    } else {
      return region; // pos is within this region
    }
  }

  return null;
}

/**
 * Replaces matched wiki entries with anchor links in the content.
 *
 * Uses a character-by-character scanning approach:
 * - For each position, tries to match the longest key first
 * - Skips positions inside excluded regions
 * - After a successful match, advances past the matched text
 * - Builds the result string character by character
 *
 * @param content - The original Markdown content
 * @param matchKeys - Sorted array of search texts (longest first)
 * @param matchMap - Map from search text to MatchEntry
 * @param excludedRegions - Regions to skip
 * @param lang - The language prefix for the link URL
 * @returns The content with wiki links injected
 */
function replaceMatches(
  content: string,
  matchKeys: string[],
  matchMap: Map<string, string>,
  excludedRegions: ExcludedRegion[],
  lang: string,
): string {
  const result: string[] = [];
  let i = 0;

  while (i < content.length) {
    // Check if we're inside an excluded region (binary search)
    const region = findExcludedRegionAt(i, excludedRegions);

    if (region) {
      // Emit the entire excluded region as-is
      result.push(content.slice(i, region.end));
      i = region.end;
      continue;
    }

    // Try to match a wiki entry at this position
    let matched = false;

    for (const key of matchKeys) {
      // Quick check: does the content at position i start with key?
      if (content.startsWith(key, i)) {
        // Check word boundary: character before should not be a word char
        const charBefore = i > 0 ? content[i - 1] : " ";

        // Character after the match: if it's an ASCII letter/digit/underscore, reject
        // (prevents partial matches like "DFSs" matching "DFS")
        // CJK characters after a match are allowed (Chinese has no word separators)
        const charAfter = i + key.length < content.length ? content[i + key.length] : " ";

        const isBoundaryBefore = !isWordChar(charBefore);
        // Only reject if next char is ASCII alphanumeric or underscore (word-joining)
        const isAfterSafe = !isAsciiWordChar(charAfter);

        if (isBoundaryBefore && isAfterSafe) {
          // Also verify the entire match is not inside an excluded region
          const endPos = i + key.length;
          if (!findExcludedRegionAt(endPos - 1, excludedRegions)) {
            const wikiName = matchMap.get(key)!;
            const url = `/${lang}/wiki/${wikiName}`;
            result.push(`<a href="${url}" data-wiki-name="${wikiName}">${key}</a>`);
            i = endPos;
            matched = true;
            break;
          }
        }
      }
    }

    if (!matched) {
      // No match at this position, emit the character as-is
      result.push(content[i]);
      i++;
    }
  }

  return result.join("");
}

/**
 * Checks if a character is an ASCII word character (letter, digit, or underscore).
 * Used specifically for post-match boundary detection (to prevent "DFSs" matching "DFS").
 *
 * @param char - The character to check
 * @returns True if the character is an ASCII word character
 */
function isAsciiWordChar(char: string): boolean {
  if (char.length === 0) return false;
  const code = char.charCodeAt(0);
  return (
    (code >= 0x41 && code <= 0x5a) || // A-Z
    (code >= 0x61 && code <= 0x7a) || // a-z
    (code >= 0x30 && code <= 0x39) || // 0-9
    code === 0x5f // underscore
  );
}

/**
 * Checks if a character is a "word character" (letter, digit, CJK ideograph).
 * Used for word boundary detection.
 *
 * @param char - The character to check
 * @returns True if the character is a word character
 */
function isWordChar(char: string): boolean {
  if (char.length === 0) return false;
  const code = char.charCodeAt(0);

  // ASCII letters and digits
  if (
    (code >= 0x41 && code <= 0x5a) || // A-Z
    (code >= 0x61 && code <= 0x7a) || // a-z
    (code >= 0x30 && code <= 0x39) // 0-9
  ) {
    return true;
  }

  // CJK Unified Ideographs (U+4E00–U+9FFF)
  if (code >= 0x4e00 && code <= 0x9fff) {
    return true;
  }

  // CJK Extension A (U+3400–U+4DBF)
  if (code >= 0x3400 && code <= 0x4dbf) {
    return true;
  }

  // Full-width characters: keep only full-width letters (FF21-FF3A, FF41-FF5A)
  // and full-width digits (FF10-FF19), exclude full-width punctuation like （ ）！
  if (
    (code >= 0xff10 && code <= 0xff19) || // full-width digits
    (code >= 0xff21 && code <= 0xff3a) || // full-width A-Z
    (code >= 0xff41 && code <= 0xff5a)
  ) {
    // full-width a-z
    return true;
  }

  // Underscore
  if (code === 0x5f) {
    return true;
  }

  return false;
}
