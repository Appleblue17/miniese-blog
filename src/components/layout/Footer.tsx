export function Footer() {
  // Glass overlay for readability against fixed Hero background
  // ! Should be consistent with the one used in Second screen: src/app/(public)/[lang]/page.tsx
  return (
    <footer
      className="footer-glass border-t border-border py-6 text-center text-sm"
      style={{
        backgroundColor: `color-mix(in srgb, var(--background) 40%, transparent)`,
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
      }}
    >
      <p className="text-muted-foreground">
        &copy;&nbsp;{new Date().getFullYear()}&nbsp;Miniese&apos;s Blog. All rights reserved.
      </p>
    </footer>
  );
}
