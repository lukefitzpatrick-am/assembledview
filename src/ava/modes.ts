import type { PageContext } from "@/lib/openai"

export type ChatMode = "general" | "mediaplan_create" | "mediaplan_edit"

const actionGuidance = [
  "When the user asks to change on-page data, respond with JSON actions in triple backticks.",
  'Supported shapes:',
  '- {"action":"updateBurstBudget","mediaType":"search","burstIndex":0,"budget":12345}',
  '- {"action":"setField","fieldId":"mp_campaignbudget","value":"50000"}',
  '- {"action":"setField","selector":"input[name=mp_campaignname]","value":"New name"}',
  '- {"action":"click","selector":"button[data-test=save-plan]"}',
  '- {"action":"select","selector":"select[name=mp_campaignstatus]","value":"On Hold"}',
  '- {"action":"toggle","selector":"input[type=checkbox][name=mp_search]","value":true}',
  "Only emit an action when confident; otherwise ask a brief clarifying question.",
].join("\n")

const modeInstructions: Record<ChatMode, (pageContext?: PageContext) => string> = {
  general: () =>
    [
      "General assistant mode. Provide concise, helpful answers grounded in the provided PageContext when available.",
      actionGuidance,
    ].join("\n"),
  mediaplan_create: () =>
    [
      "Media plan creation mode. Clarify missing goals, budgets, dates, and media mix. Provide stepwise guidance and propose edits aligned to editable fields.",
      actionGuidance,
    ].join("\n"),
  mediaplan_edit: () =>
    [
      "Media plan editing mode. Respect current values, propose incremental improvements, and confirm before overwriting budgets, dates, or selections.",
      actionGuidance,
    ].join("\n"),
}

export function getModeInstructions(mode?: ChatMode | string, pageContext?: PageContext): string {
  const resolvedMode: ChatMode =
    mode === "mediaplan_create" || mode === "mediaplan_edit" ? mode : "general"

  const routeHint =
    typeof pageContext?.route === "string"
      ? pageContext?.route
      : pageContext?.route?.pathname

  const instructions = modeInstructions[resolvedMode](pageContext)
  if (routeHint) {
    return `${instructions}\nCurrent route: ${routeHint}`
  }
  return instructions
}










