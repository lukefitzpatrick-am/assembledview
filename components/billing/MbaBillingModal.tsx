"use client"

import { useEffect, useMemo, useState, type ReactNode } from "react"
import { Check, ChevronDown, Download, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Switch } from "@/components/ui/switch"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"
import type { CampaignFinancials } from "@/lib/finance/campaignFinancials.types"
import type { PanelIndicatorsFromCampaignFinancials } from "@/lib/finance/panelIndicatorsFromCampaignFinancials"
import type { BillingDivergenceResult } from "@/lib/billing/compareBillingDivergence"
import { reconciliationBadgeVisibility } from "@/lib/mediaplan/channelHydrationGate"
import {
  BillingEqualsMbaPill,
  BillingMismatchMbaPill,
  BillingMonthStatusDot,
  BillingScheduleTitlePills,
  EditBillingOverrideDot,
} from "@/components/billing/BillingSchedulePanelIndicators"
import {
  MbaBillableEqualsPill,
  MbaBillableMismatchPill,
  MbaFeeAdjustedPill,
  MbaMediaTypeRowPills,
  MbaPartialScopePill,
} from "@/components/billing/MbaDetailsPanelIndicators"
import { BillingDivergenceBanner } from "@/components/billing/BillingDivergenceBanner"
import {
  LineTimingInlineEditor,
  type LineDateBasisChoice,
} from "@/components/billing/LineTimingInlineEditor"

const money = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/** Collapsed-by-default expand memory for the browser session (survives modal close). */
const sessionExpandedByMediaType: Record<string, boolean> = {}

export type MbaBillingScopeLine = {
  lineItemId: string
  mediaType: string
  mediaLabel: string
  title: string
  subtitle?: string
  approved: boolean
  media: number
  fee: number
  flags: {
    excluded: boolean
    manualBilling: boolean
    manualFee: boolean
    clientPaysForMedia: boolean
    prepaid: boolean
  }
}

/** Shared manual-billing read/write surface for inline Adjust timing (same model as Advanced). */
export type MbaBillingLineTimingApi = {
  monthYears: string[]
  getAmount: (mediaKey: string, lineItemId: string, monthYear: string) => number
  /** Expected media total for the sum gate (auto / booked line media). */
  getExpectedMediaTotal: (mediaKey: string, lineItemId: string) => number
  onCommit: (mediaKey: string, lineItemId: string, monthYear: string, raw: string) => void
  onResetLine: (mediaKey: string, lineItemId: string) => void
  /** Bill full line-media into the earliest campaign/draft month as reason=prepayment. */
  onPrebillLine: (mediaKey: string, lineItemId: string) => void
  /** Stale dateBasis keep/reset choice for a line (inline in timing editor). */
  getDateBasisChoice?: (lineItemId: string) => LineDateBasisChoice | null
  formatter: Intl.NumberFormat
}

