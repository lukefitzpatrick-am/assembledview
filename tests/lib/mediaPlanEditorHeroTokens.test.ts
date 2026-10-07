import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const heroSourcePath = new URL("../../components/mediaplans/MediaPlanEditorHero.tsx", import.meta.url)
const shellSourcePath = new URL("../../components/dashboard/PageHeroShell.tsx", import.meta.url)

test("MediaPlanEditorHero uses PageHeroShell with 05b token styling", async () => {
  const source = await readFile(heroSourcePath, "utf8")

  assert.match(source, /PageHeroShell/)
  assert.match(source, /PageHeroTitleBlock/)
  assert.doesNotMatch(source, /pe-28/)
  assert.match(source, /basis-\[min\(280px,100%\)\]/)
  assert.match(source, /basis-\[min\(460px,100%\)\]/)
  assert.match(source, /basis-\[min\(780px,100%\)\]/)
  assert.match(source, /actionsFloor/)
  assert.doesNotMatch(source, /#4f8fcb/i)
  assert.doesNotMatch(source, /rgba\(/)
  assert.doesNotMatch(source, /hero-glass/)
})

test("PageHeroShell is a 05b card with no watermark", async () => {
  const source = await readFile(shellSourcePath, "utf8")

  assert.match(source, /bg-card/)
  assert.match(source, /rounded-frame/)
  assert.doesNotMatch(source, /BrandMarkWatermark/)
  assert.doesNotMatch(source, /WaveRibbon/)
  assert.doesNotMatch(source, /CornerDotCluster/)
  assert.doesNotMatch(source, /w-\[60px\]/)
})
