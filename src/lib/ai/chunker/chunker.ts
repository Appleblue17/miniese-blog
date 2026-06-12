/**
 * @file Article content chunker.
 *
 * Splits article Markdown content into chunks for AI processing.
 *
 * Strategy:
 * 1. Strip YAML frontmatter
 * 2. Identify all heading boundaries (h1/h2/h3/h4)
 * 3. Group heading sections into chunks targeting TARGET_CHUNK_SIZE (~5000 chars),
 *    with MIN_CHUNK_SIZE (~1000) and MAX_CHUNK_SIZE (~8000) guards:
 *    - If a heading section alone exceeds MAX_CHUNK_SIZE, split it further by
 *      double-newline (paragraph) or fixed length
 *    - If adding the next section keeps total ≤ MAX_CHUNK_SIZE, merge them
 *    - Never split mid-paragraph across chunk boundaries
 * 4. For content with no headings, fall back to double-newline splitting
 *    with the same size guards
 *
 * Provides both `splitArticle` (full content) and `splitRange` (line range).
 */

import {
  type Chunk,
  TARGET_CHUNK_SIZE,
  MIN_CHUNK_SIZE,
  MAX_CHUNK_SIZE,
} from "./types";

export type { Chunk };

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Splits article content into appropriately sized chunks for AI processing.
 *
 * The algorithm:
 * - Identifies heading boundaries (h1/h2/h3/h4)
 * - Groups adjacent sections to reach TARGET_CHUNK_SIZE
 * - Never creates chunks smaller than MIN_CHUNK_SIZE (unless total content is smaller)
 * - Never creates chunks larger than MAX_CHUNK_SIZE (splits oversized sections by paragraph)
 * - Falls back to double-newline splitting when no headings exist
 *
 * @param content - The full Markdown article content (may include frontmatter).
 * @returns An array of chunks.
 */
export function splitArticle(content: string): Chunk[] {
  if (!content || content.trim().length === 0) {
    return [];
  }

  // Step 1: Strip YAML frontmatter
  const body = stripFrontmatter(content);
  const lines = body.split("\n");

  // Step 2: Identify heading section boundaries
  const sections = splitIntoSections(lines);

  if (sections.length === 0) {
    return [];
  }

  // Step 3: If total content is small (≤ MAX_CHUNK_SIZE), return as a single
  // chunk. This ensures short articles are sent to AI in one piece, avoiding
  // unnecessary multi-chunk splitting for small content.
  const totalChars = body.length;
  if (totalChars <= MAX_CHUNK_SIZE) {
    const firstLine = lines.find((l) => l.trim().length > 0);
    return [
      {
        id: 0,
        title: firstLine ? firstLine.trim().substring(0, 60) : "Content",
        content: body,
        startLine: 1,
        endLine: lines.length,
      },
    ];
  }

  // Step 4: Merge sections into chunks respecting size boundaries
  return mergeSectionsIntoChunks(sections, lines);
}

/**
 * Splits a specific line range into chunks, using the same heading-based
 * chunking algorithm as `splitArticle`.
 *
 * Used when a diff block with context exceeds MAX_CHUNK_SIZE and needs
 * further subdivision while respecting heading boundaries.
 *
 * @param lines - The full lines array of the article body (without frontmatter)
 * @param startLine - Start of the range (1-based, inclusive)
 * @param endLine - End of the range (1-based, inclusive)
 * @param offsetId - Starting ID for the returned chunks (default 0)
 * @returns An array of sub-chunks covering the range
 */
