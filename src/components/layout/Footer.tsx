/**
 * @file Footer — Site-wide footer with links and legal info.
 *
 * Reads footer config from site settings and ICP_BEIAN from env.
 * "关于" link goes to /about (middleware handles lang redirect).
 */

import { FiGithub } from "react-icons/fi";
import Link from "next/link";
import { cookies } from "next/headers";
import { getSettings } from "../../../config/settings";

export async function Footer() {
  const settings = await getSettings();
  const footer = settings.site.footer;
  const icp = process.env.ICP_BEIAN || "";

  // Detect current language from cookie set by middleware
  const cookieStore = await cookies();
  const lang = cookieStore.get("preferred_lang")?.value || "zh";
  const aboutLabel = lang === "en" ? footer.aboutLabelEn : footer.aboutLabel;

  return (
    <footer
      className="footer-glass border-t border-border py-6 text-center text-sm"
      style={{
        backgroundColor: `color-mix(in srgb, var(--background) 40%, transparent)`,
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
      }}
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        {/* First row: links */}
        <div className="flex items-center justify-center gap-2 mb-2">
          <a
            href={footer.githubUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
          >
            <FiGithub className="size-4" />
            GitHub
          </a>
          <span className="text-muted-foreground/40">·</span>
          <a
            href={footer.licenseUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            {footer.licenseLabel}
          </a>
          <span className="text-muted-foreground/40">·</span>
          <Link
            href="/about"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            {aboutLabel}
          </Link>
        </div>

        {/* Second row: copyright + ICP */}
        <p className="text-muted-foreground">
          &copy;&nbsp;{new Date().getFullYear()}&nbsp;Miniese&apos;s Blog.
          All rights reserved.
          {icp && (
            <>
              {" "}
              <span className="text-muted-foreground/40 mx-2">|</span>{" "}
              <span className="text-muted-foreground/80">{icp}</span>
            </>
          )}
        </p>
      </div>
    </footer>
  );
}
