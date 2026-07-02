"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useForm, useFieldArray, UseFormReturn, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import {
  productionFormSchema,
  type ProductionBurstValues,
  type ProductionFormValues,
} from "@/lib/mediaplan/schemas"
import { format } from "date-fns"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { MoneyInput } from "@/components/ui/MoneyInput"
import { NumericInput } from "@/components/ui/NumericInput"
import { Textarea } from "@/components/ui/textarea"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useToast } from "@/components/ui/use-toast"
import { Check, ChevronDown, ChevronsUpDown, Copy, Plus, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatCurrencyFull } from "@/lib/format/currency"
import { formatAUD, formatMoney } from "@/lib/format/money"
import type { BillingBurst } from "@/lib/billing/types"
import {
  aggregateInvestmentDisplayRows,
  type InvestmentBurstInput,
} from "@/lib/billing/prorateInvestmentDisplay"
import { formatBurstLabel } from "@/lib/bursts"
import type { LineItem } from "@/lib/generateMediaPlan"
import { useMediaPlanContext } from "@/contexts/MediaPlanContext"
import { useStableHydration } from "@/hooks/useStableHydration"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ComboboxModalProvider } from "@/components/ui/combobox"
import { SingleDatePicker } from "@/components/ui/single-date-picker"
import {
  defaultMediaBurstStartDate,
  defaultMediaBurstEndDate,
} from "@/lib/date-picker-anchor"
import {
  appendBurst,
  duplicateBurst,
  removeBurst,
  newBurstReactKey,
  stampBurstReactKeys,
  productionBurstDefaults,
} from "@/lib/mediaplan/burstOperations"
import MediaContainerTimelineCollapsible from "@/components/media-containers/MediaContainerTimelineCollapsible"
import {
  BurstDateRangeColumn,
  BurstFieldGrid,
  BurstFieldLabel,
  BurstLabel,
  BurstReadonlyMetric,
  BurstRowActions,
  BurstRowCard,
  BurstRowInner,
  BurstSection,
} from "@/components/media-containers/BurstRowLayout"
import { MP_BURST_GRID_5 } from "@/lib/mediaplan/burstSectionLayout"
import {
  getMediaTypeThemeHex,
  mediaTypeAccentTextStyle,
  mediaTypeLineItemBadgeStyle,
  mediaTypeSummaryStripeStyle,
  rgbaFromHex,
} from "@/lib/mediaplan/mediaTypeAccents"
import { buildLineItemId, MEDIA_TYPE_ID_CODES } from "@/lib/mediaplan/lineItemIds"
import {
  assignStableLineItemNumbers,
  reassignLineItemNumbers,
} from "@/lib/mediaplan/lineItemOrder"
import { formatProductionBurstForPersist } from "@/lib/mediaplan/resolveProductionBurstBudget"
import {
  ProductionExpertGrid,
  createEmptyProductionExpertRow,
} from "@/components/media-containers/ProductionExpertGrid"
import type { ProductionExpertScheduleRow } from "@/lib/mediaplan/expertModeWeeklySchedule"
import {
  mapProductionExpertRowsToStandardLineItems,
  mapStandardProductionLineItemsToExpertRows,
  type StandardProductionFormLineItem,
} from "@/lib/mediaplan/expertChannelMappings"
import {
  mergeProductionStandardFromExpertWithPrevious,
  serializeProductionExpertRowsBaseline,
} from "@/lib/mediaplan/expertModeSwitch"
import { buildWeeklyGanttColumnsFromCampaign } from "@/lib/utils/weeklyGanttColumns"

const MEDIA_ACCENT_HEX = getMediaTypeThemeHex("production")

// Normalize to a date-only value (local midnight) to avoid TZ off-by-one.
const toDateOnly = (d?: Date | string | null): Date | null => {
  if (!d) return null
  const dateObj = d instanceof Date ? d : new Date(d)
  if (isNaN(dateObj.getTime())) return null
  return new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate())
}

const formatDateString = (d?: Date | string): string => {
  const dateObj = toDateOnly(d)
  if (!dateObj) return ""
  const year = dateObj.getFullYear()
  const month = (dateObj.getMonth() + 1).toString().padStart(2, "0")
  const day = dateObj.getDate().toString().padStart(2, "0")
  return `${year}-${month}-${day}`
}

type MediaTypeOption = { value: string; label: string }

interface ProductionContainerProps {
  clientId: string
  onTotalMediaChange: (totalMedia: number, totalFee: number) => void
  onBurstsChange: (bursts: BillingBurst[]) => void
  onInvestmentChange: (investmentByMonth: any) => void
  onLineItemsChange: (items: LineItem[]) => void
  onMediaLineItemsChange: (items: any[]) => void
  campaignStartDate: Date
  campaignEndDate: Date
  campaignBudget: number
  campaignId: string
  mediaTypes: Array<string | MediaTypeOption>
  initialLineItems?: any[]
}

