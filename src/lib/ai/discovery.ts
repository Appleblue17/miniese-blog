/**
 * @file Wiki term discovery logic.
 *
 * Scans article content for candidate wiki terms by calling DeepSeek API.
 *
 * Supports both full-scan (discoverWikiCandidates) and incremental mode
 * (incrementalDiscover) using the unified pipeline:
 * - detectChanges() — line-level diff
 * - splitRange() — heading-based chunking
 * - buildContext() — context window
 *
 * Incremental mode reuses existing candidates for unchanged content,
 * only sending changed sub-chunks to the AI.
 *
 * Deduplicates across:
 * 1. Terms within the same AI response (case-insensitive)
 * 2. Existing WikiEntry records (already reviewed or proposed)
 * 3. Existing WikiDiscovery proposals for the same article (any status)
 */

import { prisma } from "../db";
import { callDeepSeek } from "./client";
import { splitArticle, stripFrontmatter } from "./chunker/chunker";
import { detectChanges } from "./chunker/differ";
import { splitRange } from "./chunker/chunker";
import { buildContext } from "./chunker/context";
import type { ProgressCallback } from "./translator2";

/**
 * A candidate term discovered by the AI.
 */
export interface DiscoveryCandidate {
  /** The term name */
  term: string;
  /** Type: acronym | concept | theorem | tech | other */
  type: string;
  /** One-sentence definition */
  definition: string;
  /** Importance score (0-1) */
  importance: number;
}

// ---------------------------------------------------------------------------
// Incremental discovery (uses unified pipeline)
// ---------------------------------------------------------------------------

/**
 * Computes the recommended maximum number of candidate terms for a given
 * article body length.
 *
 * Formula: min(3 + contentLength / 800, 10)
 *
 * For example:
 * - 2000 chars → min(3 + 2.5, 10) = 5
 * - 4000 chars → min(3 + 5, 10) = 8
 * - 6400 chars → min(3 + 8, 10) = 10
 *
 * @param contentLength - Number of characters in the article body
 * @returns Recommended max candidates (between 3 and 10)
 */
function computeMaxCandidates(contentLength: number): number {
  return Math.min(3 + Math.floor(contentLength / 800), 10);
}

/**
 * Performs incremental term discovery using the unified diff pipeline.
 *
 * Only processes changed sub-chunks through the AI, reusing existing
 * candidates for unchanged content.
 *
 * @param oldSourceContent - Previous version of article body (empty = full scan)
 * @param newSourceContent - Current version of article body
 * @param existingCandidatesMap - Previous discovery results (content → DiscoveryCandidate[])
 * @param articleLang - Language code ("zh" | "en")
 * @param articleId - Article ID for dedup against existing proposals
 * @param customDiscoveryPrompt - Optional custom prompt template
 * @param onProgress - Optional progress callback
 * @returns Deduplicated candidates + contentSnapshot + existingCandidatesMap for next run
 */
