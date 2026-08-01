/**
 * PC6 pure matcher — tier 1 reference+amount, tier 2 contact+amount+month,
 * duplicate/orphan passes. No DB I/O.
 */

import { normalizeContactKey } from "@/lib/xero/normalizeContact"

export type MatcherRunItem = {
  id: number
  periodId: number
  periodMonth: string // YYYY-MM
  invoiceReference: string
  amountCents: number
  clientId: number | null
  status: string
}

export type MatcherArInvoice = {
  xeroInvoiceId: string
  invoiceNumber: string | null
  referenceRaw: string | null
  contactKey: string | null // normalised contact key
  xeroContactId: string | null
  issueDate: string | null // YYYY-MM-DD
  amountCents: number
  status: string | null
}

export type ContactLink = {
  xeroContactKey: string
  clientId: number
}

export type MatchMethod = "reference" | "heuristic" | "manual"
export type MatchStatus = "matched" | "diverged" | "disputed" | "written_off"

export type MatchDecision = {
  xeroInvoiceId: string
  runItemId: number | null
  method: MatchMethod
  confidence: number
  deltaCents: number
  status: MatchStatus
  cardKind?:
    | "divergence"
    | "suggestion"
    | "duplicate"
    | "orphan"
    | null
  detail?: string
}

/** Amount within $0.01 (1 cent). */
export function amountsWithinCent(a: number, b: number): boolean {
  return Math.abs(Math.round(a) - Math.round(b)) <= 1
}

export function referenceContainsInvoiceRef(
  referenceRaw: string | null | undefined,
  invoiceReference: string
): boolean {
  const ref = String(referenceRaw ?? "").toUpperCase()
  const needle = String(invoiceReference ?? "").trim().toUpperCase()
  if (!needle || !ref) return false
  return ref.includes(needle)
}

export function issueMonthKey(issueDate: string | null | undefined): string | null {
  const s = String(issueDate ?? "").trim()
  if (!s) return null
  // YYYY-MM-DD or YYYY-MM
  if (/^\d{4}-\d{2}/.test(s)) return s.slice(0, 7)
  return null
}

export type MatcherPassResult = {
  decisions: MatchDecision[]
  cards: MatchDecision[]
  autoMatched: number
  referenceHitRate: number // matched-by-reference / AR considered (0..1)
  stats: {
    tier1Matched: number
    tier1Diverged: number
    tier2Suggested: number
    duplicates: number
    orphans: number
    referenceAttempts: number
    referenceHits: number
  }
}

/**
 * Run 3-tier matcher + duplicate/orphan passes.
 * Report-only safe: pure function.
 */
