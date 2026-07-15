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
      <td style="padding:7px 10px;border-bottom:1px solid #e2e6e4;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#1c2b25;">${escapeHtml(a.asset_name || a.original_filename || "(unnamed)")}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #e2e6e4;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#6a7772;">${escapeHtml(a.mime_type || "—")}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #e2e6e4;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#6a7772;" align="right">${fmtBytes(a.file_size_bytes)}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #e2e6e4;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#6a7772;">
         ${a.uploaded_by_name
           ? `${escapeHtml(a.uploaded_by_name)}<br><span style="color:#9aa39e;font-size:11px;">${escapeHtml(a.uploaded_by_email || "")}</span>`
           : escapeHtml(a.uploaded_by_email || "—")}
       </td>
      <td style="padding:7px 10px;border-bottom:1px solid #e2e6e4;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#6a7772;">${fmtTime(a.created_at)}</td>
    </tr>`,
        )
        .join("")
      return `<tr><td style="padding:16px 24px 4px;font-family:Arial,Helvetica,sans-serif;">
      <div style="font-size:14px;font-weight:700;color:#472477;">MBA ${escapeHtml(g.mbaNumber)} · ${g.assets.length} file${g.assets.length === 1 ? "" : "s"}</div>
    </td></tr>
    <tr><td style="padding:4px 24px 12px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #e2e6e4;">
        <tr style="background:#f4f6f5;">
          <th align="left" style="padding:7px 10px;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#6a7772;border-bottom:1px solid #e2e6e4;">File</th>
          <th align="left" style="padding:7px 10px;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#6a7772;border-bottom:1px solid #e2e6e4;">Type</th>
          <th align="right" style="padding:7px 10px;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#6a7772;border-bottom:1px solid #e2e6e4;">Size</th>
          <th align="left" style="padding:7px 10px;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#6a7772;border-bottom:1px solid #e2e6e4;">Uploaded by</th>
          <th align="left" style="padding:7px 10px;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#6a7772;border-bottom:1px solid #e2e6e4;">When (Syd)</th>
        </tr>
        ${body}
      </table>
    </td></tr>`
    })
    .join("")

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f6f5;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f5;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="720" cellpadding="0" cellspacing="0" style="max-width:720px;width:100%;background:#ffffff;border:1px solid #e2e6e4;border-radius:10px;overflow:hidden;">
        <tr><td style="background:#008e5e;padding:18px 24px;font-family:Arial,Helvetica,sans-serif;">
          <div style="font-size:17px;font-weight:700;color:#ffffff;">New client creative uploads</div>
          <div style="font-size:12px;color:#d7efe6;margin-top:3px;">${p.totalFiles} file(s) from ${p.totalUploaders} uploader(s) · last ${p.windowMinutes} min</div>
        </td></tr>
        ${rows}
        <tr><td style="padding:8px 24px 20px;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#9aa39e;">
          Internal ops email · client-role uploads only · AssembledView cron
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}
