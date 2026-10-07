import { BRAND, EMAIL_FONT_STACK } from "@/lib/brand"
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
  "at-risk": BRAND.functional.coral,
  behind: BRAND.functional.amber,
  on: BRAND.colour.forest,
  ahead: BRAND.colour.forest,
  "no-data": BRAND.colour.muted,
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
    return `<p style="font-family:${EMAIL_FONT_STACK};font-size:13px;color:${BRAND.colour.muted};margin:8px 0;">None</p>`
  }
  const body = rows
    .map((r) => {
      return `<tr>
        <td style="padding:8px 10px;border-bottom:1px solid ${BRAND.colour.line};font-family:${EMAIL_FONT_STACK};font-size:13px;color:${BRAND.colour.ink};">${escapeHtml(r.clientName)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid ${BRAND.colour.line};font-family:${EMAIL_FONT_STACK};font-size:13px;color:${BRAND.colour.ink};">${escapeHtml(r.mbaNumber)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid ${BRAND.colour.line};font-family:${EMAIL_FONT_STACK};font-size:13px;color:${BRAND.colour.ink};">${escapeHtml(r.campaignName)} <span style="color:${BRAND.colour.muted};">(${escapeHtml(r.channel)})</span></td>
        <td style="padding:8px 10px;border-bottom:1px solid ${BRAND.colour.line};font-family:${EMAIL_FONT_STACK};font-size:13px;color:${BRAND.colour.ink};" align="right">${pctLabel(r.deliveredPct)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid ${BRAND.colour.line};font-family:${EMAIL_FONT_STACK};font-size:13px;color:${BRAND.colour.ink};" align="right">${pctLabel(r.timeElapsedPct)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid ${BRAND.colour.line};font-family:${EMAIL_FONT_STACK};font-size:13px;color:${BRAND.colour.ink};" align="right">${r.daysLeft == null ? "—" : String(r.daysLeft)}</td>
      </tr>`
    })
    .join("")

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid ${BRAND.colour.line};">
    <tr style="background:${BRAND.colour.sand};">
      <th align="left" style="padding:8px 10px;font-family:${EMAIL_FONT_STACK};font-size:11px;color:${BRAND.colour.muted};border-bottom:1px solid ${BRAND.colour.line};">Client</th>
      <th align="left" style="padding:8px 10px;font-family:${EMAIL_FONT_STACK};font-size:11px;color:${BRAND.colour.muted};border-bottom:1px solid ${BRAND.colour.line};">MBA</th>
      <th align="left" style="padding:8px 10px;font-family:${EMAIL_FONT_STACK};font-size:11px;color:${BRAND.colour.muted};border-bottom:1px solid ${BRAND.colour.line};">Campaign</th>
      <th align="right" style="padding:8px 10px;font-family:${EMAIL_FONT_STACK};font-size:11px;color:${BRAND.colour.muted};border-bottom:1px solid ${BRAND.colour.line};">% delivered</th>
      <th align="right" style="padding:8px 10px;font-family:${EMAIL_FONT_STACK};font-size:11px;color:${BRAND.colour.muted};border-bottom:1px solid ${BRAND.colour.line};">% time</th>
      <th align="right" style="padding:8px 10px;font-family:${EMAIL_FONT_STACK};font-size:11px;color:${BRAND.colour.muted};border-bottom:1px solid ${BRAND.colour.line};">Days left</th>
    </tr>
    ${body}
  </table>`
}

function renderRelabelSection(payload: PacingDigestPayload): string {
  const relabels = payload.relabels ?? { day: payload.asOfDate, events: [], drift: [] }
  const events = relabels.events ?? []
  const drift = relabels.drift ?? []
  const eventRows =
    events.length === 0
      ? `<p style="font-family:${EMAIL_FONT_STACK};font-size:13px;color:${BRAND.colour.muted};margin:8px 0;">None</p>`
      : `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid ${BRAND.colour.line};">
      <tr style="background:${BRAND.colour.sand};">
        <th align="left" style="padding:8px 10px;font-family:${EMAIL_FONT_STACK};font-size:11px;color:${BRAND.colour.muted};border-bottom:1px solid ${BRAND.colour.line};">Action</th>
        <th align="left" style="padding:8px 10px;font-family:${EMAIL_FONT_STACK};font-size:11px;color:${BRAND.colour.muted};border-bottom:1px solid ${BRAND.colour.line};">MBA</th>
        <th align="left" style="padding:8px 10px;font-family:${EMAIL_FONT_STACK};font-size:11px;color:${BRAND.colour.muted};border-bottom:1px solid ${BRAND.colour.line};">Entity</th>
        <th align="left" style="padding:8px 10px;font-family:${EMAIL_FONT_STACK};font-size:11px;color:${BRAND.colour.muted};border-bottom:1px solid ${BRAND.colour.line};">Line</th>
        <th align="left" style="padding:8px 10px;font-family:${EMAIL_FONT_STACK};font-size:11px;color:${BRAND.colour.muted};border-bottom:1px solid ${BRAND.colour.line};">Actor</th>
      </tr>
      ${events
        .map(
          (event) => `<tr>
        <td style="padding:8px 10px;border-bottom:1px solid ${BRAND.colour.line};font-family:${EMAIL_FONT_STACK};font-size:13px;color:${BRAND.colour.ink};">${escapeHtml(event.action)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid ${BRAND.colour.line};font-family:${EMAIL_FONT_STACK};font-size:13px;color:${BRAND.colour.ink};">${escapeHtml(event.mbaNumber ?? "—")}</td>
        <td style="padding:8px 10px;border-bottom:1px solid ${BRAND.colour.line};font-family:${EMAIL_FONT_STACK};font-size:13px;color:${BRAND.colour.ink};">${escapeHtml(event.entityName ?? "—")}</td>
        <td style="padding:8px 10px;border-bottom:1px solid ${BRAND.colour.line};font-family:${EMAIL_FONT_STACK};font-size:13px;color:${BRAND.colour.ink};">${escapeHtml(event.toLineItemId ?? "—")}</td>
        <td style="padding:8px 10px;border-bottom:1px solid ${BRAND.colour.line};font-family:${EMAIL_FONT_STACK};font-size:13px;color:${BRAND.colour.ink};">${escapeHtml(event.actorEmail)}</td>
      </tr>`,
        )
        .join("")}
    </table>`
  const driftRows =
    drift.length === 0
      ? `<p style="font-family:${EMAIL_FONT_STACK};font-size:13px;color:${BRAND.colour.muted};margin:8px 0;">No map drift. No legacy LABEL_MAP rows.</p>`
      : `<ul style="font-family:${EMAIL_FONT_STACK};font-size:13px;color:${BRAND.colour.ink};margin:8px 0;padding-left:18px;">${drift
          .map((item) => `<li>${escapeHtml(item.kind)} · ${escapeHtml(item.message)}</li>`)
          .join("")}</ul>`

  return `<tr><td style="padding:16px 24px 4px;font-family:${EMAIL_FONT_STACK};">
    <div style="font-size:15px;font-weight:700;color:${BRAND.colour.ink};">Delivery relabels · ${escapeHtml(relabels.day)}</div>
  </td></tr>
  <tr><td style="padding:4px 24px 4px;">${eventRows}</td></tr>
  <tr><td style="padding:4px 24px 12px;">${driftRows}</td></tr>`
}

function section(band: DigestBand, rows: DigestCampaignRow[]): string {
  const colour = BAND_COLOUR[band]
  return `<tr><td style="padding:16px 24px 4px;font-family:${EMAIL_FONT_STACK};">
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
<body style="margin:0;padding:0;background:${BRAND.colour.sand};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.colour.sand};padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="720" cellpadding="0" cellspacing="0" style="max-width:720px;width:100%;background:${BRAND.colour.white};border:1px solid ${BRAND.colour.line};border-radius:8px;overflow:hidden;">
        <tr><td style="background:${BRAND.colour.ink};padding:16px 24px;font-family:${EMAIL_FONT_STACK};">
          <div style="font-size:16px;font-weight:700;color:${BRAND.colour.white};">Assembled Media</div>
        </td></tr>
        <tr><td style="padding:20px 24px 8px;font-family:${EMAIL_FONT_STACK};">
          <div style="font-size:20px;font-weight:700;color:${BRAND.colour.ink};">AssembledView pacing digest</div>
          <div style="font-size:13px;color:${BRAND.colour.muted};margin-top:4px;">As of ${escapeHtml(asOfDate)} (Melbourne) · built ${escapeHtml(builtAt)}</div>
          <div style="font-size:13px;color:${BRAND.colour.muted};margin-top:8px;">
            <span style="display:inline-block;padding:4px 8px;margin-right:6px;background:${BRAND.derived.sandTint};color:${BRAND.functional.coral};border-radius:999px;font-size:12px;font-weight:700;">${counts.atRisk} at risk</span>
            <span style="display:inline-block;padding:4px 8px;margin-right:6px;background:${BRAND.derived.sandTint};color:${BRAND.colour.forest};border-radius:999px;font-size:12px;font-weight:700;">${counts.on} on track</span>
            <span style="display:inline-block;padding:4px 8px;margin-right:6px;background:${BRAND.derived.sandTint};color:${BRAND.colour.forest};border-radius:999px;font-size:12px;font-weight:700;">${counts.ahead} ahead</span>
            <span style="display:inline-block;padding:4px 8px;background:${BRAND.colour.sand};color:${BRAND.colour.muted};border-radius:999px;font-size:12px;font-weight:700;">${counts.noData} no data</span>
          </div>
        </td></tr>
        ${section("at-risk", groups["at-risk"])}
        ${section("on", groups.on)}
        ${section("ahead", groups.ahead)}
        ${section("no-data", groups["no-data"])}
        ${renderRelabelSection(payload)}
        <tr><td style="padding:0 24px 8px;font-family:${EMAIL_FONT_STACK};font-size:11px;color:${BRAND.colour.muted};">
          Ad-serving: delivered % is deliverable progress (impressions/clicks vs plan); no spend pacing.
        </td></tr>
        <tr><td style="padding:0 24px 20px;font-family:${EMAIL_FONT_STACK};font-size:11px;color:${BRAND.colour.muted};">
          Internal ops email · bands from existing computeStatus / lineItemStatus (not 110/90/75 invent) · AssembledView cron
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}
