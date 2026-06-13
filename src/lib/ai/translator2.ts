/**
 * @file Line-level incremental translation engine (v2).
 *
 * Replaces the old chunk-content-comparison approach with a pure line-level
 * diff pipeline.
 *
 * Key insight: translations don't change line numbering. So assembly can
 * simply replace lines in the newLines array by their translations.
 *
 * Workflow:
 * 1. Strip YAML frontmatter from old and new content → newLines[]
 * 2. detectChanges(oldBody, newBody) → DiffBlock[] (changed line ranges)
 * 3. Build outputLines = copy of newLines
 * 4. For unchanged line ranges (complement of diffBlocks):
 *    - Extract the original content of those lines
 *    - Look up existingTranslations by content → replace in outputLines
 * 5. For each DiffBlock:
 *    a. splitRange() to split by heading boundaries → sub-Chunk[]
 *    b. For each sub-Chunk:
 *       - Check existingTranslations by content → reuse if found
 *       - Otherwise: buildContext → call AI → parse response
 *       - Store in translations map (content → translated text)
 *       - Replace corresponding lines in outputLines
 * 6. outputLines.join("\n") → final translated body
 *
 * Key design decisions:
 * - TranslationMap keys remain original content strings (for cache lookup)
 * - Assembly is line-based, not chunk-based
 * - Each AI call handles exactly one sub-chunk with [TRANSLATE_START]/[TRANSLATE_END]
 */

import { stripFrontmatter, extractFrontmatterBlock, splitRange } from "./chunker/chunker";
import { detectChanges } from "./chunker/differ";
import type { DiffBlock } from "./chunker/types";
import { buildContext } from "./chunker/context";
import { callDeepSeek } from "./client";

/**
 * Stores a mapping from original content to its translated text.
 */
export type TranslationMap = Record<string, string>;

/**
 * Progress callback for reporting translation/review progress.
 * @param processed - Number of sub-chunks processed so far
 * @param total - Total number of sub-chunks
 */
export type ProgressCallback = (processed: number, total: number) => void;

// ---------------------------------------------------------------------------
// Type definitions
// ---------------------------------------------------------------------------

/**
 * A group that was sent to the AI for translation, with context boundaries.
 */
export interface ChangeGroupDetail {
  /** Line range of the target in the new content (1-based, inclusive) */
  targetLines: [number, number];
  /** Context window line range (inclusive) */
  contextLines: [number, number];
}

/**
 * Result of the translation process.
 */
export interface TranslateResult {
  /** The fully translated content (frontmatter + translated body) */
  translatedContent: string;
  /** Number of sub-chunks that were newly translated by the AI */
  translatedCount: number;
  /** Number of line ranges reused from existing translations */
  reusedCount: number;
  /** Total API tokens used (sum of all calls) */
  totalTokensUsed: number;
  /** Mapping of original content → translated text */
  translations: TranslationMap;
  /** Groups sent to AI, for detail page rendering */
  translatedGroups: ChangeGroupDetail[];
}

// ---------------------------------------------------------------------------
// Prompt building
// ---------------------------------------------------------------------------

/**
 * Builds a translation prompt for a single target chunk with context.
 *
 * When `customPrompt` is provided, uses it as the full prompt template.
 * The custom prompt must contain `[TRANSLATE_START]` and `[TRANSLATE_END]` markers
 * to delimit the target text, and should include context references using
 * `{{context}}` and `{{target}}` placeholders.
 *
 * @param sourceLang - Source language name
 * @param targetLang - Target language name
 * @param contextText - Context text (unmarked)
 * @param targetText - Target text to translate
 * @param customPrompt - Optional custom prompt template
 * @returns The prompt string
 */
function buildChunkPrompt(
  sourceLang: string,
  targetLang: string,
  contextText: string,
  targetText: string,
  customPrompt?: string,
): string {
  if (!customPrompt) {
    // Minimal fallback for tests (production always provides prompt from settings)
    const lines: string[] = [];
    lines.push(`Translate the following content from ${sourceLang} to ${targetLang}.`);
    lines.push("");
    lines.push("[TRANSLATE_START]");
    lines.push(targetText);
    lines.push("[TRANSLATE_END]");
    return lines.join("\n");
  }

  let prompt = customPrompt;
  prompt = prompt.replace(/\{\{sourceLang\}\}/g, sourceLang);
  prompt = prompt.replace(/\{\{targetLang\}\}/g, targetLang);
  prompt = prompt.replace(/\{\{context\}\}/g, contextText);
  prompt = prompt.replace(/\{\{target\}\}/g, targetText);
  return prompt;
}

