/**
 * @file Line-level incremental review engine.
 *
 * Mirrors the architecture of translator2.ts but for AI article review.
 *
 * Key differences from translation:
 * - Review doesn't produce a modified version of the content — it produces
 *   a report (sections with issue items)
 * - The "content map" stores original content → review chunk (with sections/items)
 * - Unchanged sub-chunks reuse their review report from the previous run
 * - The output includes a `contentSnapshot` for the next incremental run
 *
 * Workflow:
 * 1. Strip YAML frontmatter from old and new content → newLines[]
 * 2. detectChanges(oldBody, newBody) → DiffBlock[] (changed line ranges)
 * 3. If no changes: reuse ALL from existing content map
 * 4. For unchanged ranges: look up in contentMap by content → reuse
 * 5. For each DiffBlock:
 *    a. splitRange() to split by heading boundaries → sub-Chunk[]
 *    b. For each sub-Chunk:
 *       - Check contentMap by content → reuse if found
 *       - Otherwise: buildContext → call AI → parseReviewReport
 *       - Store in contentMap (original content → review chunk)
 * 6. Merge all chunks into final output
 */

import { stripFrontmatter, splitRange } from "./chunker/chunker";
import { detectChanges } from "./chunker/differ";
import type { DiffBlock } from "./chunker/types";
import { buildContext } from "./chunker/context";
import { callDeepSeek } from "./client";
import { buildReviewPromptWithContext } from "./prompts/review";
import { parseReviewReport } from "./parsers";
import type { ProgressCallback } from "./translator2";

// ---------------------------------------------------------------------------
// Type definitions
// ---------------------------------------------------------------------------

/**
 * A single item within a review section.
 */
export interface ReviewItem {
  severity: string;
  lineStart: number;
  lineEnd: number;
  snippet: string;
  issue: string;
  suggestion: string;
}

/**
 * A section grouping review items by type.
 */
export interface ReviewSection {
  type: string;
  title: string;
  items: ReviewItem[];
}

/**
 * A review chunk covering a single sub-chunk of content.
 * Mirrors the old ReviewChunk structure for UI compatibility.
 */
export interface ReviewChunk {
  chunkId: number;
  chunkTitle: string;
  startLine: number;
  endLine: number;
  sections: ReviewSection[];
}

/**
 * A group sent to the AI for review, with context boundaries.
 */
export interface ReviewGroupDetail {
  /** Line range of the target in the new content (1-based, inclusive) */
  targetLines: [number, number];
  /** Context window line range (inclusive) */
  contextLines: [number, number];
}

/**
 * Summary statistics for the review result.
 */
export interface ReviewSummary {
  totalIssues: number;
  errors: number;
  warnings: number;
  suggestions: number;
}

/**
 * Result of the review process.
 */
