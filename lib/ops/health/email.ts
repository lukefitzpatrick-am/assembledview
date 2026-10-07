import { BRAND, EMAIL_FONT_STACK } from "@/lib/brand"
import type { OpsCheckResult, OpsHealthReport } from "./types"
import { buildOpsHealthSubject, summariseStatuses } from "./status"

const STATUS_COLOUR: Record<string, string> = {
  green: BRAND.colour.forest,
  amber: BRAND.functional.amber,
  red: BRAND.functional.coral,
}

const STATUS_BG: Record<string, string> = {
  green: BRAND.derived.sandTint,
  amber: BRAND.derived.sandTint,
  red: BRAND.derived.sandTint,
}

export function buildOpsHealthEmailHtml(report: OpsHealthReport): string {
  const rows = report.results
    .map((r) => {
      const colour = STATUS_COLOUR[r.status] ?? BRAND.colour.ink
      const bg = STATUS_BG[r.status] ?? BRAND.colour.white
      return `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid ${BRAND.colour.line};font-family:${EMAIL_FONT_STACK};font-size:14px;color:${BRAND.colour.ink};">${escapeHtml(r.name)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid ${BRAND.colour.line};font-family:${EMAIL_FONT_STACK};font-size:13px;font-weight:700;color:${colour};background:${bg};text-transform:uppercase;">${escapeHtml(r.status)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid ${BRAND.colour.line};font-family:${EMAIL_FONT_STACK};font-size:13px;color:${BRAND.colour.muted};">${escapeHtml(r.detail)}</td>
      </tr>`
    })
    .join("")

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${BRAND.colour.sand};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.colour.sand};padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;background:${BRAND.colour.white};border:1px solid ${BRAND.colour.line};border-radius:8px;overflow:hidden;">
        <tr><td style="background:${BRAND.colour.ink};padding:16px 24px;font-family:${EMAIL_FONT_STACK};">
          <div style="font-size:16px;font-weight:700;color:${BRAND.colour.white};">Assembled Media</div>
        </td></tr>
        <tr><td style="padding:20px 24px 8px;font-family:${EMAIL_FONT_STACK};">
          <div style="font-size:20px;font-weight:700;color:${BRAND.colour.ink};">AssembledView ops health</div>
          <div style="font-size:13px;color:${BRAND.colour.muted};margin-top:4px;">As of ${escapeHtml(report.asOfDate)} (Melbourne) · checked ${escapeHtml(report.checkedAt)}</div>
          <div style="font-size:13px;color:${BRAND.colour.muted};margin-top:4px;">${report.greenCount} green · ${report.amberCount} amber · ${report.redCount} red</div>
        </td></tr>
        <tr><td style="padding:8px 16px 20px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid ${BRAND.colour.line};">
            <tr style="background:${BRAND.colour.sand};">
              <th align="left" style="padding:10px 12px;font-family:${EMAIL_FONT_STACK};font-size:12px;color:${BRAND.colour.muted};border-bottom:1px solid ${BRAND.colour.line};">Check</th>
              <th align="left" style="padding:10px 12px;font-family:${EMAIL_FONT_STACK};font-size:12px;color:${BRAND.colour.muted};border-bottom:1px solid ${BRAND.colour.line};">Status</th>
              <th align="left" style="padding:10px 12px;font-family:${EMAIL_FONT_STACK};font-size:12px;color:${BRAND.colour.muted};border-bottom:1px solid ${BRAND.colour.line};">Detail</th>
            </tr>
            ${rows}
          </table>
        </td></tr>
        <tr><td style="padding:0 24px 20px;font-family:${EMAIL_FONT_STACK};font-size:11px;color:${BRAND.colour.muted};">
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
