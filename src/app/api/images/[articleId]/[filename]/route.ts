/**
 * @file GET /api/images/[articleId]/[filename]
 *
 * Serves an image file from an article's images/ directory.
 * Checks access permissions:
 *   - Draft articles: only accessible to admin
 *   - Published articles:
 *     1. Image-specific override (ArticleImageOverride) if exists
 *     2. Otherwise falls back to article's defaultImageAccessGroup
 *     3. If both are empty → public access
 *
 * Returns the raw image file with appropriate Content-Type.
 *
 * This route uses Next.js dynamic route segments:
 *   /api/images/:articleId/:filename
 */

import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/db";
import { auth } from "@/auth";

const MIME_MAP: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".avif": "image/avif",
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ articleId: string; filename: string }> },
) {
  try {
    const { articleId, filename } = await params;

    // Sanitize filename to prevent directory traversal
    const safeFilename = path.basename(filename);
    const ext = path.extname(safeFilename).toLowerCase();

    if (!MIME_MAP[ext]) {
      return new NextResponse("Unsupported image type.", { status: 400 });
    }

    // Find the article
    const article = await prisma.article.findUnique({
      where: { id: articleId },
      select: {
        contentPath: true,
        status: true,
        defaultImageAccessGroup: true,
      },
    });

    if (!article) {
      return new NextResponse("Article not found.", { status: 404 });
    }

    // Check access control
    if (article.status === "draft") {
      // Draft articles: only accessible to admin
      const session = await auth();
      const isAdmin = session?.user?.roles?.includes("admin") ?? false;
      if (!isAdmin) {
        return new NextResponse("Unauthorized. Draft images require admin access.", {
          status: 401,
        });
      }
    } else if (article.status === "published") {
      // Determine effective access group for this image:
      // 1. Image-specific override if exists
      // 2. Otherwise use article's defaultImageAccessGroup
      const override = await prisma.articleImageOverride.findUnique({
        where: { articleId_filename: { articleId, filename: safeFilename } },
      });

      const effectiveGroups = override
        ? override.accessGroup
        : article.defaultImageAccessGroup || [];

      // If access is restricted (non-public), check user session
      if (effectiveGroups.length > 0 && !effectiveGroups.includes("public")) {
        const session = await auth();

        // Admin can always access
        const isAdmin = session?.user?.roles?.includes("admin") ?? false;
        if (isAdmin) {
          // fall through — allow
        } else if (effectiveGroups.includes("school")) {
          // School-restricted: require user with "school" role
          const hasSchoolAccess = session?.user?.roles?.includes("school") ?? false;
          if (!hasSchoolAccess) {
            return new NextResponse("This image is restricted to school users.", {
              status: 403,
            });
          }
        } else {
          // Other unknown groups — deny
          return new NextResponse("This image requires access authorization.", {
            status: 403,
          });
        }
      }
    }

    // Read and serve the image
    const articleDir = path.dirname(path.join(process.cwd(), article.contentPath));
    const imagePath = path.join(articleDir, "images", safeFilename);

    let fileBuffer: Buffer;
    try {
      fileBuffer = await readFile(imagePath);
    } catch {
      return new NextResponse("Image not found.", { status: 404 });
    }

    const mimeType = MIME_MAP[ext];

    // Convert Buffer to Uint8Array for NextResponse compatibility
    const uint8Array = new Uint8Array(fileBuffer);

    return new NextResponse(uint8Array, {
      status: 200,
      headers: {
        "Content-Type": mimeType,
        "Content-Length": String(fileBuffer.length),
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    console.error("Serve image error:", error);
    return new NextResponse("Internal server error.", { status: 500 });
  }
}
