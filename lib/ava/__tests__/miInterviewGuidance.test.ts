import assert from "node:assert/strict"
import test from "node:test"
import {
  AVA_MI_INTERVIEW_GUIDANCE,
  AVA_MI_TOOL_HINTS,
} from "../miInterviewGuidance.js"

test("MI interview guidance covers conduct rules 1–6", () => {
  assert.match(AVA_MI_INTERVIEW_GUIDANCE, /start_mi_interview/)
  assert.match(AVA_MI_INTERVIEW_GUIDANCE, /ONE question per turn/i)
  assert.match(AVA_MI_INTERVIEW_GUIDANCE, /verbatim/)
  assert.match(AVA_MI_INTERVIEW_GUIDANCE, /skip/)
  assert.match(AVA_MI_INTERVIEW_GUIDANCE, /stop/)
  assert.match(AVA_MI_INTERVIEW_GUIDANCE, /generate_mi_workbook/)
  assert.match(AVA_MI_INTERVIEW_GUIDANCE, /nothing is saved to the plan/i)
  assert.match(AVA_MI_TOOL_HINTS, /get_platform_specs/)
})
