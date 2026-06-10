/**
 * @file Simple line-based diff utility.
 *
 * Produces a list of changes with added/removed lines.
 * Used for displaying pre-publish diffs.
 */

export interface DiffLine {
  type: "added" | "removed" | "unchanged";
  value: string;
  lineNumOld?: number;
  lineNumNew?: number;
}

export interface DiffResult {
  lines: DiffLine[];
  added: number;
  removed: number;
}

/**
 * Computes a simple line-based diff between two strings.
 * Uses a basic LCS-based approach.
 */
export function computeDiff(oldText: string, newText: string): DiffResult {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");

  // Build LCS table
  const m = oldLines.length;
  const n = newLines.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array.from({ length: n + 1 }, () => 0),
  );

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to find diff
  const lines: DiffLine[] = [];
  let i = m;
  let j = n;

  const temp: DiffLine[] = [];
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      temp.push({
        type: "unchanged",
        value: oldLines[i - 1],
        lineNumOld: i,
        lineNumNew: j,
      });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      temp.push({ type: "added", value: newLines[j - 1], lineNumNew: j });
      j--;
    } else {
      temp.push({ type: "removed", value: oldLines[i - 1], lineNumOld: i });
      i--;
    }
  }

  lines.push(...temp.reverse());

  const added = lines.filter((l) => l.type === "added").length;
  const removed = lines.filter((l) => l.type === "removed").length;

  return { lines, added, removed };
}
