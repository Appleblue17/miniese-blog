/**
 * @file TypeScript types for wiki entries.
 */

import type { WikiBlocks } from "@/lib/wiki/parser";

/**
 * Wiki entry lifecycle status.
 */
export type WikiStatus = "proposed" | "creating" | "unreviewed" | "reviewed";

/**
 * Metadata for a wiki entry, as stored in the database.
 */
export interface WikiEntryMeta {
  id: string;
  name: string;
  aliases: string[];
  language: "zh" | "en";
  definition: string;
  contentPath: string;
  tags: string[];
  accessGroup: string[];
  status: WikiStatus;
  createdAt: string;
  updatedAt: string;
}

/**
 * Full wiki entry detail including parsed content blocks.
 */
export interface WikiEntryDetail extends WikiEntryMeta {
  blocks: WikiBlocks;
}

/**
 * Payload for creating a wiki entry (simple: only name + language).
 */
export interface WikiEntryCreateInput {
  name: string;
  language: "zh" | "en";
}

/**
 * Payload for updating a wiki entry.
 */
export interface WikiEntryUpdateInput {
  name?: string;
  aliases?: string[];
  definition?: string;
  human?: string;
  ai?: string;
  ref?: string;
  tags?: string[];
  accessGroup?: string[];
}

/**
 * Paginated list response for wiki entries.
 */
export interface WikiListResponse {
  entries: WikiEntryMeta[];
  total: number;
  page: number;
  totalPages: number;
}
