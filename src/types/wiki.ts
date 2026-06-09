export interface WikiEntryMeta {
  id: string;
  name: string;
  aliases: string[];
  language: "zh" | "en";
  definition: string;
  contentPath: string;
  tags: string[];
  accessGroup: string[];
  isAIGenerated: boolean;
  isReviewed: boolean;
  createdAt: string;
  updatedAt: string;
}
