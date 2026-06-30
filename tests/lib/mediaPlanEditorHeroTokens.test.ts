import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const heroSourcePath = new URL("../../components/mediaplans/MediaPlanEditorHero.tsx", import.meta.url)

test("MediaPlanEditorHero uses CSS token colours for its hero gradient", async () => {
  const source = await readFile(heroSourcePath, "utf8")

  assert.match(source, /brandColour = "hsl\(var\(--secondary\)\)"/)
  assert.doesNotMatch(source, /#4f8fcb/i)
  assert.doesNotMatch(source, /rgba\(/)
  assert.doesNotMatch(source, /hexToRgba/)
})
