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
 *
 * @param fileName - The name of the file (e.g., "test-article.md")
 * @param content - The Markdown content to write
 * @returns The relative file path (e.g., "content/articles/drafts/test-article.md")
 */
export async function createTestDraft(
  fileName: string,
  content: string,
): Promise<string> {
  await mkdir(DRAFTS_DIR, { recursive: true });
  const filePath = path.join(DRAFTS_DIR, fileName);
  await writeFile(filePath, content, "utf-8");
  return `content/articles/drafts/${fileName}`;
}

/**
 * Removes a test draft file.
 *
 * @param fileName - The name of the file to remove
 */
export async function removeTestDraft(fileName: string): Promise<void> {
  const filePath = path.join(DRAFTS_DIR, fileName);
  if (existsSync(filePath)) {
    await unlink(filePath);
  }
}

/**
 * Cleans up all files in the drafts directory.
 */
export async function cleanDraftsDir(): Promise<void> {
  if (existsSync(DRAFTS_DIR)) {
    const files = await import("fs/promises").then((fs) =>
      fs.readdir(DRAFTS_DIR),
    );
    await Promise.all(
      files.map((f) => unlink(path.join(DRAFTS_DIR, f)).catch(() => {})),
    );
  }
}

/**
 * Helper to check if the database is available before running DB-dependent tests.
 */
export async function isDatabaseAvailable(): Promise<boolean> {
  try {
    const { prisma } = await import("@/lib/db");
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}
