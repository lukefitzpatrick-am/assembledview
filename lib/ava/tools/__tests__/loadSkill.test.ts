import assert from "node:assert/strict"
import test from "node:test"
import { buildLoadSkillPayload, loadSkillTool } from "../loadSkill.js"
import type { AvaToolContext } from "../types.js"
import { AVA_SKILL_GUIDANCE, AVA_SKILL_TOOL_HINTS } from "../../skills/skillGuidance.js"

const adminCtx: AvaToolContext = {
  pageContext: undefined,
  clientSlug: undefined,
  mbaNumber: undefined,
  userSub: "u1",
  userEmail: "a@b.com",
  roles: ["admin"],
  clientSlugs: [],
  mbaNumbers: [],
  capturedPatch: null,
}

test("load_skill: returns body + learnings + chained decision rules", () => {
  const payload = buildLoadSkillPayload("assembled-insight-commentary")
  assert.ok(!("error" in payload && payload.error))
  assert.equal(payload.skillId, "assembled-insight-commentary")
  assert.equal(payload.chainedDecisionRules, true)
  assert.ok(payload.content?.includes("four questions"))
  assert.ok(payload.content?.includes("Chained: assembled-marketing-brain"))
  assert.ok(payload.pairedTools?.includes("get_pacing_snapshot"))
})

test("load_skill: lazy reference load", () => {
  const payload = buildLoadSkillPayload(
    "assembled-meta-copy",
    "specs-and-evidence",
  )
  assert.equal(payload.loadedReference, "specs-and-evidence.md")
  assert.ok(payload.content?.includes("# Reference: specs-and-evidence.md"))
})

test("load_skill: unknown skill and missing reference error", () => {
  assert.ok(buildLoadSkillPayload("nope").error)
  assert.ok(buildLoadSkillPayload("assembled-meta-copy", "missing-ref").error)
})

test("load_skill: admin gate", async () => {
  const denied = await loadSkillTool.execute(
    { skillId: "assembled-meta-copy" },
    { ...adminCtx, roles: ["manager"] },
  )
  assert.equal(denied.isError, true)

  const ok = await loadSkillTool.execute(
    { skillId: "assembled-marketing-brain" },
    adminCtx,
  )
  assert.equal(ok.isError, false)
  assert.ok(ok.content.includes("skillId: assembled-marketing-brain"))
  assert.ok(ok.content.includes("chainedDecisionRules: no"))
})

test("skill guidance mentions one skill per turn and paired tools", () => {
  assert.match(AVA_SKILL_TOOL_HINTS, /load_skill/)
  assert.match(AVA_SKILL_GUIDANCE, /ONE skill per turn/i)
  assert.match(AVA_SKILL_GUIDANCE, /assembled-insight-commentary/)
  assert.match(AVA_SKILL_GUIDANCE, /get_platform_specs/)
  assert.match(AVA_SKILL_GUIDANCE, /outline-only/i)
  assert.match(AVA_SKILL_GUIDANCE, /visible user message/i)
  assert.match(AVA_SKILL_GUIDANCE, /four questions/i)
  assert.match(AVA_SKILL_GUIDANCE, /omitted context rings/i)
})
