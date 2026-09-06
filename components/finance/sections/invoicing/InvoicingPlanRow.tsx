"use client"

import { useMemo, useRef, useState, type ReactNode } from "react"
import { ChevronDown, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { RowActionLine } from "@/components/finance/RowActionLine"
import type { RowActionMenuItem } from "@/components/finance/RowActionMenu"
import { useMediaPlanActions } from "@/components/finance/MediaPlanActionBar"
import { MarkSentToFinanceButton } from "@/components/finance/sections/invoicing/MarkSentToFinanceButton"
import { UnapproveBillingButton } from "@/components/finance/sections/invoicing/UnapproveBillingButton"
import { ReceivableNotesButton } from "@/components/finance/receivables/ReceivableNotesButton"
import { ReceivablesLineGroupRow } from "@/components/finance/receivables/ReceivablesLineGroupRow"
import { useToast } from "@/components/ui/use-toast"
import {
  approveBillingRecords,
  markBillingRecordsExported,
  unapproveBillingRecords,
  unmarkBillingRecordsExported,
} from "@/lib/finance/api"
import { grainFromBillingRecord } from "@/lib/finance/billingApproveGrain"
import { hasBillingEvidence, needsInlineAmountConfirm } from "@/lib/finance/billingLifecycle"
import { groupIdenticalLineItems } from "@/lib/finance/groupIdenticalLineItems"
import { markSentResultToast } from "@/lib/finance/markSentToFinanceCopy"
import { unapproveFailureToast } from "@/lib/finance/sections/unapproveCopy"
import type { InlineScheduleEditContext } from "@/lib/finance/commitInlineScheduleAmountEdit"
import {
  buildMediaTypeRollups,
  formatMediaTypeCaption,
  invoicingBlockerReasons,
  invoicingPrimaryAction,
  invoicingPrimaryLabel,
  invoicingRowBlockers,
  type InvoicingClientBlockerMeta,
  type MediaTypeRollup,
} from "@/lib/finance/sections/invoicingRowPresentation"
import { receivableRecordSectionLabel, type MediaPlanGroup } from "@/lib/finance/useReceivablesData"
import { formatAUD } from "@/lib/format/money"
import type { BillingLineItem, BillingRecord } from "@/lib/types/financeBilling"
import { cn } from "@/lib/utils"

const EMPTY_MP: MediaPlanGroup = {
  mbaNumber: "",
  campaignName: "",
  records: [],
  total: 0,
  versionId: null,
  versionNumber: null,
}

function MediaTypeDetail({
  rollup,
  editCtx,
  invoiceBilled,
  confirmIfAnyBilled,
  onLineAmountCommitted,
}: {
  rollup: MediaTypeRollup
  editCtx: InlineScheduleEditContext | null
  invoiceBilled?: boolean
  confirmIfAnyBilled?: boolean
  onLineAmountCommitted?: InvoicingPlanRowProps["onLineAmountCommitted"]
}) {
  const grouped = useMemo(
    () =>
      groupIdenticalLineItems(
        [...rollup.lineItems].sort((a, b) => a.sort_order - b.sort_order)
      ),
    [rollup.lineItems]
  )

  return (
    <div className="rounded-input border border-border bg-background px-2">
      {grouped.map((g) => (
        <ReceivablesLineGroupRow
          key={g.key}
          group={g}
          editCtx={editCtx}
          invoiceBilled={invoiceBilled}
          confirmIfAnyBilled={confirmIfAnyBilled}
          onLineAmountCommitted={(line, next) => {
            if (!editCtx) return
            onLineAmountCommitted?.(line, next, editCtx)
          }}
        />
      ))}
    </div>
  )
}

export type InvoicingPlanRowProps = {
  record: BillingRecord
  mp?: MediaPlanGroup | null
  kind: "media" | "sow" | "retainer"
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

export function InvoicingPlanRow({
  record,
  mp,
  kind,
  refetch,
  onNotesSaved,
  onLineAmountCommitted,
  clientMeta,
}: InvoicingPlanRowProps) {
  const { toast } = useToast()
  const amountFrozen = hasBillingEvidence(record.state)
  const [busy, setBusy] = useState(false)
  const [detailOpen, setDetailOpen] = useState(amountFrozen)
  const notesTriggerRef = useRef<HTMLButtonElement>(null)
  const planMp = mp ?? EMPTY_MP
  const mediaActions = useMediaPlanActions({
    mp: planMp,
    billingMonth: record.billing_month,
    onSaved: refetch,
  })

  const state = record.state ?? "ready"
  const grain = grainFromBillingRecord(record)
  const drifted = record.approved_drift === true
  const primaryKind = invoicingPrimaryAction(state)
  const blockers = invoicingRowBlockers({
    clientsId: record.clients_id,
    clientName: record.client_name,
    record,
    clientMeta,
  })
  const blockerReasons = invoicingBlockerReasons(blockers)
  const blocked = blockerReasons.length > 0
  const rollups = useMemo(() => buildMediaTypeRollups([record]), [record])
  const caption = formatMediaTypeCaption(rollups)
  const typeLabel = receivableRecordSectionLabel(record.billing_type)
  const mbaMeta = [record.mba_number, typeLabel].filter(Boolean).join(" · ")

  const editCtx = useMemo<InlineScheduleEditContext | null>(() => {
    if (amountFrozen) return null
    if (kind !== "media") return null
    if (!planMp.mbaNumber || planMp.versionId == null || planMp.versionNumber == null) return null
    if (!record.billing_month) return null
    return {
      versionId: planMp.versionId,
      versionNumber: planMp.versionNumber,
      mbaNumber: planMp.mbaNumber,
      billingMonthIso: record.billing_month,
    }
  }, [
    amountFrozen,
    kind,
    planMp.mbaNumber,
    planMp.versionId,
    planMp.versionNumber,
    record.billing_month,
  ])

  const run = async (action: "approve" | "unapprove" | "reapprove" | "unmark") => {
    if (!grain || busy) return
    setBusy(true)
    try {
      if (action === "approve" || action === "reapprove") {
        await approveBillingRecords({
          invoice_keys: [grain.invoice_key],
          billing_month: grain.billing_month,
          ...(action === "reapprove" ? { reapprove: true } : {}),
        })
        toast({ title: action === "reapprove" ? "Re-approved at the current amount" : "Approved" })
      } else if (action === "unapprove") {
        const res = await unapproveBillingRecords({ invoice_keys: [grain.invoice_key] })
        if (!res.ok) {
          toast(unapproveFailureToast(res))
          return
        }
        toast({ title: "Approval cleared" })
      } else {
        await unmarkBillingRecordsExported({ invoice_keys: [grain.invoice_key] })
        toast({ title: "Un-marked as sent to finance" })
      }
      refetch()
    } catch (e) {
      if (action === "unapprove") {
        toast(unapproveFailureToast(e))
        return
      }
      const titles: Record<"approve" | "reapprove" | "unmark", string> = {
        approve: "Could not approve",
        reapprove: "Could not re-approve",
        unmark: "Could not un-mark",
      }
      toast({
        variant: "destructive",
        title: titles[action],
        description: e instanceof Error ? e.message : "Unknown error",
      })
    } finally {
      setBusy(false)
    }
  }

  const markSent = async () => {
    const key = record.invoice_key?.trim()
    if (!key || busy) return
    setBusy(true)
    try {
      const exported = await markBillingRecordsExported({ invoice_keys: [key] })
      toast({
        title: markSentResultToast({
          marked: exported.records.length,
          skippedNotApproved: exported.skipped?.length ?? 0,
        }),
      })
      refetch()
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Could not mark as sent",
        description: e instanceof Error ? e.message : "Unknown error",
      })
    } finally {
      setBusy(false)
    }
  }

  const primaryVariant = blocked ? "secondary" : "default"
  const unapproveControl =
    state === "approved" && grain ? (
      <UnapproveBillingButton
        busy={busy}
        clientName={record.client_name ?? ""}
        billingMonth={record.billing_month}
        amountDollars={record.total}
        onConfirm={() => run("unapprove")}
      />
    ) : null
  let forwardPrimary: ReactNode = null
  if (primaryKind === "approve" && grain) {
    forwardPrimary = (
      <Button
        type="button"
        size="sm"
        variant={primaryVariant}
        disabled={busy}
        onClick={() => void run("approve")}
      >
        {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
        {invoicingPrimaryLabel("approve")}
      </Button>
    )
  } else if (primaryKind === "mark_sent" && record.invoice_key) {
    forwardPrimary = (
      <MarkSentToFinanceButton
        busy={busy}
        variant={primaryVariant}
        label={invoicingPrimaryLabel("mark_sent")}
        onConfirm={() => markSent()}
      />
    )
  }
  const primary =
    forwardPrimary || unapproveControl ? (
      <div className="flex items-center gap-2">
        {forwardPrimary}
        {unapproveControl}
      </div>
    ) : null

  const menuItems: RowActionMenuItem[] = []
  if (kind === "media") {
    menuItems.push({
      label: "Edit",
      disabled: !mediaActions.editHref,
      disabledReason: mediaActions.editHref ? undefined : "No MBA number on this row",
      onSelect: () => {
        if (!mediaActions.editHref) return
        window.open(mediaActions.editHref, "_blank", "noopener,noreferrer")
      },
    })
    menuItems.push({
      label: mediaActions.isDownloadingAa ? "AA plan…" : "AA plan",
      disabled: !planMp.mbaNumber || mediaActions.isDownloadingAa,
      disabledReason: planMp.mbaNumber ? undefined : "No MBA number on this row",
      onSelect: () => {
        void mediaActions.downloadAa()
      },
    })
    menuItems.push({
      label: mediaActions.isLoadingAlter ? "Alter billing…" : "Alter billing",
      disabled: !mediaActions.canAlter || mediaActions.isLoadingAlter,
      disabledReason: mediaActions.canAlter ? undefined : "No published version to alter",
      onSelect: () => {
        void mediaActions.openAlter()
      },
    })
  }
  menuItems.push({
    label: (record.notes ?? "").trim() ? "Notes" : "Add note",
    disabled: !record.invoice_key,
    disabledReason: record.invoice_key ? undefined : "Invoice is not yet materialised",
    onSelect: () => notesTriggerRef.current?.click(),
  })
  if (drifted && state === "approved") {
    menuItems.push({
      label: "Re-approve",
      disabled: !grain || busy,
      disabledReason: grain ? undefined : "Missing invoice key",
      onSelect: () => {
        void run("reapprove")
      },
    })
  }
  if (state === "sent_to_finance") {
    menuItems.push({
      label: "Un-mark",
      disabled: !grain || busy,
      disabledReason: grain ? undefined : "Missing invoice key",
      onSelect: () => {
        void run("unmark")
      },
    })
  }

  const driftContext =
    drifted && state === "approved" ? "Amount changed since approval" : undefined

  return (
    <div
      data-invoicing-plan-row=""
      data-invoice-key={record.invoice_key ?? ""}
      data-amount-frozen={amountFrozen ? "" : undefined}
      className="space-y-1.5 border-b border-border/50 py-3 last:border-0 last:pb-0 first:pt-0"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">
            {record.campaign_name || planMp.campaignName || "Campaign"}
          </p>
          {mbaMeta ? (
            <p className="num truncate text-[11px] text-muted-foreground">{mbaMeta}</p>
          ) : null}
        </div>
        <p className="num shrink-0 text-sm font-semibold tabular-nums">{formatAUD(record.total)}</p>
      </div>

      {rollups.length > 0 ? (
        <Collapsible open={detailOpen} onOpenChange={setDetailOpen}>
          <CollapsibleTrigger className="flex w-full items-center gap-1.5 rounded-input py-0.5 text-left text-[11px] text-muted-foreground hover:text-foreground">
            <ChevronDown
              className={cn(
                "h-3 w-3 shrink-0 transition-transform",
                detailOpen && "rotate-180"
              )}
              aria-hidden
            />
            <span className="num min-w-0 truncate">{caption}</span>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-1 space-y-1">
            {rollups.map((rollup) => (
              <MediaTypeDetail
                key={rollup.mediaType}
                rollup={rollup}
                editCtx={editCtx}
                invoiceBilled={hasBillingEvidence(record.state)}
                confirmIfAnyBilled={needsInlineAmountConfirm(record)}
                onLineAmountCommitted={onLineAmountCommitted}
              />
            ))}
          </CollapsibleContent>
        </Collapsible>
      ) : (
        <p className="text-[11px] text-muted-foreground">No line items</p>
      )}

      {blocked ? (
        <p
          data-invoicing-blockers=""
          className="text-[11px] text-status-critical-fg"
        >
          {blockerReasons.join(" · ")}
        </p>
      ) : null}

      <RowActionLine
        state={state}
        approvedDrift={false}
        reason={record.state_reason}
        context={driftContext}
        primary={primary}
        menuItems={menuItems}
      />

      <div className="sr-only">
        <ReceivableNotesButton
          ref={notesTriggerRef}
          record={record}
          onSaved={onNotesSaved}
        />
      </div>
      {kind === "media" ? mediaActions.alterDialog : null}
    </div>
  )
}
