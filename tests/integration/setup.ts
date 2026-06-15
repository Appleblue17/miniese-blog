/**
 * @file Integration test setup.
 *
 * Provides shared test infrastructure:
 * - Helper to create test draft files in the drafts directory
 * - Helper to clean up test files
 * - Test database URL configuration
 *
 * Integration tests that require a database use the `DATABASE_URL` env var
 * from the environment. If no database is available, DB-dependent tests
 * will be skipped automatically.
 */

import { mkdir, writeFile, unlink, rm } from "fs/promises";
import path from "path";
import { existsSync } from "fs";

/** Root drafts directory for testing */
export const DRAFTS_DIR = path.join(
  process.cwd(),
  "content",
  "articles",
  "drafts",
);

/**
 * Creates a test draft file in the drafts directory.
 * Supports both flat files and directory structure.
 *
 * @param fileName - The file name (e.g., "test-article.md" for flat, or "test-article/article.md" for directory)
 * @param content - The Markdown content to write
 * @returns The relative file path (e.g., "content/articles/drafts/test-article.md")
 */
export async function createTestDraft(
  fileName: string,
  content: string,
): Promise<string> {
  await mkdir(DRAFTS_DIR, { recursive: true });

  // If fileName contains a "/", treat as directory structure
  if (fileName.includes("/")) {
    const parts = fileName.split("/");
    const subDir = path.join(DRAFTS_DIR, parts[0]);
    await mkdir(subDir, { recursive: true });
    const filePath = path.join(subDir, parts.slice(1).join("/"));
    await writeFile(filePath, content, "utf-8");
    return `content/articles/drafts/${fileName}`;
  }

  // Flat file (legacy)
  const filePath = path.join(DRAFTS_DIR, fileName);
  await writeFile(filePath, content, "utf-8");
  return `content/articles/drafts/${fileName}`;
}

/**
 * Creates a test draft using the new directory structure.
 *
 * @param dirName - The directory name (e.g., "test-article")
 * @param content - The Markdown content to write to article.md
 * @returns The relative content path
 */
export async function createTestDraftDir(
  dirName: string,
  content: string,
): Promise<string> {
  await mkdir(DRAFTS_DIR, { recursive: true });
  const draftDir = path.join(DRAFTS_DIR, dirName);
  await mkdir(draftDir, { recursive: true });
  await mkdir(path.join(draftDir, "images"), { recursive: true });
  await writeFile(path.join(draftDir, "article.md"), content, "utf-8");
  return `content/articles/drafts/${dirName}/article.md`;
}

/**
 * Removes a test draft file or directory.
 *
 * @param name - The file name or directory name to remove
 */
export async function removeTestDraft(name: string): Promise<void> {
  const itemPath = path.join(DRAFTS_DIR, name);
  if (existsSync(itemPath)) {
    try {
      await rm(itemPath, { recursive: true, force: true });
    } catch {
      await unlink(itemPath).catch(() => {});
    }
  }
}

/**
 * Cleans up all files and directories in the drafts directory.
 */
export async function cleanDraftsDir(): Promise<void> {
  if (existsSync(DRAFTS_DIR)) {
    const entries = await import("fs/promises").then((fs) =>
      fs.readdir(DRAFTS_DIR, { withFileTypes: true }),
    );
    await Promise.all(
      entries.map(async (entry) => {
        const fullPath = path.join(DRAFTS_DIR, entry.name);
        if (entry.isDirectory()) {
          await rm(fullPath, { recursive: true, force: true }).catch(() => {});
        } else {
          await unlink(fullPath).catch(() => {});
        }
      }),
    );
  }
}

/**
 * Helper to check if the database is available before running DB-dependent tests.
 */
export async function isDatabaseAvailable(): Promise<boolean> {
  try {
    const { prisma } = await import("./db-client");
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}
