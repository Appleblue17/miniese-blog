export interface ArticleMeta {
  id: string;
  slug: string;
  title: string;
  language: "zh" | "en";
  contentPath: string;
  summary?: string;
  tags: string[];
  status: "draft" | "published" | "review";
  accessGroup: string[];
  publishedAt?: string;
  updatedAt: string;
  changelog?: string;
  author: string;
}