export function splitRange(
  lines: string[],
  startLine: number,
  endLine: number,
  offsetId = 0,
): Chunk[] {
  // Extract the range lines
  const rangeLines = lines.slice(startLine - 1, endLine);

  if (rangeLines.length === 0) {
    return [];
  }

  // If the range itself is small, return as single chunk
  const rangeSize = rangeLines.reduce((acc, l) => acc + l.length + 1, 0);
  if (rangeSize <= MAX_CHUNK_SIZE) {
    const firstLine = rangeLines.find((l) => l.trim().length > 0);
    return [
      {
        id: offsetId,
        title: firstLine ? firstLine.trim().substring(0, 60) : "Content",
        content: rangeLines.join("\n"),
        startLine,
        endLine,
      },
    ];
  }

  // Use the same section-merge logic on the extracted range.
  // We need to remap section line numbers to the full lines array.
  const sections = splitIntoSections(rangeLines);

  if (sections.length === 0) {
    return [];
  }

  // Remap section line numbers to the original lines array
  const remappedSections = sections.map((s) => ({
    startLine: s.startLine + startLine - 1,
    endLine: s.endLine + startLine - 1,
    heading: s.heading,
  }));

  // Merge with offset id
  const chunks = mergeSectionsIntoChunks(remappedSections, lines);

  // Re-assign IDs starting from offsetId
  return chunks.map((c, i) => ({ ...c, id: offsetId + i }));
}

// ---------------------------------------------------------------------------
// Section identification
// ---------------------------------------------------------------------------

/**
 * A section delimited by a heading (or start/end of content).
 * For content with no headings, paragraphs act as sections.
 */
interface Section {
  /** 1-based start line */
  startLine: number;
  /** 1-based end line (inclusive) */
  endLine: number;
  /** The heading line text, or null for preamble/paragraph sections */
  heading: string | null;
}

/**
 * Splits lines into sections based on heading boundaries.
 * Returns a flat list of sections (preamble + heading sections).
 */
function splitIntoSections(lines: string[]): Section[] {
  // Collect all heading line numbers (h1/h2/h3/h4)
  const headingLines: number[] = [];
  const headingPattern = /^#{1,4} /;

  for (let i = 0; i < lines.length; i++) {
    if (headingPattern.test(lines[i])) {
      headingLines.push(i + 1); // 1-based
    }
  }

  // If no headings at all, split by paragraphs
  if (headingLines.length === 0) {
    return splitByParagraphs(lines);
  }

  const sections: Section[] = [];

  // Preamble before first heading
  if (headingLines[0] > 1) {
    sections.push({
      startLine: 1,
      endLine: headingLines[0] - 1,
      heading: null,
    });
  }

  // Each heading section
  for (let h = 0; h < headingLines.length; h++) {
    const start = headingLines[h];
    const end =
      h + 1 < headingLines.length
        ? headingLines[h + 1] - 1
        : lines.length;
    sections.push({
      startLine: start,
      endLine: end,
      heading: lines[start - 1].trim(),
    });
  }

  return sections;
}

/**
 * Fallback: split lines into paragraph sections (separated by blank lines).
 */
function splitByParagraphs(lines: string[]): Section[] {
  const sections: Section[] = [];
  let paraStart = 1;

  for (let i = 0; i <= lines.length; i++) {
    const lineNum = i + 1;
    const isBlank = i >= lines.length || lines[i].trim() === "";

    if (isBlank && lineNum > paraStart) {
      const hasContent = lines
        .slice(paraStart - 1, lineNum - 1)
        .some((l) => l.trim().length > 0);
      if (hasContent) {
        sections.push({
          startLine: paraStart,
          endLine: lineNum - 1,
          heading: null,
        });
      }
      paraStart = lineNum + 1;
    }
  }

  return sections;
}

// ---------------------------------------------------------------------------
// Section merging
// ---------------------------------------------------------------------------

/**
 * Merges sections into chunks that respect size boundaries.
 */
