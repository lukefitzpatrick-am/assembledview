/**
 * The working billing append merge on the plan form (edit; B52). Moved from
 * the edit page so the B20 and B35 alias identity is a required argument, not
 * a set of options each call site has to remember.
 */
import {
  appendAutoLineItemTemplateIntoWorking,
  type AppendIntoWorkingOpts,
  type BillingAliasReconcileEntry,
} from "@/lib/billing/appendAutoReferenceIntoWorking"
import type { BillingAliasNumberCheck } from "@/lib/billing/billingLineIdAlias"
import type { BillingMonth } from "@/lib/billing/types"
import { unionGeneratedBillingLines } from "@/lib/billing/unionGeneratedBillingLines"

type AttachLineItems = (months: BillingMonth[], mode: "billing" | "delivery") => BillingMonth[]

/**
 * Who the plan is, for old-id alias matching (MB-30, B20) and the number
 * proof from the loaded lines (B35, MB-40). Without it an old `ML` row and
 * its current row would both stay, and the line would bill twice.
 */
export type BillingAliasIdentity = {
  mbaNumber: string | null | undefined
  aliasNumberCheck: BillingAliasNumberCheck | null | undefined
  /** Alias adoptions and placeholder skips, once per merge when any happened. */
  onReconcile: (entries: BillingAliasReconcileEntry[]) => void
}

/**
 * Line-item template: prefer burst-derived auto months; if auto is empty but
 * working has rows, use working as the month skeleton so toggling media types
 * still merges (attach reads live form and containers).
 */
function appendTemplate(autoReference: BillingMonth[], working: BillingMonth[], attach: AttachLineItems): BillingMonth[] {
  const skeleton = autoReference.length > 0 ? autoReference : working
  if (!skeleton.length) return []
  return attach(JSON.parse(JSON.stringify(skeleton)) as BillingMonth[], "billing")
}

/**
 * Append-only: merges the template from auto reference and containers into
 * working. New months, keys and line ids only; existing line ids unchanged
 * (preserved-state model). MB-30: the lib merge does the old-id alias match,
 * placeholder skip and canonical dedupe backstop.
 */
export function appendAutoReferenceIntoWorkingBilling(
  working: BillingMonth[],
  autoReference: BillingMonth[],
  formatter: Intl.NumberFormat,
  attach: AttachLineItems,
  identity: BillingAliasIdentity,
  opts?: Omit<AppendIntoWorkingOpts, keyof BillingAliasIdentity | "mediaKey">
): BillingMonth[] {
  return appendAutoLineItemTemplateIntoWorking(working, appendTemplate(autoReference, working, attach), formatter, {
    ...opts,
    ...identity,
  })
}

/** MB-30 union of generated lines into a bucket, with the plan's alias identity. */
export function unionWithAliasIdentity<T extends Parameters<typeof unionGeneratedBillingLines>[1][number]>(
  existing: T[] | null | undefined,
  generated: T[],
  mediaKey: string,
  identity: Pick<BillingAliasIdentity, "mbaNumber" | "aliasNumberCheck">
) {
  return unionGeneratedBillingLines(existing, generated, {
    mediaKey,
    mbaNumber: identity.mbaNumber,
    aliasNumberCheck: identity.aliasNumberCheck,
  })
}
