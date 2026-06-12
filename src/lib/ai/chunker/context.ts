/**
 * @file Context window builder.
 *
 * Given a diff block (a contiguous range of changed lines), extends it
 * upward and downward to provide surrounding context for the AI.
 *
 * The extension algorithm:
 * 1. Extend upward/downward line by line, accumulating character count
 * 2. Prefer to stop/start at heading boundaries (lines starting with #)
 * 3. Respect targetSize (aim to include this many chars of context)
 *    and maxSize (hard cap, never exceed)
 * 4. Always include at least the diff block itself
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

  // Distribute: try to allocate target/2 to each side, with heading alignment
  const halfTarget = Math.floor(targetContext / 2);

  // Extend upward
  const upwardEnd = extendUpward(lines, diffBlock.startLine - 1, halfTarget, contextBudget);
  const upwardChars = computeRangeSize(lines, upwardEnd, diffBlock.startLine - 1);

  // Remaining budget for downward
  const remainingBudget = contextBudget - upwardChars;
  const downwardTarget = Math.min(
    Math.floor(targetContext / 2) + Math.max(0, halfTarget - upwardChars),
    remainingBudget,
  );

  // Extend downward
  const downwardEnd = extendDownward(lines, diffBlock.endLine + 1, downwardTarget, remainingBudget);

  return {
    startLine: upwardEnd,
    endLine: downwardEnd,
  };
}

/**
 * Extends the context upward from `startLine` (exclusive, moving toward line 1).
 *
 * @param lines - Complete lines array
 * @param fromLine - The line just above the diff block (1-based), where extension starts
 * @param targetChars - Target number of characters to include
 * @param maxChars - Maximum number of characters to include
 * @returns The new start line (1-based, inclusive)
 */
function extendUpward(
  lines: string[],
  fromLine: number,
  targetChars: number,
  maxChars: number,
): number {
  if (fromLine < 1 || maxChars <= 0) {
    return fromLine + 1; // Return the original diff start
  }

  let collected = 0;
  let currentLine = fromLine;
  let lastHeadingLine = -1;

  while (currentLine >= 1) {
    const lineLen = lines[currentLine - 1].length + 1; // +1 for newline

    // Check if this is a heading (prefer to include entire heading sections)
    if (/^#{1,4} /.test(lines[currentLine - 1])) {
      lastHeadingLine = currentLine;
    }

    if (collected + lineLen > maxChars) {
      // If we haven't collected enough for target but hit max, stop
      break;
    }

    collected += lineLen;
    currentLine--;
  }

  // If we found a heading within the collected range, align to it
  if (lastHeadingLine !== -1) {
    return lastHeadingLine;
  }

  return currentLine + 1;
}

/**
 * Extends the context downward from `endLine` (exclusive, moving toward end).
 *
 * @param lines - Complete lines array
 * @param fromLine - The line just below the diff block (1-based), where extension starts
 * @param targetChars - Target number of characters to include
 * @param maxChars - Maximum number of characters to include
 * @returns The new end line (1-based, inclusive)
 */
function extendDownward(
  lines: string[],
  fromLine: number,
  targetChars: number,
  maxChars: number,
): number {
  const totalLines = lines.length;
  if (fromLine > totalLines || maxChars <= 0) {
    return fromLine - 1; // Return the original diff end
  }

  let collected = 0;
  let currentLine = fromLine;

  // Track if we pass a heading — we want to include the whole section after a heading
  let pendingHeadingLine = -1;

  while (currentLine <= totalLines) {
    const lineLen = lines[currentLine - 1].length + 1;

    // If we encounter a heading, mark it (we might want to include its section)
    if (/^#{1,4} /.test(lines[currentLine - 1]) && collected > 0) {
      // This heading would start a new section; stop before it unless we're below target
      if (collected >= targetChars) {
        return currentLine - 1;
      }
      pendingHeadingLine = currentLine;
    }

    if (collected + lineLen > maxChars) {
      break;
    }

    collected += lineLen;
    currentLine++;
  }

  // If we passed a heading, include up to just before it
  if (pendingHeadingLine !== -1 && pendingHeadingLine < currentLine) {
    return pendingHeadingLine - 1;
  }

  return currentLine - 1;
}

/**
 * Computes the total character size of a range of lines.
 */
function computeRangeSize(
  lines: string[],
  startLine: number,
  endLine: number,
): number {
  let size = 0;
  for (let i = startLine - 1; i < Math.min(endLine, lines.length); i++) {
    size += lines[i].length + 1;
  }
  return size;
}