function mergeSectionsIntoChunks(
  sections: Section[],
  lines: string[],
): Chunk[] {
  const chunks: Chunk[] = [];

  let pending: Section[] = [];
  let pendingSize = 0;

  function flushPending(): void {
    if (pending.length === 0) return;
    chunks.push(buildChunk(pending, lines, chunks.length));
    pending = [];
    pendingSize = 0;
  }

  for (const section of sections) {
    const sectionSize = computeSectionSize(section, lines);

    // This single section exceeds MAX_CHUNK_SIZE → split it internally
    if (sectionSize > MAX_CHUNK_SIZE) {
      // Flush any pending sections first
      if (pending.length > 0) {
        // If pending is small enough, emit it
        if (pendingSize >= MIN_CHUNK_SIZE || pendingSize === 0) {
          flushPending();
        } else {
          // Merge pending into this oversized section — the whole thing
          // will be split anyway
        }
      }
      // Split the oversized section
      const subChunks = splitOversizedSection(section, lines, chunks.length);
      chunks.push(...subChunks);
      pending = [];
      pendingSize = 0;
      continue;
    }

    // Adding this section would exceed MAX_CHUNK_SIZE → flush first
    if (pendingSize > 0 && pendingSize + sectionSize > MAX_CHUNK_SIZE) {
      // But only flush if pending meets MIN_CHUNK_SIZE
      if (pendingSize >= MIN_CHUNK_SIZE) {
        flushPending();
      }
      // Otherwise, keep accumulating (forced merge)
    }

    pending.push(section);
    pendingSize += sectionSize;
  }

  // Flush remaining
  if (pending.length > 0) {
    chunks.push(buildChunk(pending, lines, chunks.length));
  }

  return chunks;
}

/**
 * Computes the character length of a section.
 */
function computeSectionSize(section: Section, lines: string[]): number {
  let size = 0;
  for (let i = section.startLine - 1; i < section.endLine; i++) {
    size += lines[i].length + 1; // +1 for newline
  }
  return size;
}

/**
 * Builds a single Chunk from one or more consecutive sections.
 */
function buildChunk(
  sections: Section[],
  lines: string[],
  chunkId: number,
): Chunk {
  const startLine = sections[0].startLine;
  const endLine = sections[sections.length - 1].endLine;

  const chunkLines = lines.slice(startLine - 1, endLine);
  const content = chunkLines.join("\n");

  // Determine title: use first section's heading, or first non-empty line
  let title: string;
  const firstSection = sections[0];
  if (firstSection.heading) {
    title = firstSection.heading;
  } else {
    const firstLine = chunkLines.find((l) => l.trim().length > 0);
    title = firstLine
      ? firstLine.trim().substring(0, 60)
      : `Section ${chunkId + 1}`;
  }

  return {
    id: chunkId,
    title,
    content,
    startLine,
    endLine,
  };
}

/**
 * Splits a single oversized section (exceeds MAX_CHUNK_SIZE) into sub-chunks.
 * First tries paragraph boundaries, then falls back to fixed length.
 */
function splitOversizedSection(
  section: Section,
  lines: string[],
  startChunkId: number,
): Chunk[] {
  const sectionLines = lines.slice(section.startLine - 1, section.endLine);
  const content = sectionLines.join("\n");
  const chunkIdOffset = startChunkId;

  // If the section has a heading, keep it attached to the first sub-chunk
  if (section.heading) {
    // Try splitting the section body (excluding heading) by paragraphs
    const body = sectionLines.slice(1); // lines after heading
    if (body.length > 0) {
      const bodyContent = body.join("\n");
      const bodyChunks = splitByTargetSize(bodyContent, TARGET_CHUNK_SIZE);

      if (bodyChunks.length > 1) {
        // Attach heading to first body chunk
        const firstChunkContent = `${section.heading}\n${bodyChunks[0].content}`;
        const result: Chunk[] = [
          {
            id: chunkIdOffset,
            title: section.heading,
            content: firstChunkContent,
            startLine: section.startLine,
            endLine: section.startLine + bodyChunks[0].lineCount - 1,
          },
        ];

        let lineOffset = section.startLine + bodyChunks[0].lineCount;
        for (let i = 1; i < bodyChunks.length; i++) {
          const bc = bodyChunks[i];
          result.push({
            id: chunkIdOffset + i,
            title: bc.content.substring(0, 60).trim(),
            content: bc.content,
            startLine: lineOffset,
            endLine: lineOffset + bc.lineCount - 1,
          });
          lineOffset += bc.lineCount;
        }

        return result;
      }
    }
  }

  // Fallback: fixed length split
  return splitByTargetSizeLines(sectionLines, section, chunkIdOffset);
}

/**
 * Result of splitting content by target size.
 */
interface BodyChunk {
  content: string;
  lineCount: number;
}

