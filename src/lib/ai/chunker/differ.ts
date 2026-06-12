/**
 * @file Line-level diff engine.
 *
 * Compares old and new content at the line level to detect changes,
 * returning contiguous blocks of changed lines.
 *
 * Uses the classic LCS (Longest Common Subsequence) algorithm on lines.
 * Adjacent change blocks within `mergeGap` lines are merged to reduce
 * the number of small, fragmented blocks.
 */

import { type DiffBlock } from "./types";

/** Default gap: merge blocks if they are within 3 lines of each other */
const DEFAULT_MERGE_GAP = 3;

/**
 * Compares old and new content and returns blocks of changed lines.
 *
 * @param oldContent - The previous version of the content (without frontmatter)
 * @param newContent - The current version of the content (without frontmatter)
 * @param mergeGap - Maximum lines between two changed blocks for them to be merged (default 3)
 * @returns Array of DiffBlock (each with 1-based line numbers in the new content)
 */
export function detectChanges(
  oldContent: string,
  newContent: string,
  mergeGap: number = DEFAULT_MERGE_GAP,
): DiffBlock[] {
  const oldLines = oldContent.split("\n");
  const newLines = newContent.split("\n");

  // If old is empty, everything is new
  if (!oldContent.trim()) {
    if (!newContent.trim()) {
      return [];
    }
    return [{ startLine: 1, endLine: newLines.length }];
  }

  // If new is empty, there are no blocks in the new content
  if (!newContent.trim()) {
    return [];
  }

  // Build full LCS table for backtracking
  const m = oldLines.length;
  const n = newLines.length;
  const lcs: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        lcs[i][j] = lcs[i - 1][j - 1] + 1;
      } else {
        lcs[i][j] = Math.max(lcs[i - 1][j], lcs[i][j - 1]);
      }
    }
  }

  // Backtrack to find changed lines in new content
  const changedInNew = new Set<number>();
  let i = m;
  let j = n;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      // Lines match — part of LCS, unchanged
      i--;
      j--;
    } else if (j > 0 && (i === 0 || lcs[i][j - 1] >= lcs[i - 1][j])) {
      // Line added in new content
      changedInNew.add(j); // 1-based
      j--;
    } else if (i > 0) {
      // Line removed from old content (no direct mapping to new)
      i--;
    } else {
      break;
    }
  }

  if (changedInNew.size === 0) {
    return [];
  }

  // Convert set of indices to contiguous blocks
  const sorted = Array.from(changedInNew).sort((a, b) => a - b);
  const blocks: DiffBlock[] = [];
  let blockStart = sorted[0];
  let blockEnd = sorted[0];

  for (let k = 1; k < sorted.length; k++) {
    const gap = sorted[k] - sorted[k - 1] - 1;
    if (gap <= mergeGap) {
      // Merge: extend current block
      blockEnd = sorted[k];
    } else {
      blocks.push({ startLine: blockStart, endLine: blockEnd });
      blockStart = sorted[k];
      blockEnd = sorted[k];
    }
  }
  blocks.push({ startLine: blockStart, endLine: blockEnd });

  return blocks;
}
