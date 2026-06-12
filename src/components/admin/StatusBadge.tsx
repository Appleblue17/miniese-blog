/**
 * @file StatusBadge - Reusable status badge for article management.
 */

export function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, string> = {
    published: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
    draft: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
    review: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  };

  const labels: Record<string, string> = {
    published: "已发布",
    draft: "草稿",
    review: "审查中",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
        variants[status] || variants.draft
      }`}
    >
      {labels[status] || status}
    </span>
  );
}
