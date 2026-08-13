/**
 * Fireflies meeting types (API + sync).
 */

import type { TitleClientEntry } from "./titleClients.js"
import type { TeamMemberIdentity } from "./rosterAliases.js"

export type FirefliesSummary = {
  overview?: string | null
  action_items?: string | null
  short_summary?: string | null
  shorthand_bullet?: string | null
}

export type FirefliesTranscript = {
  id: string
  title: string | null
  /** Epoch ms (Fireflies) or ISO string depending on field. */
  date: number | string | null
  duration: number | null
  participants: string[] | null
  organizer_email?: string | null
  transcript_url?: string | null
  summary?: FirefliesSummary | null
}

export type KnownMba = {
  mbaNumber: string
  clientId: number | null
}

export type AttributionCandidate = {
  clientId: number
  name: string
}

export type TitleRuleTarget = "internal" | "new_business"

export type AttributionResult =
  | {
      kind: "client"
      mbaNumber: string | null
      clientId: number
      publisherId: null
      matchedBy: "title" | "domain"
      isInternal: false
    }
  | {
      kind: "publisher"
      mbaNumber: null
      clientId: null
      publisherId: number
      matchedBy: "publisher_domain"
      isInternal: false
    }
  | {
      kind: "internal"
      mbaNumber: null
      clientId: null
      publisherId: null
      matchedBy: "internal" | "title_rule"
      isInternal: true
    }
  | {
      kind: "new_business"
      mbaNumber: null
      clientId: null
      publisherId: null
      matchedBy: "title_rule"
      isInternal: false
    }
  | {
      kind: "unattributed"
      mbaNumber: null
      clientId: null
      publisherId: null
      matchedBy: null
      isInternal: false
      candidates: AttributionCandidate[]
    }

export type AttributionContext = {
  knownMbas: Map<string, KnownMba>
  domainToClient: Map<string, number>
  assembledDomains: Set<string>
  titleClients: TitleClientEntry[]
  roster?: TeamMemberIdentity[]
  domainToPublisher?: Map<string, number>
  titleRules?: Map<string, TitleRuleTarget>
}
