import assert from "node:assert/strict"
import test from "node:test"
import {
  AVA_MI_INTERVIEW_GUIDANCE,
  AVA_MI_TOOL_HINTS,
} from "../miInterviewGuidance.js"

test("MI interview guidance covers conduct rules 1–6", () => {
  assert.match(AVA_MI_INTERVIEW_GUIDANCE, /start_mi_interview/)
  assert.match(AVA_MI_INTERVIEW_GUIDANCE, /ONE question per turn/i)
  assert.match(AVA_MI_INTERVIEW_GUIDANCE, /verbatim/i)
  assert.match(AVA_MI_INTERVIEW_GUIDANCE, /never invent/i)
  assert.match(AVA_MI_INTERVIEW_GUIDANCE, /VERBATIM|question card/i)
  assert.match(AVA_MI_INTERVIEW_GUIDANCE, /never paraphrase/i)
  assert.match(AVA_MI_INTERVIEW_GUIDANCE, /do NOT re-list options/i)
  assert.match(AVA_MI_INTERVIEW_GUIDANCE, /from plan: bid_strategy/)
  assert.match(AVA_MI_INTERVIEW_GUIDANCE, /skip/)
  assert.match(AVA_MI_INTERVIEW_GUIDANCE, /stop/)
  assert.match(AVA_MI_INTERVIEW_GUIDANCE, /generate_mi_workbook/)
  assert.match(AVA_MI_INTERVIEW_GUIDANCE, /nothing is saved to the plan/i)
  assert.match(AVA_MI_TOOL_HINTS, /get_platform_specs/)
  assert.match(AVA_MI_TOOL_HINTS, /never invent extras/i)
})
