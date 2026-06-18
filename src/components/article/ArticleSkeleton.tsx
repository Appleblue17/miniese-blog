/**
 * @file ArticleSkeleton — Loading placeholder for the article page while
 * content is being fetched.
 *
 * Includes title area skeleton (matches ArticleReader header layout)
 * and body content skeleton (matches ArticleContent flex row with TOC).
 */

export function ArticleSkeleton() {
  {/* Body + TOC row */}
  return (
    <div className="flex gap-8 py-8">
      {/* Content skeleton */}
      <div className="min-w-0 flex-1 space-y-6">
        <div className="space-y-3">
          <div className="h-4 bg-muted rounded animate-pulse w-full" />
          <div className="h-4 bg-muted rounded animate-pulse w-11/12" />
          <div className="h-4 bg-muted rounded animate-pulse w-4/5" />
        </div>
        <div className="space-y-3">
          <div className="h-4 bg-muted rounded animate-pulse w-full" />
          <div className="h-4 bg-muted rounded animate-pulse w-3/4" />
          <div className="h-4 bg-muted rounded animate-pulse w-5/6" />
        </div>
        <div className="space-y-3">
          <div className="h-4 bg-muted rounded animate-pulse w-full" />
          <div className="h-4 bg-muted rounded animate-pulse w-2/3" />
        </div>
        <div className="space-y-3">
          <div className="h-4 bg-muted rounded animate-pulse w-full" />
          <div className="h-4 bg-muted rounded animate-pulse w-5/6" />
          <div className="h-4 bg-muted rounded animate-pulse w-4/5" />
        </div>
        <div className="space-y-3">
          <div className="h-4 bg-muted rounded animate-pulse w-full" />
          <div className="h-4 bg-muted rounded animate-pulse w-7/12" />
        </div>
      </div>

      {/* TOC skeleton — hidden on mobile */}
      <div className="hidden xl:block w-56 shrink-0">
        <div className="h-3 bg-muted rounded animate-pulse w-16 mb-5" />
        <div className="space-y-3">
          {[100, 85, 70, 90, 60].map((w, i) => (
            <div
              key={i}
              className="h-3 bg-muted rounded animate-pulse"
              style={{ width: `${w}%` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
