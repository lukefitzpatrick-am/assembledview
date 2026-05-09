"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useForm, useFieldArray, UseFormReturn, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { format } from "date-fns"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { MoneyInput } from "@/components/ui/MoneyInput"
import { NumericInput } from "@/components/ui/NumericInput"
import { Textarea } from "@/components/ui/textarea"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Check, ChevronDown, ChevronsUpDown, Copy, Plus, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatCurrencyFull } from "@/lib/format/currency"
import { formatMoney } from "@/lib/format/money"
import type { BillingBurst } from "@/lib/billing/types"
import { formatBurstLabel } from "@/lib/bursts"
import type { LineItem } from "@/lib/generateMediaPlan"
import { useMediaPlanContext } from "@/contexts/MediaPlanContext"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { SingleDatePicker } from "@/components/ui/single-date-picker"
import {
  defaultMediaBurstStartDate,
  defaultMediaBurstEndDate,
  hasCampaignDateWindow,
} from "@/lib/date-picker-anchor"
import MediaContainerTimelineCollapsible from "@/components/media-containers/MediaContainerTimelineCollapsible"
import {
  MP_BURST_ACTION_COLUMN,
  MP_BURST_CARD,
  MP_BURST_CARD_CONTENT,
  MP_BURST_GRID_5,
  MP_BURST_HEADER_INNER,
  MP_BURST_HEADER_ROW,
  MP_BURST_HEADER_SHELL,
  MP_BURST_LABEL_COLUMN,
  MP_BURST_LABEL_HEADING,
  MP_BURST_ROW_SHELL,
  MP_BURST_SECTION_OUTER,
} from "@/lib/mediaplan/burstSectionLayout"
import {
  getMediaTypeThemeHex,
  mediaTypeAccentTextStyle,
  mediaTypeLineItemBadgeStyle,
  mediaTypeSummaryStripeStyle,
} from "@/lib/mediaplan/mediaTypeAccents"
import { mapProductionLineItemsForExport } from "@/lib/mediaplan/productionLineItems"

const MEDIA_ACCENT_HEX = getMediaTypeThemeHex("production")

const burstSchema = z.object({
  cost: z.number().min(0, "Cost is required"),
  amount: z.number().min(0, "Amount is required"),
  startDate: z.date(),
  endDate: z.date(),
})

const lineItemSchema = z.object({
  mediaType: z.string().min(1, "Production type is required"),
  publisher: z.string().optional(),
  description: z.string().optional(),
  market: z.string().optional(),
  bursts: z.array(burstSchema).min(1, "At least one burst is required"),
  lineItemId: z.string().optional(),
})

const formSchema = z.object({
  lineItems: z.array(lineItemSchema).min(1, "At least one line item is required"),
})

type ProductionFormValues = z.infer<typeof formSchema>

export function getAllBursts(form: UseFormReturn<ProductionFormValues>) {
  const lineItems = form.getValues("lineItems") || []
  return lineItems.flatMap((lineItem) =>
    lineItem.bursts.map((burst) => ({
      startDate: burst.startDate,
      endDate: burst.endDate,
      cost: burst.cost,
      amount: burst.amount,
    }))
  )
}

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
  const year = dateObj.getUTCFullYear()
  const month = (dateObj.getUTCMonth() + 1).toString().padStart(2, "0")
  const day = dateObj.getUTCDate().toString().padStart(2, "0")
  return `${year}-${month}-${day}`
}

type MediaTypeOption = { value: string; label: string }

interface ProductionContainerProps {
  clientId: string
  feesearch?: number
  onTotalMediaChange: (totalMedia: number, totalFee: number) => void
  onBurstsChange: (bursts: BillingBurst[]) => void
  onInvestmentChange: (investmentByMonth: any) => void
  onLineItemsChange: (items: LineItem[]) => void
  onMediaLineItemsChange?: (items: any[]) => void
  campaignStartDate: Date
  campaignEndDate: Date
  campaignBudget: number
  campaignId: string
  mediaTypes: Array<string | MediaTypeOption>
  initialLineItems?: any[]
}

const getPeriodEnd = (start: Date) => {
  const end = new Date(start.getFullYear(), start.getMonth() + 1, 0)
  return toDateOnly(end) || end
}

const addDays = (date: Date, days: number) => {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return toDateOnly(next) || next
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
  const monthly: Record<string, number> = {}
  bursts.forEach((burst) => {
    const start = new Date(burst.startDate)
    const end = new Date(burst.endDate)
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return
    const totalDays = Math.max(
      1,
      Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1
    )
    let cursor = new Date(start)
    while (cursor <= end) {
      const monthYear = `${cursor.toLocaleString("default", {
        month: "long",
      })} ${cursor.getFullYear()}`
      const nextMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0)
      const sliceEnd =
        nextMonth > end ? end : nextMonth
      const daysInThisMonth =
        Math.ceil((sliceEnd.getTime() - cursor.getTime()) / (1000 * 60 * 60 * 24)) + 1
      const share = (burst.mediaAmount || 0) * (daysInThisMonth / totalDays)
      monthly[monthYear] = (monthly[monthYear] || 0) + share
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)
    }
  })
  return Object.entries(monthly).map(([monthYear, amount]) => ({
    monthYear,
    amount: formatCurrencyFull(amount, { locale: "en-AU", currency: "AUD" }),
  }))
}

