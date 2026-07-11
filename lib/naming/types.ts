export type ElementSource = "plan" | "picklist" | "free" | "literal"

export interface TemplateElement {
  key: string
  source: ElementSource
  literal?: string // when source === "literal"
  picklist?: string // key into PICKLISTS
  optional?: boolean
  isLineItemId?: boolean // exactly one per pacing-grain level, must be terminal
}

export interface NamingTemplate {
  platform: string // "cm360" | "dv360" | "youtube" | "meta" | "search" | "native"
  scope?: string // human note, e.g. "all programmatic channels"
  level: string // platform's own level name
  isPacingGrain?: boolean // exactly one level per platform
  elements: TemplateElement[]
  separator: "-"
  case: "lower" | "preserve"
}