export type MbaBillingModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Display-only version ordinal (not override API id). */
  versionLabel: string
  financials: CampaignFinancials
  panelIndicators: PanelIndicatorsFromCampaignFinancials
  /** Per-line scope rows for approve/exclude. */
  scopeLines: MbaBillingScopeLine[]
  onToggleLineApproved: (lineItemId: string, mediaType: string, approved: boolean) => void
  /** Approve/exclude every line in a media-type container (batched). */
  onToggleContainerApproved?: (mediaType: string, approved: boolean) => void
  onResetApprovalsToAllIn?: () => void
  onDownloadExcel?: () => void
  downloadDisabled?: boolean
  /**
   * Opens the parent-owned full-billing reset confirm (AlertDialog).
   * Hidden when omitted — modal does not run reset itself.
   */
  onResetBillingToAuto?: () => void
  /**
   * True when parent has prepared `manualBillingMonths` for timing edits.
   * Enables per-line Adjust timing expanders without opening Advanced.
   */
  timingDraftReady?: boolean
  /** Prepare the shared manual-billing draft (Edit timing). */
  onEnsureTimingDraft?: () => void
  /** Close / discard the timing draft session. */
  onCloseTimingDraft?: () => void
  /** When true, show the Advanced spreadsheet on the billing side. */
  showAdvancedEditor?: boolean
  onToggleAdvancedEditor?: () => void
  /**
   * @deprecated Prefer timingDraftReady + showAdvancedEditor.
   * Treated as showAdvancedEditor when the new props are omitted.
   */
  showManualEditor?: boolean
  /**
   * @deprecated Prefer onEnsureTimingDraft / onToggleAdvancedEditor.
   */
  onToggleManualEditor?: () => void
  /** Per-line inline timing API (same callbacks as Advanced spreadsheet). */
  lineTiming?: MbaBillingLineTimingApi
  /** Parent-owned Advanced editor (ManualBillingSpreadsheetProvider). */
  manualBillingEditor?: ReactNode
  /**
   * Manual vs auto divergence — shown as an inline attention banner (not a stacked Dialog).
   * Hidden when null / not divergent / already acknowledged.
   */
  billingDivergence?: BillingDivergenceResult | null
  showDivergenceBanner?: boolean
  onAcknowledgeDivergence?: () => void
  footer?: ReactNode
  /**
   * False while channel containers are still hydrating. Suppresses green/red
   * billable=MBA badges so a partial channel set cannot self-reconcile as green.
   */
  reconciliationReady?: boolean
}

type ScopeContainerGroup = {
  mediaType: string
  mediaLabel: string
  lines: MbaBillingScopeLine[]
  approvedCount: number
  totalCount: number
  mediaSum: number
  feeSum: number
  allApproved: boolean
  noneApproved: boolean
  partial: boolean
}

function groupScopeLinesByContainer(scopeLines: MbaBillingScopeLine[]): ScopeContainerGroup[] {
  const order: string[] = []
  const byType = new Map<string, MbaBillingScopeLine[]>()
  for (const line of scopeLines) {
    if (!byType.has(line.mediaType)) {
      byType.set(line.mediaType, [])
      order.push(line.mediaType)
    }
    byType.get(line.mediaType)!.push(line)
  }
  return order.map((mediaType) => {
    const lines = byType.get(mediaType) ?? []
    const approvedCount = lines.filter((l) => l.approved).length
    const totalCount = lines.length
    const mediaSum = lines.reduce((acc, l) => acc + l.media, 0)
    const feeSum = lines.reduce((acc, l) => acc + l.fee, 0)
    const allApproved = totalCount > 0 && approvedCount === totalCount
    const noneApproved = approvedCount === 0
    return {
      mediaType,
      mediaLabel: lines[0]?.mediaLabel ?? mediaType,
      lines,
      approvedCount,
      totalCount,
      mediaSum,
      feeSum,
      allApproved,
      noneApproved,
      partial: !allApproved && !noneApproved,
    }
  })
}

