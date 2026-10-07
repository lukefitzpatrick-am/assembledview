import { BRAND, EMAIL_FONT_STACK } from "@/lib/brand"
import type { UploadDigestPayload } from "./uploadDigest"

function escapeHtml(v: string): string {
  return v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function fmtBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "—"
  const u = ["B", "KB", "MB", "GB"]
  let i = 0
  let x = n
  while (x >= 1024 && i < u.length - 1) {
    x /= 1024
    i++
  }
  return `${x.toFixed(x >= 10 || i === 0 ? 0 : 1)} ${u[i]}`
}

function fmtTime(epoch: number): string {
  try {
    return new Intl.DateTimeFormat("en-AU", {
      timeZone: "Australia/Sydney",
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(epoch))
  } catch {
    return "—"
  }
}

export function buildUploadDigestSubject(p: UploadDigestPayload): string {
  const mbas = p.groups.length
  return `Client upload${p.totalFiles === 1 ? "" : "s"} — ${p.totalFiles} file${p.totalFiles === 1 ? "" : "s"} across ${mbas} campaign${mbas === 1 ? "" : "s"}`
}

export function buildUploadDigestEmailHtml(p: UploadDigestPayload): string {
  const rows = p.groups
    .map((g) => {
      const body = g.assets
        .map(
          (a) => `<tr>
      <td style="padding:7px 10px;border-bottom:1px solid ${BRAND.colour.line};font-family:${EMAIL_FONT_STACK};font-size:13px;color:${BRAND.colour.ink};">${escapeHtml(a.asset_name || a.original_filename || "(unnamed)")}</td>
      <td style="padding:7px 10px;border-bottom:1px solid ${BRAND.colour.line};font-family:${EMAIL_FONT_STACK};font-size:12px;color:${BRAND.colour.muted};">${escapeHtml(a.mime_type || "—")}</td>
      <td style="padding:7px 10px;border-bottom:1px solid ${BRAND.colour.line};font-family:${EMAIL_FONT_STACK};font-size:12px;color:${BRAND.colour.muted};" align="right">${fmtBytes(a.file_size_bytes)}</td>
      <td style="padding:7px 10px;border-bottom:1px solid ${BRAND.colour.line};font-family:${EMAIL_FONT_STACK};font-size:12px;color:${BRAND.colour.muted};">
         ${a.uploaded_by_name
           ? `${escapeHtml(a.uploaded_by_name)}<br><span style="color:${BRAND.colour.muted};font-size:11px;">${escapeHtml(a.uploaded_by_email || "")}</span>`
           : escapeHtml(a.uploaded_by_email || "—")}
       </td>
      <td style="padding:7px 10px;border-bottom:1px solid ${BRAND.colour.line};font-family:${EMAIL_FONT_STACK};font-size:12px;color:${BRAND.colour.muted};">${fmtTime(a.created_at)}</td>
    </tr>`,
        )
        .join("")
      return `<tr><td style="padding:16px 24px 4px;font-family:${EMAIL_FONT_STACK};">
      <div style="font-size:14px;font-weight:700;color:${BRAND.colour.forest};">MBA ${escapeHtml(g.mbaNumber)} · ${g.assets.length} file${g.assets.length === 1 ? "" : "s"}</div>
    </td></tr>
    <tr><td style="padding:4px 24px 12px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid ${BRAND.colour.line};">
        <tr style="background:${BRAND.colour.sand};">
          <th align="left" style="padding:7px 10px;font-family:${EMAIL_FONT_STACK};font-size:11px;color:${BRAND.colour.muted};border-bottom:1px solid ${BRAND.colour.line};">File</th>
          <th align="left" style="padding:7px 10px;font-family:${EMAIL_FONT_STACK};font-size:11px;color:${BRAND.colour.muted};border-bottom:1px solid ${BRAND.colour.line};">Type</th>
          <th align="right" style="padding:7px 10px;font-family:${EMAIL_FONT_STACK};font-size:11px;color:${BRAND.colour.muted};border-bottom:1px solid ${BRAND.colour.line};">Size</th>
          <th align="left" style="padding:7px 10px;font-family:${EMAIL_FONT_STACK};font-size:11px;color:${BRAND.colour.muted};border-bottom:1px solid ${BRAND.colour.line};">Uploaded by</th>
          <th align="left" style="padding:7px 10px;font-family:${EMAIL_FONT_STACK};font-size:11px;color:${BRAND.colour.muted};border-bottom:1px solid ${BRAND.colour.line};">When (Syd)</th>
        </tr>
        ${body}
      </table>
    </td></tr>`
    })
    .join("")

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${BRAND.colour.sand};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.colour.sand};padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="720" cellpadding="0" cellspacing="0" style="max-width:720px;width:100%;background:${BRAND.colour.white};border:1px solid ${BRAND.colour.line};border-radius:8px;overflow:hidden;">
        <tr><td style="background:${BRAND.colour.ink};padding:18px 24px;font-family:${EMAIL_FONT_STACK};">
          <div style="font-size:14px;font-weight:700;color:${BRAND.colour.white};">Assembled Media</div>
          <div style="font-size:17px;font-weight:700;color:${BRAND.colour.white};margin-top:4px;">New client creative uploads</div>
          <div style="font-size:12px;color:${BRAND.colour.mutedOnBlack};margin-top:3px;">${p.totalFiles} file(s) from ${p.totalUploaders} uploader(s) · last ${p.windowMinutes} min</div>
        </td></tr>
        ${rows}
        <tr><td style="padding:8px 24px 20px;font-family:${EMAIL_FONT_STACK};font-size:11px;color:${BRAND.colour.muted};">
          Internal ops email · client-role uploads only · AssembledView cron
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}
