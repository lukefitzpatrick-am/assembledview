"use client"

import {
  AddSiteDialog,
  mergeCardProps,
  useChannelAdSizes,
  useChannelSiteList,
  useChannelStationAdd,
} from "@/components/media-containers/ChannelSiteList"
import { ContainerEmptyLinesPlaceholder } from "@/components/media-containers/ContainerEmptyLinesPlaceholder"
import { CostQuantityBurstRows } from "@/components/media-containers/CostQuantityBurstRows"
import { ExpertCard } from "@/components/media-containers/ExpertCard"
import { ExpertIncompleteRowsSummary } from "@/components/media-containers/ExpertIncompleteRowsSummary"
import { ExpertGrid } from "@/components/media-containers/ExpertGrid"
import MediaContainerTimelineCollapsible from "@/components/media-containers/MediaContainerTimelineCollapsible"
import MediaContainerSummarySection from "@/components/media-containers/MediaContainerSummarySection"
import {
  buildDefaultLineItem,
  type ContainerChannelConfig,
} from "@/lib/mediaplan/containerChannelConfig"
import type { ExpertGridTitleOption } from "@/lib/mediaplan/expertGridChannelConfig"
import { writeContainerEntryMode } from "@/lib/mediaplan/containerEntryMode"
import {
  consumeIngestOohExpertPreference,
  countOohPanelGranularityLines,
  OOH_PANEL_LINE_EXPERT_THRESHOLD,
  shouldShowOohLargeFormatSummary,
} from "@/lib/mediaplans/ingest/oohLargeFormatExpertGate"
import { useEffect, useMemo, useRef } from "react"
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
import { nextLineFields, resolvedLineItemId } from "@/lib/mediaplan/lineItemIds"
import { cn } from "@/lib/utils"
import { segmentChipClass } from "@/components/layout/navChip"
import { Copy, Plus, Trash2 } from "lucide-react"
import { formatCardTitleFromLine } from "@/lib/mediaplan/cardTitleFromLine"
import { formatBuyTypeForExport } from "@/lib/mediaplan/buyTypeLabels"
import { defaultMediaBurstStartDate, defaultMediaBurstEndDate } from "@/lib/date-picker-anchor"
import { newBurstReactKey } from "@/lib/mediaplan/burstOperations"
import {
  getMediaTypeThemeHex,
  mediaTypeLineItemBadgeStyle,
  mediaTypeOutlineStyle,
  mediaTypeSummaryStripeStyle
} from "@/lib/mediaplan/mediaTypeAccents"
import type { FieldValues } from "react-hook-form"

type MediaChannelContainerProps = MediaChannelContainerHookProps & {
  config: ContainerChannelConfig
}