export default function ProductionContainer({
  clientId,
  feesearch = 0,
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
  const mediaTypeOptions = useMemo(() => buildMediaTypeOptions(mediaTypes), [mediaTypes])
  const [openMediaIndex, setOpenMediaIndex] = useState<number | null>(null)

  const makeDefaultBurst = useCallback((): z.infer<typeof burstSchema> => {
    const startRaw = defaultMediaBurstStartDate(campaignStartDate, campaignEndDate)
    const startDate = toDateOnly(startRaw) || startRaw
    let endRaw = defaultMediaBurstEndDate(campaignStartDate, campaignEndDate)
    let endDate = toDateOnly(endRaw) || endRaw
    if (!hasCampaignDateWindow(campaignStartDate, campaignEndDate)) {
      endDate = getPeriodEnd(startDate)
    }
    return { cost: 0, amount: 0, startDate, endDate }
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
    resolver: zodResolver(formSchema),
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

  const watchedLineItems = useWatch({
    control: form.control,
    name: "lineItems",
  })

  // Hydrate form when initialLineItems are provided (edit flow)
  useEffect(() => {
    if (!initialLineItems || initialLineItems.length === 0) return
    try {
      const normalized = initialLineItems.map((item: any, idx: number) => {
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
            : (item.bursts_json ?? item.bursts ?? [])

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
            if (hasCampaignDateWindow(campaignStartDate, campaignEndDate)) {
              const fe = defaultMediaBurstEndDate(campaignStartDate, campaignEndDate)
              endDate = toDateOnly(fe) || fe
            } else {
              endDate = getPeriodEnd(startDate)
            }
          }
          return { cost, amount, startDate, endDate }
        })

        return {
          mediaType: item.mediaType || item.platform || item.media_type || "",
          publisher: item.publisher || item.network || "",
          description: item.description || item.creative || "",
          market: item.market || "",
          lineItemId: item.line_item_id || item.lineItemId || `${campaignId || "MBA"}PROD${idx + 1}`,
          bursts: bursts.length > 0 ? bursts : [makeDefaultBurst()],
        }
      })
      form.setValue("lineItems", normalized, { shouldDirty: false })
    } catch (err) {
      console.warn("[ProductionContainer] Failed to hydrate initial line items", err)
    }
  }, [initialLineItems, form, campaignId, campaignStartDate, campaignEndDate, makeDefaultBurst])

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
    return (watchedLineItems || []).map((lineItem, index) => ({
      media_plan_version: 0,
      mba_number: mbaNumber || "",
      mp_client_name: "",
      mp_plannumber: "",
      media_type: lineItem.mediaType || "",
      publisher: lineItem.publisher || "",
      market: lineItem.market || "",
      description: lineItem.description || "",
      line_item_id: lineItem.lineItemId || `${mbaNumber || "MBA"}PROD${index + 1}`,
      bursts: (lineItem.bursts || []).map((burst) => ({
        cost: Number(burst.cost) || 0,
        amount: Number(burst.amount) || 0,
        startDate: formatDateString(burst.startDate),
        endDate: formatDateString(burst.endDate),
      })),
      line_item: index + 1,
    }))
  }, [watchedLineItems, mbaNumber])

  useEffect(() => {
    const bursts = buildBillingBursts(watchedLineItems || [])
    totalMediaChangeRef.current?.(totals.totalMedia, 0)
    burstsChangeRef.current?.(bursts)
    investmentChangeRef.current?.(buildInvestmentByMonth(bursts))
    const mappedLineItems = mapProductionLineItemsForExport(watchedLineItems || [], mbaNumber || "MBA")
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
        bursts: current.bursts.map((b) => ({ ...b })),
      })
    }
  }

  const handleAddBurst = (lineItemIndex: number) => {
    const currentBursts = form.getValues(`lineItems.${lineItemIndex}.bursts`) || []
    const lastBurst = currentBursts[currentBursts.length - 1]
    const lastEndDate = toDateOnly(lastBurst?.endDate)
    const anchor =
      toDateOnly(defaultMediaBurstStartDate(campaignStartDate, campaignEndDate)) ??
      defaultMediaBurstStartDate(campaignStartDate, campaignEndDate)
    const nextStart = lastEndDate ? addDays(lastEndDate, 1) : anchor
    const nextEnd = getPeriodEnd(nextStart)
    form.setValue(`lineItems.${lineItemIndex}.bursts`, [
      ...currentBursts,
      {
        cost: 0,
        amount: 0,
        startDate: nextStart,
        endDate: nextEnd,
      },
    ])
  }

  const handleDuplicateBurst = (lineItemIndex: number, burstIndex: number) => {
    const currentBursts = form.getValues(`lineItems.${lineItemIndex}.bursts`) || []
    const burst = currentBursts[burstIndex]
    if (!burst) return
    const lastBurst = currentBursts[currentBursts.length - 1]
    const lastEndDate = toDateOnly(lastBurst?.endDate)
    const anchor =
      toDateOnly(defaultMediaBurstStartDate(campaignStartDate, campaignEndDate)) ??
      defaultMediaBurstStartDate(campaignStartDate, campaignEndDate)
    const startDate = lastEndDate ? addDays(lastEndDate, 1) : anchor
    const endDate = getPeriodEnd(startDate)
    const cloned = { ...burst, startDate, endDate }
    const updated = [
      ...currentBursts.slice(0, burstIndex + 1),
      cloned,
      ...currentBursts.slice(burstIndex + 1),
    ]
    form.setValue(`lineItems.${lineItemIndex}.bursts`, updated)
  }

  const handleRemoveBurst = (lineItemIndex: number, burstIndex: number) => {
    const currentBursts = form.getValues(`lineItems.${lineItemIndex}.bursts`) || []
    form.setValue(
      `lineItems.${lineItemIndex}.bursts`,
      currentBursts.filter((_, idx) => idx !== burstIndex)
    )
  }

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden border-0 shadow-md">
        <div className="h-1" style={mediaTypeSummaryStripeStyle(MEDIA_ACCENT_HEX)} />
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold tracking-tight">Production</CardTitle>
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
                {formatCurrencyFull(totals.totalMedia, { locale: "en-AU", currency: "AUD" })}
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
              `${mbaNumber || "MBA"}PROD${lineItemIndex + 1}`
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
                          {formatCurrencyFull(lineItemMediaTotal, { locale: "en-AU", currency: "AUD" })}
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

                <div className={MP_BURST_SECTION_OUTER}>
                  <div className={MP_BURST_HEADER_SHELL}>
                    <div className={MP_BURST_HEADER_INNER}>
                      <div className={MP_BURST_LABEL_COLUMN} aria-hidden />
                      <div className={MP_BURST_HEADER_ROW}>
                        <div
                          className={cn(
                            MP_BURST_GRID_5,
                            "gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground",
                          )}
                        >
                          <span>Cost</span>
                          <span>Quantity</span>
                          <div className="col-span-2 grid grid-cols-2 gap-2">
                            <span>Start Date</span>
                            <span>End Date</span>
                          </div>
                          <span>Production Total</span>
                        </div>
                        <div className={MP_BURST_ACTION_COLUMN}>
                          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                            Actions
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                  {lineItemBursts.map((burst, burstIndex) => {
                    const mediaValue = (burst.cost || 0) * (burst.amount || 0)
                    return (
                      <Card key={`${lineItemIndex}-${burstIndex}`} className={MP_BURST_CARD}>
                        <CardContent className={MP_BURST_CARD_CONTENT}>
                          <div className={MP_BURST_ROW_SHELL}>
                            <div className={MP_BURST_LABEL_COLUMN}>
                              <h4 className={MP_BURST_LABEL_HEADING}>
                                {formatBurstLabel(burstIndex + 1, burst.startDate, burst.endDate, {
                                  noun: "Production",
                                })}
                              </h4>
                            </div>

                            <div className={cn(MP_BURST_GRID_5, "gap-2")}>
                              <FormField
                                control={form.control}
                                name={`lineItems.${lineItemIndex}.bursts.${burstIndex}.cost`}
                                render={({ field }) => (
                                  <FormItem>
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

                              <div className="col-span-2 grid grid-cols-2 gap-2">
                                <FormField
                                  control={form.control}
                                  name={`lineItems.${lineItemIndex}.bursts.${burstIndex}.startDate`}
                                  render={({ field }) => (
                                    <FormItem>
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
                              </div>

                              <Input
                                type="text"
                                className="h-10 w-full min-w-0 text-sm tabular-nums bg-muted/30 border-border/40 text-muted-foreground"
                                readOnly
                                title="Production total (cost × quantity)"
                                value={formatMoney(mediaValue, { locale: "en-AU", currency: "AUD" })}
                              />
                            </div>

                            <div className={MP_BURST_ACTION_COLUMN}>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => handleAddBurst(lineItemIndex)}
                                title="Add burst"
                              >
                                <Plus className="h-4 w-4" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => handleDuplicateBurst(lineItemIndex, burstIndex)}
                                title="Duplicate burst"
                              >
                                <Copy className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive/70 hover:text-destructive hover:bg-destructive/10"
                                onClick={() => handleRemoveBurst(lineItemIndex, burstIndex)}
                                title="Remove burst"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>
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
    </div>
  )
}

