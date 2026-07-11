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
  }
  pageText?: {
    title?: string
    headings?: string[]
    breadcrumbs?: string[]
  }
}

type FormPatchUpdate = { fieldId: string; value: unknown }
export type FormPatch = { updates: FormPatchUpdate[] }
export type ModelChatReply = { replyText: string; patch: FormPatch | null }
