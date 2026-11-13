/**
 * The Codex daily email digest (B41). Pure HTML builder, inline CSS and table
 * layout like the pacing digest (`lib/ops/digest/email.ts`). Each task links
 * to `/tasks/<id>` on APP_BASE_URL (no link when it is not set).
 */
import { BRAND, EMAIL_FONT_STACK } from "@/lib/brand"
import type { DigestEmail } from "@/lib/codex/notifications"

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

export function taskLink(appBaseUrl: string, taskId: number): string | null {
  const base = appBaseUrl.trim().replace(/\/+$/, "")
  return base ? `${base}/tasks/${taskId}` : null
}

export function buildCodexDigestHtml(digest: DigestEmail, opts: { appBaseUrl: string; asOf: string }): string {
  const tasks = digest.tasks
    .map((t) => {
      const href = taskLink(opts.appBaseUrl, t.task_id)
      const title = escapeHtml(t.title || "Untitled task")
      const heading = href
        ? `<a href="${escapeHtml(href)}" style="color:${BRAND.colour.forest};text-decoration:none;">${title}</a>`
        : title
      const lines = t.lines
        .map((l) => `<li style="margin:2px 0;">${escapeHtml(l)}</li>`)
        .join("")
      return `<tr><td style="padding:12px 24px 4px;font-family:${EMAIL_FONT_STACK};">
        <div style="font-size:14px;font-weight:700;color:${BRAND.colour.ink};">${heading}</div>
        <ul style="font-family:${EMAIL_FONT_STACK};font-size:13px;color:${BRAND.colour.ink};margin:4px 0 8px;padding-left:18px;">${lines}</ul>
      </td></tr>`
    })
    .join("")
  const n = digest.total
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${BRAND.colour.sand};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.colour.sand};padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:${BRAND.colour.white};border:1px solid ${BRAND.colour.line};border-radius:8px;overflow:hidden;">
        <tr><td style="background:${BRAND.colour.ink};padding:16px 24px;font-family:${EMAIL_FONT_STACK};">
          <div style="font-size:16px;font-weight:700;color:${BRAND.colour.white};">Assembled Media</div>
        </td></tr>
        <tr><td style="padding:20px 24px 4px;font-family:${EMAIL_FONT_STACK};">
          <div style="font-size:18px;font-weight:700;color:${BRAND.colour.ink};">Your Codex updates</div>
          <div style="font-size:13px;color:${BRAND.colour.muted};margin-top:4px;">${n} unread ${n === 1 ? "update" : "updates"} on ${digest.tasks.length} ${digest.tasks.length === 1 ? "task" : "tasks"} · ${escapeHtml(opts.asOf)} (Melbourne)</div>
        </td></tr>
        ${tasks}
        <tr><td style="padding:12px 24px 20px;font-family:${EMAIL_FONT_STACK};font-size:11px;color:${BRAND.colour.muted};">
          One email a day of the notifications you have not read. Turn it off from the bell on any Tasks page.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}
