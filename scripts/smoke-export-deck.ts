/**
 * Smoke: build a fixture Demand Flow deck and write .claude-scratch-export.pptx
 * Run: npx tsx scripts/smoke-export-deck.ts
 */
import fs from "fs"
import path from "path"
import { buildPlannerDeck } from "../lib/planning/export/buildPlannerDeck"

/** 1×1 PNG */
const TINY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="

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
          reachIndexPng: TINY_PNG,
          quadrantPng: TINY_PNG,
          dfiiPng: TINY_PNG,
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
          reachIndexPng: TINY_PNG,
          quadrantPng: TINY_PNG,
          dfiiPng: TINY_PNG,
        },
      },
    ],
    splitTablePng: TINY_PNG,
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