const buildMediaTypeOptions = (mediaTypes: Array<string | MediaTypeOption>): MediaTypeOption[] => {
  return mediaTypes.map((item) =>
    typeof item === "string" ? { value: item, label: item } : item
  )
}

const buildBillingBursts = (lineItems: ProductionFormValues["lineItems"]): BillingBurst[] => {
  return lineItems.flatMap((lineItem) =>
    lineItem.bursts.map((burst) => {
      const startDate = toDateOnly(burst.startDate) || new Date()
      const endDate = toDateOnly(burst.endDate) || startDate
      const mediaAmount = (burst.cost || 0) * (burst.amount || 0)
      return {
        startDate,
        endDate,
        mediaAmount,
        feeAmount: 0,
        totalAmount: mediaAmount,
        mediaType: "production",
        feePercentage: 0,
        clientPaysForMedia: false,
        budgetIncludesFees: false,
        noAdserving: false,
        deliverables: burst.amount || 0,
        buyType: "production",
      } as BillingBurst
    })
  )
}

const buildInvestmentByMonth = (bursts: BillingBurst[]) => {
  const inputs: InvestmentBurstInput[] = bursts.map((burst) => ({
    amount: burst.mediaAmount || 0,
    start: burst.startDate,
    end: burst.endDate,
  }))
  return aggregateInvestmentDisplayRows(inputs, (amount) =>
    formatCurrencyFull(amount, { locale: "en-AU", currency: "AUD" }),
  )
}

/**
 * Maps production line items into the shared LineItem[] export shape.
 *
 * IMPORTANT: platform is hardcoded to "production" for all production rows.
 * Production is treated as a single media type for export purposes; the
 * dropdown subcategory ("Print", "Audio", etc.) is internal organisation
 * only and is preserved in `apiLineItems.media_type` for dropdown
 * re-hydration but does NOT appear in exports.
 *
 * Matches buildBillingBursts which also forces mediaType: "production"
 * for billing math.
 */
const mapLineItemsForExport = (
  lineItems: ProductionFormValues["lineItems"],
  mbaNumber: string | undefined
): LineItem[] => {
  let burstIndex = 0
  return lineItems.flatMap((lineItem, lineIndex) =>
    lineItem.bursts.map((burst) => {
      const mediaAmount = (burst.cost || 0) * (burst.amount || 0)
      const lineId =
        lineItem.lineItemId ||
        buildLineItemId(mbaNumber, MEDIA_TYPE_ID_CODES.production, lineIndex + 1)
      burstIndex += 1
      return {
        market: lineItem.market || "",
        platform: "production",
        network: lineItem.publisher || "",
        creative: lineItem.description || "",
        startDate: formatDateString(burst.startDate),
        endDate: formatDateString(burst.endDate),
        deliverables: burst.amount || 0,
        buyType: "production",
        deliverablesAmount: (burst.cost || 0).toString(),
        grossMedia: String(mediaAmount),
        line_item_id: lineId,
        line_item: lineIndex + 1,
      }
    })
  )
}

