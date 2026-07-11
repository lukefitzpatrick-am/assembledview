import type { OpsCheckResult, OpsHealthReport } from "./types"
import { buildOpsHealthSubject, summariseStatuses } from "./status"

const STATUS_COLOUR: Record<string, string> = {
  green: "#1a7f37",
  amber: "#9a6700",
  red: "#cf222e",
}

const STATUS_BG: Record<string, string> = {
  green: "#dafbe1",
  amber: "#fff8c5",
  red: "#ffebe9",
}

export function buildOpsHealthEmailHtml(report: OpsHealthReport): string {
  const rows = report.results
    .map((r) => {
      const colour = STATUS_COLOUR[r.status] ?? "#24292f"
      const bg = STATUS_BG[r.status] ?? "#ffffff"
      return `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #d0d7de;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#24292f;">${escapeHtml(r.name)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #d0d7de;font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:700;color:${colour};background:${bg};text-transform:uppercase;">${escapeHtml(r.status)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #d0d7de;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#57606a;">${escapeHtml(r.detail)}</td>
      </tr>`
    })
    .join("")

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f6f8fa;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f8fa;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;background:#ffffff;border:1px solid #d0d7de;border-radius:8px;">
        <tr><td style="padding:20px 24px 8px;font-family:Arial,Helvetica,sans-serif;">
          <div style="font-size:20px;font-weight:700;color:#24292f;">AssembledView ops health</div>
          <div style="font-size:13px;color:#57606a;margin-top:4px;">As of ${escapeHtml(report.asOfDate)} (Melbourne) · checked ${escapeHtml(report.checkedAt)}</div>
          <div style="font-size:13px;color:#57606a;margin-top:4px;">${report.greenCount} green · ${report.amberCount} amber · ${report.redCount} red</div>
        </td></tr>
        <tr><td style="padding:8px 16px 20px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #d0d7de;">
            <tr style="background:#f6f8fa;">
              <th align="left" style="padding:10px 12px;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#57606a;border-bottom:1px solid #d0d7de;">Check</th>
              <th align="left" style="padding:10px 12px;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#57606a;border-bottom:1px solid #d0d7de;">Status</th>
              <th align="left" style="padding:10px 12px;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#57606a;border-bottom:1px solid #d0d7de;">Detail</th>
            </tr>
            ${rows}
          </table>
        </td></tr>
        <tr><td style="padding:0 24px 20px;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#8c959f;">
          Internal ops email · AssembledView cron
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

export function buildOpsHealthReport(
  asOfDate: string,
  checkedAt: string,
  results: OpsCheckResult[],
): OpsHealthReport {
  const counts = summariseStatuses(results)
  return { asOfDate, checkedAt, results, ...counts }
}

export { buildOpsHealthSubject }

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}
