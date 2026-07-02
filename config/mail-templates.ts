/**
 * @file mail-templates.ts — Email HTML templates with placeholder substitution.
 *
 * Templates support {{variable}} placeholders. The defaults below match the
 * original hardcoded HTML in mail.ts and notifications.ts, but can be
 * overridden via site settings (mailTemplates config).
 *
 * Available placeholders per template:
 *
 * resetPassword:
 *   {{token}} — password reset token
 *   {{url}}   — full reset link
 *
 * notification:
 *   {{title}}        — notification title
 *   {{content}}      — notification body text
 *   {{articleTitle}} — related article title (may be empty)
 *   {{url}}          — link to notifications page
 */

export const DEFAULT_MAIL_TEMPLATES = {
  resetPassword: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
  <h1 style="color: #333; font-size: 20px;">重置密码</h1>
  <p style="color: #666; line-height: 1.6;">请点击下方链接重置您的密码：</p>
  <p style="text-align: center; margin: 24px 0;">
    <a href="{{url}}" style="display: inline-block; padding: 12px 24px; background: #0066cc; color: #fff; text-decoration: none; border-radius: 6px; font-size: 14px;">重置密码</a>
  </p>
  <p style="color: #999; font-size: 12px;">或复制以下链接到浏览器：</p>
  <p style="color: #999; font-size: 12px; word-break: break-all;">{{url}}</p>
  <p style="color: #999; font-size: 12px;">此链接有效期为 1 小时。</p>
</body>
</html>`,

  notification: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
  <h2 style="color: #333; font-size: 18px;">{{title}}</h2>
  <p style="color: #666; line-height: 1.6;">{{content}}</p>
  {{#articleTitle}}
  <p style="color: #999; font-size: 14px;">相关文章：{{articleTitle}}</p>
  {{/articleTitle}}
  <p style="margin-top: 24px;">
    <a href="{{url}}/admin/notifications" style="display: inline-block; padding: 8px 16px; background: #333; color: #fff; text-decoration: none; border-radius: 6px; font-size: 14px;">查看详情</a>
  </p>
</body>
</html>`,
};

/**
 * Simple mustache-style template renderer.
 * Supports {{variable}} substitution and {{#key}}...{{/key}} conditional blocks.
 */
export function renderTemplate(
  template: string,
  variables: Record<string, string>,
): string {
  let result = template;

  // Replace {{variable}} placeholders
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
  }

  // Handle {{#key}}...{{/key}} conditional blocks
  for (const [key, value] of Object.entries(variables)) {
    const blockRegex = new RegExp(`\\{\\{#${key}\\}\\}([\\s\\S]*?)\\{\\{/${key}\\}\\}`, "g");
    if (value) {
      // Keep content, remove markers
      result = result.replace(blockRegex, "$1");
    } else {
      // Remove entire block including markers
      result = result.replace(blockRegex, "");
    }
  }

  // Remove any unmatched conditional blocks
  result = result.replace(/\{\{#\w+\}\}[\s\S]*?\{\{\/\w+\}\}/g, "");

  return result;
}
