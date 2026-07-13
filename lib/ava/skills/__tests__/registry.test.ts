import assert from "node:assert/strict"
import test from "node:test"
import {
  DECISION_RULES_REF,
  MARKETING_BRAIN_ID,
  SKILL_INJECTION_BUDGET_CHARS,
  __resetSkillRegistryCacheForTests,
  compressTriggerSummary,
  getDecisionRulesBody,
  loadSkillRegistry,
  loadSkillsVersion,
  parseFrontmatter,
  skillInjectionChars,
  skillsContentDir,
} from "../registry.js"

test("skills: all 9 load with frontmatter, unique ids, chained brain", () => {
  __resetSkillRegistryCacheForTests()
  const entries = loadSkillRegistry()
  assert.equal(entries.length, 9)

  const ids = entries.map((e) => e.id)
  assert.equal(new Set(ids).size, 9)
  assert.ok(ids.includes(MARKETING_BRAIN_ID))
  assert.ok(ids.includes("assembled-performance-review-report"))

  for (const entry of entries) {
    assert.ok(entry.version, `${entry.id} version`)
    assert.ok(entry.body.trim(), `${entry.id} body`)
    assert.ok(entry.triggerSummary.trim(), `${entry.id} triggerSummary`)
    const words = entry.triggerSummary.split(/\s+/).filter(Boolean).length
    assert.ok(words <= 60, `${entry.id} triggerSummary words=${words}`)

    for (const chainId of entry.chains ?? []) {
      assert.ok(ids.includes(chainId), `${entry.id} chains to missing ${chainId}`)
    }
  }

  const version = loadSkillsVersion()
  assert.equal(version.sourceZip, "ava-skills-drop-v2.zip")
  assert.ok(version.importedAt)
  for (const entry of entries) {
    assert.equal(version.skills[entry.id], entry.version)
  }
})

test("skills: injection budget = body + learnings + chained decision-rules + largest ref ≤ 24000", () => {
  __resetSkillRegistryCacheForTests()
  const entries = loadSkillRegistry()
  const rules = getDecisionRulesBody()
  assert.ok(rules.length > 0)
  assert.ok(
    entries
      .find((e) => e.id === MARKETING_BRAIN_ID)
      ?.references.some((r) => r.name === DECISION_RULES_REF),
  )

  let maxSize = 0
  let maxId = ""
  for (const entry of entries) {
    const size = skillInjectionChars(entry, rules.length)
    assert.ok(
      size <= SKILL_INJECTION_BUDGET_CHARS,
      `${entry.id} injection ${size} exceeds ${SKILL_INJECTION_BUDGET_CHARS}`,
    )
    if (size > maxSize) {
      maxSize = size
      maxId = entry.id
    }
  }
  assert.equal(maxId, "assembled-presentations")
  assert.ok(maxSize <= 19_500, `presentations expected ~19k, got ${maxSize}`)
})

test("skills: content dir is under lib/ava/skills/content", () => {
  assert.ok(skillsContentDir().replace(/\\/g, "/").endsWith("lib/ava/skills/content"))
})

test("parseFrontmatter + compressTriggerSummary", () => {
  const parsed = parseFrontmatter(`---
name: assembled-meta-copy
description: Write Meta hooks. Use whenever asked for Meta ads.
metadata:
  version: 1.2.0
---

# Body here
`)
  assert.equal(parsed.name, "assembled-meta-copy")
  assert.equal(parsed.version, "1.2.0")
  assert.ok(parsed.description?.includes("Meta hooks"))
  assert.ok(parsed.body.includes("# Body here"))

  const long = Array.from({ length: 70 }, (_, i) => `w${i}`).join(" ")
  const compressed = compressTriggerSummary(long, 60)
  assert.equal(compressed.split(/\s+/).length, 60)
  assert.ok(compressed.endsWith("…"))
})
