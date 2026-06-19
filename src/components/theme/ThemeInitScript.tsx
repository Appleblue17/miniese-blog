/**
 * @file ThemeInitScript — Client Component that injects the FOUC-prevention
 * inline script via next/script.
 *
 * Must be a Client Component to avoid React hydration warnings about <script>
 * tags rendered inside Server Components.
 */
"use client";

import Script from "next/script";

export function ThemeInitScript() {
  return (
    <Script
      id="theme-init"
      strategy="beforeInteractive"
      dangerouslySetInnerHTML={{
        __html: `
          (function() {
            try {
              var theme = localStorage.getItem('theme');
              var isDark = theme === 'dark' || (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches);
              if (isDark) {
                document.documentElement.classList.add('dark');
                document.documentElement.setAttribute('data-theme', 'dark');
              } else {
                document.documentElement.classList.remove('dark');
                document.documentElement.setAttribute('data-theme', 'light');
              }
            } catch(e) {}
          })();
        `,
      }}
    />
  );
}