function HeaderStrip({
  versionLabel,
  financials,
  panelIndicators,
  reconciliationReady = true,
}: {
  versionLabel: string
  financials: CampaignFinancials
  panelIndicators: PanelIndicatorsFromCampaignFinancials
  reconciliationReady?: boolean
}) {
  const lines = financials.perLine
  const total = lines.length
  const approved = lines.filter((l) => !l.flags.excluded).length
  const manual = lines.filter((l) => l.flags.manualBilling && !l.flags.excluded).length
  const clientPays = lines.filter((l) => l.flags.clientPaysForMedia && !l.flags.excluded).length
  const billingNeDelivery = financials.deliveryVsBillingDelta.filter(
    (d) => Math.abs(d.media) > 0.005 || d.reasons.some((r) => r !== "rounding")
  ).length
  // CORE validation only (subtracts client-pays media). Never compare schedule grand total to MBA nett.
  const billableEquals = financials.validation.billableEqualsMba
  const rec = reconciliationBadgeVisibility(reconciliationReady, billableEquals)
  const partialLabel = panelIndicators.mbaDetails.partialLabel

  const quiet =
    !partialLabel && manual === 0 && clientPays === 0 && billingNeDelivery === 0

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface-panel px-6 py-3">
      <Badge variant="secondary" size="sm" className="rounded-pill font-medium">
        MBA {versionLabel}
      </Badge>
      {/* Core signal — same Partial MBA · X of Y as MBA Details panel */}
      <MbaPartialScopePill label={partialLabel} />
      {!partialLabel && total > 0 ? (
        <Badge variant="good" size="sm" className="rounded-pill font-medium">
          <span className="num">{`${approved} of ${total} approved`}</span>
        </Badge>
      ) : null}
      {manual > 0 ? (
        <Badge variant="attention" size="sm" className="rounded-pill font-medium">
          <span className="num">{manual}</span> manual
        </Badge>
      ) : null}
      {clientPays > 0 ? (
        <Badge variant="secondary" size="sm" className="rounded-pill font-medium text-muted-foreground">
          client-pays: <span className="num">{clientPays}</span>
        </Badge>
      ) : null}
      {billingNeDelivery > 0 ? (
        <Badge variant="attention" size="sm" className="rounded-pill font-medium">
          billing≠delivery: <span className="num">{billingNeDelivery}</span>
        </Badge>
      ) : null}
      {!reconciliationReady ? (
        <Badge
          variant="secondary"
          size="sm"
          className="rounded-pill font-medium text-muted-foreground"
          title="Waiting for all media channels to finish loading"
        >
          Loading channels…
        </Badge>
      ) : rec.showEquals ? (
        <Badge variant="good" size="sm" className="rounded-pill font-medium" title="Billable totals match MBA">
          <Check className="mr-1 h-3.5 w-3.5" aria-hidden />
          billable = MBA
        </Badge>
      ) : rec.showMismatch && total > 0 ? (
        <Badge
          variant="blocking"
          size="sm"
          className="rounded-pill font-medium"
          title="Billable totals do not match MBA"
        >
          billing ≠ MBA
        </Badge>
      ) : null}
      {quiet && rec.showEquals && total > 0 ? (
        <span className="text-xs text-muted-foreground">Clean plan</span>
      ) : null}
    </div>
  )
}

function inMbaVersionPillLabel(versionLabel: string): string {
  const v = versionLabel.trim()
  if (!v) return "In MBA"
  return /^v/i.test(v) ? `In MBA ${v}` : `In MBA v${v}`
}