export function runThreeTierMatcher(args: {
  runItems: MatcherRunItem[]
  invoices: MatcherArInvoice[]
  contactLinks: ContactLink[]
  aliases?: ContactLink[] // xero_client_aliases as contact_key → client_id
  firstPeriodMonth: string // orphan floor
  existingMatches?: Array<{ xeroInvoiceId: string; runItemId: number | null }>
}): MatcherPassResult {
  const items = args.runItems.filter((i) => !["excluded", "held"].includes(i.status))
  const byRef = new Map<string, MatcherRunItem[]>()
  for (const it of items) {
    const k = it.invoiceReference.trim().toUpperCase()
    if (!k) continue
    const list = byRef.get(k) ?? []
    list.push(it)
    byRef.set(k, list)
  }

  const clientByContact = new Map<string, number>()
  for (const a of args.aliases ?? []) {
    clientByContact.set(normalizeContactKey(a.xeroContactKey), a.clientId)
  }
  for (const l of args.contactLinks) {
    clientByContact.set(normalizeContactKey(l.xeroContactKey), l.clientId)
  }

  const existingByInvoice = new Map(
    (args.existingMatches ?? []).map((m) => [m.xeroInvoiceId, m.runItemId])
  )

  const decisions: MatchDecision[] = []
  const cards: MatchDecision[] = []
  const matchedInvoiceIds = new Set<string>()
  const runItemMatchCounts = new Map<number, string[]>() // runItemId → invoice ids

  let tier1Matched = 0
  let tier1Diverged = 0
  let tier2Suggested = 0
  let referenceAttempts = 0
  let referenceHits = 0

  // Tier 1 — reference contains invoice_reference
  for (const inv of args.invoices) {
    if (existingByInvoice.has(inv.xeroInvoiceId)) {
      matchedInvoiceIds.add(inv.xeroInvoiceId)
      continue
    }
    const candidates = items.filter((it) =>
      referenceContainsInvoiceRef(inv.referenceRaw, it.invoiceReference)
    )
    if (candidates.length === 0) continue
    referenceAttempts += 1

    // Prefer exact amount; else first with amount delta for divergence
    const exact = candidates.find((c) => amountsWithinCent(c.amountCents, inv.amountCents))
    if (exact) {
      referenceHits += 1
      tier1Matched += 1
      matchedInvoiceIds.add(inv.xeroInvoiceId)
      const list = runItemMatchCounts.get(exact.id) ?? []
      list.push(inv.xeroInvoiceId)
      runItemMatchCounts.set(exact.id, list)
      decisions.push({
        xeroInvoiceId: inv.xeroInvoiceId,
        runItemId: exact.id,
        method: "reference",
        confidence: 1,
        deltaCents: Math.round(inv.amountCents) - Math.round(exact.amountCents),
        status: "matched",
        cardKind: null,
      })
      continue
    }

    // Reference match but amount differs → divergence
    const primary = candidates[0]!
    referenceHits += 1 // reference hit even if amount wrong
    tier1Diverged += 1
    matchedInvoiceIds.add(inv.xeroInvoiceId)
    const delta = Math.round(inv.amountCents) - Math.round(primary.amountCents)
    const d: MatchDecision = {
      xeroInvoiceId: inv.xeroInvoiceId,
      runItemId: primary.id,
      method: "reference",
      confidence: 0.7,
      deltaCents: delta,
      status: "diverged",
      cardKind: "divergence",
      detail: `Δ ${delta} cents (invoice ${inv.amountCents} vs run ${primary.amountCents})`,
    }
    decisions.push(d)
    cards.push(d)
  }

  // Tier 2 — contact + amount + month
  for (const inv of args.invoices) {
    if (matchedInvoiceIds.has(inv.xeroInvoiceId)) continue
    const ck = normalizeContactKey(String(inv.contactKey ?? ""))
    if (!ck) continue
    const clientId = clientByContact.get(ck)
    if (clientId == null) continue
    const month = issueMonthKey(inv.issueDate)
    if (!month) continue

    const candidates = items.filter(
      (it) =>
        it.clientId === clientId &&
        it.periodMonth === month &&
        amountsWithinCent(it.amountCents, inv.amountCents)
    )
    if (candidates.length !== 1) continue

    const hit = candidates[0]!
    // Don't suggest if already has a silent match from another invoice for same item in tier1
    tier2Suggested += 1
    matchedInvoiceIds.add(inv.xeroInvoiceId)
    const d: MatchDecision = {
      xeroInvoiceId: inv.xeroInvoiceId,
      runItemId: hit.id,
      method: "heuristic",
      confidence: 0.55,
      deltaCents: Math.round(inv.amountCents) - Math.round(hit.amountCents),
      status: "diverged", // suggestion until accepted
      cardKind: "suggestion",
      detail: `contact+amount+month → run item ${hit.id}`,
    }
    decisions.push(d)
    cards.push(d)
  }

  // Duplicate pass — two+ invoices → one run item
  let duplicates = 0
  for (const [runItemId, invoiceIds] of runItemMatchCounts) {
    if (invoiceIds.length < 2) continue
    duplicates += 1
    const d: MatchDecision = {
      xeroInvoiceId: invoiceIds.join(","),
      runItemId,
      method: "reference",
      confidence: 0.4,
      deltaCents: 0,
      status: "diverged",
      cardKind: "duplicate",
      detail: `duplicate invoices for run item ${runItemId}: ${invoiceIds.join(", ")}`,
    }
    cards.push(d)
  }

  // Orphan pass — AR ≥ first period month with no run item match
  let orphans = 0
  const floor = args.firstPeriodMonth
  for (const inv of args.invoices) {
    if (matchedInvoiceIds.has(inv.xeroInvoiceId)) continue
    const month = issueMonthKey(inv.issueDate)
    if (!month || month < floor) continue
    orphans += 1
    const d: MatchDecision = {
      xeroInvoiceId: inv.xeroInvoiceId,
      runItemId: null,
      method: "heuristic",
      confidence: 0.2,
      deltaCents: 0,
      status: "diverged",
      cardKind: "orphan",
      detail: `orphan AR ${inv.invoiceNumber ?? inv.xeroInvoiceId} month ${month}`,
    }
    decisions.push(d)
    cards.push(d)
  }

  const referenceHitRate =
    referenceAttempts === 0 ? 0 : referenceHits / referenceAttempts

  return {
    decisions,
    cards,
    autoMatched: tier1Matched,
    referenceHitRate,
    stats: {
      tier1Matched,
      tier1Diverged,
      tier2Suggested,
      duplicates,
      orphans,
      referenceAttempts,
      referenceHits,
    },
  }
}

/** Manual assign teaches contact link permanently. */
export function learnContactLink(args: {
  xeroContactKey: string
  clientId: number
  existing: ContactLink[]
}): ContactLink[] {
  const key = normalizeContactKey(args.xeroContactKey)
  const without = args.existing.filter(
    (e) => normalizeContactKey(e.xeroContactKey) !== key
  )
  return [...without, { xeroContactKey: key, clientId: args.clientId }]
}

export function periodShouldReconcile(openCardCount: number): boolean {
  return openCardCount === 0
}

export function shouldEscalateDay10(args: {
  periodMonth: string
  now: Date
  openCardCount: number
}): boolean {
  if (args.openCardCount <= 0) return false
  // Period month YYYY-MM → day 10 of that month in local/Sydney sense (date-only)
  const [y, m] = args.periodMonth.split("-").map(Number)
  if (!y || !m) return false
  const day10 = new Date(Date.UTC(y, m - 1, 10, 14, 0, 0)) // ~00:00 Sydney-ish UTC+10
  return args.now.getTime() >= day10.getTime()
}

/**
 * O7 — Day-10 escalation: at most one card per periodMonth per condition.
 * Once escalated for the period, never re-notify on day 11..N.
 */
export function shouldInsertDay10Escalation(args: {
  periodMonth: string
  now: Date
  openCardCount: number
  alreadyEscalatedForPeriod: boolean
}): boolean {
  if (args.alreadyEscalatedForPeriod) return false
  return shouldEscalateDay10({
    periodMonth: args.periodMonth,
    now: args.now,
    openCardCount: args.openCardCount,
  })
}