/**
 * Splits text content into chunks roughly of targetSize, preferring paragraph
 * (double newline) boundaries.
 */
function splitByTargetSize(text: string, targetSize: number): BodyChunk[] {
  const paragraphs = text.split(/\n\n+/);
  const chunks: BodyChunk[] = [];

  let currentLines: string[] = [];
  let currentSize = 0;

  function flush() {
    if (currentLines.length === 0) return;
    chunks.push({
      content: currentLines.join("\n\n"),
      lineCount: currentLines.join("\n\n").split("\n").length,
    });
    currentLines = [];
    currentSize = 0;
  }

  for (const para of paragraphs) {
    const paraSize = para.length + 2; // +2 for "\n\n"
    if (currentSize > 0 && currentSize + paraSize > targetSize) {
      flush();
    }
    currentLines.push(para);
    currentSize += paraSize;
  }

  if (currentLines.length > 0) flush();

  if (chunks.length === 0) {
    chunks.push({ content: text, lineCount: text.split("\n").length });
  }

  return chunks;
}

/**
 * Splits section lines by target size, used as final fallback.
 */
function splitByTargetSizeLines(
  sectionLines: string[],
  section: Section,
  chunkIdOffset: number,
): Chunk[] {
  const chunks: Chunk[] = [];
  let startIdx = 0;
  let charCount = 0;

  for (let i = 0; i < sectionLines.length; i++) {
    const lineLen = sectionLines[i].length + 1;
    if (charCount + lineLen > TARGET_CHUNK_SIZE && charCount > 0) {
      const chunkContent = sectionLines.slice(startIdx, i).join("\n");
      const firstLine = chunkContent
        .split("\n")
        .find((l) => l.trim().length > 0);
      chunks.push({
        id: chunkIdOffset + chunks.length,
        title: firstLine
          ? firstLine.trim().substring(0, 60)
          : `Part ${chunks.length + 1}`,
        content: chunkContent,
        startLine: section.startLine + startIdx,
        endLine: section.startLine + i - 1,
      });
      startIdx = i;
      charCount = lineLen;
    } else {
      charCount += lineLen;
    }
  }

  // Flush remaining
  if (startIdx < sectionLines.length) {
    const chunkContent = sectionLines.slice(startIdx).join("\n");
    const firstLine = chunkContent
      .split("\n")
      .find((l) => l.trim().length > 0);
    chunks.push({
      id: chunkIdOffset + chunks.length,
      title: firstLine
        ? firstLine.trim().substring(0, 60)
        : `Part ${chunks.length + 1}`,
      content: chunkContent,
      startLine: section.startLine + startIdx,
      endLine: section.endLine,
    });
  }

  return chunks;
}

// ---------------------------------------------------------------------------
// Frontmatter stripping
// ---------------------------------------------------------------------------

/**
 * Strips YAML frontmatter (delimited by ---) from the beginning of content.
 * Only removes the first occurrence of --- ... --- at the very start.
 *
 * @param content - Raw Markdown content possibly with frontmatter.
 * @returns Content with frontmatter removed.
 */
export function stripFrontmatter(content: string): string {
  const trimmed = content.trimStart();
  if (!trimmed.startsWith("---")) {
    return content;
  }

  // Find the closing ---
  const endIndex = trimmed.indexOf("\n---", 3);
  if (endIndex === -1) {
    return content; // No closing ---, keep as-is
  }

  // Return everything after the closing ---
  const afterFrontmatter = trimmed.slice(endIndex + 4);
  return afterFrontmatter.trimStart();
}

/**
 * Extracts the raw YAML frontmatter string from content.
 * Returns empty string if no valid frontmatter is found.
 *
 * @param content - Raw content that may include YAML frontmatter
 * @returns The frontmatter string (inclusive of `---` markers), or empty string
 */
export function extractFrontmatterBlock(content: string): string {
  const trimmed = content.trimStart();
  if (!trimmed.startsWith("---")) {
    return "";
  }
  const endIndex = trimmed.indexOf("\n---", 3);
  if (endIndex === -1) {
    return "";
  }
  return trimmed.slice(0, endIndex + 4);
}