export interface ReviewResult {
  /** Article ID */
  articleId: string;
  /** Version string */
  version: string;
  /** ISO timestamp of when the review was completed */
  reviewedAt: string;
  /** Review chunks (each with sections & items) — same structure as old output */
  chunks: ReviewChunk[];
  /** Groups sent to AI, for detail page rendering */
  groups: ReviewGroupDetail[];
  /** Summary statistics */
  summary: ReviewSummary;
  /** Number of sub-chunks that were newly reviewed by the AI */
  reviewedCount: number;
  /** Number of sub-chunks reused from previous review */
  reusedCount: number;
  /** Total API tokens used (sum of all calls) */
  totalTokensUsed: number;
  /** Mapping of original content → review chunk (for future incremental runs) */
  contentMap: Record<string, ReviewChunk>;
  /** Snapshot of the article body at the time of review (for next incremental diff) */
  contentSnapshot: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Computes the complement of a set of ranges within [1, totalLines].
 * Returns the ranges that are NOT covered by any diff block.
 */
function complementRanges(totalLines: number, blocks: DiffBlock[]): DiffBlock[] {
  if (blocks.length === 0) {
    return [{ startLine: 1, endLine: totalLines }];
  }

  const result: DiffBlock[] = [];
  let cursor = 1;

  for (const block of blocks) {
    if (cursor < block.startLine) {
      result.push({ startLine: cursor, endLine: block.startLine - 1 });
    }
    cursor = block.endLine + 1;
  }

  if (cursor <= totalLines) {
    result.push({ startLine: cursor, endLine: totalLines });
  }

  return result;
}

/**
 * Computes summary statistics from an array of review chunks.
 */
function computeSummary(chunks: ReviewChunk[]): ReviewSummary {
  let totalIssues = 0;
  let errors = 0;
  let warnings = 0;
  let suggestions = 0;

  for (const chunk of chunks) {
    for (const section of chunk.sections) {
      for (const item of section.items) {
        if (item.severity === "ok") continue;
        totalIssues++;
        if (item.severity === "error") errors++;
        else if (item.severity === "warning") warnings++;
        else if (item.severity === "suggestion") suggestions++;
      }
    }
  }

  return { totalIssues, errors, warnings, suggestions };
}

// ---------------------------------------------------------------------------
// Helpers: line-level content map building
// ---------------------------------------------------------------------------

/**
 * Builds a map from individual source lines to their review items,
 * by splitting the multi-line keys in existingContentMap.
 *
 * This mirrors the lineToTranslation approach in translator2.ts, and is
 * critical for unchanged-range reuse: after a full review, the contentMap
 * keys are entire sub-chunks (e.g., heading sections). After an edit,
 * `splitRange` may produce different chunk boundaries, so the multi-line
 * keys won't match. By splitting into individual lines, we can reuse
 * review items for unchanged lines regardless of chunk boundary changes.
 *
 * @param contentMap - Existing content map (original content → ReviewChunk)
 * @returns A map from individual source line → ReviewChunk
 */
function buildLineToChunk(contentMap: Record<string, ReviewChunk>): Map<string, ReviewChunk> {
  const map = new Map<string, ReviewChunk>();

  for (const [sourceText, chunk] of Object.entries(contentMap)) {
    const sourceLines = sourceText.split("\n");
    for (const line of sourceLines) {
      // Only store if not already mapped (first match wins — most specific)
      if (!map.has(line)) {
        map.set(line, chunk);
      }
    }
  }

  return map;
}

/**
 * Merges a ReviewChunk into an existing one, deduplicating sections/items.
 * If a section with the same type already exists, items are merged.
 */
function mergeChunks(existing: ReviewChunk, incoming: ReviewChunk): ReviewChunk {
  // Merge sections by type
  const mergedSections: ReviewSection[] = [...existing.sections];
  const sectionByType = new Map<string, number>();
  mergedSections.forEach((s, i) => sectionByType.set(s.type, i));

  for (const section of incoming.sections) {
    const existingIdx = sectionByType.get(section.type);
    if (existingIdx !== undefined) {
      // Merge items — deduplicate by issue text
      const existingIssues = new Set(mergedSections[existingIdx].items.map((i) => i.issue));
      for (const item of section.items) {
        if (!existingIssues.has(item.issue)) {
          mergedSections[existingIdx].items.push(item);
        }
      }
    } else {
      mergedSections.push(section);
    }
  }

  return {
    ...existing,
    sections: mergedSections,
    startLine: Math.min(existing.startLine, incoming.startLine),
    endLine: Math.max(existing.endLine, incoming.endLine),
  };
}

// ---------------------------------------------------------------------------
// Main review pipeline
// ---------------------------------------------------------------------------

/**
 * Reviews article content incrementally using line-level diff.
 *
 * @param oldSourceContent - Previous version of the source content (or empty for first review)
 * @param newSourceContent - Current version of the source content
 * @param existingContentMap - Previously reviewed chunks (original content → ReviewChunk)
 * @param articleId - Article ID for the output (passed through)
 * @param version - Version string for the output (passed through)
 * @param onProgress - Optional callback for progress reporting (processed, total)
 * @param customReviewPrompt - Optional custom review prompt override
 * @returns The review result
 */
export async function incrementalReview(
  oldSourceContent: string,
  newSourceContent: string,
  existingContentMap: Record<string, ReviewChunk>,
  articleId: string,
  version: string,
  onProgress?: ProgressCallback,
  customReviewPrompt?: string,
): Promise<ReviewResult> {
  // Strip frontmatter
  const newBody = stripFrontmatter(newSourceContent);
  const oldBody = stripFrontmatter(oldSourceContent);

  if (!newBody.trim()) {
    return {
      articleId,
      version,
      reviewedAt: new Date().toISOString(),
      chunks: [],
      groups: [],
      summary: { totalIssues: 0, errors: 0, warnings: 0, suggestions: 0 },
      reviewedCount: 0,
      reusedCount: 0,
      totalTokensUsed: 0,
      contentMap: { ...existingContentMap },
      contentSnapshot: newBody,
    };
  }

  const newLines = newBody.split("\n");

  // ---- Step 0: Build line-level lookup from existing content map ----
  // This is critical for robustness: after a full review, the contentMap keys
  // are sub-chunk contents defined by splitRange. After an edit, splitRange
  // may produce different boundaries, so we need line-level fallback.
  const lineToChunk = buildLineToChunk(existingContentMap);

  // ---- Step 1: Run line-level diff ----
  const diffBlocks = detectChanges(oldBody, newBody);

  // DIAGNOSTIC: Log diff details
  {
    const oldLines = oldBody ? oldBody.split("\n").length : 0;
    const newLineCount = newLines.length;
    const diffRanges = diffBlocks.map((b) => `${b.startLine}-${b.endLine}`);
    console.log(
      `[Reviewer] DIAG: oldLines=${oldLines}, newLines=${newLineCount}, ` +
        `diffBlocks=${diffBlocks.length}, ranges=[${diffRanges.join(", ")}]`,
    );
    if (
      diffBlocks.length > 0 &&
      diffBlocks[0].startLine === 1 &&
      diffBlocks[0].endLine === newLineCount
    ) {
      console.log(
        `[Reviewer] DIAG: *** FULL CONTENT diff detected! All ${newLineCount} lines changed.`,
      );
    }
  }

  // ---- Step 2: Handle no changes ----
  if (diffBlocks.length === 0) {
    // All content is unchanged. Reuse from existingContentMap.
    // First try exact sub-chunk match, then fall back to line-level.
    const fullRangeChunks = splitRange(newLines, 1, newLines.length);
    const reusedChunks: ReviewChunk[] = [];
    let reusedCount = 0;

    for (const sc of fullRangeChunks) {
      // Try exact match first
      let existing = existingContentMap[sc.content];
      if (existing) {
        reusedChunks.push({
          ...existing,
          chunkId: reusedChunks.length,
          startLine: sc.startLine,
          endLine: sc.endLine,
        });
        reusedCount++;
        continue;
      }

      // Fall back: line-level lookup — collect unique chunks referenced
      // by individual lines in this range, then merge them.
      const referencedChunks = new Set<ReviewChunk>();
      for (let lineNum = sc.startLine; lineNum <= sc.endLine; lineNum++) {
        const line = newLines[lineNum - 1];
        const chunk = lineToChunk.get(line);
        if (chunk) {
          referencedChunks.add(chunk);
        }
      }

      if (referencedChunks.size > 0) {
        // Merge all referenced chunks into one
        let merged: ReviewChunk = {
          chunkId: reusedChunks.length,
          chunkTitle: sc.title,
          startLine: sc.startLine,
          endLine: sc.endLine,
          sections: [],
        };
        for (const c of referencedChunks) {
          merged = mergeChunks(merged, c);
        }
        reusedChunks.push(merged);
        reusedCount++;
      }
    }

    console.log(
      `[Reviewer] No changes detected: ${reusedCount} chunks reused (${fullRangeChunks.length} total ranges)`,
    );

    return {
      articleId,
      version,
      reviewedAt: new Date().toISOString(),
      chunks: reusedChunks,
      groups: [],
      summary: computeSummary(reusedChunks),
      reviewedCount: 0,
      reusedCount,
      totalTokensUsed: 0,
      contentMap: { ...existingContentMap },
      contentSnapshot: newBody,
    };
  }

  // ---- Step 3: Build output by processing unchanged ranges and diff blocks ----

  let reviewedCount = 0;
  let reusedCount = 0;
  let totalTokensUsed = 0;
  const newContentMap: Record<string, ReviewChunk> = { ...existingContentMap };
  const groups: ReviewGroupDetail[] = [];
  const allChunks: ReviewChunk[] = [];

  // 3a. Pre-compute all sub-chunks from diff blocks
  const allSubChunks: Array<{
    startLine: number;
    endLine: number;
    content: string;
    title: string;
  }> = [];
  for (const block of diffBlocks) {
    const subChunks = splitRange(newLines, block.startLine, block.endLine);
    for (const sc of subChunks) {
      allSubChunks.push(sc);
    }
  }

  const totalSubChunks = allSubChunks.length;

  // Report initial progress
  onProgress?.(0, totalSubChunks);

  let processedSubChunks = 0;

  // 3b. Process each sub-chunk (reviewed or reused)
  for (const subChunk of allSubChunks) {
    const originalContent = subChunk.content;

    // Check content map for reuse (exact match)
    if (newContentMap[originalContent] !== undefined) {
      const existing = newContentMap[originalContent];
      allChunks.push({
        ...existing,
        chunkId: allChunks.length,
        startLine: subChunk.startLine,
        endLine: subChunk.endLine,
      });
      reusedCount++;

      // Record for detail page even for reused chunks — prevents
      // groups from being empty when all sub-chunks are reused.
      groups.push({
        targetLines: [subChunk.startLine, subChunk.endLine],
        contextLines: [subChunk.startLine, subChunk.endLine],
      });

      processedSubChunks++;
      onProgress?.(processedSubChunks, totalSubChunks);
      continue;
    }

    // Build context window
    const ctx = buildContext(
      { startLine: subChunk.startLine, endLine: subChunk.endLine },
      newLines,
    );

    // Extract context text and target text
    const contextParts: string[] = [];
    const targetParts: string[] = [];

    for (let lineNum = ctx.startLine; lineNum <= ctx.endLine; lineNum++) {
      const line = newLines[lineNum - 1];
      if (lineNum >= subChunk.startLine && lineNum <= subChunk.endLine) {
        targetParts.push(line);
      } else {
        contextParts.push(line);
      }
    }

    const contextText = contextParts.join("\n");
    const targetText = targetParts.join("\n");

    // Build prompt and call AI
    const prompt = buildReviewPromptWithContext(contextText, targetText, customReviewPrompt);

    try {
      const response = await callDeepSeek({
        prompt,
        responseFormat: "json",
        temperature: 0.3,
        maxTokens: 4096,
      });

      totalTokensUsed += response.usage.total_tokens;

      const report = parseReviewReport(response.content);

      const newChunk: ReviewChunk = {
        chunkId: allChunks.length,
        chunkTitle: subChunk.title,
        startLine: subChunk.startLine,
        endLine: subChunk.endLine,
        sections: report?.sections ?? [],
      };

      newContentMap[originalContent] = newChunk;
      allChunks.push(newChunk);
      reviewedCount++;
    } catch (err) {
      console.error(
        `[Reviewer] Chunk at line ${subChunk.startLine} failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      // Fallback: empty review for this chunk
      const fallbackChunk: ReviewChunk = {
        chunkId: allChunks.length,
        chunkTitle: subChunk.title,
        startLine: subChunk.startLine,
        endLine: subChunk.endLine,
        sections: [],
      };
      newContentMap[originalContent] = fallbackChunk;
      allChunks.push(fallbackChunk);
      reviewedCount++;
    }

    // Record group for detail page
    groups.push({
      targetLines: [subChunk.startLine, subChunk.endLine],
      contextLines: [ctx.startLine, ctx.endLine],
    });

    // Report progress after each sub-chunk
    processedSubChunks++;
    onProgress?.(processedSubChunks, totalSubChunks);
  }

  // 3c. Process unchanged ranges: use line-level lookup for robustness
  const unchangedRanges = complementRanges(newLines.length, diffBlocks);

  for (const range of unchangedRanges) {
    // Try exact sub-chunk match first (when boundaries align)
    const rangeSubChunks = splitRange(newLines, range.startLine, range.endLine);
    for (const sc of rangeSubChunks) {
      // Try exact match
      const exactMatch = newContentMap[sc.content];
      if (exactMatch) {
        allChunks.push({
          ...exactMatch,
          chunkId: allChunks.length,
          startLine: sc.startLine,
          endLine: sc.endLine,
        });
        reusedCount++;
        continue;
      }

      // Fall back: line-level lookup — collect all unique chunks referenced
      // by individual lines in this range, then merge them.
      const referencedChunks = new Set<ReviewChunk>();
      for (let lineNum = sc.startLine; lineNum <= sc.endLine; lineNum++) {
        const line = newLines[lineNum - 1];
        const chunk = lineToChunk.get(line);
        if (chunk) {
          referencedChunks.add(chunk);
        }
      }

      if (referencedChunks.size > 0) {
        let merged: ReviewChunk = {
          chunkId: allChunks.length,
          chunkTitle: sc.title,
          startLine: sc.startLine,
          endLine: sc.endLine,
          sections: [],
        };
        for (const c of referencedChunks) {
          merged = mergeChunks(merged, c);
        }
        allChunks.push(merged);
        reusedCount++;
      }
    }
  }

  // Sort allChunks by startLine to restore document order
  allChunks.sort((a, b) => a.startLine - b.startLine);

  // Re-assign sequential IDs
  allChunks.forEach((chunk, idx) => {
    chunk.chunkId = idx;
  });

  const summary = computeSummary(allChunks);

  console.log(
    `[Reviewer] Review complete: ${summary.totalIssues} issues found ` +
      `(${summary.errors} errors, ${summary.warnings} warnings, ${summary.suggestions} suggestions), ` +
      `${reviewedCount} reviewed, ${reusedCount} reused`,
  );

  return {
    articleId,
    version,
    reviewedAt: new Date().toISOString(),
    chunks: allChunks,
    groups,
    summary,
    reviewedCount,
    reusedCount,
    totalTokensUsed,
    contentMap: newContentMap,
    contentSnapshot: newBody,
  };
}
