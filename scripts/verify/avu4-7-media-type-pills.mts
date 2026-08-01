/**
 * AVU4-7 — write an SVG of every canonical media-type pill using getMediaBadgeStyle.
 * Run: npx tsx scripts/verify/avu4-7-media-type-pills.mts
 */
import { writeFileSync } from "node:fs"
import { join } from "node:path"
import { getMediaBadgeStyle, MEDIA_TYPE_REGISTRY } from "../../lib/charts/registry"

const labels = Object.values(MEDIA_TYPE_REGISTRY).map((r) => r.label)
const pillH = 28
const gap = 10
const pad = 24
const cols = 4
const colW = 220
const rows = Math.ceil(labels.length / cols)
const width = pad * 2 + cols * colW
const height = pad * 2 + 36 + rows * (pillH + gap)

function escapeXml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

const pills = labels
  .map((label, i) => {
    const style = getMediaBadgeStyle(label)
    const col = i % cols
    const row = Math.floor(i / cols)
    const x = pad + col * colW
    const y = pad + 40 + row * (pillH + gap)
    const tw = Math.max(72, label.length * 7.2 + 24)
    return `
  <g transform="translate(${x},${y})">
    <rect width="${tw}" height="${pillH}" rx="999" fill="${style.backgroundColor}" stroke="${style.borderColor ?? style.color}" stroke-width="1"/>
    <text x="${tw / 2}" y="${pillH / 2 + 4}" text-anchor="middle" font-family="ui-sans-serif,system-ui,sans-serif" font-size="12" font-weight="600" fill="${style.color}">${escapeXml(label)}</text>
  </g>`
  })
  .join("")

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#f7f6f2"/>
  <text x="${pad}" y="${pad + 14}" font-family="ui-sans-serif,system-ui,sans-serif" font-size="14" font-weight="700" fill="#1a2e1f">AVU4-7 · Media-type pills (getMediaBadgeStyle / MEDIA_TYPE_REGISTRY)</text>
  ${pills}
</svg>
`

const out = join(process.cwd(), "scripts/verify/avu4-7-media-type-pills.svg")
writeFileSync(out, svg, "utf8")
console.log(`Wrote ${out} (${labels.length} pills)`)
for (const label of labels) {
  const s = getMediaBadgeStyle(label)
  console.log(`  ${label}: ${s.color}`)
}
