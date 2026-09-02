"use client"

/**
 * Maps a media / fees group to one InvoicingPlanRow per record (CB-FIX-5 identity).
 */

import type { BillingLineItem } from "@/lib/types/financeBilling"
import type { MediaPlanGroup } from "@/lib/finance/useReceivablesData"
import type { InlineScheduleEditContext } from "@/lib/finance/commitInlineScheduleAmountEdit"
import type { InvoicingClientBlockerMeta } from "@/lib/finance/sections/invoicingRowPresentation"
import { InvoicingPlanRow } from "@/components/finance/sections/invoicing/InvoicingPlanRow"

type InvoicingMediaPlanSectionProps = {
  mp: MediaPlanGroup
  kind: "media" | "sow"
  refetch: () => void
  onNotesSaved?: (result: {
    invoice_key: string
    notes: string
    persisted_record_id: number
  }) => void
  onLineAmountCommitted?: (
    line: BillingLineItem,
    next: { amount: number; billing_mode?: "auto" | "manual" | null },
    ctx: InlineScheduleEditContext
  ) => void
  clientMeta?: InvoicingClientBlockerMeta | null
}

export function InvoicingMediaPlanSection({
  mp,
  kind,
  refetch,
  onNotesSaved,
  onLineAmountCommitted,
  clientMeta,
}: InvoicingMediaPlanSectionProps) {
  return (
    <>
      {mp.records.map((record, recIdx) => (
        <InvoicingPlanRow
          key={record.invoice_key ?? `${kind}-${mp.mbaNumber}-${recIdx}-${record.id}`}
          record={record}
          mp={mp}
          kind={kind}
          refetch={refetch}
          onNotesSaved={onNotesSaved}
          onLineAmountCommitted={onLineAmountCommitted}
          clientMeta={clientMeta}
        />
      ))}
    </>
  )
}
