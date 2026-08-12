/**
 * Fireflies meeting types (API + sync).
 */

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

export type AttributionResult =
  | {
      kind: "campaign"
      mbaNumber: string
      clientId: number | null
      matchedBy: "title"
      isInternal: false
    }
  | {
      kind: "client"
      mbaNumber: null
      clientId: number
      matchedBy: "domain"
      isInternal: false
    }
  | {
      kind: "internal"
      mbaNumber: null
      clientId: null
      matchedBy: "internal"
      isInternal: true
    }
  | {
      kind: "unattributed"
      mbaNumber: null
      clientId: null
      matchedBy: null
      isInternal: false
    }

export type AttributionContext = {
  knownMbas: Map<string, KnownMba>
  domainToClient: Map<string, number>
  assembledDomains: Set<string>
}
