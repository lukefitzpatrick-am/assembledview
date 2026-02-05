import type { PageContext } from "@/lib/openai"

export type AssistantActionHandlers = {
  /**
   * Update the budget for a specific burst within a media type.
   * Expected payload shape:
   * { action: "updateBurstBudget", mediaType: string, burstIndex: number, budget: number }
   */
  updateBurstBudget?: (payload: { mediaType: string; burstIndex?: number; budget: number }) => Promise<string | void> | string | void
  /**
   * Generic field setter using known ids or selectors.
   * Supports { fieldId, selector, value } (string/number/boolean).
   */
  setField?: (payload: { fieldId?: string; selector?: string; value: any }) => Promise<string | void> | string | void
  /**
   * Generic click action by selector.
   */
  click?: (payload: { selector: string }) => Promise<string | void> | string | void
  /**
   * Generic select option action by selector and value.
   */
  select?: (payload: { selector: string; value: string }) => Promise<string | void> | string | void
  /**
   * Generic toggle (checkbox/switch) by selector.
   */
  toggle?: (payload: { selector: string; value: boolean }) => Promise<string | void> | string | void
}

export type AssistantContext = {
  summary?: unknown
  actions?: AssistantActionHandlers
  pageContext?: PageContext
}

const GLOBAL_KEY = "__AV_ASSISTANT__"

export function getAssistantContext(): AssistantContext | undefined {
  if (typeof window === "undefined") return undefined
  return (window as any)[GLOBAL_KEY]
}

export function setAssistantContext(next: AssistantContext) {
  if (typeof window === "undefined") return
  const current = getAssistantContext()
  ;(window as any)[GLOBAL_KEY] = {
    ...(current || {}),
    ...next,
    actions: {
      ...(current?.actions || {}),
      ...(next.actions || {}),
    },
  }
}

export function setAssistantSummary(summary: unknown) {
  setAssistantContext({ summary })
}

export function getAssistantSummary(): unknown | undefined {
  return getAssistantContext()?.summary
}


