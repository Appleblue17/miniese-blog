/**
 * @file mail.ts — Email sending utility.
 *
 * Sends emails via Resend SDK. If dev mode or real email is disabled,
 * logs to console instead of actually sending.
 */

import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

/**
 * Check if real email sending is enabled based on environment and dev settings.
 */
async function shouldSendRealEmail(): Promise<boolean> {
  // If no API key configured, always use mock
  if (!resend) return false;

  // Check dev settings
  try {
    const { getSettings } = await import("../../config/settings");
    const settings = await getSettings();
    const features = settings.features as Record<string, unknown>;
    // Default to mock if devMode is true and realEmail is not explicitly true
    if (features.devMode === true && features.realEmail !== true) {
      return false;
    }
    return true;
  } catch {
    // If settings can't be loaded, default to mock in dev
    return false;
  }
}

/**
 * Send an email or log it in development.
 */
export async function sendEmail(options: {
  to: string;
  subject: string;
  html: string;
}): Promise<void> {
  const real = await shouldSendRealEmail();

  if (real && resend) {
    await resend.emails.send({
      from: `Miniese's Blog <noreply@${process.env.SITE_URL?.replace(/https?:\/\//, "") || "localhost"}>`,
      to: options.to,
      subject: options.subject,
      html: options.html,
    });
  } else {
    console.log(
      `[Mail Mock] To: ${options.to}`,
      `Subject: ${options.subject}`,
      `HTML: ${options.html.substring(0, 200)}...`,
    );
  }
}

/**
 * Generate a verification email HTML template.
 */
export function verificationEmailHtml(token: string): string {
  const url = `${process.env.SITE_URL || "http://localhost:3000"}/verify?token=${token}`;
  return `
    <h1>验证您的邮箱</h1>
    <p>请点击下方链接验证您的邮箱地址：</p>
    <a href="${url}" style="display:inline-block;padding:12px 24px;background:#0066cc;color:#fff;text-decoration:none;border-radius:6px;">验证邮箱</a>
    <p>或复制以下链接到浏览器：</p>
    <p>${url}</p>
    <p>此链接有效期为 24 小时。</p>
  `;
}

/**
 * Generate a password reset email HTML template.
 */
export function resetPasswordEmailHtml(token: string): string {
  const url = `${process.env.SITE_URL || "http://localhost:3000"}/reset?token=${token}`;
  return `
    <h1>重置密码</h1>
    <p>请点击下方链接重置您的密码：</p>
    <a href="${url}" style="display:inline-block;padding:12px 24px;background:#0066cc;color:#fff;text-decoration:none;border-radius:6px;">重置密码</a>
    <p>或复制以下链接到浏览器：</p>
    <p>${url}</p>
    <p>此链接有效期为 1 小时。</p>
  `;
}
