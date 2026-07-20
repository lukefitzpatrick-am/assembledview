"use client"

import { ContainerEmptyLinesPlaceholder } from "@/components/media-containers/ContainerEmptyLinesPlaceholder"
import { ExpertCard } from "@/components/media-containers/ExpertCard"
import { ExpertIncompleteRowsSummary } from "@/components/media-containers/ExpertIncompleteRowsSummary"
import { ExpertGrid } from "@/components/media-containers/ExpertGrid"
import { MediaContainerLoadState } from "@/components/media-containers/MediaContainerLoadState"
import MediaContainerTimelineCollapsible from "@/components/media-containers/MediaContainerTimelineCollapsible"
import MediaContainerSummarySection from "@/components/media-containers/MediaContainerSummarySection"
import type { CpcFamilyVariant } from "@/components/media-containers/burst-calculated-fields"
import {
  buildDefaultLineItem,
  type ContainerChannelConfig,
} from "@/lib/mediaplan/containerChannelConfig"
import { writeContainerEntryMode } from "@/lib/mediaplan/containerEntryMode"
import {
  useMediaChannelContainer,
  type MediaChannelContainerHookProps,
} from "@/lib/mediaplan/useMediaChannelContainer"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ComboboxModalProvider } from "@/components/ui/combobox"
import { Form } from "@/components/ui/form"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { buildLineItemId } from "@/lib/mediaplan/lineItemIds"
import { cn } from "@/lib/utils"
import { Copy, Plus, Trash2 } from "lucide-react"
import { formatMoney } from "@/lib/format/money"
import { defaultMediaBurstStartDate, defaultMediaBurstEndDate } from "@/lib/date-picker-anchor"
import { newBurstReactKey } from "@/lib/mediaplan/burstOperations"
import { getMediaTypeThemeHex, rgbaFromHex } from "@/lib/mediaplan/mediaTypeAccents"
import type { FieldValues, UseFormReturn } from "react-hook-form"
import type { ReactNode } from "react"

type MediaChannelContainerRenderCtx = {
  form: UseFormReturn<any>
  feePct: number
  config: ContainerChannelConfig
  watchedLineItems: any[]
  campaignStartDate: Date
  campaignEndDate: Date
}

type MediaChannelContainerComputeOverrideArgs = {
  lineItemIndex: number
  totalMedia: number
  totalCalculatedValue: number
  feePct: number
  form: UseFormReturn<any>
  fieldKey: string
}

type MediaChannelContainerProps = MediaChannelContainerHookProps & {
  config: ContainerChannelConfig
  /**
   * Escape hatch (Family 4): inject UI after the header card / before line items.
   */
  renderExtra?: ReactNode | ((ctx: MediaChannelContainerRenderCtx) => ReactNode)
  /**
   * Escape hatch (Family 4): override ExpertCard total display (e.g. SocialMedia inline compute).
   * Return null to use the default cpcCpvCpm total formula.
   */
  computeOverride?: (
    args: MediaChannelContainerComputeOverrideArgs,
  ) => { totalDisplay: string } | null
}

function buildEmptyLineItemPayload(
  config: ContainerChannelConfig,
  campaignStartDate: Date,
  campaignEndDate: Date,
) {
  return {
    ...buildDefaultLineItem(config.fieldMap),
    bursts: [
      {
        budget: "",
        buyAmount: "",
        startDate: defaultMediaBurstStartDate(campaignStartDate, campaignEndDate),
        endDate: defaultMediaBurstEndDate(campaignStartDate, campaignEndDate),
        calculatedValue: 0,
        fee: 0,
        _reactKey: newBurstReactKey(),
      } as FieldValues,
    ],
    totalMedia: 0,
    totalDeliverables: 0,
    totalFee: 0,
  }
}

function defaultTotalDisplay(totalMedia: number, feePct: number) {
  const pct = feePct || 0
  return formatMoney(
    totalMedia + (totalMedia / (100 - pct)) * pct,
    { locale: "en-AU", currency: "AUD" },
  )
}

/**
 * Shared JSX shell for config-driven media channels (header + entry mode +
 * summary + timeline + ExpertCard list + expert Dialog + exit confirm).
 */
