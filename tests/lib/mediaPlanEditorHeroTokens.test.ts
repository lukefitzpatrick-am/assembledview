import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const heroSourcePath = new URL("../../components/mediaplans/MediaPlanEditorHero.tsx", import.meta.url)
const shellSourcePath = new URL("../../components/dashboard/PageHeroShell.tsx", import.meta.url)

test("MediaPlanEditorHero uses B2 PageHeroShell with token-based styling", async () => {
  const source = await readFile(heroSourcePath, "utf8")

  assert.match(source, /PageHeroShell/)
  assert.match(source, /PageHeroTitleBlock/)
  assert.doesNotMatch(source, /#4f8fcb/i)
  assert.doesNotMatch(source, /rgba\(/)
  assert.doesNotMatch(source, /hero-glass/)
})

test("PageHeroShell uses sage surface and brand watermark tokens", async () => {
  const source = await readFile(shellSourcePath, "utf8")

  assert.match(source, /bg-background/)
  assert.match(source, /rounded-frame/)
  assert.match(source, /BrandMarkWatermark/)
  assert.doesNotMatch(source, /WaveRibbon/)
  assert.doesNotMatch(source, /CornerDotCluster/)
})