// ---------------------------------------------------------------------------
// Response parsing
// ---------------------------------------------------------------------------

/**
 * Parses the AI response to extract the translated chunk content.
 */
function parseTranslatedChunk(response: string): string {
  const regex = /\[TRANSLATE_START\]\n?([\s\S]*?)\n?\[TRANSLATE_END\]/;
  const match = regex.exec(response);
  if (match) {
    return match[1].trim();
  }
  return "";
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Computes the complement of a set of ranges within [1, totalLines].
 * Returns the ranges that are NOT covered by any diff block.
 *
 * Example: totalLines=7, blocks=[{2,3},{5,6}] → [{1,1},{4,4},{7,7}]
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
 * Extracts the content of a line range from a lines array.
 */
function extractContent(lines: string[], startLine: number, endLine: number): string {
  return lines.slice(startLine - 1, endLine).join("\n");
}

/**
 * Replaces a range of lines in an array with new content.
 * The new content may have more or fewer lines than the range.
 */
function replaceLines(
  lines: string[],
  startLine: number,
  endLine: number,
  newContent: string,
): string[] {
  const newLineArr = newContent.split("\n");
  const before = lines.slice(0, startLine - 1);
  const after = lines.slice(endLine);
  return [...before, ...newLineArr, ...after];
}

// ---------------------------------------------------------------------------
// Main translation pipeline
// ---------------------------------------------------------------------------

/**
 * Translates article content incrementally using line-level diff.
 *
 * @param oldSourceContent - Previous version of the source content (or empty)
 * @param newSourceContent - Current version of the source content
 * @param existingTranslations - Previously translated chunks (original content → translated text)
 * @param sourceLang - Source language name (e.g., "Chinese", "English")
 * @param targetLang - Target language name (e.g., "English", "Chinese")
 * @param onProgress - Optional callback for progress reporting (processed, total)
 * @param customTranslatePrompt - Optional custom translation prompt template
 * @returns The translation result
 */
export async function incrementalTranslate(
  oldSourceContent: string,
  newSourceContent: string,
  existingTranslations: TranslationMap,
  sourceLang: string,
  targetLang: string,
  onProgress?: ProgressCallback,
  customTranslatePrompt?: string,
): Promise<TranslateResult> {
  // Strip frontmatter
  const newFrontmatter = extractFrontmatterBlock(newSourceContent);
  const oldBody = stripFrontmatter(oldSourceContent);
  const newBody = stripFrontmatter(newSourceContent);

  if (!newBody.trim()) {
    return {
      translatedContent: newFrontmatter || "",
      translatedCount: 0,
      reusedCount: 0,
      totalTokensUsed: 0,
      translations: {},
      translatedGroups: [],
    };
  }

  const newLines = newBody.split("\n");

  // ---- Step 1: Run line-level diff ----
  const diffBlocks = detectChanges(oldBody, newBody);

  // ---- Step 2: Handle no changes ----
  if (diffBlocks.length === 0) {
    // All content is unchanged. Reuse every line from existingTranslations.
    const translatedLines = newLines.map((line) => {
      const t = existingTranslations[line];
      return t !== undefined ? t : line;
    });
    const translatedBody = translatedLines.join("\n");

    return {
      translatedContent: newFrontmatter ? newFrontmatter + "\n\n" + translatedBody : translatedBody,
      translatedCount: 0,
      reusedCount: translatedLines.filter((_, i) => existingTranslations[newLines[i]] !== undefined)
        .length,
      totalTokensUsed: 0,
      translations: { ...existingTranslations },
      translatedGroups: [],
    };
  }

  // ---- Step 3: Build output by processing unchanged ranges and diff blocks ----

  let translatedCount = 0;
  let reusedCount = 0;
  let totalTokensUsed = 0;
  const newTranslations: TranslationMap = { ...existingTranslations };
  const translatedGroups: ChangeGroupDetail[] = [];
  let outputLines = [...newLines];

  // 3a. Process unchanged ranges: reuse from existingTranslations
  //
  // existingTranslations is keyed by multi-line content (the original content
  // of a sub-chunk), not by individual lines. So we try to match the entire
  // unchanged range content first (for exact sub-chunk matches), then fall
  // back to merging lines from existingTranslations that are contiguous.
  //
  // In practice, after several incremental edits, unchanged ranges span
  // multiple previously-translated sub-chunks. The most reliable approach is
  // to look up each line individually in a map built from the full key-split
  // values of existingTranslations.
  const unchangedRanges = complementRanges(newLines.length, diffBlocks);

  // Build a reverse map: for each translation value in existingTranslations,
  // store all its constituent lines mapped to their original (source) text.
  // This allows single-line lookups to find translations from multi-line keys.
  const lineToTranslation = new Map<string, string>();
  for (const [sourceText, translatedText] of Object.entries(existingTranslations)) {
    const sourceLines = sourceText.split("\n");
    const translatedLines = translatedText.split("\n");
    const minLen = Math.min(sourceLines.length, translatedLines.length);
    // Map each source line to its corresponding translated line
    for (let i = 0; i < minLen; i++) {
      // Only store if not already mapped (first match wins — most specific)
      if (!lineToTranslation.has(sourceLines[i])) {
        lineToTranslation.set(sourceLines[i], translatedLines[i]);
      }
    }
  }

  for (const range of unchangedRanges) {
    for (let lineNum = range.startLine; lineNum <= range.endLine; lineNum++) {
      const line = newLines[lineNum - 1];
      const t = lineToTranslation.get(line);
      if (t !== undefined) {
        outputLines[lineNum - 1] = t;
        reusedCount++;
      }
    }
  }

  // 3b. Pre-compute total sub-chunks for progress reporting
  const allSubChunks: Array<{ startLine: number; endLine: number; content: string }> = [];
  for (const block of diffBlocks) {
    const subChunks = splitRange(newLines, block.startLine, block.endLine);
    for (const sc of subChunks) {
      allSubChunks.push(sc);
    }
  }

  const totalSubChunks = allSubChunks.length;
  let processedSubChunks = 0;

  // Report initial progress
  onProgress?.(0, totalSubChunks);

  // 3c. Process each sub-chunk
  for (const subChunk of allSubChunks) {
    const originalContent = subChunk.content;

    // Check existing translations by content
    if (newTranslations[originalContent] !== undefined) {
      // Already translated (either from existingTranslations or previous sub-chunk)
      const translated = newTranslations[originalContent];
      outputLines = replaceLines(outputLines, subChunk.startLine, subChunk.endLine, translated);
      reusedCount++;
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
    const prompt = buildChunkPrompt(sourceLang, targetLang, contextText, targetText, customTranslatePrompt);

    const result = await callDeepSeek({
      prompt,
      responseFormat: "text",
      temperature: 0.3,
    });

    totalTokensUsed += result.usage.total_tokens;

    const translated = parseTranslatedChunk(result.content);

    if (translated) {
      newTranslations[originalContent] = translated;
      translatedCount++;

      // Replace lines in output
      outputLines = replaceLines(outputLines, subChunk.startLine, subChunk.endLine, translated);
    } else {
      // Fallback: use original content
      console.warn(
        `[Translator2] Sub-chunk at line ${subChunk.startLine} returned empty translation, using original.`,
      );
      newTranslations[originalContent] = originalContent;
      translatedCount++;
    }

    // Record for detail page
    translatedGroups.push({
      targetLines: [subChunk.startLine, subChunk.endLine],
      contextLines: [ctx.startLine, ctx.endLine],
    });

    // Report progress after each sub-chunk
    processedSubChunks++;
    onProgress?.(processedSubChunks, totalSubChunks);
  }

  // ---- Step 4: Assemble final content ----
  const translatedBody = outputLines.join("\n");
  const translatedContent = newFrontmatter
    ? newFrontmatter + "\n\n" + translatedBody
    : translatedBody;

  return {
    translatedContent,
    translatedCount,
    reusedCount,
    totalTokensUsed,
    translations: newTranslations,
    translatedGroups,
  };
}

/**
 * Performs a full translation. Delegates to `incrementalTranslate` with
 * empty old content — all content is treated as "new" and translated.
 *
 * @param sourceContent - The source text to translate
 * @param sourceLang - Source language name
 * @param targetLang - Target language name
 * @returns The translation result
 */
export async function translateFull(
  sourceContent: string,
  sourceLang: string,
  targetLang: string,
): Promise<TranslateResult> {
  return incrementalTranslate("", sourceContent, {}, sourceLang, targetLang);
}
