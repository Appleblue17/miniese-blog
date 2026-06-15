/**
 * @file images.ts — Image utilities for article image management.
 *
 * Provides helpers for:
 * - Extracting image references from Markdown content
 * - Validating that referenced images exist in the article's images/ directory
 */

import { stat } from "fs/promises";
import path from "path";

/**
 * Result of image reference validation.
 */
export interface ImageValidationResult {
  /** Whether all referenced images exist */
  valid: boolean;
  /** List of referenced image filenames that are missing */
  missing: string[];
  /** List of all referenced image filenames found in the content */
  referenced: string[];
}

/**
 * Extracts image filenames from Markdown content.
 * Supports both standard Markdown ![]() syntax and HTML <img> tags.
 *
 * @param content — The Markdown/HTML content
 * @returns Array of image filenames (basename only)
 */
export function extractImageReferences(content: string): string[] {
  const filenames = new Set<string>();

  // Match Markdown images: ![alt](url)
  const markdownRegex = /!\[.*?\]\(([^)]+)\)/g;
  let match: RegExpExecArray | null;
  while ((match = markdownRegex.exec(content)) !== null) {
    const url = match[1];
    const filename = extractFilename(url);
    if (filename) {
      filenames.add(filename);
    }
  }

  // Match HTML img tags: <img src="url" ... />
  const htmlImgRegex = /<img[^>]+src\s*=\s*["']([^"']+)["'][^>]*>/gi;
  while ((match = htmlImgRegex.exec(content)) !== null) {
    const url = match[1];
    const filename = extractFilename(url);
    if (filename) {
      filenames.add(filename);
    }
  }

  return Array.from(filenames);
}

/**
 * Extracts the filename from a URL/path.
 * Strips query parameters, fragments, and directory prefixes.
 *
 * @param url — The image URL or path
 * @returns The basename (filename + extension) or null if not an image
 */
function extractFilename(url: string): string | null {
  try {
    // Strip query parameters and fragments
    const cleanUrl = url.split("?")[0].split("#")[0];

    // Get the basename
    const basename = path.basename(cleanUrl);

    // Check if it looks like an image file
    const ext = path.extname(basename).toLowerCase();
    const imageExtensions = new Set([
      ".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".avif",
    ]);

    if (imageExtensions.has(ext) && basename.length > ext.length) {
      return basename;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Validates that all images referenced in Markdown content exist
 * in the article's images/ directory.
 *
 * @param content — The Markdown/HTML content
 * @param articleDir — The article directory (parent of images/)
 * @returns Validation result with details
 */
export async function validateImageReferences(
  content: string,
  articleDir: string,
): Promise<ImageValidationResult> {
  const referenced = extractImageReferences(content);
  const missing: string[] = [];

  if (referenced.length === 0) {
    return { valid: true, missing: [], referenced: [] };
  }

  const imagesDir = path.join(articleDir, "images");

  for (const filename of referenced) {
    try {
      await stat(path.join(imagesDir, filename));
    } catch {
      missing.push(filename);
    }
  }

  return {
    valid: missing.length === 0,
    missing,
    referenced,
  };
}
