export type PageField = {
  fieldId?: string
  id?: string
  label?: string
  value?: unknown
  editable?: boolean
  required?: boolean
  type?: string
  options?: { label: string; value: string }[] | string[]
  /**
   * Semantic hint for the model to understand what this field represents.
   * Examples: "client_name", "campaign_name", "media_type", "budget", "date", "status", "boolean_toggle"
   */
  semanticType?: string
  /**
   * Grouping hint for UI sections or logical bundles.
   * Examples: "campaign", "billing", "delivery", "search_container", "social_container"
   */
  group?: string
  /**
   * Where this value came from.
   */
  source?: "xano" | "computed" | "ui"
}

export type PageContext = {
  route?: { pathname?: string; clientSlug?: string; mbaSlug?: string } | string
  fields?: PageField[]
  generatedAt?: string
  /**
   * Structured, read-only snapshot of the current UI state.
   * Use this for "what's happening on this page?" questions (filters, sort, counts, previews).
   */
  state?: Record<string, any>
  /**
   * Optional selector to click after applying a patch (where supported).
   */
  saveSelector?: string
  entities?: {
    clientSlug?: string
    clientName?: string
    mbaNumber?: string
    campaignName?: string
    mediaTypes?: string[]
    /** Active plan version from the edit page (`?version=`). */
    versionNumber?: number
    /**
     * Enabled media-container fetch keys (e.g. `television`, `socialMedia`).
     * Populated from media-type switches on the edit page.
     */
    enabledMediaTypes?: string[]
  }
  pageText?: {
    title?: string
    headings?: string[]
    breadcrumbs?: string[]
  }
}

type FormPatchUpdate = { fieldId: string; value: unknown }
export type FormPatch = { updates: FormPatchUpdate[] }

/** Display-only file download for the chat UI (never round-tripped into the agent loop). */
export type ChatFileAttachment = {
  kind: "file"
  fileName: string
  url: string
  contentType: string
  sizeBytes?: number
  /** Present only when the client already knows a TTL; omit otherwise. */
  expiresInMinutes?: number
}

/**
 * Display/input sugar for MI interview questions (never round-tripped into the agent loop).
 * Confirm sends the selection as a plain-text user message.
 */
export type ChatInterviewQuestion = {
  kind: "question"
  id: string
  text: string
  type: "choice" | "multichoice" | "text"
  options?: string[]
  /** Proposed defaults pre-selected in the card. */
  selected?: string[]
  /** 1-based progress through the interview (answered + current). */
  index: number
  /** Original open-question count at interview start (stable denominator). */
  total: number
}

export type ModelChatReply = {
  replyText: string
  patch: FormPatch | null
  attachments?: ChatFileAttachment[]
  questions?: ChatInterviewQuestion[]
}
