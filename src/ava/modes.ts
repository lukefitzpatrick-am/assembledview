import type { PageContext } from "@/lib/ava/types"

export type ChatMode = "general" | "mediaplan_create" | "mediaplan_edit"

const toolPatchGuidance = [
  "When the user asks you to change form values, call the apply_form_patch tool.",
  "Never embed FormPatch JSON or a replyText/patch object in your prose reply.",
  "Only patch fields present in the provided PageContext and marked editable.",
  "After a successful patch, confirm the changes in plain English.",
].join("\n")

const modeInstructions: Record<ChatMode, (pageContext?: PageContext) => string> = {
  general: () =>
    [
      "General assistant mode. Provide concise, helpful answers grounded in the provided PageContext when available.",
      "Prefer tools over guessing when the user asks about clients, campaigns, pacing, creative, naming, or methodology.",
      toolPatchGuidance,
    ].join("\n"),
  mediaplan_create: () =>
    [
      "Media plan creation mode. Clarify missing goals, budgets, dates, and media mix.",
      "Provide stepwise guidance and propose edits via apply_form_patch for editable fields.",
      toolPatchGuidance,
    ].join("\n"),
  mediaplan_edit: () =>
    [
      "Media plan editing mode. Respect current values, propose incremental improvements, and confirm before overwriting budgets, dates, or selections.",
      "Use tools to load campaign, creative, audience, or pacing context before advising.",
      toolPatchGuidance,
    ].join("\n"),
}

export function getModeInstructions(mode?: ChatMode | string, pageContext?: PageContext): string {
  const resolvedMode: ChatMode =
    mode === "mediaplan_create" || mode === "mediaplan_edit" ? mode : "general"

  const routeHint =
    typeof pageContext?.route === "string" ? pageContext?.route : pageContext?.route?.pathname

  const instructions = modeInstructions[resolvedMode](pageContext)
  if (routeHint) {
    return `${instructions}\nCurrent route: ${routeHint}`
  }
  return instructions
}
