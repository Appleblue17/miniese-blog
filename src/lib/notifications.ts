/**
 * @file notifications.ts — Notification utility functions.
 *
 * Provides:
 * - createNotification: Create a notification record in the database
 * - sendNotificationEmail: Send email notification for important events
 * - notifyAndMail: Create notification + conditionally send email based on settings
 */

import { prisma } from "@/lib/db";
import { sendEmail } from "@/lib/mail";
import { getSettings } from "../../config/settings";

export type NotificationType =
  | "comment"
  | "comment_deleted"
  | "translation_complete"
  | "task_failed"
  | "discovery"
  | "article_published";

interface CreateNotificationParams {
  type: NotificationType;
  title: string;
  content: string;
  articleId?: string;
  articleTitle?: string;
  taskId?: string;
  userId?: string;
}

/**
 * Notification severity levels (matching the existing comment-based severity).
 * 🔴 important  — task_failed, article_published (force email)
 * 🟡 normal    — comment, comment_deleted (configurable email)
 * 🔵 notice    — translation_complete, discovery (never email)
 */
export type NotificationSeverity = "important" | "normal" | "notice";

function getSeverity(type: NotificationType): NotificationSeverity {
  if (type === "task_failed" || type === "article_published") {
    return "important";
  }
  if (type === "translation_complete" || type === "discovery") {
    return "notice";
  }
  return "normal";
}

/**
 * Delete old notifications beyond the configured retain count.
 * Runs best-effort (catches errors silently).
 */
async function pruneOldNotifications(): Promise<void> {
  try {
    const { getSettings } = await import("../../config/settings");
    const settings = await getSettings();
    const maxCount = settings.notifications.maxRetainCount;

    // Get total count
    const total = await prisma.notification.count();

    if (total > maxCount) {
      // Find the cutoff ID — oldest notification that stays
      const keep = await prisma.notification.findMany({
        orderBy: { createdAt: "desc" },
        take: maxCount,
        select: { id: true },
      });

      if (keep.length > 0) {
        const keepIds = new Set(keep.map((n) => n.id));
        await prisma.notification.deleteMany({
          where: { id: { notIn: [...keepIds] } },
        });
      }
    }
  } catch (err) {
    console.error("[Notifications] Failed to prune old notifications:", err);
  }
}

/**
 * Create a notification record in the database.
 * Automatically prunes old notifications if count exceeds configured max.
 */
export async function createNotification(params: CreateNotificationParams): Promise<void> {
  try {
    const severity = getSeverity(params.type);
    await prisma.notification.create({
      data: {
        type: params.type,
        title: params.title,
        content: params.content,
        articleId: params.articleId || null,
        articleTitle: params.articleTitle || null,
        taskId: params.taskId || null,
        userId: params.userId || null,
        severity,
      },
    });

    // Prune old notifications in the background
    await pruneOldNotifications();
  } catch (err) {
    console.error("[Notifications] Failed to create notification:", err);
  }
}

/**
 * Send an email notification for important events.
 * Only sends if the admin has the corresponding email notification enabled.
 */
export async function sendNotificationEmail(params: {
  to: string;
  title: string;
  content: string;
  articleTitle?: string;
  type: NotificationType;
}): Promise<void> {
  try {
    const url = process.env.SITE_URL || "http://localhost:3000";
    const subject = `[Miniese's Blog] ${params.title}`;
    const html = `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #333;">${params.title}</h2>
        <p style="color: #666; line-height: 1.6;">${params.content}</p>
        ${params.articleTitle ? `<p style="color: #999; font-size: 14px;">相关文章：${params.articleTitle}</p>` : ""}
        <p style="margin-top: 24px;">
          <a href="${url}/admin/notifications" style="display: inline-block; padding: 8px 16px; background: #333; color: #fff; text-decoration: none; border-radius: 6px; font-size: 14px;">
            查看详情
          </a>
        </p>
      </div>
    `;

    await sendEmail({ to: params.to, subject, html });
  } catch (err) {
    console.error("[Notifications] Failed to send email:", err);
  }
}

/**
 * Determine whether email should be sent for a given notification type,
 * based on site settings and severity level.
 *
 * 🔴 Important (强制): task_failed, article_published — always sends email
 * 🟡 Normal   (可配置): comment, comment_deleted — checks typeSettings.email
 * 🔵 Notice   (仅站内): translation_complete, discovery — never sends email
 */
async function shouldSendEmail(type: NotificationType): Promise<boolean> {
  const settings = await getSettings();

  // Global email toggle
  if (!settings.notifications.email) return false;

  // Admin email must be configured
  if (!settings.notifications.adminEmail?.trim()) return false;

  // 🔴 Important — force send email regardless of typeSettings
  if (type === "task_failed" || type === "article_published") {
    return true;
  }

  // 🟡 Normal — check the per-type email toggle
  const typeSetting = settings.notifications.typeSettings?.[type];
  if (typeSetting && typeSetting.email) {
    return true;
  }

  // 🔵 Notice — never send email
  return false;
}

/**
 * Create notification and optionally send email.
 * Email decision is based on site settings (typeSettings + severity level).
 * Callers do NOT need to pass adminEmail — it's read from settings internally.
 */
export async function notifyAndMail(params: CreateNotificationParams): Promise<void> {
  await createNotification(params);

  try {
    if (await shouldSendEmail(params.type)) {
      const settings = await getSettings();
      await sendNotificationEmail({
        to: settings.notifications.adminEmail!,
        title: params.title,
        content: params.content,
        articleTitle: params.articleTitle,
        type: params.type,
      });
    }
  } catch (err) {
    console.error("[Notifications] Failed to send email:", err);
  }
}
