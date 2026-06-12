/**
 * @file Context window builder.
 *
 * Given a diff block (a contiguous range of changed lines), extends it
 * upward and downward to provide surrounding context for the AI.
 *
 * Strategy: extend upward line by line until we either reach targetSize
 * OR hit a heading boundary. Same for downward. The heading boundary
 * wins — if we hit a heading before reaching targetSize, we stop there.
 */

import { type DiffBlock, type ContextConfig, DEFAULT_CONTEXT_CONFIG } from "./types";

/**
 * Builds a context window around a diff block.
 *
 * @param diffBlock - The original diff block
 * @param lines - The complete lines array of the article body
 * @param config - Context configuration (default if not provided)
 * @returns Expanded line range { startLine, endLine } (1-based, inclusive)
 */
export function buildContext(
  diffBlock: DiffBlock,
  lines: string[],
  config: ContextConfig = DEFAULT_CONTEXT_CONFIG,
): { startLine: number; endLine: number } {
  const totalLines = lines.length;

  // Calculate the size of the diff block itself
  const diffSize = computeRangeSize(lines, diffBlock.startLine, diffBlock.endLine);

  // If the diff block alone is larger than maxSize, return it as-is
  if (diffSize >= config.maxSize) {
    return { startLine: diffBlock.startLine, endLine: diffBlock.endLine };
  }

  // Available budget for context (both sides combined)
  const contextBudget = config.maxSize - diffSize;
  const targetContext = Math.min(config.targetSize, contextBudget);

  // Extend upward: collect until we hit targetSize or a heading
  const upwardStart = extendUpward(lines, diffBlock.startLine - 1, targetContext);
  const upwardChars =
    upwardStart > 0 ? computeRangeSize(lines, upwardStart, diffBlock.startLine - 1) : 0;

  // Extend downward: remaining budget
  const remainingBudget = contextBudget - upwardChars;
  const downwardTarget = Math.min(targetContext, remainingBudget);
  const downwardEnd = extendDownward(lines, diffBlock.endLine + 1, downwardTarget);

  return {
    startLine: upwardStart > 0 ? upwardStart : diffBlock.startLine,
    endLine: downwardEnd > 0 ? downwardEnd : diffBlock.endLine,
  };
}

/**
 * Extends the context upward from `fromLine` (exclusive, moving toward line 1).
 *
 * Stops when either:
 * - targetChars of context has been accumulated, OR
 * - a heading line (starting with #) is encountered
 *
 * @param lines - Complete lines array
 * @param fromLine - The line just above the diff block (1-based), where extension starts
 * @param targetChars - Target number of characters to include
 * @returns The new start line (1-based, inclusive), or 0 if no context added
 */
function extendUpward(lines: string[], fromLine: number, targetChars: number): number {
  if (fromLine < 1 || targetChars <= 0) {
    return 0;
  }

  let collected = 0;
  let currentLine = fromLine;

  while (currentLine >= 1) {
    const line = lines[currentLine - 1];

    // Stop at heading boundary (include the heading in context)
    if (/^#{1,4} /.test(line)) {
      return currentLine;
    }

    collected += line.length + 1;

    // Stop if we've collected enough
    if (collected >= targetChars) {
      return currentLine;
    }

    currentLine--;
  }

  // Reached the top of the article
  return 1;
}

/**
 * Extends the context downward from `fromLine` (exclusive, moving toward end).
 *
 * Stops when either:
 * - targetChars of context has been accumulated, OR
 * - a heading line (starting with #) is encountered
 *
 * @param lines - Complete lines array
 * @param fromLine - The line just below the diff block (1-based), where extension starts
 * @param targetChars - Target number of characters to include
 * @returns The new end line (1-based, inclusive), or 0 if no context added
 */
function extendDownward(lines: string[], fromLine: number, targetChars: number): number {
  const totalLines = lines.length;
  if (fromLine > totalLines || targetChars <= 0) {
    return 0;
  }

  let collected = 0;
  let currentLine = fromLine;

  while (currentLine <= totalLines) {
    const line = lines[currentLine - 1];

    // Stop at heading boundary (don't include the next section's heading)
    if (/^#{1,4} /.test(line)) {
      return currentLine - 1;
    }

    collected += line.length + 1;

    // Stop if we've collected enough
    if (collected >= targetChars) {
      return currentLine;
    }

    currentLine++;
  }

  // Reached the bottom of the article
  return totalLines;
}

/**
 * Computes the total character size of a range of lines.
 */
function computeRangeSize(lines: string[], startLine: number, endLine: number): number {
  let size = 0;
  for (let i = startLine - 1; i < Math.min(endLine, lines.length); i++) {
    size += lines[i].length + 1;
  }
  return size;
}