function buildEmptyLineItemPayload(
  config: ContainerChannelConfig,
  campaignStartDate: Date,
  campaignEndDate: Date,
) {
  const startDate = defaultMediaBurstStartDate(campaignStartDate, campaignEndDate)
  const endDate = defaultMediaBurstEndDate(campaignStartDate, campaignEndDate)
  return {
    ...buildDefaultLineItem(config.fieldMap),
    bursts: [
      (config.costQuantityBursts
        ? { cost: 0, amount: 0, startDate, endDate, _reactKey: newBurstReactKey() }
        : {
            budget: "",
            buyAmount: "",
            startDate,
            endDate,
            calculatedValue: 0,
            fee: 0,
            _reactKey: newBurstReactKey(),
          }) as FieldValues,
    ],
    totalMedia: 0,
    totalDeliverables: 0,
    totalFee: 0,
  }
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
  onRawLineItemsChange,
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
    writeCostQuantityMoney,
    handleAppendBurst,
    handleDuplicateBurst,
    handleRemoveBurst,
    getDeliverablesLabel,
    overallTotals,
    publishers,
    watchedLineItems,
    mbaNumber,
    reorderedRef,
    fieldKey,
    weekStartsOn,
    setWeekStartsOn,
    toast,
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
    onRawLineItemsChange,
  })

  const siteList = useChannelSiteList(config.sites, form, fieldKey, toast)
  const stationAdd = useChannelStationAdd(config.addStation ? shell.loadLabel : undefined, config.stations, form, fieldKey, toast)
  const adSizeList = useChannelAdSizes(config.adSizes, shell.loadLabel, form, fieldKey, toast)
  // The card summary's third cell: the line's site, title or bid strategy.
  const thirdCell = config.cardCells?.[1] ?? (config.sites ? ["Site", "site"] : stationAdd.key === "title" ? ["Title", "title"] : ["Bid strategy", "bidStrategy"])
  const firstCell = config.cardCells?.[0]
  const panelLineCount = useMemo(
    () =>
      config.largeFormatGate
        ? countOohPanelGranularityLines(
            ((watchedLineItems || []) as Array<{ lineItemId?: string; line_item_id?: string; channel?: string; attrs?: Record<string, unknown>; buy_granularity?: string }>).map((li) => ({
              lineItemId: li.lineItemId || li.line_item_id || null,
              channel: li.channel ?? "ooh",
              attrs: { ...(li.attrs ?? {}), ...(li.buy_granularity ? { buy_granularity: li.buy_granularity } : {}) },
            })),
          )
        : 0,
    [config.largeFormatGate, watchedLineItems],
  )
  const largeFormat = shouldShowOohLargeFormatSummary(panelLineCount)
  // After a large-format ingest accept (or when over the card limit), open the
  // grid once on load: never leave 50 to 300 cards mounted.
  const didAutoOpenExpertRef = useRef(false)
  useEffect(() => {
    if (!config.largeFormatGate || didAutoOpenExpertRef.current) return
    if (expertModalOpen) {
      didAutoOpenExpertRef.current = true
      return
    }
    // Read the one-shot ingest flag only once lines exist: hydrate fills the
    // form after the first render, so an earlier read spent it on `[]` (C-382).
    if ((watchedLineItems || []).length === 0) return
    const fromIngest = consumeIngestOohExpertPreference()
    if (!fromIngest && !largeFormat) return
    didAutoOpenExpertRef.current = true
    writeContainerEntryMode("schedule")
    openExpertModal()
  }, [config.largeFormatGate, openExpertModal, expertModalOpen, largeFormat, watchedLineItems])
  const mediaHex = getMediaTypeThemeHex(shell.themeKey)
  const expertDialogTitle = shell.expertDialogTitle ?? `${shell.title} Expert Mode`
  const entryModeAriaLabel = shell.entryModeAriaLabel ?? `${shell.title} entry mode`
  const summaryDimensions = Object.keys(config.summaryDimensions)
  // Production's own type list, from the page (the card's and the grid's
  // `mediaType` combobox). Every other channel's list is in its grid config.
  const mediaTypeOptions = useMemo(
    () =>
      config.mediaTypeOptions
        ? (mediaTypes as Array<string | { value: string; label: string }>).map((item) =>
            typeof item === "string" ? { value: item, label: item } : item,
          )
        : undefined,
    [config.mediaTypeOptions, mediaTypes],
  )

  const emptyPayload = (footer: boolean) => {
    const ids = nextLineFields(form.getValues(fieldKey) || [], mbaNumber, config.mediaTypeIdCode)
    if (config.newLine) return config.newLine(ids, footer)
    return {
      ...buildEmptyLineItemPayload(config, campaignStartDate, campaignEndDate),
      ...(mediaTypeOptions ? { mediaType: mediaTypeOptions[0]?.value ?? "" } : {}),
      ...ids,
    }
  }

  return (
    <div className="space-y-6">
      <div className="mb-6">
        <Card className="overflow-hidden">
          <div className="h-1" style={mediaTypeSummaryStripeStyle(mediaHex)} />
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <CardTitle className="text-base font-semibold tracking-tight">
                    {shell.title}
                  </CardTitle>
                  {expertModalOpen ? (
                    <Badge variant="neutral" className="gap-1.5 border-transparent text-[10px] font-semibold uppercase tracking-wider" style={mediaTypeLineItemBadgeStyle(mediaHex)}><span className="size-2 shrink-0 rounded-full border border-foreground/15" style={{ backgroundColor: mediaHex }} aria-hidden />Schedule grid open</Badge>
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
                    className={segmentChipClass(!expertModalOpen)}
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
                    className={cn(segmentChipClass(expertModalOpen), expertSegmentAttention && !expertModalOpen && "animate-pulse")} style={expertSegmentAttention && !expertModalOpen ? mediaTypeOutlineStyle(mediaHex) : undefined}
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

      <div>
          <div className="space-y-6">
            {expertModalOpen ? null : (
              <Form {...form}>
                <div className="space-y-6">
                  {lineItemFields.length === 0 ? (
                    <ContainerEmptyLinesPlaceholder
                      onAdd={() => appendLineItem(emptyPayload(false))}
                    />
                  ) : null}
                  {largeFormat && lineItemFields.length > 0 ? (
                    <div className="rounded-card border border-border bg-card p-6 shadow-e1">
                      <p className="text-sm font-medium text-foreground">
                        <span className="num">{panelLineCount}</span> large-format panel line
                        {panelLineCount === 1 ? "" : "s"}{" "}
                        <span className="font-normal text-muted-foreground">
                          (over the {OOH_PANEL_LINE_EXPERT_THRESHOLD}-card interim limit)
                        </span>
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Card entry is suppressed for this volume — use the schedule grid (expert view) to edit.
                      </p>
                      <Button
                        type="button"
                        className="mt-4"
                        onClick={() => {
                          writeContainerEntryMode("schedule")
                          openExpertModal()
                        }}
                      >
                        Open expert view
                      </Button>
                    </div>
                  ) : null}
                  {!largeFormat && lineItemFields.map((field, lineItemIndex) => {
                    const lineItemId = resolvedLineItemId(
                      form.getValues(`${fieldKey}.${lineItemIndex}`),
                      mbaNumber,
                      config.mediaTypeIdCode,
                      lineItemIndex + 1,
                    )
                    const totalDisplay = formatCardTitleFromLine(
                      form.getValues(`${fieldKey}.${lineItemIndex}`),
                      feePct || 0,
                    )

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
                        flagUnknownPublisherKeys={config.flagUnknownPublisherKeys}
                        {...(mediaTypeOptions ? { dynamicOptionsByKey: { mediaType: mediaTypeOptions } } : {})}
                        feePct={feePct || 0}
                        calculatedVariant={config.calculatedVariant}
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
                          siteList.onComboboxValueChange(key, li, value)
                        }}
                        onFieldValueChange={(key, li, value) => {
                          if (config.costQuantityBursts && key === "unitRate") {
                            writeCostQuantityMoney(li, value)
                            return
                          }
                          if (!config.copyToBursts?.includes(key)) return
                          const bursts: unknown[] = form.getValues(`${fieldKey}.${li}.bursts`) || []
                          bursts.forEach((_, bi) =>
                            form.setValue(`${fieldKey}.${li}.bursts.${bi}.${key}`, value, { shouldDirty: true }),
                          )
                        }}
                        {...mergeCardProps(
                          siteList.cardProps(lineItemIndex),
                          stationAdd.cardProps(lineItemIndex),
                          adSizeList.cardProps(lineItemIndex),
                        )}
                        burstsSlot={
                          config.costQuantityBursts ? (
                            <CostQuantityBurstRows
                              form={form}
                              itemsKey={fieldKey}
                              lineItemIndex={lineItemIndex}
                              noun={shell.title}
                              campaignStartDate={campaignStartDate}
                              campaignEndDate={campaignEndDate}
                              onValueChange={writeCostQuantityMoney}
                              onAppendBurst={handleAppendBurst}
                              onDuplicateBurst={handleDuplicateBurst}
                              onRemoveBurst={handleRemoveBurst}
                            />
                          ) : undefined
                        }
                        summaryRow={
                          <div className="border-b px-6 py-2">
                            <div className="grid grid-cols-4 gap-4 text-sm">
                              <div>
                                <span className="font-medium">
                                  {firstCell ? `${firstCell[0]}:` : config.addStation ? "Network:" : config.sites ? "Publisher:" : "Platform:"}
                                </span>{" "}
                                {(firstCell
                                  ? form.watch(`${fieldKey}.${lineItemIndex}.${firstCell[1]}`)
                                  : config.sites
                                  ? siteList.publisherOf(lineItemIndex)
                                  : form.watch(
                                      `${fieldKey}.${lineItemIndex}.${config.addStation ? "network" : "platform"}`,
                                    )) || "Not selected"}
                              </div>
                              <div>
                                <span className="font-medium">
                                  {config.cardBuyTypeCell ? `${config.cardBuyTypeCell[0]}:` : "Buy Type:"}
                                </span>{" "}
                                {(config.cardBuyTypeCell
                                  ? form.watch(`${fieldKey}.${lineItemIndex}.${config.cardBuyTypeCell[1]}`)
                                  : formatBuyTypeForExport(
                                      form.watch(
                                        `${fieldKey}.${lineItemIndex}.buyType`,
                                      ) || undefined,
                                    )) || "Not selected"}
                              </div>
                              <div>
                                <span className="font-medium">{thirdCell[0]}:</span>{" "}
                                {form.watch(`${fieldKey}.${lineItemIndex}.${thirdCell[1]}`) || "Not selected"}
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
                                    appendLineItem(emptyPayload(true))
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
      </div>

      <Dialog open={expertModalOpen} onOpenChange={handleModalOpenChange}>
        <DialogContent className="max-w-[95vw] w-[95vw] max-h-[95vh] h-[95vh] flex flex-col p-4 gap-0 overflow-hidden">
          <DialogHeader className="flex-shrink-0 pb-2">
            <DialogTitle>{expertDialogTitle}</DialogTitle>
          </DialogHeader>
          <ComboboxModalProvider>
            <div className="flex-1 min-h-0 overflow-hidden">
              <ExpertGrid
                config={config.gridConfig}
                campaignStartDate={campaignStartDate}
                campaignEndDate={campaignEndDate}
                feePercent={feePct}
                rows={expertRows}
                onRowsChange={handleExpertRowsChange}
                publishers={publishers}
                sites={siteList.list}
                // A title catalogue's rows carry their title (Newspaper).
                {...(stationAdd.key === "title"
                  ? { titles: stationAdd.list as ExpertGridTitleOption[] }
                  : { stations: stationAdd.list })}
                extraComboboxOptions={
                  config.adSizes
                    ? { size: adSizeList.options }
                    : mediaTypeOptions
                      ? { mediaType: mediaTypeOptions }
                      : undefined
                }
                weekStartsOn={weekStartsOn}
                onWeekStartsOnChange={setWeekStartsOn}
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
            <DialogTitle>Leave {expertDialogTitle}?</DialogTitle>
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

      <AddSiteDialog dialog={siteList.dialog} publishers={publishers} />
      <AddSiteDialog dialog={stationAdd.dialog} publishers={publishers} />
      <AddSiteDialog dialog={adSizeList.dialog} publishers={publishers} />
    </div>
  )
}