export default function MediaChannelContainer({
  config,
  clientId,
  feePct,
  onTotalMediaChange,
  onBurstsChange,
  onInvestmentChange,
  onLineItemsChange,
  onMediaLineItemsChange,
  campaignStartDate,
  campaignEndDate,
  campaignBudget,
  campaignId,
  mediaTypes,
  initialLineItems = [],
  renderExtra,
  computeOverride,
}: MediaChannelContainerProps) {
  const shell = config.shell
  if (!shell) {
    throw new Error(
      `MediaChannelContainer requires config.shell (mediaType=${config.mediaTypeString})`,
    )
  }

  const {
    form,
    lineItemFields,
    appendLineItem,
    removeLineItem,
    collapsedLineItems,
    toggleLineItemCollapsed,
    expertModalOpen,
    expertExitConfirmOpen,
    expertRows,
    expertApplyPendingPageSave,
    expertSegmentAttention,
    openExpertModal,
    handleExpertApply,
    handleModalOpenChange,
    dismissExpertExitConfirm,
    confirmExpertExitWithoutSaving,
    handleExpertRowsChange,
    handleDuplicateLineItem,
    handleBuyTypeChange,
    handleValueChange,
    handleAppendBurst,
    handleDuplicateBurst,
    handleRemoveBurst,
    getDeliverablesLabel,
    overallTotals,
    publishers,
    isLoading,
    watchedLineItems,
    mbaNumber,
    reorderedRef,
    fieldKey,
  } = useMediaChannelContainer(config, {
    clientId,
    feePct,
    onTotalMediaChange,
    onBurstsChange,
    onInvestmentChange,
    onLineItemsChange,
    onMediaLineItemsChange,
    campaignStartDate,
    campaignEndDate,
    campaignBudget,
    campaignId,
    mediaTypes,
    initialLineItems,
  })

  const mediaHex = getMediaTypeThemeHex(shell.themeKey)
  const expertDialogTitle = shell.expertDialogTitle ?? `${shell.title} Expert Mode`
  const entryModeAriaLabel = shell.entryModeAriaLabel ?? `${shell.title} entry mode`
  const summaryDimensions = Object.keys(config.summaryDimensions)
  const calculatedVariant = config.calculatedVariant as CpcFamilyVariant

  const renderCtx: MediaChannelContainerRenderCtx = {
    form,
    feePct,
    config,
    watchedLineItems,
    campaignStartDate,
    campaignEndDate,
  }
  const extra =
    typeof renderExtra === "function" ? renderExtra(renderCtx) : renderExtra

  const emptyPayload = () =>
    buildEmptyLineItemPayload(config, campaignStartDate, campaignEndDate)

  return (
    <div className="space-y-6">
      <div className="mb-6">
        <Card className="overflow-hidden border-0 shadow-md">
          <div className="h-1 bg-gradient-to-r from-primary via-primary/70 to-primary/40" />
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <CardTitle className="text-base font-semibold tracking-tight">
                    {shell.title}
                  </CardTitle>
                  {expertModalOpen ? (
                    <Badge
                      variant="outline"
                      className="border-2 text-[10px] font-semibold uppercase tracking-wider shadow-sm"
                      style={{
                        borderColor: rgbaFromHex(mediaHex, 0.55),
                        backgroundColor: rgbaFromHex(mediaHex, 0.14),
                        color: mediaHex,
                      }}
                    >
                      Schedule grid open
                    </Badge>
                  ) : null}
                  {expertApplyPendingPageSave ? (
                    <Badge
                      variant="outline"
                      className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
                    >
                      Not saved to plan yet
                    </Badge>
                  ) : null}
                </div>
                <div
                  role="group"
                  aria-label={entryModeAriaLabel}
                  className="inline-flex shrink-0 rounded-lg border border-border bg-muted/50 p-0.5"
                >
                  <button
                    type="button"
                    aria-pressed={!expertModalOpen}
                    className={cn(
                      "rounded-md px-3 py-1.5 text-xs font-medium transition-all",
                      !expertModalOpen
                        ? "text-white shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                    style={
                      !expertModalOpen
                        ? { backgroundColor: mediaHex }
                        : undefined
                    }
                    onClick={() => {
                      if (expertModalOpen) {
                        writeContainerEntryMode("card")
                        handleModalOpenChange(false)
                      }
                    }}
                  >
                    Card entry
                  </button>
                  <button
                    type="button"
                    aria-pressed={expertModalOpen}
                    className={cn(
                      "rounded-md px-3 py-1.5 text-xs font-medium transition-all",
                      expertModalOpen
                        ? "text-white shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                      expertSegmentAttention &&
                        !expertModalOpen &&
                        "animate-pulse",
                    )}
                    style={{
                      ...(expertModalOpen
                        ? { backgroundColor: mediaHex }
                        : {}),
                      ...(expertSegmentAttention && !expertModalOpen
                        ? {
                            boxShadow: `0 0 0 2px ${rgbaFromHex(mediaHex, 0.45)}`,
                          }
                        : {}),
                    }}
                    onClick={() => {
                      if (!expertModalOpen) {
                        writeContainerEntryMode("schedule")
                        openExpertModal()
                      }
                    }}
                  >
                    Schedule grid
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground tabular-nums">
                  {overallTotals.lineItemTotals.length} line item
                  {overallTotals.lineItemTotals.length !== 1 ? "s" : ""}
                </span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-0">
            <MediaContainerSummarySection
              lines={overallTotals.lineItemTotals}
              overallMedia={overallTotals.overallMedia}
              overallFee={overallTotals.overallFee}
              overallCost={overallTotals.overallCost}
              feeLabel={`Fee (${feePct}%)`}
              accentHex={mediaHex}
              dimensions={summaryDimensions}
              deliverablesLabelFor={getDeliverablesLabel}
            />
            <MediaContainerTimelineCollapsible
              mediaTypeKey={shell.timelineMediaTypeKey}
              lineItems={watchedLineItems}
              campaignStartDate={campaignStartDate}
              campaignEndDate={campaignEndDate}
            />
          </CardContent>
        </Card>
      </div>

      {extra}

      <div>
        {isLoading ? (
          <MediaContainerLoadState loading label={shell.loadLabel} />
        ) : (
          <div className="space-y-6">
            {expertModalOpen ? null : (
              <Form {...form}>
                <div className="space-y-6">
                  {lineItemFields.length === 0 ? (
                    <ContainerEmptyLinesPlaceholder
                      onAdd={() => appendLineItem(emptyPayload())}
                    />
                  ) : null}
                  {lineItemFields.map((field, lineItemIndex) => {
                    const lineItemId = buildLineItemId(
                      mbaNumber,
                      config.mediaTypeIdCode,
                      lineItemIndex + 1,
                    )
                    const getTotals = (idx: number) => {
                      const lineItem = form.getValues(`${fieldKey}.${idx}`)
                      let totalMedia = 0
                      let totalCalculatedValue = 0

                      ;(lineItem?.bursts || []).forEach(
                        (burst: {
                          budget?: string
                          calculatedValue?: number
                        }) => {
                          const budget =
                            parseFloat(
                              String(burst.budget ?? "").replace(/[^0-9.]/g, ""),
                            ) || 0
                          totalMedia += budget
                          totalCalculatedValue += burst.calculatedValue || 0
                        },
                      )

                      return { totalMedia, totalCalculatedValue }
                    }

                    const { totalMedia, totalCalculatedValue } =
                      getTotals(lineItemIndex)

                    const override = computeOverride?.({
                      lineItemIndex,
                      totalMedia,
                      totalCalculatedValue,
                      feePct,
                      form,
                      fieldKey,
                    })

                    const includesFees = form.getValues(
                      `${fieldKey}.${lineItemIndex}.budgetIncludesFees`,
                    )
                    const totalDisplay =
                      override?.totalDisplay ??
                      (includesFees
                        ? formatMoney(totalMedia, {
                            locale: "en-AU",
                            currency: "AUD",
                          })
                        : defaultTotalDisplay(totalMedia, feePct))

                    return (
                      <ExpertCard
                        key={field.id}
                        config={config.gridConfig}
                        form={form}
                        itemsKey={fieldKey}
                        lineItemIndex={lineItemIndex}
                        lineItemId={lineItemId}
                        collapsed={collapsedLineItems.has(lineItemIndex)}
                        onToggleCollapsed={() =>
                          toggleLineItemCollapsed(lineItemIndex)
                        }
                        totalDisplay={totalDisplay}
                        publishers={publishers}
                        feePct={feePct || 0}
                        calculatedVariant={calculatedVariant}
                        campaignStartDate={campaignStartDate}
                        campaignEndDate={campaignEndDate}
                        onBurstValueChange={handleValueChange}
                        onAppendBurst={handleAppendBurst}
                        onDuplicateBurst={(li) => handleDuplicateBurst(li)}
                        onRemoveBurst={handleRemoveBurst}
                        onBudgetIncludesFeesChange={(li, checked) => {
                          const bursts =
                            form.getValues(`${fieldKey}.${li}.bursts`) || []
                          bursts.forEach((_: unknown, bi: number) =>
                            handleValueChange(li, bi, !!checked),
                          )
                        }}
                        onComboboxValueChange={(key, li, value) => {
                          if (key === "buyType") handleBuyTypeChange(li, value)
                        }}
                        summaryRow={
                          <div className="border-b px-6 py-2">
                            <div className="grid grid-cols-4 gap-4 text-sm">
                              <div>
                                <span className="font-medium">Platform:</span>{" "}
                                {form.watch(
                                  `${fieldKey}.${lineItemIndex}.platform`,
                                ) || "Not selected"}
                              </div>
                              <div>
                                <span className="font-medium">Buy Type:</span>{" "}
                                {form.watch(
                                  `${fieldKey}.${lineItemIndex}.buyType`,
                                ) || "Not selected"}
                              </div>
                              <div>
                                <span className="font-medium">
                                  Bid strategy:
                                </span>{" "}
                                {form.watch(
                                  `${fieldKey}.${lineItemIndex}.bidStrategy`,
                                ) || "Not selected"}
                              </div>
                              <div>
                                <span className="font-medium">Bursts:</span>{" "}
                                {
                                  (
                                    form.watch(
                                      `${fieldKey}.${lineItemIndex}.bursts`,
                                      [],
                                    ) as unknown[]
                                  ).length
                                }
                              </div>
                            </div>
                          </div>
                        }
                        footer={
                          <>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="text-destructive/70 hover:bg-destructive/10 hover:text-destructive"
                              onClick={() => removeLineItem(lineItemIndex)}
                            >
                              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                              Remove
                            </Button>
                            <div className="flex items-center gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  handleDuplicateLineItem(lineItemIndex)
                                }
                              >
                                <Copy className="mr-1.5 h-3.5 w-3.5" />
                                Duplicate
                              </Button>
                              {lineItemIndex === lineItemFields.length - 1 && (
                                <Button
                                  type="button"
                                  size="sm"
                                  onClick={() =>
                                    appendLineItem(emptyPayload())
                                  }
                                >
                                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                                  Add Line Item
                                </Button>
                              )}
                            </div>
                          </>
                        }
                      />
                    )
                  })}
                </div>
              </Form>
            )}
          </div>
        )}
      </div>

      <Dialog open={expertModalOpen} onOpenChange={handleModalOpenChange}>
        <DialogContent className="max-w-[95vw] w-[95vw] max-h-[95vh] h-[95vh] flex flex-col p-4 gap-0 overflow-hidden">
          <DialogHeader className="flex-shrink-0 pb-2">
            <DialogTitle>{expertDialogTitle}</DialogTitle>
          </DialogHeader>
          <ComboboxModalProvider>
            <div className="flex-1 min-h-0 overflow-auto">
              <ExpertGrid
                config={config.gridConfig}
                campaignStartDate={campaignStartDate}
                campaignEndDate={campaignEndDate}
                feePercent={feePct}
                rows={expertRows}
                onRowsChange={handleExpertRowsChange}
                publishers={publishers}
                onReorder={() => {
                  reorderedRef.current = true
                }}
              />
            </div>
          </ComboboxModalProvider>
          <DialogFooter className="flex-shrink-0 border-t pt-3 mt-2">
            <div className="mr-auto flex flex-col gap-1.5">
              <ExpertIncompleteRowsSummary rows={expertRows} />
              {expertApplyPendingPageSave ? (
                <span className="text-xs text-muted-foreground">
                  Applied earlier — awaiting page Save
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">
                  Apply updates the plan draft only
                </span>
              )}
            </div>
            <Button type="button" onClick={handleExpertApply}>
              Apply to plan (not saved yet)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={expertExitConfirmOpen}
        onOpenChange={(open) => {
          if (!open) dismissExpertExitConfirm()
        }}
      >
        <DialogContent
          className="z-[100] sm:max-w-md"
          onClick={(e) => {
            if (
              (e.target as HTMLElement).closest(
                `[${shell.exitConfirmYesAttr}]`,
              )
            ) {
              return
            }
            dismissExpertExitConfirm()
          }}
        >
          <DialogHeader>
            <DialogTitle>Leave {shell.title} Expert Mode?</DialogTitle>
            <DialogDescription>
              You have unsaved changes in Expert Mode. Apply saves them to the{" "}
              {shell.title} section; leaving now discards those edits.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={dismissExpertExitConfirm}
            >
              No, keep editing
            </Button>
            <Button
              type="button"
              variant="destructive"
              {...{ [shell.exitConfirmYesAttr]: true }}
              onClick={confirmExpertExitWithoutSaving}
            >
              Yes, leave without saving
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
