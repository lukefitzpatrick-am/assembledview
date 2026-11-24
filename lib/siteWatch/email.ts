/**
 * The Critical email (gate D9), in Roz's voice: a dry, by-the-book desk
 * clerk on her monster-hunting morning rounds. Our own wording only: no
 * film quotes, catchphrases, character art or logos.
 * Every value from a scanned site is escaped.
 */
import { BRAND, EMAIL_FONT_STACK } from "@/lib/brand"

import type { CriticalChange } from "./store"

const FIELD_LABELS: Record<string, string> = {
  robots_meta: "Meta robots",
  x_robots: "X-Robots-Tag header",
  robots_txt: "robots.txt",
  status: "HTTP status",
  page_failed: "Page failed to load",
  canonical: "Canonical",
  "tracking:gtm": "GTM container",
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

function show(v: unknown): string {
  if (v === null || v === undefined || v === "") return "(none)"
  const text = typeof v === "string" ? v : JSON.stringify(v)
  return text.length > 200 ? `${text.slice(0, 200)}…` : text
}

export function criticalEmail(input: { label: string; clientName: string | null; baseUrl: string; changes: readonly CriticalChange[] }) {
  // A grouped change (same change on many pages) is one line with a page count.
  const lines = new Map<string, { c: CriticalChange; pages: number }>()
  for (const c of input.changes) {
    const key = c.groupKey ?? `${c.field}|${c.url}|${JSON.stringify(c.before)}|${JSON.stringify(c.after)}`
    const hit = lines.get(key)
    if (hit) hit.pages++
    else lines.set(key, { c, pages: 1 })
  }
  const n = lines.size
  const subject = `Roz found ${n} critical change${n === 1 ? "" : "s"} lurking on ${input.label}`
  const cell = `padding:8px 10px;border-bottom:1px solid ${BRAND.colour.line};font-family:${EMAIL_FONT_STACK};font-size:13px;color:${BRAND.colour.ink};vertical-align:top;`
  const rows = [...lines.values()]
    .map(({ c, pages }) => {
      const where = c.url ? escapeHtml(c.url) : "Whole site"
      const more = pages > 1 ? ` <span style="color:${BRAND.colour.muted};">and ${pages - 1} more pages</span>` : ""
      const change =
        c.field === "robots_txt"
          ? "Changed. Check it for a new Disallow line."
          : `${escapeHtml(show(c.before))} → <strong>${escapeHtml(show(c.after))}</strong>`
      return `<tr><td style="${cell}">${escapeHtml(FIELD_LABELS[c.field] ?? c.field)}</td><td style="${cell}">${where}${more}</td><td style="${cell}">${change}</td></tr>`
    })
    .join("")
  const p = `font-family:${EMAIL_FONT_STACK};font-size:14px;line-height:1.5;color:${BRAND.colour.ink};margin:0 0 12px;`
  const who = input.clientName && input.clientName !== input.label ? ` (${escapeHtml(input.clientName)})` : ""
  const html = `<div style="max-width:680px;">
  <p style="${p}font-size:18px;font-weight:bold;">Roz here. Rounds are done, and something's lurking.</p>
  <p style="${p}">I went through <strong>${escapeHtml(input.label)}</strong>${who} at ${escapeHtml(input.baseUrl)} and found ${n === 1 ? "one thing" : `${n} things`} with teeth. ${n === 1 ? "It doesn't" : "They don't"} get to wait in the in-tray. The paperwork is below, filed in triplicate. Well, once.</p>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid ${BRAND.colour.line};">
    <tr style="background:${BRAND.colour.sand};"><td style="${cell}font-weight:bold;">What</td><td style="${cell}font-weight:bold;">Where</td><td style="${cell}font-weight:bold;">Before → now</td></tr>
    ${rows}
  </table>
  <p style="${p}margin-top:16px;">Please deal with ${n === 1 ? "this" : "these"} today. Live campaigns may be sending people straight into ${n === 1 ? "it" : "them"}.</p>
  <p style="${p}color:${BRAND.colour.muted};font-size:12px;">Roz, Site Watch, AssembledView. Same desk, 6am tomorrow. Don't make me come looking for you.</p>
</div>`
  return { subject, html }
}
