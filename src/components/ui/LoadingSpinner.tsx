/**
 * @file LoadingSpinner — A small ring spinner for loading states.
 * Used in ArticleLoadingOverlay (positioned at illustration's top-right)
 * and can be reused for any loading indicator.
 */

interface LoadingSpinnerProps {
  /** Size in pixels (default 20) */
  size?: number;
  /** Additional className overrides */
  className?: string;
}

export function LoadingSpinner({ size = 20, className = "" }: LoadingSpinnerProps) {
  return (
    <div
      className={`animate-spin rounded-full border-2 border-primary/20 border-t-primary ${className}`}
      style={{ width: size, height: size }}
      role="status"
      aria-label="Loading"
    />
  );
}
