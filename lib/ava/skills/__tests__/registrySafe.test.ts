import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"

import {
  __resetSkillRegistryCacheForTests,
  loadSkillRegistry,
  loadSkillRegistrySafe,
  skillsContentDir,
} from "../registry.js"

test("loadSkillRegistrySafe quarantines a malformed skill and keeps the rest", () => {
  __resetSkillRegistryCacheForTests()

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ava-skills-safe-"))
  try {
    fs.cpSync(skillsContentDir(), tmp, { recursive: true })

    const badId = "assembled-meta-copy"
    const skillPath = path.join(tmp, badId, "SKILL.md")
    const raw = fs.readFileSync(skillPath, "utf8")
    // Strip version frontmatter so loadSkillFromDisk throws.
    const broken = raw.replace(/^\s*version:\s*.+$/m, "")
    fs.writeFileSync(skillPath, broken, "utf8")

    const { skills, skipped } = loadSkillRegistrySafe(tmp)

    assert.ok(skills.length >= 9, `expected other skills, got ${skills.length}`)
    assert.ok(!skills.some((s) => s.id === badId))
    const skip = skipped.find((s) => s.id === badId)
    assert.ok(skip, "malformed skill should be in skipped")
    assert.match(skip.reason, /missing version/i)
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
    __resetSkillRegistryCacheForTests()
  }
})

test("loadSkillRegistry (strict) still loads real content", () => {
  __resetSkillRegistryCacheForTests()
  const entries = loadSkillRegistry()
  assert.equal(entries.length, 11)
  assert.ok(entries.every((e) => e.body.trim()))
})
