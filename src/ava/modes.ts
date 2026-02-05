import type { PageContext } from "@/lib/openai"

export type ChatMode = "general" | "mediaplan_create" | "mediaplan_edit"

const patchGuidance = [
  "Return JSON only matching the response contract.",
  'Always return: {"replyText": string, "patch": FormPatch | null}.',
  'FormPatch shape: {"updates":[{"fieldId":string,"value":any}]}.',
  "If the user did not request a change, return patch as null.",
  "Only include updates for fields present in the provided PageContext and marked editable.",
].join("\n")

const modeInstructions: Record<ChatMode, (pageContext?: PageContext) => string> = {
  general: () =>
    [
      "General assistant mode. Provide concise, helpful answers grounded in the provided PageContext when available.",
      patchGuidance,
    ].join("\n"),
  mediaplan_create: () =>
    [
      "Media plan creation mode. Clarify missing goals, budgets, dates, and media mix. Provide stepwise guidance and propose edits aligned to editable fields.",
      patchGuidance,
    ].join("\n"),
  mediaplan_edit: () =>
    [
      "Media plan editing mode. Respect current values, propose incremental improvements, and confirm before overwriting budgets, dates, or selections.",
      patchGuidance,
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










