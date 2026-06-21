/**
 * @file scripts/backfill-char-count.ts
 *
 * One-time script to backfill charCount for articles published before
 * the charCount field was added to the database.
 *
 * CJK characters count as 2 bytes, ASCII as 1 byte.
 *
 * Usage: npx tsx scripts/backfill-char-count.ts
 */

import { readFileSync } from "fs";
import { prisma } from "../src/lib/db";

/** Count bytes: CJK chars = 2, ASCII = 1 */
function countBytes(text: string): number {
  return [...text.replace(/\s/g, "")].reduce(
    (acc, ch) => acc + (/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/.test(ch) ? 2 : 1),
    0,
  );
}

async function main() {
  const articles = await prisma.article.findMany({
    where: { status: "published", charCount: 0 },
    select: { id: true, slug: true, contentPath: true, language: true },
  });

  console.log(`Found ${articles.length} articles to update`);

  for (const a of articles) {
    try {
      const content = readFileSync(a.contentPath, "utf-8");
      // Extract body after frontmatter
      const body = content.replace(/^---[\s\S]*?---\n*/, "");
      const charCount = countBytes(body);

      await prisma.article.update({
        where: { id: a.id },
        data: { charCount },
      });
      console.log(`  ✓ ${a.slug} (${a.language}) → ${charCount} bytes`);
    } catch (e) {
      console.error(`  ✗ ${a.slug}: ${(e as Error).message}`);
    }
  }

  await prisma.$disconnect();
  console.log("Done.");
}

main();