export async function incrementalDiscover(
  oldSourceContent: string,
  newSourceContent: string,
  existingCandidatesMap: Record<string, DiscoveryCandidate[]>,
  articleLang: string,
  articleId: string,
  customDiscoveryPrompt?: string,
  onProgress?: ProgressCallback,
): Promise<{
  candidates: DiscoveryCandidate[];
  contentSnapshot: string;
  existingCandidatesMap: Record<string, DiscoveryCandidate[]>;
}> {
  const newBody = stripFrontmatter(newSourceContent);
  const oldBody = stripFrontmatter(oldSourceContent);

  if (!newBody.trim()) {
    return { candidates: [], contentSnapshot: newBody, existingCandidatesMap: {} };
  }

  const newLines = newBody.split("\n");

  // ---- Step 1: Run line-level diff ----
  const diffBlocks = detectChanges(oldBody, newBody);

  // ---- Step 2: Handle no changes ----
  if (diffBlocks.length === 0) {
    // All content unchanged — reuse all existing candidates
    const allReused: DiscoveryCandidate[] = [];
    for (const candidates of Object.values(existingCandidatesMap)) {
      allReused.push(...candidates);
    }

    const deduped = deduplicateByTerm(allReused);
    const filtered = await deduplicateWithExisting(deduped, articleLang, articleId);

    return { candidates: filtered, contentSnapshot: newBody, existingCandidatesMap };
  }

  // ---- Step 3: Build line-level lookup for candidate reuse ----
  const lineToCandidates = new Map<string, DiscoveryCandidate[]>();
  for (const [sourceText, candidates] of Object.entries(existingCandidatesMap)) {
    const sourceLines = sourceText.split("\n");
    for (const line of sourceLines) {
      if (!lineToCandidates.has(line)) {
        lineToCandidates.set(line, candidates);
      }
    }
  }

  // ---- Step 4: Process diff blocks ----
  const allSubChunks: Array<{ startLine: number; endLine: number; content: string; title: string }> = [];
  for (const block of diffBlocks) {
    const subChunks = splitRange(newLines, block.startLine, block.endLine);
    for (const sc of subChunks) {
      allSubChunks.push(sc);
    }
  }

  const totalSubChunks = allSubChunks.length;
  let processedSubChunks = 0;
  onProgress?.(0, totalSubChunks);

  // Collect results and build the new existingCandidatesMap
  // Key design: each subchunk content maps to the candidates found for it
  const newCandidates: DiscoveryCandidate[] = [];
  const newExistingMap: Record<string, DiscoveryCandidate[]> = {};
  const reusedKeys = new Set<string>();

  for (const subChunk of allSubChunks) {
    const existing = existingCandidatesMap[subChunk.content];
    if (existing) {
      newCandidates.push(...existing);
      newExistingMap[subChunk.content] = existing;
      reusedKeys.add(subChunk.content);
      processedSubChunks++;
      onProgress?.(processedSubChunks, totalSubChunks);
      continue;
    }

    // Build context window
    const ctx = buildContext(
      { startLine: subChunk.startLine, endLine: subChunk.endLine },
      newLines,
    );

    // Build prompt and call AI
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

    // Compute max candidates based on the full body length
    const maxCandidates = computeMaxCandidates(newBody.length);

    const combinedPrompt = (customDiscoveryPrompt || "")
      .replace(/\{\{content\}\}/g, () => targetText)
      .replace(/\{\{context\}\}/g, () => contextText)
      .replace(/\{\{language\}\}/g, () => (articleLang === "en" ? "English" : "Chinese"))
      .replace(/\{\{maxCandidates\}\}/g, () => String(maxCandidates));

    try {
      const response = await callDeepSeek({
        prompt: combinedPrompt,
        responseFormat: "json",
        temperature: 0.3,
        maxTokens: 4096,
      });

      const candidates = parseDiscoveryResponse(response.content);
      newCandidates.push(...candidates);
      newExistingMap[subChunk.content] = candidates;
    } catch (err) {
      console.warn(
        `[Discovery] Failed to process chunk at line ${subChunk.startLine}: ${err instanceof Error ? err.message : String(err)}`,
      );
      newExistingMap[subChunk.content] = [];
    }

    processedSubChunks++;
    onProgress?.(processedSubChunks, totalSubChunks);
  }

  // ---- Step 5: Collect candidates from unchanged ranges ----
  // Use line-level fallback for unchanged lines that might have had
  // candidates from previous runs.
  const unchangedRanges = complementRanges(newLines.length, diffBlocks);
  for (const range of unchangedRanges) {
    const rangeSubChunks = splitRange(newLines, range.startLine, range.endLine);
    for (const sc of rangeSubChunks) {
      // Try exact match first
      const exact = existingCandidatesMap[sc.content];
      if (exact) {
        if (!reusedKeys.has(sc.content)) {
          newCandidates.push(...exact);
          newExistingMap[sc.content] = exact;
          reusedKeys.add(sc.content);
        }
        continue;
      }

      // Fall back: line-level lookup — collect unique candidates
      const seenInRange = new Set<string>();
      for (let lineNum = sc.startLine; lineNum <= sc.endLine; lineNum++) {
        const line = newLines[lineNum - 1];
        const candidates = lineToCandidates.get(line);
        if (candidates) {
          for (const c of candidates) {
            const key = c.term.toLowerCase().trim();
            if (!seenInRange.has(key)) {
              seenInRange.add(key);
              newCandidates.push(c);
            }
          }
        }
      }
    }
  }

  // ---- Step 6: Deduplicate and filter ----
  const uniqueCandidates = deduplicateByTerm(newCandidates);
  const filtered = await deduplicateWithExisting(uniqueCandidates, articleLang, articleId);

  return { candidates: filtered, contentSnapshot: newBody, existingCandidatesMap: newExistingMap };
}