export default function ProductionContainer({
  clientId,
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
}: ProductionContainerProps) {
  const { mbaNumber } = useMediaPlanContext()
  const { toast } = useToast()
  const mediaTypeOptions = useMemo(() => buildMediaTypeOptions(mediaTypes), [mediaTypes])
  const [openMediaIndex, setOpenMediaIndex] = useState<number | null>(null)

  const [expertProductionRows, setExpertProductionRows] = useState<
    ProductionExpertScheduleRow[]
  >([])
  const [productionExpertModalOpen, setProductionExpertModalOpen] = useState(false)
  const [productionExpertExitConfirmOpen, setProductionExpertExitConfirmOpen] =
    useState(false)
  const [expertSegmentAttention, setExpertSegmentAttention] = useState(true)
  const productionExpertModalOpenRef = useRef(false)
  const productionExpertRowsBaselineRef = useRef<string>("")
  const reorderedRef = useRef(false)
  productionExpertModalOpenRef.current = productionExpertModalOpen

  const productionExpertWeekColumns = useMemo(
    () => buildWeeklyGanttColumnsFromCampaign(campaignStartDate, campaignEndDate),
    [campaignStartDate, campaignEndDate]
  )

  const productionTypeComboboxOptions = useMemo(
    () =>
      mediaTypeOptions.map((option) => ({
        value: option.value,
        label: option.label,
      })),
    [mediaTypeOptions]
  )

  const makeDefaultBurst = useCallback((): ProductionBurstValues & { _reactKey: string } => {
    const startRaw = defaultMediaBurstStartDate(campaignStartDate, campaignEndDate)
    const startDate = toDateOnly(startRaw) || startRaw
    const endRaw = defaultMediaBurstEndDate(campaignStartDate, campaignEndDate)
    const endDate = toDateOnly(endRaw) || endRaw
    return { cost: 0, amount: 0, startDate, endDate, _reactKey: newBurstReactKey() }
  }, [campaignStartDate, campaignEndDate])

  // Keep stable references to parent callbacks to avoid effect loops
  const totalMediaChangeRef = useRef(onTotalMediaChange)
  const burstsChangeRef = useRef(onBurstsChange)
  const investmentChangeRef = useRef(onInvestmentChange)
  const lineItemsChangeRef = useRef(onLineItemsChange)
  const mediaLineItemsChangeRef = useRef(onMediaLineItemsChange)

  useEffect(() => {
    totalMediaChangeRef.current = onTotalMediaChange
  }, [onTotalMediaChange])

  useEffect(() => {
    burstsChangeRef.current = onBurstsChange
  }, [onBurstsChange])

  useEffect(() => {
    investmentChangeRef.current = onInvestmentChange
  }, [onInvestmentChange])

  useEffect(() => {
    lineItemsChangeRef.current = onLineItemsChange
  }, [onLineItemsChange])

  useEffect(() => {
    mediaLineItemsChangeRef.current = onMediaLineItemsChange
  }, [onMediaLineItemsChange])

  const form = useForm<ProductionFormValues>({
    resolver: zodResolver(productionFormSchema),
    defaultValues: {
      lineItems: [
        {
          mediaType: mediaTypeOptions[0]?.value || "",
          publisher: "",
          description: "",
          market: "",
          lineItemId: "",
          bursts: [makeDefaultBurst()],
        },
      ],
    },
  })

  const {
    fields: lineItemFields,
    append: appendLineItem,
    remove: removeLineItemBase,
    insert: insertLineItem,
  } = useFieldArray({
    control: form.control,
    name: "lineItems",
  })

  const [collapsedLineItems, setCollapsedLineItems] = useState<Set<number>>(new Set())

  const toggleLineItemCollapsed = useCallback((i: number) => {
    setCollapsedLineItems((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
  }, [])

  const removeLineItem = useCallback(
    (i: number) => {
      setCollapsedLineItems((prev) => {
        const next = new Set<number>()
        prev.forEach((idx) => {
          if (idx < i) next.add(idx)
          else if (idx > i) next.add(idx - 1)
        })
        return next
      })
      removeLineItemBase(i)
    },
    [removeLineItemBase]
  )

  const collapseAllLineItems = useCallback(() => {
    const items = form.getValues("lineItems") || []
    setCollapsedLineItems(new Set(items.map((_, i) => i)))
  }, [form])

  useEffect(() => {
    const id = window.setTimeout(() => setExpertSegmentAttention(false), 2800)
    return () => window.clearTimeout(id)
  }, [])

  const handleExpertProductionRowsChange = useCallback(
    (next: ProductionExpertScheduleRow[]) => {
      setExpertProductionRows(next)
    },
    []
  )

  const openProductionExpertModal = useCallback(() => {
    const mapped = mapStandardProductionLineItemsToExpertRows(
      form.getValues("lineItems") || [],
      productionExpertWeekColumns,
      campaignStartDate,
      campaignEndDate
    )
    const weekKeys = productionExpertWeekColumns.map((c) => c.weekKey)
    const rows: ProductionExpertScheduleRow[] =
      mapped.length > 0
        ? mapped
        : [
            createEmptyProductionExpertRow(
              typeof crypto !== "undefined" && crypto.randomUUID
                ? crypto.randomUUID()
                : `production-expert-${Date.now()}`,
              campaignStartDate,
              campaignEndDate,
              weekKeys
            ),
          ]
    productionExpertRowsBaselineRef.current =
      serializeProductionExpertRowsBaseline(rows)
    setExpertProductionRows(rows)
    setProductionExpertExitConfirmOpen(false)
    setProductionExpertModalOpen(true)
  }, [campaignStartDate, campaignEndDate, form, productionExpertWeekColumns])

  const dismissProductionExpertExitConfirm = useCallback(() => {
    setProductionExpertExitConfirmOpen(false)
  }, [])

  const confirmProductionExpertExitWithoutSaving = useCallback(() => {
    setProductionExpertExitConfirmOpen(false)
    collapseAllLineItems()
    setProductionExpertModalOpen(false)
  }, [collapseAllLineItems])

  const handleProductionExpertModalOpenChange = useCallback(
    (open: boolean) => {
      if (open) {
        setProductionExpertModalOpen(true)
        return
      }
      const dirty =
        serializeProductionExpertRowsBaseline(expertProductionRows) !==
        productionExpertRowsBaselineRef.current
      if (!dirty) {
        collapseAllLineItems()
        setProductionExpertModalOpen(false)
        return
      }
      setProductionExpertExitConfirmOpen(true)
    },
    [collapseAllLineItems, expertProductionRows]
  )

  const handleProductionExpertApply = useCallback(() => {
    const prevLineItems = form.getValues("lineItems") || []
    const standard = mapProductionExpertRowsToStandardLineItems(
      expertProductionRows,
      productionExpertWeekColumns,
      campaignStartDate,
      campaignEndDate
    )
    const merged = mergeProductionStandardFromExpertWithPrevious(
      standard,
      prevLineItems as StandardProductionFormLineItem[]
    )
    const orderedForApply = reorderedRef.current
      ? reassignLineItemNumbers(merged, mbaNumber, MEDIA_TYPE_ID_CODES.production)
      : merged
    reorderedRef.current = false
    const keyedMerged = stampBurstReactKeys(orderedForApply)
    form.setValue("lineItems", keyedMerged as any, {
      shouldDirty: true,
      shouldValidate: false,
    })
    setProductionExpertExitConfirmOpen(false)
    collapseAllLineItems()
    setProductionExpertModalOpen(false)
  }, [
    campaignStartDate,
    campaignEndDate,
    collapseAllLineItems,
    expertProductionRows,
    form,
    mbaNumber,
    productionExpertWeekColumns,
  ])

  const watchedLineItems = useWatch({
    control: form.control,
    name: "lineItems",
  })

  useStableHydration(
    initialLineItems,
    (items) => {
      try {
        const normalized = items.map((item: any, idx: number) => {
          const rawBursts =
            typeof item.bursts_json === "string"
              ? (() => {
                  try {
                    const parsed = JSON.parse(item.bursts_json)
                    return Array.isArray(parsed) ? parsed : []
                  } catch {
                    return []
                  }
                })()
              : Array.isArray(item.bursts_json)
                ? item.bursts_json
                : Array.isArray(item.bursts)
                  ? item.bursts
                  : []

          const bursts = (rawBursts || []).map((burst: any) => {
            const cost = typeof burst.cost === "string" ? parseFloat(burst.cost.replace(/[^0-9.-]/g, "")) || 0 : Number(burst.cost || 0)
            const amountRaw = burst.amount ?? burst.deliverables ?? 0
            const amount = typeof amountRaw === "string" ? parseFloat(amountRaw.replace(/[^0-9.-]/g, "")) || 0 : Number(amountRaw || 0)
            const fallbackStart = defaultMediaBurstStartDate(campaignStartDate, campaignEndDate)
            const startDate =
              toDateOnly(burst.startDate || burst.start_date) ??
              toDateOnly(fallbackStart) ??
              fallbackStart
            let endDate = toDateOnly(burst.endDate || burst.end_date)
            if (!endDate) {
              const fallbackEnd = defaultMediaBurstEndDate(campaignStartDate, campaignEndDate)
              endDate = toDateOnly(fallbackEnd) || fallbackEnd
            }
            return { cost, amount, startDate, endDate }
          })

          return {
            mediaType: item.mediaType || item.platform || item.media_type || "",
            publisher: item.publisher || item.network || "",
            description: item.description || item.creative || "",
            market: item.market || "",
            lineItemId:
              item.line_item_id ||
              item.lineItemId ||
              buildLineItemId(mbaNumber, MEDIA_TYPE_ID_CODES.production, idx + 1),
            bursts: bursts.length > 0 ? bursts : [makeDefaultBurst()],
          }
        })
        form.reset({
          lineItems: stampBurstReactKeys(normalized),
        })
      } catch (err) {
        console.warn("[ProductionContainer] Failed to hydrate initial line items", err)
      }
    },
    productionExpertModalOpenRef,
  )

  const totals = useMemo(() => {
    const totalMedia = watchedLineItems?.reduce((sum, li) => {
      const burstSum = li.bursts.reduce(
        (burstAcc, b) => burstAcc + (b.cost || 0) * (b.amount || 0),
        0
      )
      return sum + burstSum
    }, 0) || 0
    return { totalMedia }
  }, [watchedLineItems])

  const apiLineItems = useMemo(() => {
    const stableProductionItems = assignStableLineItemNumbers<any>(watchedLineItems || [], mbaNumber, MEDIA_TYPE_ID_CODES.production)
    return stableProductionItems.map((lineItem) => ({
      media_plan_version: 0,
      mba_number: mbaNumber || "",
      mp_client_name: "",
      mp_plannumber: "",
      media_type: lineItem.mediaType || "",
      publisher: lineItem.publisher || "",
      market: lineItem.market || "",
      description: lineItem.description || "",
      line_item_id: lineItem.line_item_id,
      bursts: (lineItem.bursts || []).map((burst) =>
        formatProductionBurstForPersist(
          {
            cost: Number(burst.cost) || 0,
            amount: Number(burst.amount) || 0,
            startDate: formatDateString(burst.startDate),
            endDate: formatDateString(burst.endDate),
          },
          lineItem
        )
      ),
      line_item: lineItem.line_item,
    }))
  }, [watchedLineItems, mbaNumber])

  useEffect(() => {
    const bursts = buildBillingBursts(watchedLineItems || [])
    totalMediaChangeRef.current?.(totals.totalMedia, 0)
    burstsChangeRef.current?.(bursts)
    investmentChangeRef.current?.(buildInvestmentByMonth(bursts))
    const mappedLineItems = mapLineItemsForExport(watchedLineItems || [], mbaNumber)
    lineItemsChangeRef.current?.(mappedLineItems)
    mediaLineItemsChangeRef.current?.(apiLineItems)
  }, [watchedLineItems, totals.totalMedia, mbaNumber, apiLineItems])

  const handleAddLineItem = () => {
    appendLineItem({
      mediaType: mediaTypeOptions[0]?.value || "",
      publisher: "",
      description: "",
      market: "",
      lineItemId: "",
      bursts: [makeDefaultBurst()],
    })
  }

  const handleDuplicateLineItem = (index: number) => {
    const current = form.getValues(`lineItems.${index}`)
    if (current) {
      insertLineItem(index + 1, {
        ...current,
        lineItemId: "",
        bursts: current.bursts.map((b) => ({ ...b, _reactKey: newBurstReactKey() })),
      })
    }
  }

  const handleAddBurst = (lineItemIndex: number) => {
    appendBurst({
      form,
      fieldKey: "lineItems",
      lineItemIndex,
      campaignStartDate,
      campaignEndDate,
      onAfter: () => {},
      toast: toast as Parameters<typeof appendBurst>[0]["toast"],
      makeBurst: productionBurstDefaults,
    })
  }

  const handleDuplicateBurst = (lineItemIndex: number) => {
    duplicateBurst({
      form,
      fieldKey: "lineItems",
      lineItemIndex,
      onAfter: () => {},
      toast: toast as Parameters<typeof duplicateBurst>[0]["toast"],
    })
  }

  const handleRemoveBurst = (lineItemIndex: number, burstIndex: number) => {
    removeBurst({
      form,
      fieldKey: "lineItems",
      lineItemIndex,
      burstIndex,
      onAfter: () => {},
      toast: toast as Parameters<typeof removeBurst>[0]["toast"],
    })
  }

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden border-0 shadow-md">
        <div className="h-1" style={mediaTypeSummaryStripeStyle(MEDIA_ACCENT_HEX)} />
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <CardTitle className="text-base font-semibold tracking-tight">Production</CardTitle>
                {productionExpertModalOpen ? (
                  <Badge
                    variant="outline"
                    className="border-2 text-[10px] font-semibold uppercase tracking-wider shadow-sm"
                    style={{
                      borderColor: rgbaFromHex(MEDIA_ACCENT_HEX, 0.55),
                      backgroundColor: rgbaFromHex(MEDIA_ACCENT_HEX, 0.14),
                      color: MEDIA_ACCENT_HEX,
                    }}
                  >
                    Expert schedule open
                  </Badge>
                ) : null}
              </div>
              <div
                role="group"
                aria-label="Production entry mode"
                className="inline-flex shrink-0 rounded-lg border border-border bg-muted/50 p-0.5"
              >
                <button
                  type="button"
                  aria-pressed={!productionExpertModalOpen}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-xs font-medium transition-all",
                    !productionExpertModalOpen
                      ? "text-white shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                  style={
                    !productionExpertModalOpen
                      ? { backgroundColor: MEDIA_ACCENT_HEX }
                      : undefined
                  }
                  onClick={() => {
                    if (productionExpertModalOpen) {
                      handleProductionExpertModalOpenChange(false)
                    }
                  }}
                >
                  Standard
                </button>
                <button
                  type="button"
                  aria-pressed={productionExpertModalOpen}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-xs font-medium transition-all",
                    productionExpertModalOpen
                      ? "text-white shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                    expertSegmentAttention &&
                      !productionExpertModalOpen &&
                      "animate-pulse"
                  )}
                  style={{
                    ...(productionExpertModalOpen
                      ? { backgroundColor: MEDIA_ACCENT_HEX }
                      : {}),
                    ...(expertSegmentAttention && !productionExpertModalOpen
                      ? {
                          boxShadow: `0 0 0 2px ${rgbaFromHex(MEDIA_ACCENT_HEX, 0.45)}`,
                        }
                      : {}),
                  }}
                  onClick={() => {
                    if (!productionExpertModalOpen) {
                      openProductionExpertModal()
                    }
                  }}
                >
                  Expert
                </button>
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">Card-based entry</p>
              <span className="text-xs text-muted-foreground tabular-nums sm:text-right">
                {lineItemFields.length} line item
                {lineItemFields.length !== 1 ? "s" : ""}
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-0 pt-0">
          <div className="flex items-center justify-between py-2">
            <span className="text-sm font-semibold">Total</span>
            <div className="text-right">
              <span className="text-[11px] text-muted-foreground font-normal block">Media</span>
              <span
                className="text-sm font-semibold tabular-nums"
                style={mediaTypeAccentTextStyle(MEDIA_ACCENT_HEX)}
              >
                {formatAUD(totals.totalMedia)}
              </span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground pt-3 border-t border-border/40">
            Production line items use the same schedule grid and media plan export as other channels. No agency fees apply.
          </p>
          <MediaContainerTimelineCollapsible
            mediaTypeKey="production"
            lineItems={watchedLineItems}
            campaignStartDate={campaignStartDate}
            campaignEndDate={campaignEndDate}
          />
        </CardContent>
      </Card>

      <Form {...form}>
        <div className="space-y-6">
          {lineItemFields.map((field, lineItemIndex) => {
            const lineItemId =
              form.watch(`lineItems.${lineItemIndex}.lineItemId`) ||
              buildLineItemId(mbaNumber, MEDIA_TYPE_ID_CODES.production, lineItemIndex + 1)
            const lineItemBursts = form.watch(`lineItems.${lineItemIndex}.bursts`) || []
            const lineItemMediaTotal =
              lineItemBursts.reduce(
                (sum, burst) => sum + (burst.cost || 0) * (burst.amount || 0),
                0
              ) || 0

            return (
              <Card key={field.id} className="overflow-hidden border border-border/50 shadow-sm hover:shadow-md transition-shadow duration-200 space-y-6">
                <CardHeader className="pb-2 bg-muted/30">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                        style={mediaTypeLineItemBadgeStyle(MEDIA_ACCENT_HEX)}
                      >
                        {lineItemIndex + 1}
                      </div>
                      <div>
                        <CardTitle className="text-sm font-semibold tracking-tight">Production Line Item</CardTitle>
                        <span className="font-mono text-[11px] text-muted-foreground">{lineItemId}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <span className="block text-[11px] text-muted-foreground">Total</span>
                        <span className="text-sm font-bold tabular-nums">
                          {formatAUD(lineItemMediaTotal)}
                        </span>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 shrink-0 rounded-full p-0"
                        aria-expanded={!collapsedLineItems.has(lineItemIndex)}
                        aria-label={
                          collapsedLineItems.has(lineItemIndex)
                            ? `Expand details for production line item ${lineItemIndex + 1}`
                            : `Collapse details for production line item ${lineItemIndex + 1}`
                        }
                        onClick={() => toggleLineItemCollapsed(lineItemIndex)}
                      >
                        <ChevronDown
                          className={cn(
                            "h-4 w-4 transition-transform",
                            collapsedLineItems.has(lineItemIndex) && "-rotate-90"
                          )}
                          aria-hidden
                        />
                      </Button>
                    </div>
                  </div>
                </CardHeader>

                <div className="px-6 py-2 border-b">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                    <div>
                      <span className="font-medium">Production type:</span>{" "}
                      {form.watch(`lineItems.${lineItemIndex}.mediaType`) || "Not selected"}
                    </div>
                    <div>
                      <span className="font-medium">Publisher:</span>{" "}
                      {form.watch(`lineItems.${lineItemIndex}.publisher`) || "Not provided"}
                    </div>
                    <div>
                      <span className="font-medium">Market:</span>{" "}
                      {form.watch(`lineItems.${lineItemIndex}.market`) || "Not provided"}
                    </div>
                    <div>
                      <span className="font-medium">Bursts:</span> {lineItemBursts.length}
                    </div>
                  </div>
                </div>

                {!collapsedLineItems.has(lineItemIndex) && (
                <>
                <div className="px-6 py-5">
                  <CardContent className="space-y-5 p-0">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-4">
                      <div className="space-y-4">
                        <FormField
                          control={form.control}
                          name={`lineItems.${lineItemIndex}.mediaType`}
                          render={({ field }) => {
                            const selectedOption = mediaTypeOptions.find((option) => option.value === field.value)
                            const isOpen = openMediaIndex === lineItemIndex

                            return (
                              <FormItem className="flex flex-col space-y-1.5">
                                <FormLabel className="text-sm text-muted-foreground font-medium">Production type</FormLabel>
                                <Popover open={isOpen} onOpenChange={(open) => setOpenMediaIndex(open ? lineItemIndex : null)}>
                                  <PopoverTrigger asChild>
                                    <Button
                                      variant="outline"
                                      role="combobox"
                                      aria-expanded={isOpen}
                                      className="w-full h-9 justify-between rounded-md"
                                    >
                                      <span className="truncate">
                                        {selectedOption ? selectedOption.label : "Select production type"}
                                      </span>
                                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                    </Button>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-[280px] p-0" align="start">
                                    <Command>
                                      <CommandInput placeholder="Search production types..." />
                                      <CommandList>
                                        <CommandEmpty>No production types found.</CommandEmpty>
                                        <CommandGroup>
                                          {mediaTypeOptions.map((option) => {
                                            const isSelected = option.value === field.value
                                            return (
                                              <CommandItem
                                                key={option.value}
                                                value={option.label}
                                                onSelect={() => {
                                                  field.onChange(option.value)
                                                  setOpenMediaIndex(null)
                                                }}
                                              >
                                                <Check
                                                  className={cn(
                                                    "mr-2 h-4 w-4",
                                                    isSelected ? "opacity-100" : "opacity-0"
                                                  )}
                                                />
                                                <span className="truncate">{option.label}</span>
                                              </CommandItem>
                                            )
                                          })}
                                        </CommandGroup>
                                      </CommandList>
                                    </Command>
                                  </PopoverContent>
                                </Popover>
                                <FormMessage />
                              </FormItem>
                            )
                          }}
                        />
                      </div>

                      <div className="space-y-4">
                        <FormField
                          control={form.control}
                          name={`lineItems.${lineItemIndex}.publisher`}
                          render={({ field }) => (
                            <FormItem className="flex flex-col space-y-1.5">
                              <FormLabel className="text-sm text-muted-foreground font-medium">Publisher</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="Publisher" className="h-10 text-sm" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <div className="space-y-4">
                        <FormField
                          control={form.control}
                          name={`lineItems.${lineItemIndex}.market`}
                          render={({ field }) => (
                            <FormItem className="flex flex-col space-y-1.5">
                              <FormLabel className="text-sm text-muted-foreground font-medium">Market</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="Market" className="h-10 text-sm" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <div className="space-y-4" aria-hidden />
                    </div>

                    <FormField
                      control={form.control}
                      name={`lineItems.${lineItemIndex}.description`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-sm text-muted-foreground font-medium">Description</FormLabel>
                          <FormControl>
                            <Textarea {...field} placeholder="Description" className="min-h-[96px] text-sm rounded-md border border-border/50 bg-muted/30 transition-colors focus:bg-background" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </CardContent>
                </div>

                <BurstSection>
                  {lineItemBursts.map((burst, burstIndex) => {
                    const mediaValue = (burst.cost || 0) * (burst.amount || 0)
                    return (
                      <BurstRowCard key={(burst as any)._reactKey ?? `${lineItemIndex}-${burstIndex}`}>
                        <BurstRowInner>
                          <BurstLabel>
                            {formatBurstLabel(burstIndex + 1, burst.startDate, burst.endDate, {
                              noun: "Production",
                            })}
                          </BurstLabel>

                            <BurstFieldGrid className={MP_BURST_GRID_5}>
                              <FormField
                                control={form.control}
                                name={`lineItems.${lineItemIndex}.bursts.${burstIndex}.cost`}
                                render={({ field }) => (
                                  <FormItem>
                                    <BurstFieldLabel>Cost</BurstFieldLabel>
                                    <FormControl>
                                      <MoneyInput
                                        ref={field.ref}
                                        name={field.name}
                                        onBlur={field.onBlur}
                                        className="h-10 w-full min-w-0 text-sm"
                                        value={field.value}
                                        onChange={(v) => field.onChange(v ?? 0)}
                                      />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />

                              <FormField
                                control={form.control}
                                name={`lineItems.${lineItemIndex}.bursts.${burstIndex}.amount`}
                                render={({ field }) => (
                                  <FormItem>
                                    <BurstFieldLabel>Quantity</BurstFieldLabel>
                                    <FormControl>
                                      <NumericInput
                                        ref={field.ref}
                                        name={field.name}
                                        onBlur={field.onBlur}
                                        decimals={0}
                                        className="h-10 w-full min-w-0 text-sm"
                                        value={field.value}
                                        onChange={(v) => field.onChange(v ?? 0)}
                                      />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />

                              <BurstDateRangeColumn>
                                <FormField
                                  control={form.control}
                                  name={`lineItems.${lineItemIndex}.bursts.${burstIndex}.startDate`}
                                  render={({ field }) => (
                                    <FormItem>
                                      <BurstFieldLabel>Start Date</BurstFieldLabel>
                                      <FormControl>
                                        <SingleDatePicker
                                          ref={field.ref}
                                          name={field.name}
                                          onBlur={field.onBlur}
                                          value={field.value}
                                          onChange={field.onChange}
                                          className="h-10 w-full pl-2 text-left text-sm font-normal"
                                          calendarContext="media-burst"
                                          mediaBurstRole="start"
                                          campaignStartDate={campaignStartDate}
                                          campaignEndDate={campaignEndDate}
                                        />
                                      </FormControl>
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />

                                <FormField
                                  control={form.control}
                                  name={`lineItems.${lineItemIndex}.bursts.${burstIndex}.endDate`}
                                  render={({ field }) => (
                                    <FormItem>
                                      <BurstFieldLabel>End Date</BurstFieldLabel>
                                      <FormControl>
                                        <SingleDatePicker
                                          ref={field.ref}
                                          name={field.name}
                                          onBlur={field.onBlur}
                                          value={field.value}
                                          onChange={field.onChange}
                                          className="h-10 w-full pl-2 text-left text-sm font-normal"
                                          calendarContext="media-burst"
                                          mediaBurstRole="end"
                                          campaignStartDate={campaignStartDate}
                                          campaignEndDate={campaignEndDate}
                                        />
                                      </FormControl>
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />
                              </BurstDateRangeColumn>

                              <BurstReadonlyMetric
                                label="Production Total"
                                muted
                                value={formatAUD(mediaValue)}
                              />
                            </BurstFieldGrid>

                            <BurstRowActions
                              onAdd={() => handleAddBurst(lineItemIndex)}
                              onDuplicate={() => handleDuplicateBurst(lineItemIndex)}
                              onRemove={() => handleRemoveBurst(lineItemIndex, burstIndex)}
                            />
                        </BurstRowInner>
                      </BurstRowCard>
                    )
                  })}
                </BurstSection>
                </>
                )}

                <CardFooter className="flex items-center justify-between pt-4 pb-4 bg-muted/20 border-t border-border/40">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-destructive/70 hover:text-destructive hover:bg-destructive/10"
                    onClick={() => removeLineItem(lineItemIndex)}
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                    Remove
                  </Button>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => handleAddBurst(lineItemIndex)}>
                      <Plus className="h-3.5 w-3.5 mr-1.5" />
                      Add Burst
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => handleDuplicateLineItem(lineItemIndex)}>
                      <Copy className="h-3.5 w-3.5 mr-1.5" />
                      Duplicate
                    </Button>
                    {lineItemIndex === lineItemFields.length - 1 && (
                      <Button type="button" size="sm" onClick={handleAddLineItem}>
                        <Plus className="h-3.5 w-3.5 mr-1.5" />
                        Add Line Item
                      </Button>
                    )}
                  </div>
                </CardFooter>
              </Card>
            )
          })}
        </div>
      </Form>

      <Dialog open={productionExpertModalOpen} onOpenChange={handleProductionExpertModalOpenChange}>
        <DialogContent className="max-w-[95vw] w-[95vw] max-h-[95vh] h-[95vh] flex flex-col p-4 gap-0 overflow-hidden">
          <DialogHeader className="flex-shrink-0 pb-2">
            <DialogTitle>Production Expert Mode</DialogTitle>
          </DialogHeader>
          <ComboboxModalProvider>
            <div className="flex-1 min-h-0 overflow-auto">
              <ProductionExpertGrid
                campaignStartDate={campaignStartDate}
                campaignEndDate={campaignEndDate}
                rows={expertProductionRows}
                onRowsChange={handleExpertProductionRowsChange}
                productionTypeOptions={productionTypeComboboxOptions}
                onReorder={() => {
                  reorderedRef.current = true
                }}
              />
            </div>
          </ComboboxModalProvider>
          <DialogFooter className="flex-shrink-0 border-t pt-3 mt-2">
            <Button type="button" onClick={handleProductionExpertApply}>
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={productionExpertExitConfirmOpen}
        onOpenChange={(open) => {
          if (!open) dismissProductionExpertExitConfirm()
        }}
      >
        <DialogContent
          className="z-[100] sm:max-w-md"
          onClick={(e) => {
            if ((e.target as HTMLElement).closest("[data-production-expert-exit-yes]")) {
              return
            }
            dismissProductionExpertExitConfirm()
          }}
        >
          <DialogHeader>
            <DialogTitle>Leave Production Expert Mode?</DialogTitle>
            <DialogDescription>
              You have unsaved changes in Expert Mode. Apply saves them to the Production section;
              leaving now discards those edits.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={dismissProductionExpertExitConfirm}>
              No, keep editing
            </Button>
            <Button
              type="button"
              variant="destructive"
              data-production-expert-exit-yes
              onClick={confirmProductionExpertExitWithoutSaving}
            >
              Yes, leave without saving
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

