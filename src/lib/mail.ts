/**
 * @file mail.ts — Email sending utility.
 *
 * Sends emails via Resend SDK. If dev mode or real email is disabled,
 * logs to console instead of actually sending.
 *
 * Email templates are loaded from site settings (mailTemplates config),
 * with defaults from config/mail-templates.ts.
 */

import { Resend } from "resend";
import { renderTemplate } from "../../config/mail-templates";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const MAIL_FROM =
  process.env.MAIL_FROM || "Miniese Blog <noreply@miniese.xyz>";

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
 * Load a mail template from settings, falling back to the default.
 */
async function loadMailTemplate(
  key: string,
): Promise<string> {
  try {
    const { getSettings } = await import("../../config/settings");
    const settings = await getSettings();
    const custom = settings.mailTemplates?.[key];
    if (custom?.trim()) return custom;
  } catch {
    // Fall through to defaults
  }

  // Fall back to compiled-in defaults
  const { DEFAULT_MAIL_TEMPLATES } = await import("../../config/mail-templates");
  return DEFAULT_MAIL_TEMPLATES[key as keyof typeof DEFAULT_MAIL_TEMPLATES] || "";
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
      from: MAIL_FROM,
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
 * Generate a password reset email HTML using configurable template.
 */
export async function resetPasswordEmailHtml(token: string): Promise<string> {
  const template = await loadMailTemplate("resetPassword");
  const url = `${process.env.SITE_URL || "http://localhost:3000"}/reset?token=${token}`;
  return renderTemplate(template, { token, url });
}
