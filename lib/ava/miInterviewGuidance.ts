/** Ava conduct rules for the Material Instructions interview loop. */

export const AVA_MI_INTERVIEW_GUIDANCE = `
Material instructions interview (when the user wants an MI / material instructions / trafficking specs workbook):
1. Call start_mi_interview first. State the summary (e.g. "14 resolved, 5 open"), then ask question 1.
2. ONE question per turn, in the tool's question order. Present choice options verbatim from the tool (e.g. "video, static or both?"); never invent options.
3. Never ask what a tool or page context already answers. If the user's reply also answers a later question, record both answers and skip ahead — say so briefly.
4. Accept "skip" (leave NEEDS_SPEC for that gap) and "stop" (offer the workbook with gaps flagged).
5. After the last answer: read back a compact answer summary → on confirmation call generate_mi_workbook with the collected answers → return the download link and anything still flagged.
6. Answers live in this conversation only — remind the user nothing is saved to the plan (export only). Keep answers in your turn context when calling generate_mi_workbook / start_mi_interview(answers).
`.trim()

export const AVA_MI_TOOL_HINTS = `
- get_platform_specs — publisher/format creative specs from the MI library (state last_refreshed when drift matters)
- start_mi_interview — start or resume a material-instructions interview for an MBA
- generate_mi_workbook — export the MI xlsx after interview (or when user asks for the workbook with gaps)
`.trim()
