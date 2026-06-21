export interface ArticleMeta {
  id: string;
  slug: string;
  title: string;
  language: "zh" | "en";
  contentType: "markdown" | "notesaw";
  contentPath: string;
  summary?: string;
  tags: string[];
  status: "draft" | "published" | "review";
  accessGroup: string[];
  publishedAt?: string;
  updatedAt: string;
  changelog?: string;
  author: string;
  viewCount: number;
  likes: number;
  charCount?: number;
}
