/**
 * @file notifications.ts — Notification utility functions.
 *
 * Provides:
 * - createNotification: Create a notification record in the database
 * - sendNotificationEmail: Send email notification for important events
 */

import { prisma } from "@/lib/db";
import { sendEmail } from "@/lib/mail";

export type NotificationType =
  | "comment"
  | "comment_deleted"
  | "translation_complete"
  | "task_failed"
  | "discovery";

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
 * Create a notification record in the database.
 */
export async function createNotification(params: CreateNotificationParams): Promise<void> {
  try {
    await prisma.notification.create({
      data: {
        type: params.type,
        title: params.title,
        content: params.content,
        articleId: params.articleId || null,
        articleTitle: params.articleTitle || null,
        taskId: params.taskId || null,
        userId: params.userId || null,
      },
    });
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
 * Create notification and optionally send email for important events.
 */
export async function notifyAndMail(params: CreateNotificationParams & { adminEmail?: string }): Promise<void> {
  await createNotification(params);

  // Send email for important notifications if admin email is provided
  if (params.adminEmail && ["comment", "task_failed"].includes(params.type)) {
    await sendNotificationEmail({
      to: params.adminEmail,
      title: params.title,
      content: params.content,
      articleTitle: params.articleTitle,
      type: params.type,
    });
  }
}
