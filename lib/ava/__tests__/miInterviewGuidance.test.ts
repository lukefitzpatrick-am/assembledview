import assert from "node:assert/strict"
import test from "node:test"
import {
  AVA_MI_INTERVIEW_GUIDANCE,
  AVA_MI_TOOL_HINTS,
} from "../miInterviewGuidance.js"

test("MI interview guidance covers conduct rules 1–6", () => {
  assert.match(AVA_MI_INTERVIEW_GUIDANCE, /start_mi_interview/)
  assert.match(AVA_MI_INTERVIEW_GUIDANCE, /ONE question per turn/i)
  assert.match(AVA_MI_INTERVIEW_GUIDANCE, /tool-driven|currentQuestion/i)
  assert.match(AVA_MI_INTERVIEW_GUIDANCE, /never author|never invent/i)
  assert.match(AVA_MI_INTERVIEW_GUIDANCE, /not a question/i)
  assert.match(AVA_MI_INTERVIEW_GUIDANCE, /question card/i)
  assert.match(AVA_MI_INTERVIEW_GUIDANCE, /do NOT re-list options/i)
  assert.match(AVA_MI_INTERVIEW_GUIDANCE, /Derived answers are already applied/i)
  assert.match(AVA_MI_INTERVIEW_GUIDANCE, /never ask the user to confirm derived/i)
  assert.match(AVA_MI_INTERVIEW_GUIDANCE, /never map bid_strategy to funnel/i)
  assert.match(AVA_MI_INTERVIEW_GUIDANCE, /from plan: bid_strategy/)
  assert.match(AVA_MI_INTERVIEW_GUIDANCE, /skip/)
  assert.match(AVA_MI_INTERVIEW_GUIDANCE, /stop/)
  assert.match(AVA_MI_INTERVIEW_GUIDANCE, /generate_mi_workbook/)
  assert.match(AVA_MI_INTERVIEW_GUIDANCE, /nothing is saved to the plan/i)
  assert.match(AVA_MI_TOOL_HINTS, /get_platform_specs/)
  assert.match(AVA_MI_TOOL_HINTS, /ONE current question card/i)
  assert.match(AVA_MI_TOOL_HINTS, /never invent/i)
  assert.match(AVA_MI_TOOL_HINTS, /derived fills are already applied/i)
})

test("MI interview guidance forbids freelanced Question N of M and derived labels", () => {
  assert.match(AVA_MI_INTERVIEW_GUIDANCE, /questionIndex/)
  assert.match(AVA_MI_INTERVIEW_GUIDANCE, /questionTotal/)
  assert.match(
    AVA_MI_INTERVIEW_GUIDANCE,
    /never (compose|author|invent).{0,40}Question\s+N\s+of\s+M|do not (compose|author|invent).{0,40}["']?Question/i,
  )
  assert.match(
    AVA_MI_INTERVIEW_GUIDANCE,
    /echo.{0,40}(questionIndex|card)|questionIndex.{0,40}echo/i,
  )
  assert.match(
    AVA_MI_INTERVIEW_GUIDANCE,
    /derived.{0,80}(verbatim|field\/value|own labels|do not restate|never restate)/i,
  )
  assert.match(AVA_MI_INTERVIEW_GUIDANCE, /exportWithGaps/)
  assert.match(AVA_MI_TOOL_HINTS, /exportWithGaps|open questions/i)
})
