/**
 * @file /admin/articles/[id]/edit - Edit draft page (Step 2).
 *
 * Loads the draft data and renders the PublishForm in review mode.
 */

import { notFound } from "next/navigation";
import { readFile } from "fs/promises";
import path from "path";
import matter from "gray-matter";
import { prisma } from "@/lib/db";
import { PublishForm } from "@/components/admin/PublishForm";
import type { Metadata } from "next";

interface Props {
  params: Promise<{ id: string }>;
}

export const metadata: Metadata = {
  title: "编辑草稿 | Miniese's Blog",
};

export default async function EditDraftPage({ params }: Props) {
  const { id } = await params;

  const draft = await prisma.article.findUnique({
    where: { id },
    select: {
      id: true,
      contentPath: true,
      language: true,
      status: true,
      draftOfId: true,
    },
  });

  if (!draft || (draft.status !== "draft" && draft.status !== "review")) {
    notFound();
  }

  // Read file content
  let content = "";
  try {
    content = await readFile(path.join(process.cwd(), draft.contentPath), "utf-8");
  } catch {
    // File may not exist
  }

  const fileName = draft.contentPath.split("/").pop() || "draft.md";

  // Parse frontmatter to build initialMeta
  let initialMeta:
    | {
        title: string;
        language: "zh" | "en" | "";
        fileType: "markdown" | "notesaw" | "";
        tags: string[];
        author: string;
        summary: string;
        accessGroup?: string[];
      }
    | undefined;

  let initialExtraFrontmatter: Record<string, unknown> | undefined;

  if (content) {
    try {
      const parsed = matter(content);
      const data = parsed.data as Record<string, unknown>;

      const managedKeys = new Set([
        "title",
        "language",
        "fileType",
        "contentType",
        "tags",
        "author",
        "summary",
        "slug",
        "accessGroup",
        "changelog",
      ]);

      const fmFileType = (data.fileType || data.contentType || "") as "markdown" | "notesaw";

      initialMeta = {
        title: (data.title as string) || "",
        language: (data.language === "en" ? "en" : data.language === "zh" ? "zh" : "") as "zh" | "en" | "",
        fileType: fmFileType, // Read from frontmatter, fall back to manual selection
        tags: Array.isArray(data.tags) ? (data.tags as string[]) : [],
        author: (data.author as string) || "博主",
        summary: (data.summary as string) || "",
        accessGroup: Array.isArray(data.accessGroup) ? (data.accessGroup as string[]) : undefined,
      };

      const extra: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(data)) {
        if (!managedKeys.has(key)) {
          extra[key] = value;
        }
      }
      if (Object.keys(extra).length > 0) {
        initialExtraFrontmatter = extra;
      }
    } catch {
      // Use defaults
    }
  }

  return (
    <div className="py-8">
      <PublishForm
        draftId={draft.id}
        publishedId={draft.draftOfId || undefined}
        initialContent={content}
        initialFileName={fileName}
        initialMeta={initialMeta}
        initialExtraFrontmatter={initialExtraFrontmatter}
      />
    </div>
  );
}