function ScopeLineRow({
  line,
  versionLabel,
  onToggleLineApproved,
  timingDraftReady,
  onEnsureTimingDraft,
  lineTiming,
}: {
  line: MbaBillingScopeLine
  versionLabel: string
  onToggleLineApproved: MbaBillingModalProps["onToggleLineApproved"]
  timingDraftReady?: boolean
  onEnsureTimingDraft?: () => void
  lineTiming?: MbaBillingLineTimingApi
}) {
  const muted = line.flags.excluded
  const dateBasisChoice = lineTiming?.getDateBasisChoice?.(line.lineItemId) ?? null
  const [timingOpen, setTimingOpen] = useState(() => Boolean(dateBasisChoice))
  const canAdjustTiming = Boolean(lineTiming) && !muted

  // Auto-expand Adjust timing when a date-basis choice appears for this line.
  useEffect(() => {
    if (dateBasisChoice && timingDraftReady) setTimingOpen(true)
  }, [dateBasisChoice, timingDraftReady])

  function handleToggleTiming() {
    if (!canAdjustTiming) return
    if (!timingDraftReady) {
      onEnsureTimingDraft?.()
      setTimingOpen(true)
      return
    }
    setTimingOpen((v) => !v)
  }

  return (
    <div
      className={cn(
        "rounded-input border border-transparent px-2 py-2 pl-8 transition-colors",
        muted ? "bg-muted/30 text-muted-foreground opacity-70" : "hover:bg-table-row-hover"
      )}
    >
      <div className="flex items-start gap-3">
        <Switch
          checked={line.approved}
          onCheckedChange={(checked) =>
            onToggleLineApproved(line.lineItemId, line.mediaType, checked)
          }
          aria-label={
            line.approved
              ? `Exclude ${line.title} from MBA`
              : `Approve ${line.title} for MBA`
          }
          className="mt-0.5 shrink-0"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={cn(
                "truncate text-sm font-medium",
                muted ? "text-muted-foreground" : "text-foreground"
              )}
            >
              {line.title}
            </span>
            {muted ? (
              <Badge
                variant="secondary"
                size="sm"
                className="rounded-pill font-normal text-muted-foreground"
              >
                Not in MBA — excluded
              </Badge>
            ) : line.approved ? (
              <Badge variant="good" size="sm" className="rounded-pill font-normal">
                {inMbaVersionPillLabel(versionLabel)}
              </Badge>
            ) : (
              <Badge
                variant="secondary"
                size="sm"
                className="rounded-pill font-normal text-muted-foreground"
              >
                Not in MBA
              </Badge>
            )}
            {line.flags.prepaid && !muted ? (
              <Badge variant="attention" size="sm" className="rounded-pill font-normal">
                Prepaid
              </Badge>
            ) : null}
            {line.flags.manualBilling && !muted && !line.flags.prepaid ? (
              <Badge variant="attention" size="sm" className="rounded-pill font-normal">
                Manual
              </Badge>
            ) : null}
            {line.flags.manualFee && !muted ? (
              <Badge variant="attention" size="sm" className="rounded-pill font-normal">
                Fee adjusted
              </Badge>
            ) : null}
            {line.flags.clientPaysForMedia && !muted ? (
              <Badge variant="secondary" size="sm" className="rounded-pill font-normal">
                Client pays
              </Badge>
            ) : null}
            {dateBasisChoice && !muted ? (
              <Badge variant="attention" size="sm" className="rounded-pill font-normal">
                Dates changed
              </Badge>
            ) : null}
          </div>
          {line.subtitle ? (
            <p className="truncate text-xs text-muted-foreground">{line.subtitle}</p>
          ) : null}
          {canAdjustTiming ? (
            <div className="mt-1 flex flex-wrap items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={handleToggleTiming}
                aria-expanded={timingOpen && timingDraftReady}
              >
                <ChevronDown
                  className={cn(
                    "mr-1 h-3.5 w-3.5 transition-transform",
                    !(timingOpen && timingDraftReady) && "-rotate-90"
                  )}
                  aria-hidden
                />
                Adjust timing
              </Button>
              {!line.flags.prepaid ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => lineTiming?.onPrebillLine(line.mediaType, line.lineItemId)}
                >
                  ⚡ Prebill
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="shrink-0 text-right">
          <div className="num text-sm font-medium">{money.format(line.media)}</div>
          {line.fee > 0.005 ? (
            <div className="num text-xs text-muted-foreground">fee {money.format(line.fee)}</div>
          ) : null}
        </div>
      </div>
      {canAdjustTiming && timingOpen && timingDraftReady && lineTiming ? (
        <LineTimingInlineEditor
          mediaKey={line.mediaType}
          lineItemId={line.lineItemId}
          expectedMediaTotal={lineTiming.getExpectedMediaTotal(line.mediaType, line.lineItemId)}
          monthYears={lineTiming.monthYears}
          getAmount={lineTiming.getAmount}
          onCommit={lineTiming.onCommit}
          onResetToAuto={lineTiming.onResetLine}
          onPrebill={lineTiming.onPrebillLine}
          isPrepaid={line.flags.prepaid}
          dateBasisChoice={dateBasisChoice}
          formatter={lineTiming.formatter}
        />
      ) : null}
    </div>
  )
}

function ContainerStatusCheck({
  allApproved,
  partial,
}: {
  allApproved: boolean
  partial: boolean
}) {
  if (allApproved) {
    return (
      <span
        className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-pill bg-status-good-bg text-status-good-fg"
        title="All lines in MBA"
        aria-label="All lines approved"
      >
        <Check className="h-3 w-3" aria-hidden />
      </span>
    )
  }
  if (partial) {
    return (
      <span
        className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-pill bg-status-attention-bg"
        title="Partial approval"
        aria-label="Partially approved"
      >
        <span className="h-2 w-2 rounded-pill bg-status-attention" aria-hidden />
      </span>
    )
  }
  return (
    <span
      className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-pill border border-border"
      title="None in MBA"
      aria-label="No lines approved"
    />
  )
}

/**
 * Single MBA & Billing split view. Displays core financials + panel indicators only —
 * no local totals math. Parent owns approval + C2/C3 callbacks.
 */
export function MbaBillingModal({
  open,
  onOpenChange,
  versionLabel,
  financials,
  panelIndicators,
  scopeLines,
  onToggleLineApproved,
  onToggleContainerApproved,
  onResetApprovalsToAllIn,
  onDownloadExcel,
  downloadDisabled,
  onResetBillingToAuto,
  timingDraftReady,
  onEnsureTimingDraft,
  onCloseTimingDraft,
  showAdvancedEditor,
  onToggleAdvancedEditor,
  showManualEditor,
  onToggleManualEditor,
  lineTiming,
  manualBillingEditor,
  billingDivergence = null,
  showDivergenceBanner = false,
  onAcknowledgeDivergence,
  footer,
  reconciliationReady = true,
}: MbaBillingModalProps) {
  const advancedOpen = showAdvancedEditor ?? showManualEditor ?? false
  const draftReady = timingDraftReady ?? advancedOpen
  const ensureDraft =
    onEnsureTimingDraft ??
    (onToggleManualEditor && !advancedOpen ? onToggleManualEditor : undefined)
  const toggleAdvanced =
    onToggleAdvancedEditor ??
    (onToggleManualEditor && draftReady ? onToggleManualEditor : undefined)
  const closeDraft = onCloseTimingDraft
  const t = financials.mbaScopeTotals
  const schedule = financials.billingSchedule
  const byMedia = panelIndicators.mbaDetails.byMediaType
  const mbaRec = reconciliationBadgeVisibility(
    reconciliationReady,
    panelIndicators.mbaDetails.billableEqualsMba
  )
  const billingRec = reconciliationBadgeVisibility(
    reconciliationReady,
    panelIndicators.billingSchedule.billableEqualsMba
  )

  const [expandedByMediaType, setExpandedByMediaType] = useState<Record<string, boolean>>(
    () => ({ ...sessionExpandedByMediaType })
  )

  const containers = useMemo(() => groupScopeLinesByContainer(scopeLines), [scopeLines])

  const grandMedia = schedule.reduce(
    (acc, m) => acc + (parseFloat(String(m.mediaTotal).replace(/[^0-9.-]/g, "")) || 0),
    0
  )
  const grandFee = schedule.reduce(
    (acc, m) => acc + (parseFloat(String(m.feeTotal).replace(/[^0-9.-]/g, "")) || 0),
    0
  )
  const grandAd = schedule.reduce(
    (acc, m) =>
      acc + (parseFloat(String(m.adservingTechFees).replace(/[^0-9.-]/g, "")) || 0),
    0
  )
  const grandProd = schedule.reduce(
    (acc, m) =>
      acc + (parseFloat(String(m.production || "0").replace(/[^0-9.-]/g, "")) || 0),
    0
  )
  const grandTotal = schedule.reduce(
    (acc, m) => acc + (parseFloat(String(m.totalAmount).replace(/[^0-9.-]/g, "")) || 0),
    0
  )

  function setExpanded(next: Record<string, boolean>) {
    setExpandedByMediaType(next)
    for (const [k, v] of Object.entries(next)) {
      sessionExpandedByMediaType[k] = v
    }
  }

  function toggleContainerExpanded(mediaType: string) {
    setExpandedByMediaType((prev) => {
      const next = { ...prev, [mediaType]: !prev[mediaType] }
      sessionExpandedByMediaType[mediaType] = next[mediaType]
      return next
    })
  }

  function expandAllContainers() {
    setExpanded(Object.fromEntries(containers.map((c) => [c.mediaType, true])))
  }

  function collapseAllContainers() {
    setExpanded(Object.fromEntries(containers.map((c) => [c.mediaType, false])))
  }

  function handleContainerApproveToggle(group: ScopeContainerGroup) {
    const nextApproved = !group.allApproved
    if (onToggleContainerApproved) {
      onToggleContainerApproved(group.mediaType, nextApproved)
      return
    }
    for (const line of group.lines) {
      if (line.approved !== nextApproved) {
        onToggleLineApproved(line.lineItemId, line.mediaType, nextApproved)
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[calc(100vh-1.5rem)] w-[calc(100vw-1.5rem)] max-w-none flex-col gap-0 overflow-hidden p-0">
        {/* Sticky header: brand bar + title + status strip */}
        <div className="shrink-0">
          <div className="h-1 bg-primary" />
          <div className="border-b border-border px-6 py-4 pr-12">
            <DialogHeader>
              <DialogTitle>MBA &amp; billing</DialogTitle>
              <DialogDescription>
                Approve lines for MBA scope and review the billing schedule. Totals come from core
                financials.
              </DialogDescription>
            </DialogHeader>
          </div>
          <HeaderStrip
            versionLabel={versionLabel}
            financials={financials}
            panelIndicators={panelIndicators}
            reconciliationReady={reconciliationReady}
          />
          {showDivergenceBanner && billingDivergence?.isDivergent ? (
            <div className="border-b border-border px-6 py-3">
              <BillingDivergenceBanner
                divergence={billingDivergence}
                onAcknowledge={onAcknowledgeDivergence}
              />
            </div>
          ) : null}
        </div>

        {/* Scrollable two-column body between sticky header + footer */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="grid min-h-full grid-cols-1 gap-0 xl:grid-cols-2 xl:divide-x xl:divide-border">
            {/* Left — MBA scope collapsible tree */}
            <section className="flex min-w-0 flex-col border-b border-border xl:border-b-0">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 bg-muted/20 px-5 py-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  MBA scope
                </h3>
                <div className="flex flex-wrap items-center gap-1">
                  {containers.length > 0 ? (
                    <>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={expandAllContainers}
                      >
                        Expand all
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={collapseAllContainers}
                      >
                        Collapse all
                      </Button>
                    </>
                  ) : null}
                  {onResetApprovalsToAllIn ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={onResetApprovalsToAllIn}
                    >
                      All in
                    </Button>
                  ) : null}
                </div>
              </div>
              <div className="space-y-2 px-3 py-3">
                {containers.length === 0 ? (
                  <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                    No line items yet. Enable media and add flights first.
                  </p>
                ) : (
                  containers.map((group) => {
                    // Collapsed by default — only true when explicitly expanded.
                    const expanded = expandedByMediaType[group.mediaType] === true
                    const rowInd = byMedia[group.mediaType]
                    const checkboxState: boolean | "indeterminate" = group.allApproved
                      ? true
                      : group.partial
                        ? "indeterminate"
                        : false
                    return (
                      <div
                        key={group.mediaType}
                        className="rounded-card border border-border bg-card shadow-e0"
                      >
                        <div
                          className={cn(
                            "flex items-center gap-2 px-2 py-2",
                            group.noneApproved && "opacity-70"
                          )}
                        >
                          <button
                            type="button"
                            className="interactive-tint flex min-w-0 flex-1 items-center gap-2 rounded-input px-1 py-1 text-left"
                            onClick={() => toggleContainerExpanded(group.mediaType)}
                            aria-expanded={expanded}
                          >
                            <ChevronDown
                              className={cn(
                                "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                                !expanded && "-rotate-90"
                              )}
                              aria-hidden
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="truncate text-sm font-semibold text-foreground">
                                  <span className="num">
                                    {`${group.mediaLabel} · ${group.approvedCount} of ${group.totalCount}`}
                                  </span>
                                </span>
                                <ContainerStatusCheck
                                  allApproved={group.allApproved}
                                  partial={group.partial}
                                />
                                <MbaMediaTypeRowPills row={rowInd} />
                              </div>
                            </div>
                            <div className="shrink-0 text-right">
                              <div className="num text-sm font-medium">
                                {money.format(group.mediaSum)}
                              </div>
                              <div className="num text-xs text-muted-foreground">
                                fee {money.format(group.feeSum)}
                              </div>
                            </div>
                          </button>
                          <Checkbox
                            checked={checkboxState}
                            onCheckedChange={() => handleContainerApproveToggle(group)}
                            aria-label={
                              group.allApproved
                                ? `Exclude all ${group.mediaLabel} lines from MBA`
                                : `Approve all ${group.mediaLabel} lines for MBA`
                            }
                            className="shrink-0"
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>
                        {expanded ? (
                          <div className="space-y-0.5 border-t border-border px-1 py-1">
                            {group.lines.map((line) => (
                              <ScopeLineRow
                                key={`${line.mediaType}:${line.lineItemId}`}
                                line={line}
                                versionLabel={versionLabel}
                                onToggleLineApproved={onToggleLineApproved}
                                timingDraftReady={draftReady}
                                onEnsureTimingDraft={ensureDraft}
                                lineTiming={lineTiming}
                              />
                            ))}
                          </div>
                        ) : null}
                      </div>
                    )
                  })
                )}
              </div>
              {/* Core MBA scope totals — not ad-hoc resums of the tree */}
              <div className="mt-auto space-y-2 border-t border-border bg-muted/10 px-5 py-4">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Gross Media</span>
                  <span className="num font-medium">{money.format(t.grossMedia)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="flex items-center text-muted-foreground">
                    Assembled Fee
                    <MbaFeeAdjustedPill show={panelIndicators.mbaDetails.mbaFeeAdjusted} />
                  </span>
                  <span className="num font-medium">{money.format(t.fee)}</span>
                </div>
                {(t.adServing > 0.005 || t.production > 0.005) && (
                  <>
                    {t.adServing > 0.005 ? (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Ad Serving &amp; Tech</span>
                        <span className="num font-medium">{money.format(t.adServing)}</span>
                      </div>
                    ) : null}
                    {t.production > 0.005 ? (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Production</span>
                        <span className="num font-medium">{money.format(t.production)}</span>
                      </div>
                    ) : null}
                  </>
                )}
                <div className="flex justify-between border-t border-border pt-2 text-sm font-semibold">
                  <span className="flex items-center">
                    Total investment (ex GST)
                    <MbaBillableEqualsPill show={mbaRec.showEquals} />
                    <MbaBillableMismatchPill show={mbaRec.showMismatch} />
                  </span>
                  <span className="num text-foreground">{money.format(t.nettExGst)}</span>
                </div>
              </div>
            </section>

            {/* Right — Billing schedule */}
            <section className="flex min-w-0 flex-col">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 bg-muted/20 px-5 py-3">
                <div className="min-w-0">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Billing schedule
                  </h3>
                  <BillingScheduleTitlePills pills={panelIndicators.billingSchedule.titlePills} />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {onResetBillingToAuto ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={onResetBillingToAuto}
                    >
                      Reset billing to auto
                    </Button>
                  ) : null}
                  {onDownloadExcel ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={downloadDisabled}
                      onClick={onDownloadExcel}
                    >
                      <Download className="mr-1.5 h-3.5 w-3.5" />
                      Excel
                    </Button>
                  ) : null}
                  {ensureDraft || toggleAdvanced || closeDraft ? (
                    <>
                      {!draftReady && ensureDraft ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="action"
                          className="relative"
                          onClick={ensureDraft}
                        >
                          Edit timing
                          <EditBillingOverrideDot
                            show={panelIndicators.billingSchedule.editBillingHasOverride}
                          />
                        </Button>
                      ) : null}
                      {draftReady && toggleAdvanced ? (
                        <Button
                          type="button"
                          size="sm"
                          variant={advancedOpen ? "secondary" : "outline"}
                          className="relative"
                          onClick={toggleAdvanced}
                        >
                          {advancedOpen ? "Hide advanced" : "Advanced editor"}
                          <EditBillingOverrideDot
                            show={panelIndicators.billingSchedule.editBillingHasOverride}
                          />
                        </Button>
                      ) : null}
                      {draftReady && closeDraft ? (
                        <Button type="button" size="sm" variant="ghost" onClick={closeDraft}>
                          Done
                        </Button>
                      ) : null}
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Manual billing available after save.
                    </p>
                  )}
                </div>
              </div>
              <div className="min-w-0 overflow-x-auto px-3 py-3">
                <Table className="min-w-[32rem]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Month</TableHead>
                      <TableHead className="text-right">Media</TableHead>
                      <TableHead className="text-right">Fees</TableHead>
                      <TableHead className="text-right">Ad Serving</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {schedule.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground">
                          No billing schedule yet.
                        </TableCell>
                      </TableRow>
                    ) : (
                      <>
                        {schedule.map((m) => (
                          <TableRow key={m.monthYear}>
                            <TableCell>
                              <span className="inline-flex items-center">
                                {m.monthYear}
                                <BillingMonthStatusDot
                                  indicator={panelIndicators.billingSchedule.byMonth[m.monthYear]}
                                />
                              </span>
                            </TableCell>
                            <TableCell className="num text-right">{m.mediaTotal}</TableCell>
                            <TableCell className="num text-right">{m.feeTotal}</TableCell>
                            <TableCell className="num text-right">{m.adservingTechFees}</TableCell>
                            <TableCell className="num text-right font-semibold">
                              {m.totalAmount}
                            </TableCell>
                          </TableRow>
                        ))}
                        <TableRow className="font-bold">
                          <TableCell>
                            <span className="inline-flex items-center">
                              Grand Total
                              {/* Same core flag as header — not grandTotal vs MBA scope nett. */}
                              <BillingEqualsMbaPill show={billingRec.showEquals} />
                              <BillingMismatchMbaPill show={billingRec.showMismatch} />
                            </span>
                          </TableCell>
                          <TableCell className="num text-right">{money.format(grandMedia)}</TableCell>
                          <TableCell className="num text-right">{money.format(grandFee)}</TableCell>
                          <TableCell className="num text-right">{money.format(grandAd)}</TableCell>
                          <TableCell className="num text-right">{money.format(grandTotal)}</TableCell>
                        </TableRow>
                      </>
                    )}
                  </TableBody>
                </Table>
                {schedule.length > 0 && grandProd > 0.005 ? (
                  <p className="mt-2 px-2 text-xs text-muted-foreground">
                    Production in schedule: <span className="num">{money.format(grandProd)}</span>
                  </p>
                ) : null}
                {financials.reconciliation &&
                financials.reconciliation.clientPaysMedia > 0.005 ? (
                  <p className="mt-2 flex flex-wrap items-center gap-x-1 px-2 text-xs text-muted-foreground">
                    <span>
                      Billing total{" "}
                      <span className="num">
                        {money.format(financials.reconciliation.billableMbaExGst)}
                      </span>
                      {" + "}
                      client-pays media{" "}
                      <span className="num">
                        {money.format(financials.reconciliation.clientPaysMedia)}
                      </span>
                      {" = "}
                      total investment{" "}
                      <span className="num">{money.format(t.nettExGst)}</span>
                    </span>
                    <BillingEqualsMbaPill
                      show={financials.validation.billableEqualsMba}
                      title="Billing reconciles to MBA total"
                    />
                  </p>
                ) : null}
              </div>

              {advancedOpen && manualBillingEditor ? (
                <div className="border-t border-border px-3 py-4">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Advanced editor
                  </p>
                  {manualBillingEditor}
                </div>
              ) : null}
            </section>
          </div>
        </div>

        {/* Sticky footer */}
        {footer ? (
          <div className="shrink-0 border-t border-border bg-background px-6 py-3">{footer}</div>
        ) : (
          <div className="flex shrink-0 justify-end border-t border-border bg-background px-6 py-3">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              <X className="mr-1.5 h-3.5 w-3.5" />
              Close
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
