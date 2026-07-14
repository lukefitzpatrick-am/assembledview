import type { PageContext } from "@/lib/ava/types"

type AssistantActionHandlers = {
  /**
   * Update the budget for a specific burst within a media type.
   * Expected payload shape:
   * { action: "updateBurstBudget", mediaType: string, burstIndex: number, budget: number }
   */
  updateBurstBudget?: (payload: {
    mediaType: string
    burstIndex?: number
    budget: number
  }) => Promise<string | void> | string | void
  /**
   * Generic field setter using known ids or selectors.
   * Supports { fieldId, selector, value } (string/number/boolean).
   */
  setField?: (payload: {
    fieldId?: string
    selector?: string
    value: any
  }) => Promise<string | void> | string | void
  /**
   * Generic click action by selector.
   */
  click?: (payload: { selector: string }) => Promise<string | void> | string | void
  /**
   * Generic select option action by selector and value.
   */
  select?: (payload: {
    selector: string
    value: string
  }) => Promise<string | void> | string | void
  /**
   * Generic toggle (checkbox/switch) by selector.
   */
  toggle?: (payload: {
    selector: string
    value: boolean
  }) => Promise<string | void> | string | void
  /**
   * Bulk-replace (or append) line items for a media container after AVA plan parse.
   */
  setLineItems?: (payload: {
    channel: "radio" | "ooh"
    items: Record<string, unknown>[]
    replace?: boolean
  }) => Promise<string | void> | string | void
}

export type AssistantContext = {
  summary?: unknown
  actions?: AssistantActionHandlers
  pageContext?: PageContext
}

const GLOBAL_KEY = "__AV_ASSISTANT__"
const OPEN_CHAT_EVENT = "ava:open-chat"

export type OpenAvaChatDetail = {
  message: string
}

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

/** Clear bridge state when a provider page unmounts (avoids stale PageContext). */
export function clearAssistantContext() {
  if (typeof window === "undefined") return
  delete (window as any)[GLOBAL_KEY]
}

/**
 * Open the Ava chat widget and send a visible first user message.
 * ChatWidget subscribes via `subscribeAvaChatOpen`.
 */
export function openAvaChat(detail: OpenAvaChatDetail) {
  if (typeof window === "undefined") return
  const message = detail?.message?.trim()
  if (!message) return
  window.dispatchEvent(
    new CustomEvent(OPEN_CHAT_EVENT, {
      detail: { message } satisfies OpenAvaChatDetail,
    }),
  )
}

export function subscribeAvaChatOpen(
  handler: (detail: OpenAvaChatDetail) => void,
): () => void {
  if (typeof window === "undefined") return () => {}
  const listener = (event: Event) => {
    const custom = event as CustomEvent<OpenAvaChatDetail>
    const message = custom.detail?.message?.trim()
    if (!message) return
    handler({ message })
  }
  window.addEventListener(OPEN_CHAT_EVENT, listener)
  return () => window.removeEventListener(OPEN_CHAT_EVENT, listener)
}
