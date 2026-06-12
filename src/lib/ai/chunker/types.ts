/**
 * @file Shared type definitions for the unified incremental content processing pipeline.
 */

/** Size constraints for chunking */
export const TARGET_CHUNK_SIZE = 5000;
export const MIN_CHUNK_SIZE = 1000;
export const MAX_CHUNK_SIZE = 8000;

/**
 * A single chunk of an article, corresponding to a contiguous block of content.
 */
export interface Chunk {
  /** Sequential ID starting from 0 */
  id: number;
  /** Title of the chunk (e.g. "# Introduction") */
  title: string;
  /** Full content of the chunk including the title */
  content: string;
  /** Starting line number in the original source (1-based) */
  startLine: number;
  /** Ending line number in the original source (1-based, inclusive) */
  endLine: number;
}

/**
 * A contiguous block of changed lines from a line-level diff.
 */
export interface DiffBlock {
  /** Starting line number in the new content (1-based) */
  startLine: number;
  /** Ending line number in the new content (1-based, inclusive) */
  endLine: number;
}

/**
 * Configuration for context window building.
 */
export interface ContextConfig {
  /** Target character count for context (algorithm will try to align to heading boundaries) */
  targetSize: number;
  /** Maximum character count for context (hard cap) */
  maxSize: number;
}

/** Default context configuration */
export const DEFAULT_CONTEXT_CONFIG: ContextConfig = {
  targetSize: 1000,
  maxSize: 2000,
};
