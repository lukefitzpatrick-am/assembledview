import type { DigestBand, DigestCampaignRow } from "./banding"
import type { PacingDigestPayload } from "./buildPacingDigest"

const BAND_LABEL: Record<DigestBand, string> = {
  "at-risk": "At risk (behind / under-pacing)",
  behind: "Behind",
  on: "On track",
  ahead: "Ahead",
  "no-data": "No data",
}

const BAND_COLOUR: Record<DigestBand, string> = {
  "at-risk": "#cf222e",
  behind: "#9a6700",
  on: "#0969da",
  ahead: "#1a7f37",
  "no-data": "#57606a",
}

function pctLabel(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—"
  return `${(value * 100).toFixed(1)}%`
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function renderTable(rows: DigestCampaignRow[]): string {
  if (rows.length === 0) {
    return `<p style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#57606a;margin:8px 0;">None</p>`
  }
  const body = rows
    .map((r) => {
      return `<tr>
        <td style="padding:8px 10px;border-bottom:1px solid #d0d7de;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#24292f;">${escapeHtml(r.clientName)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #d0d7de;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#24292f;">${escapeHtml(r.mbaNumber)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #d0d7de;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#24292f;">${escapeHtml(r.campaignName)} <span style="color:#8c959f;">(${escapeHtml(r.channel)})</span></td>
        <td style="padding:8px 10px;border-bottom:1px solid #d0d7de;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#24292f;" align="right">${pctLabel(r.deliveredPct)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #d0d7de;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#24292f;" align="right">${pctLabel(r.timeElapsedPct)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #d0d7de;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#24292f;" align="right">${r.daysLeft == null ? "—" : String(r.daysLeft)}</td>
      </tr>`
    })
    .join("")

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #d0d7de;">
    <tr style="background:#f6f8fa;">
      <th align="left" style="padding:8px 10px;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#57606a;border-bottom:1px solid #d0d7de;">Client</th>
      <th align="left" style="padding:8px 10px;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#57606a;border-bottom:1px solid #d0d7de;">MBA</th>
      <th align="left" style="padding:8px 10px;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#57606a;border-bottom:1px solid #d0d7de;">Campaign</th>
      <th align="right" style="padding:8px 10px;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#57606a;border-bottom:1px solid #d0d7de;">% delivered</th>
      <th align="right" style="padding:8px 10px;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#57606a;border-bottom:1px solid #d0d7de;">% time</th>
      <th align="right" style="padding:8px 10px;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#57606a;border-bottom:1px solid #d0d7de;">Days left</th>
    </tr>
    ${body}
  </table>`
}

function section(band: DigestBand, rows: DigestCampaignRow[]): string {
  const colour = BAND_COLOUR[band]
  return `<tr><td style="padding:16px 24px 4px;font-family:Arial,Helvetica,sans-serif;">
    <div style="font-size:15px;font-weight:700;color:${colour};">${escapeHtml(BAND_LABEL[band])} · ${rows.length}</div>
  </td></tr>
  <tr><td style="padding:4px 24px 12px;">${renderTable(rows)}</td></tr>`
}

export function buildPacingDigestSubject(payload: PacingDigestPayload): string {
  const { atRisk, on, ahead, total } = payload.counts
  return `Pacing digest — ${atRisk} at risk, ${on} on track, ${ahead} ahead (${total} live)`
}

/**
 * Inline-CSS HTML email. Structure loosely follows docs/sendgrid/pacing-template.md
 * (header counts → priority list → grouped tables) without requiring a dynamic template.
 */
export function buildPacingDigestEmailHtml(payload: PacingDigestPayload): string {
  const { groups, counts, asOfDate, builtAt } = payload

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f6f8fa;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f8fa;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="720" cellpadding="0" cellspacing="0" style="max-width:720px;width:100%;background:#ffffff;border:1px solid #d0d7de;border-radius:8px;">
        <tr><td style="padding:20px 24px 8px;font-family:Arial,Helvetica,sans-serif;">
          <div style="font-size:20px;font-weight:700;color:#24292f;">AssembledView pacing digest</div>
          <div style="font-size:13px;color:#57606a;margin-top:4px;">As of ${escapeHtml(asOfDate)} (Melbourne) · built ${escapeHtml(builtAt)}</div>
          <div style="font-size:13px;color:#57606a;margin-top:8px;">
            <span style="display:inline-block;padding:4px 8px;margin-right:6px;background:#ffebe9;color:#cf222e;border-radius:999px;font-size:12px;font-weight:700;">${counts.atRisk} at risk</span>
            <span style="display:inline-block;padding:4px 8px;margin-right:6px;background:#ddf4ff;color:#0969da;border-radius:999px;font-size:12px;font-weight:700;">${counts.on} on track</span>
            <span style="display:inline-block;padding:4px 8px;margin-right:6px;background:#dafbe1;color:#1a7f37;border-radius:999px;font-size:12px;font-weight:700;">${counts.ahead} ahead</span>
            <span style="display:inline-block;padding:4px 8px;background:#f6f8fa;color:#57606a;border-radius:999px;font-size:12px;font-weight:700;">${counts.noData} no data</span>
          </div>
        </td></tr>
        ${section("at-risk", groups["at-risk"])}
        ${section("on", groups.on)}
        ${section("ahead", groups.ahead)}
        ${section("no-data", groups["no-data"])}
        <tr><td style="padding:0 24px 8px;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#8c959f;">
          Ad-serving: delivered % is deliverable progress (impressions/clicks vs plan); no spend pacing.
        </td></tr>
        <tr><td style="padding:0 24px 20px;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#8c959f;">
          Internal ops email · bands from existing computeStatus / lineItemStatus (not 110/90/75 invent) · AssembledView cron
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}
