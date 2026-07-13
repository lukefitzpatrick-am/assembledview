/**
 * Smoke: build a fixture Demand Flow deck and write .claude-scratch-export.pptx
 * Run: npx tsx scripts/smoke-export-deck.ts
 */
import fs from "fs"
import path from "path"
import zlib from "zlib"
import { buildPlannerDeck } from "../lib/planning/export/buildPlannerDeck"

const FIXTURE_W = 1200
const FIXTURE_H = 340

function crc32(buf: Buffer): number {
  let c = ~0
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]!
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
  }
  return ~c >>> 0
}

/** Build a solid RGB PNG data URL at the given pixel size (exercises aspect layout). */
function solidPngDataUrl(width: number, height: number, rgb: [number, number, number]): string {
  const [r, g, b] = rgb
  const rowSize = 1 + width * 3
  const raw = Buffer.alloc(rowSize * height)
  for (let y = 0; y < height; y++) {
    const off = y * rowSize
    raw[off] = 0 // filter None
    for (let x = 0; x < width; x++) {
      const i = off + 1 + x * 3
      raw[i] = r
      raw[i + 1] = g
      raw[i + 2] = b
    }
  }
  const compressed = zlib.deflateSync(raw)

  function chunk(type: string, data: Buffer) {
    const typeBuf = Buffer.from(type, "ascii")
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length, 0)
    const crcBuf = Buffer.concat([typeBuf, data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(crcBuf), 0)
    return Buffer.concat([len, typeBuf, data, crc])
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // RGB
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const png = Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", compressed),
    chunk("IEND", Buffer.alloc(0)),
  ])
  return `data:image/png;base64,${png.toString("base64")}`
}

const LANDSCAPE_PNG = solidPngDataUrl(FIXTURE_W, FIXTURE_H, [0x2f, 0x5d, 0x50])

async function main() {
  const out = path.join(process.cwd(), ".claude-scratch-export.pptx")
  console.log("Building fixture deck…")
  const buf = await buildPlannerDeck({
    brief: {
      clientName: "Smoke Client",
      campaignName: "Q3 demand build",
      category: "FMCG",
      market: "Australia",
      objectiveKind: "Create demand",
      createCapture: 40,
      budget: 500_000,
      startDate: "2026-07-01",
      endDate: "2026-09-30",
    },
    diagnosis: {
      penetrationPct: 18,
      targetPct: 28,
      salience: "Moderate",
      createCapture: 40,
    },
    constraintsSummary: {
      includedCount: 14,
      excludedNames: ["Cinema"],
    },
    waveLabel: "2025H2",
    reachBasis: "Addressable",
    audiences: [
      {
        name: "Primary — All People 25-54",
        definition: "National · All · 25–54 · Addressable",
        stats: "Size 4,210 '000s · 22.4% of 14+ · n 1,842 · Robust",
        insight: `HEADLINE
High BVOD and social skew with solid broadcast backbone.

WHAT STANDS OUT
- BVOD indexes 128 with 34% reach.
- Instagram indexes 119; Facebook close behind.

REACH ARCHITECTURE
Broadcast and BVOD carry breadth; social and search finish activation.

CREATIVE AND CEP DIRECTION
Lead with brand film on BVOD; retarget on Meta.

WATCH-OUTS
Channel-consumption only — no attitudinal Helix cut in this dataset.`,
        topMix: "BVOD 22% · TV 18% · Instagram 14%",
        topDfii: "BVOD 142",
        charts: {
          reachIndexPng: LANDSCAPE_PNG,
          reachIndexPngWidth: FIXTURE_W,
          reachIndexPngHeight: FIXTURE_H,
          quadrantPng: LANDSCAPE_PNG,
          quadrantPngWidth: FIXTURE_W,
          quadrantPngHeight: FIXTURE_H,
          dfiiPng: LANDSCAPE_PNG,
          dfiiPngWidth: FIXTURE_W,
          dfiiPngHeight: FIXTURE_H,
        },
      },
      {
        name: "Secondary — category intenders",
        definition: "NSW+VIC · Female · 18–44 · Addressable",
        stats: "Size 890 '000s · 4.7% of 14+ · n 412 · Adequate",
        insight: null,
        topMix: "Instagram 120 · BVOD 115 · Search 108",
        topDfii: "Instagram 131",
        charts: {
          reachIndexPng: LANDSCAPE_PNG,
          reachIndexPngWidth: FIXTURE_W,
          reachIndexPngHeight: FIXTURE_H,
          quadrantPng: LANDSCAPE_PNG,
          quadrantPngWidth: FIXTURE_W,
          quadrantPngHeight: FIXTURE_H,
          dfiiPng: LANDSCAPE_PNG,
          dfiiPngWidth: FIXTURE_W,
          dfiiPngHeight: FIXTURE_H,
        },
      },
    ],
    splitTablePng: LANDSCAPE_PNG,
    splitTablePngWidth: FIXTURE_W,
    splitTablePngHeight: FIXTURE_H,
    generatedAtLabel: "13 Jul 2026",
  })

  fs.writeFileSync(out, buf)
  console.log(`Wrote ${out} (${buf.length} bytes)`)
  console.log("Open in PowerPoint: check layouts, filled text, images, no repair warning.")
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