/**
 * Deduplicates candidates against existing wiki entries and proposals.
 */
async function deduplicateWithExisting(
  candidates: DiscoveryCandidate[],
  language: string,
  articleId: string,
): Promise<DiscoveryCandidate[]> {
  if (candidates.length === 0) return [];

  // Filter against existing wiki entries in DB
  const afterEntries = await filterExistingWikiEntries(candidates, language);
  if (afterEntries.length === 0) return [];

  // Filter against existing proposals for the same article
  return filterPendingProposals(afterEntries, articleId);
}

/**
 * Computes the complement of a set of ranges within [1, totalLines].
 */
function complementRanges(totalLines: number, blocks: Array<{ startLine: number; endLine: number }>): Array<{ startLine: number; endLine: number }> {
  if (blocks.length === 0) {
    return [{ startLine: 1, endLine: totalLines }];
  }
  const result: Array<{ startLine: number; endLine: number }> = [];
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

// ---------------------------------------------------------------------------
// Full-scan discovery (existing — kept for non-incremental triggers)
// ---------------------------------------------------------------------------

/**
 * Scans article content and returns candidate wiki terms, deduplicated.
 *
 * For long articles, automatically splits into chunks using the
 * pipeline's chunker (splitArticle) and processes each chunk separately.
 *
 * @param articleId - The article's database ID.
 * @param articleLang - The article's language code ("zh" | "en").
 * @param content - The full article content (may include frontmatter).
 * @param customDiscoveryPrompt - Optional custom discovery prompt template.
 * @returns A deduplicated list of candidate terms.
 */
export async function discoverWikiCandidates(
  articleId: string,
  articleLang: string,
  content: string,
  customDiscoveryPrompt?: string,
): Promise<DiscoveryCandidate[]> {
  // 1. Strip frontmatter to get body
  const body = stripFrontmatter(content);
  if (!body.trim()) {
    return [];
  }

  // 2. Split article into chunks if long
  const chunks = splitArticle(body);

  // 3. Process each chunk, collect candidates
  const allCandidates: DiscoveryCandidate[] = [];

  for (const chunk of chunks) {
    try {
      const candidates = await processChunk(chunk.content, articleLang, customDiscoveryPrompt);
      allCandidates.push(...candidates);
    } catch (err) {
      console.warn(
        `[Discovery] Failed to process chunk "${chunk.title}": ${err instanceof Error ? err.message : String(err)}`,
      );
      // Continue with next chunk
    }
  }

  // 4. Deduplicate within results (case-insensitive)
  const uniqueCandidates = deduplicateByTerm(allCandidates);

  // 5. Filter out existing wiki entries (case-insensitive, same language)
  const filtered = await filterExistingWikiEntries(uniqueCandidates, articleLang);

  // 6. Filter out existing pending proposals (same article)
  return filterPendingProposals(filtered, articleId);
}

/**
 * Processes a single chunk of article content through the AI.
 *
 * @param chunkContent - The chunk content to scan.
 * @param language - The article's language code ("zh" | "en").
 * @param customPrompt - Optional custom discovery prompt template.
 * @returns List of candidate terms from this chunk.
 */
async function processChunk(chunkContent: string, language: string, customPrompt?: string): Promise<DiscoveryCandidate[]> {
  // Use the provided prompt (from settings) with placeholder substitution.
  // customPrompt is always provided by the worker (loaded from settings).
  const maxCandidates = computeMaxCandidates(chunkContent.length);
  const combinedPrompt = (customPrompt || "")
    .replace(/\{\{content\}\}/g, () => chunkContent)
    .replace(/\{\{language\}\}/g, () => language === "en" ? "English" : "Chinese")
    .replace(/\{\{maxCandidates\}\}/g, () => String(maxCandidates));

  const response = await callDeepSeek({
    prompt: combinedPrompt,
    responseFormat: "json",
    temperature: 0.3,
    maxTokens: 4096,
  });

  // Parse the response
  return parseDiscoveryResponse(response.content);
}

/**
 * Parses the AI response into candidate terms.
 *
 * @param responseContent - Raw AI response string.
 * @returns List of candidate terms, or empty array if parsing fails.
 */
function parseDiscoveryResponse(responseContent: string): DiscoveryCandidate[] {
  try {
    const parsed = JSON.parse(responseContent);
    if (!parsed.candidates || !Array.isArray(parsed.candidates)) {
      return [];
    }

    return parsed.candidates
      .filter(
        (c: unknown) =>
          c &&
          typeof c === "object" &&
          typeof (c as Record<string, unknown>).term === "string" &&
          typeof (c as Record<string, unknown>).type === "string" &&
          typeof (c as Record<string, unknown>).definition === "string" &&
          typeof (c as Record<string, unknown>).importance === "number",
      )
      .map((c: Record<string, unknown>) => ({
        term: String(c.term),
        type: String(c.type),
        definition: String(c.definition),
        importance: Number(c.importance),
      }));
  } catch {
    // Malformed JSON
    return [];
  }
}

/**
 * Deduplicates candidates by term (case-insensitive).
 * Keeps the first occurrence of each term.
 *
 * @param candidates - Raw candidate list.
 * @returns Deduplicated candidate list.
 */
function deduplicateByTerm(candidates: DiscoveryCandidate[]): DiscoveryCandidate[] {
  const seen = new Set<string>();
  return candidates.filter((c) => {
    const key = c.term.toLowerCase().trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Removes candidates whose term already exists as a wiki entry
 * in the same language.
 *
 * @param candidates - Deduplicated candidate list.
 * @param language - The article's language.
 * @returns Filtered candidate list.
 */
async function filterExistingWikiEntries(
  candidates: DiscoveryCandidate[],
  language: string,
): Promise<DiscoveryCandidate[]> {
  if (candidates.length === 0) return [];

  const existingEntries = await prisma.wikiEntry.findMany({
    where: {
      language: language as "zh" | "en",
    },
    select: { name: true },
  });

  if (existingEntries.length === 0) return candidates;

  const existingSet = new Set(existingEntries.map((e) => e.name.toLowerCase().trim()));

  return candidates.filter((c) => !existingSet.has(c.term.toLowerCase().trim()));
}

/**
 * Removes candidates whose term already exists in ANY discovery proposal
 * (pending, approved, or rejected) for the same article.
 *
 * This prevents the same term from being discovered multiple times for
 * the same article across different discovery runs.
 *
 * @param candidates - Deduplicated candidate list.
 * @param articleId - The article's database ID.
 * @returns Filtered candidate list.
 */
async function filterPendingProposals(
  candidates: DiscoveryCandidate[],
  articleId: string,
): Promise<DiscoveryCandidate[]> {
  if (candidates.length === 0) return [];

  const existingProposals = await prisma.wikiDiscovery.findMany({
    where: {
      articleId,
    },
    select: { term: true },
  });

  if (existingProposals.length === 0) return candidates;

  const existingSet = new Set(existingProposals.map((p) => p.term.toLowerCase().trim()));

  return candidates.filter((c) => !existingSet.has(c.term.toLowerCase().trim()));
}
