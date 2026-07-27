"use client"

/**
 * Shared media-channel container orchestration.
 *
 * Ports ProgDisplayContainer's ~37 hooks into one parameterized hook so
 * containers keep only their wrapper + descriptor + channel-specific JSX.
 */

import { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback, startTransition } from "react"
import { useForm, useFieldArray, useWatch, type UseFormReturn } from "react-hook-form"
import { useToast } from "@/components/ui/use-toast"
import { useMediaPlanContext } from "@/contexts/MediaPlanContext"
import { useStableHydration } from "@/hooks/useStableHydration"
import { publishMediaLineItemsIfChanged } from "@/lib/mediaplan/publishMediaLineItems"
import { allCollapsedIndices } from "@/lib/mediaplan/collapsedLineItems"
import { subscribeMediaPlanPageSaved } from "@/lib/mediaplan/expertApplyDirtyBridge"
import {
  type ContainerChannelConfig,
  buildDefaultLineItem,
  mapHydrationToForm,
  mapFormToApi,
} from "@/lib/mediaplan/containerChannelConfig"
import { computeBurstAmounts } from "@/lib/mediaplan/burstAmounts"
import { resolveLineItemBursts } from "@/lib/mediaplan/deriveBursts"
import { expertApplyClearedAdServingOverride } from "@/lib/mediaplan/adServingOverrideNotice"
import { MEDIA_TYPE_ID_CODES, buildLineItemId } from "@/lib/mediaplan/lineItemIds"

export type MediaCode = (typeof MEDIA_TYPE_ID_CODES)[keyof typeof MEDIA_TYPE_ID_CODES]
import { assignStableLineItemNumbers, reassignLineItemNumbers } from "@/lib/mediaplan/lineItemOrder"
import {
  aggregateInvestmentDisplayRows,
  type InvestmentBurstInput,
} from "@/lib/billing/prorateInvestmentDisplay"
import { resolveBillingBurstLineItemId } from "@/lib/billing/resolveBillingBurstLineItemId"
import type { BillingBurst } from "@/lib/billing/types"
import type { LineItem } from "@/lib/generateMediaPlan"
import { defaultMediaBurstStartDate, defaultMediaBurstEndDate } from "@/lib/date-picker-anchor"
import { coerceBurstDateLocal } from "@/lib/mediaplan/burstDate"
import { buildWeeklyGanttColumnsFromCampaign } from "@/lib/utils/weeklyGanttColumns"
import {
  coerceBuyTypeWithDevWarn,
  computeDeliverableFromMedia,
  computeLoadedDeliverables,
  roundDeliverables,
} from "@/lib/mediaplan/deliverableBudget"
import {
  appendBurst,
  duplicateBurst,
  removeBurst,
  newBurstReactKey,
  stampBurstReactKeys,
} from "@/lib/mediaplan/burstOperations"

export type MediaChannelContainerHookProps = {
  clientId: string
  feePct: number
  onTotalMediaChange: (totalMedia: number, totalFee: number) => void
  onBurstsChange: (bursts: BillingBurst[]) => void
  onInvestmentChange: (investmentByMonth: any) => void
  onLineItemsChange: (items: LineItem[]) => void
  onMediaLineItemsChange: (lineItems: any[]) => void
  campaignStartDate: Date
  campaignEndDate: Date
  campaignBudget: number
  campaignId: string
  mediaTypes: string[]
  initialLineItems?: any[]
}

interface Publisher {
  id: number
  publisher_name: string
}

const formatDateString = (d?: Date | string): string => {
  if (!d) return ""

  const dateObj = d instanceof Date ? d : new Date(d)

  if (isNaN(dateObj.getTime())) {
    if (d instanceof Date && isNaN(d.getTime())) return ""
    return ""
  }

  const year = dateObj.getFullYear()
  const month = (dateObj.getMonth() + 1).toString().padStart(2, "0")
  const day = dateObj.getDate().toString().padStart(2, "0")

  return `${year}-${month}-${day}`
}

/** Billing bursts from form line items — used by debounce + Excel effects. */
export function getChannelBursts(
  form: UseFormReturn<any>,
  feePct: number,
  mbaNumber: string | undefined,
  mediaTypeIdCode: MediaCode,
  billingMediaTypeLabel: string,
  fieldKey: string,
): BillingBurst[] {
  const lineItems = form.getValues(fieldKey) || []

  return lineItems.flatMap((li: any, liIndex: number) =>
    (li.bursts || []).map((burst: any) => {
      const rawBudget = parseFloat(String(burst.budget ?? "").replace(/[^0-9.]/g, "")) || 0
      const pct = feePct || 0

      const { mediaAmount, deliveryMediaAmount, feeAmount } = computeBurstAmounts({
        rawBudget,
        budgetIncludesFees: !!li.budgetIncludesFees,
        clientPaysForMedia: !!li.clientPaysForMedia,
        feePct: pct,
      })

      return {
        startDate: burst.startDate,
        endDate: burst.endDate,
        mediaAmount,
        deliveryMediaAmount,
        feeAmount,
        totalAmount: mediaAmount + feeAmount,
        mediaType: billingMediaTypeLabel,
        feePercentage: pct,
        clientPaysForMedia: li.clientPaysForMedia,
        budgetIncludesFees: li.budgetIncludesFees,
        deliverables: burst.calculatedValue ?? 0,
        buyType: li.buyType,
        noAdserving: li.noadserving,
        lineItemId: resolveBillingBurstLineItemId(
          li,
          mbaNumber,
          mediaTypeIdCode,
          liIndex,
        ),
      }
    }),
  )
}

export function calculateChannelInvestmentPerMonth(
  form: UseFormReturn<any>,
  feePct: number,
  fieldKey: string,
) {
  const items = form.getValues(fieldKey) || []
  const bursts: InvestmentBurstInput[] = []
  items.forEach((lineItem: any) => {
    ;(lineItem.bursts || []).forEach((burst: any) => {
      const lineMedia = parseFloat(String(burst.budget).replace(/[^0-9.]/g, "")) || 0
      const pct = feePct || 0
      const totalInvestment = lineMedia + (lineMedia / (100 - pct)) * pct
      bursts.push({ amount: totalInvestment, start: burst.startDate, end: burst.endDate })
    })
  })
  return aggregateInvestmentDisplayRows(bursts)
}

export function useMediaChannelContainer(
  config: ContainerChannelConfig,
  props: MediaChannelContainerHookProps,
) {
  const {
    clientId,
    feePct,
    onTotalMediaChange,
    onBurstsChange,
    onInvestmentChange,
    onLineItemsChange,
    onMediaLineItemsChange,
    campaignStartDate,
    campaignEndDate,
    initialLineItems,
  } = props

  // All channel containers use the same RHF root key today.
  const fieldKey = "lineItems"
  const mediaTypeIdCode = config.mediaTypeIdCode as MediaCode
  const billingLabel = config.billingMediaTypeLabel

  const prevInvestmentRef = useRef<{ monthYear: string; amount: string }[]>([])
  const prevBurstsRef = useRef<BillingBurst[]>([])
  const publishersRef = useRef<Publisher[]>([])

  const [publishers, setPublishers] = useState<Publisher[]>([])
  // Options fetch must not block the line-item body; publishers populate async.
  const [isLoading, setIsLoading] = useState(false)
  const { toast } = useToast()
  const { mbaNumber } = useMediaPlanContext()
  const [overallDeliverables, setOverallDeliverables] = useState(0)
  const form = useForm<any>({
    defaultValues: {
      [fieldKey]: [
        {
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
            },
          ],
          totalMedia: 0,
          totalDeliverables: 0,
          totalFee: 0,
        },
      ],
      overallDeliverables: 0,
    },
  } as any)

  const {
    fields: lineItemFields,
    append: appendLineItem,
    remove: removeLineItemBase,
  } = useFieldArray({
    control: form.control,
    name: fieldKey as any,
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

  const collapseAllLineItems = useCallback(() => {
    const items = form.getValues(fieldKey) || []
    setCollapsedLineItems(new Set(items.map((_: unknown, i: number) => i)))
  }, [form, fieldKey])

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
    [removeLineItemBase],
  )

  const standardBaselineRef = useRef("")
  const mediaLineItemsPublishFpRef = useRef("")
  const [expertRows, setExpertRows] = useState<any[]>([])
  const [expertModalOpen, setExpertModalOpen] = useState(false)
  const [expertApplyPendingPageSave, setExpertApplyPendingPageSave] = useState(false)
  useEffect(() => {
    return subscribeMediaPlanPageSaved(() => setExpertApplyPendingPageSave(false))
  }, [])

  const [expertExitConfirmOpen, setExpertExitConfirmOpen] = useState(false)
  const [expertSegmentAttention, setExpertSegmentAttention] = useState(true)
  const expertRowsBaselineRef = useRef("")
  const reorderedRef = useRef(false)
  const expertModalOpenRef = useRef(false)
  expertModalOpenRef.current = expertModalOpen

  const expertWeekColumns = useMemo(
    () => buildWeeklyGanttColumnsFromCampaign(campaignStartDate, campaignEndDate),
    [campaignStartDate, campaignEndDate],
  )

  useLayoutEffect(() => {
    if (!config.serializeStandardBaseline) return
    standardBaselineRef.current = config.serializeStandardBaseline(
      form.getValues(fieldKey) || [],
    )
  }, [form, config, fieldKey])

  useEffect(() => {
    const id = window.setTimeout(() => setExpertSegmentAttention(false), 2800)
    return () => window.clearTimeout(id)
  }, [])

  const handleExpertRowsChange = useCallback((next: any[]) => {
    setExpertRows(next)
  }, [])

  const openExpertModal = useCallback(() => {
    if (!config.toExpert || !config.createEmptyExpertRow || !config.serializeExpertBaseline) {
      return
    }
    const mapped = config.toExpert(
      form.getValues(fieldKey) || [],
      expertWeekColumns,
      campaignStartDate,
      campaignEndDate,
    )
    const weekKeys = expertWeekColumns.map((c) => c.weekKey)
    const rows =
      mapped.length > 0
        ? mapped
        : [
            config.createEmptyExpertRow(
              typeof crypto !== "undefined" && crypto.randomUUID
                ? crypto.randomUUID()
                : `${config.mediaTypeIdCode}-expert-${Date.now()}`,
              campaignStartDate,
              campaignEndDate,
              weekKeys,
            ),
          ]
    expertRowsBaselineRef.current = config.serializeExpertBaseline(rows)
    setExpertRows(rows)
    setExpertExitConfirmOpen(false)
    setExpertModalOpen(true)
  }, [
    campaignStartDate,
    campaignEndDate,
    config,
    expertWeekColumns,
    fieldKey,
    form,
  ])

  const dismissExpertExitConfirm = useCallback(() => {
    setExpertExitConfirmOpen(false)
  }, [])

  const confirmExpertExitWithoutSaving = useCallback(() => {
    setExpertExitConfirmOpen(false)
    collapseAllLineItems()
    setExpertModalOpen(false)
  }, [collapseAllLineItems])

  const handleModalOpenChange = useCallback(
    (open: boolean) => {
      if (open) {
        setExpertModalOpen(true)
        return
      }
      if (!config.serializeExpertBaseline) {
        collapseAllLineItems()
        setExpertModalOpen(false)
        return
      }
      const dirty =
        config.serializeExpertBaseline(expertRows) !== expertRowsBaselineRef.current
      if (!dirty) {
        collapseAllLineItems()
        setExpertModalOpen(false)
        return
      }
      setExpertExitConfirmOpen(true)
    },
    [collapseAllLineItems, config, expertRows],
  )

  const handleExpertApply = useCallback(() => {
    if (!config.fromExpert || !config.mergeFromExpert || !config.serializeStandardBaseline) {
      return
    }
    const prevLineItems = form.getValues(fieldKey) || []
    const feeOpts: Record<string, unknown> = {
      budgetIncludesFees: Boolean(prevLineItems[0]?.budgetIncludesFees),
    }
    if (config.expertFromFeeKey) {
      feeOpts[config.expertFromFeeKey] = feePct
    }
    const standard = config.fromExpert(
      expertRows,
      expertWeekColumns,
      campaignStartDate,
      campaignEndDate,
      feeOpts,
    )
    const merged = config.mergeFromExpert(standard, prevLineItems)
    const orderedForApply = reorderedRef.current
      ? reassignLineItemNumbers(merged, mbaNumber, mediaTypeIdCode)
      : merged
    reorderedRef.current = false
    const keyedMerged = stampBurstReactKeys(orderedForApply)
    const clearedOverride = expertApplyClearedAdServingOverride(
      prevLineItems as any,
      keyedMerged as any,
    )
    form.setValue(fieldKey, keyedMerged, {
      shouldDirty: true,
      shouldValidate: false,
    })
    if (clearedOverride) {
      toast({
        title: "Ad serving overrides reset",
        description:
          "Applying expert mode reset per-burst ad serving overrides on this channel to baseline. Re-enter them on the affected bursts if needed.",
      })
    }
    standardBaselineRef.current = config.serializeStandardBaseline(
      form.getValues(fieldKey) || [],
    )
    setExpertExitConfirmOpen(false)
    collapseAllLineItems()
    setExpertApplyPendingPageSave(true)
    setExpertModalOpen(false)
  }, [
    campaignStartDate,
    campaignEndDate,
    collapseAllLineItems,
    config,
    expertRows,
    expertWeekColumns,
    feePct,
    fieldKey,
    form,
    mbaNumber,
    mediaTypeIdCode,
    toast,
  ])

  const handleDuplicateLineItem = useCallback(
    (lineItemIndex: number) => {
      const items = form.getValues(fieldKey) || []
      const source = items[lineItemIndex]

      if (!source) {
        toast({
          title: "No line item to duplicate",
          description: "Cannot duplicate a missing line item.",
          variant: "destructive",
        })
        return
      }

      const clone = {
        ...source,
        bursts: (source.bursts || []).map((burst: any) => ({
          ...burst,
          startDate: coerceBurstDateLocal(burst?.startDate) ?? new Date(),
          endDate: coerceBurstDateLocal(burst?.endDate) ?? new Date(),
          calculatedValue: burst?.calculatedValue ?? 0,
          fee: burst?.fee ?? 0,
          _reactKey: newBurstReactKey(),
        })),
      }

      appendLineItem(clone)
    },
    [appendLineItem, fieldKey, form, toast],
  )

  const watchedLineItems = useWatch({
    control: form.control,
    name: fieldKey as any,
    defaultValue: form.getValues(fieldKey),
  })

  useStableHydration(
    initialLineItems,
    (items) => {
      const transformedLineItems = items.map((item: any) => {
        const parsedBursts = resolveLineItemBursts(item)
        return {
          ...mapHydrationToForm(config.fieldMap, item),
          line_item: item.line_item ?? item.lineItem,
          lineItem: item.lineItem ?? item.line_item,
          line_item_id: item.line_item_id || item.lineItemId,
          lineItemId: item.line_item_id || item.lineItemId,
          bursts:
            parsedBursts.length > 0
              ? parsedBursts.map((burst: any) => ({
                  budget: burst.budget || "",
                  buyAmount: burst.buyAmount || "",
                  startDate:
                    coerceBurstDateLocal(burst.startDate) ??
                    (campaignStartDate || new Date()),
                  endDate:
                    coerceBurstDateLocal(burst.endDate) ??
                    (campaignEndDate || new Date()),
                  calculatedValue: computeLoadedDeliverables(
                    item.buy_type || item.buyType || "",
                    burst,
                    Boolean(item.budget_includes_fees || item.budgetIncludesFees),
                    feePct ?? 0,
                  ),
                  fee: burst.fee || 0,
                  adServingRatePct: burst.adServingRatePct,
                  adServingImpressions: burst.adServingImpressions,
                }))
              : [
                  {
                    budget: "",
                    buyAmount: "",
                    startDate: defaultMediaBurstStartDate(campaignStartDate, campaignEndDate),
                    endDate: defaultMediaBurstEndDate(campaignStartDate, campaignEndDate),
                    calculatedValue: 0,
                    fee: 0,
                  },
                ],
          totalMedia: item.total_media || 0,
          totalDeliverables: item.total_deliverables || 0,
          totalFee: item.total_fee || 0,
        }
      })

      form.reset({
        [fieldKey]: stampBurstReactKeys(transformedLineItems),
        overallDeliverables: 0,
      })
      // Display-only: first paint is header rows. Form values remain in RHF
      // via reset/getValues — collapse does not affect save, totals, or billing.
      setCollapsedLineItems(allCollapsedIndices(transformedLineItems.length))
    },
    expertModalOpenRef,
  )

  useEffect(() => {
    const formLineItems = form.getValues(fieldKey) || []
    const stableItems = assignStableLineItemNumbers<any>(
      formLineItems,
      mbaNumber,
      mediaTypeIdCode,
    )

    const transformedLineItems = stableItems.map((lineItem) => {
      let totalMedia = 0
      lineItem.bursts.forEach((burst: any) => {
        const budget = parseFloat(String(burst.budget).replace(/[^0-9.]/g, "")) || 0
        if (lineItem.budgetIncludesFees) {
          const pct = feePct || 0
          totalMedia += (budget * (100 - pct)) / 100
        } else {
          totalMedia += budget
        }
      })

      return {
        media_plan_version: 0,
        mba_number: mbaNumber || "",
        mp_client_name: "",
        mp_plannumber: "",
        ...mapFormToApi(config.fieldMap, lineItem),
        line_item_id: lineItem.line_item_id,
        bursts: lineItem.bursts,
        feePct: feePct || 0,
        line_item: lineItem.line_item,
        totalMedia: totalMedia,
      }
    })

    publishMediaLineItemsIfChanged(
      mediaLineItemsPublishFpRef,
      transformedLineItems,
      (items) => {
        startTransition(() => {
          onMediaLineItemsChange(items)
        })
      },
    )
  }, [
    watchedLineItems,
    mbaNumber,
    feePct,
    form,
    onMediaLineItemsChange,
    fieldKey,
    mediaTypeIdCode,
    config.fieldMap,
  ])

  const overallTotals = useMemo(() => {
    let overallMedia = 0
    let overallFee = 0
    let overallCost = 0

    const lineItemTotals = (watchedLineItems || []).map((lineItem: any, index: number) => {
      let lineMedia = 0
      let lineDeliverables = 0
      let lineFee = 0
      let lineCost = 0
      const summaryBursts: InvestmentBurstInput[] = []

      ;(lineItem.bursts || []).forEach((burst: any) => {
        const budget = parseFloat(String(burst.budget).replace(/[^0-9.]/g, "")) || 0
        let burstMedia = 0
        let burstFee = 0
        if (lineItem.budgetIncludesFees) {
          const pct = feePct || 0
          burstMedia = (budget * (100 - pct)) / 100
          burstFee = (budget * pct) / 100
        } else {
          burstMedia = budget
          burstFee = feePct ? (budget / (100 - feePct)) * feePct : 0
        }
        lineMedia += burstMedia
        lineFee += burstFee
        lineDeliverables += burst.calculatedValue || 0
        summaryBursts.push({
          amount: burstMedia + burstFee,
          start: burst.startDate,
          end: burst.endDate,
        })
      })

      lineCost = lineMedia + lineFee

      overallMedia += lineMedia
      overallFee += lineFee
      overallCost += lineCost

      const dimensions: Record<string, string> = {}
      for (const [label, camel] of Object.entries(config.summaryDimensions)) {
        dimensions[label] = lineItem[camel] || ""
      }

      return {
        index: index + 1,
        deliverables: lineDeliverables,
        media: lineMedia,
        fee: lineFee,
        totalCost: lineCost,
        buyType: lineItem.buyType || "",
        dimensions,
        bursts: summaryBursts,
      }
    })

    return { lineItemTotals, overallMedia, overallFee, overallCost }
  }, [watchedLineItems, feePct, config.summaryDimensions])

  const handleLineItemValueChange = useCallback(
    (_lineItemIndex: number) => {
      const lineItems = form.getValues(fieldKey) || []
      let overallMedia = 0
      let overallFee = 0
      let overallCost = 0
      let overallDeliverableCount = 0

      lineItems.forEach((lineItem: any) => {
        let lineMedia = 0
        let lineFee = 0
        let lineDeliverables = 0

        ;(lineItem.bursts || []).forEach((burst: any) => {
          const budget = parseFloat(burst?.budget?.replace(/[^0-9.]/g, "") || "0")
          if (lineItem.budgetIncludesFees) {
            const pct = feePct || 0
            lineMedia += (budget * (100 - pct)) / 100
            lineFee += (budget * pct) / 100
          } else {
            lineMedia += budget
            const fee = feePct ? (budget / (100 - feePct)) * feePct : 0
            lineFee += fee
          }
          lineDeliverables += burst?.calculatedValue || 0
        })

        overallMedia += lineMedia
        overallFee += lineFee
        overallCost += lineMedia + lineFee
        overallDeliverableCount += lineDeliverables
      })

      setOverallDeliverables(overallDeliverableCount)
      onTotalMediaChange(overallMedia, overallFee)
    },
    [form, feePct, onTotalMediaChange, fieldKey],
  )

  const handleBuyTypeChange = useCallback(
    (lineItemIndex: number, value: string) => {
      form.setValue(`${fieldKey}.${lineItemIndex}.buyType`, value)

      if (value === "bonus" || value === "package_inclusions") {
        const currentBursts = form.getValues(`${fieldKey}.${lineItemIndex}.bursts`) || []
        const zeroedBursts = currentBursts.map((burst: any) => ({
          ...burst,
          budget: "0",
          buyAmount: "0",
          calculatedValue: burst.calculatedValue ?? 0,
        }))

        form.setValue(`${fieldKey}.${lineItemIndex}.bursts`, zeroedBursts, {
          shouldDirty: true,
        })
      }

      handleLineItemValueChange(lineItemIndex)
    },
    [form, handleLineItemValueChange, fieldKey],
  )

  const handleValueChange = useCallback(
    (lineItemIndex: number, burstIndex: number, budgetIncludesFeesOverride?: boolean) => {
      const burst = form.getValues(`${fieldKey}.${lineItemIndex}.bursts.${burstIndex}`)
      const lineItem = form.getValues(`${fieldKey}.${lineItemIndex}`)
      const rawBudget = parseFloat(burst?.budget?.replace(/[^0-9.]/g, "") || "0")
      const budgetIncludesFees =
        budgetIncludesFeesOverride ?? Boolean(lineItem?.budgetIncludesFees)
      const buyAmount = parseFloat(burst?.buyAmount?.replace(/[^0-9.]/g, "") || "1")
      const buyTypeRaw = form.getValues(`${fieldKey}.${lineItemIndex}.buyType`)

      const buyTypeLower = String(buyTypeRaw || "").toLowerCase()
      if (
        buyTypeLower === "bonus" ||
        buyTypeLower === "package_inclusions" ||
        buyTypeLower === "package"
      ) {
        return
      }

      const bt = coerceBuyTypeWithDevWarn(
        String(buyTypeRaw || ""),
        `${config.mediaTypeString}.handleValueChange`,
      )
      const rawCalculated = computeDeliverableFromMedia({
        buyType: bt,
        rawBudget,
        buyAmount,
        budgetIncludesFees,
        feePct: feePct || 0,
      })
      const calculatedValue =
        config.deliverableRoundingPolicy === "rounded"
          ? roundDeliverables(bt, rawCalculated)
          : rawCalculated

      const currentValue = form.getValues(
        `${fieldKey}.${lineItemIndex}.bursts.${burstIndex}.calculatedValue`,
      )
      if (currentValue !== calculatedValue && !isNaN(calculatedValue)) {
        form.setValue(
          `${fieldKey}.${lineItemIndex}.bursts.${burstIndex}.calculatedValue`,
          calculatedValue,
          {
            shouldValidate: false,
            shouldDirty: false,
          },
        )

        handleLineItemValueChange(lineItemIndex)
      }
    },
    [feePct, form, handleLineItemValueChange, fieldKey, config],
  )

  const handleAppendBurst = useCallback(
    (lineItemIndex: number) => {
      appendBurst({
        form,
        fieldKey,
        lineItemIndex,
        campaignStartDate,
        campaignEndDate,
        onAfter: handleLineItemValueChange,
        toast: toast as Parameters<typeof appendBurst>[0]["toast"],
      })
    },
    [form, handleLineItemValueChange, toast, campaignStartDate, campaignEndDate, fieldKey],
  )

  const handleDuplicateBurst = useCallback(
    (lineItemIndex: number) => {
      duplicateBurst({
        form,
        fieldKey,
        lineItemIndex,
        onAfter: handleLineItemValueChange,
        toast: toast as Parameters<typeof duplicateBurst>[0]["toast"],
      })
    },
    [form, handleLineItemValueChange, toast, fieldKey],
  )

  const handleRemoveBurst = useCallback(
    (lineItemIndex: number, burstIndex: number) => {
      removeBurst({
        form,
        fieldKey,
        lineItemIndex,
        burstIndex,
        onAfter: handleLineItemValueChange,
        toast: toast as Parameters<typeof removeBurst>[0]["toast"],
      })
    },
    [form, handleLineItemValueChange, toast, fieldKey],
  )

  const getDeliverablesLabel = useCallback((buyType: string) => {
    if (!buyType) return "Deliverables"

    switch (buyType.toLowerCase()) {
      case "cpc":
        return "Clicks"
      case "cpv":
        return "Views"
      case "cpm":
        return "Impressions"
      case "fixed_cost":
        return "Fixed Fee"
      default:
        return "Deliverables"
    }
  }, [])

  useEffect(() => {
    const fetchPublishers = async () => {
      try {
        if (publishersRef.current.length > 0) {
          setPublishers(publishersRef.current)
          setIsLoading(false)
          return
        }

        if (!config.fetchPublishers) {
          setPublishers([])
          setIsLoading(false)
          return
        }

        const fetchedPublishers = await config.fetchPublishers()
        publishersRef.current = fetchedPublishers
        setPublishers(fetchedPublishers)
      } catch (error: any) {
        toast({
          title: "Error loading publishers",
          description: error.message,
          variant: "destructive",
        })
      } finally {
        setIsLoading(false)
      }
    }

    fetchPublishers()
  }, [clientId, toast, config])

  useEffect(() => {
    startTransition(() => {
      onTotalMediaChange(overallTotals.overallMedia, overallTotals.overallFee)
    })
  }, [overallTotals.overallFee, overallTotals.overallMedia, onTotalMediaChange])

  useEffect(() => {
    const calculatedBursts = getChannelBursts(
      form,
      feePct || 0,
      mbaNumber,
      mediaTypeIdCode,
      billingLabel,
      fieldKey,
    )
    let burstIndex = 0

    const items: LineItem[] = (form.getValues(fieldKey) || []).flatMap(
      (lineItem: any, lineItemIndex: number) =>
        (lineItem.bursts || []).map((burst: any) => {
          const computedBurst = calculatedBursts[burstIndex++]
          const mediaAmount = computedBurst
            ? computedBurst.mediaAmount
            : parseFloat(String(burst.budget).replace(/[^0-9.-]+/g, "")) || 0
          const lineItemId = buildLineItemId(mbaNumber, mediaTypeIdCode, lineItemIndex + 1)
          const recomputedDeliverable = computeDeliverableFromMedia({
            buyType: lineItem.buyType as Parameters<
              typeof computeDeliverableFromMedia
            >[0]["buyType"],
            rawBudget: parseFloat(String(burst.budget).replace(/[^0-9.-]+/g, "")) || 0,
            buyAmount:
              parseFloat(String(burst.buyAmount ?? burst.budget).replace(/[^0-9.-]+/g, "")) ||
              0,
            budgetIncludesFees: !!lineItem.budgetIncludesFees,
            feePct: feePct || 0,
          })
          const deliverableForExcel = Number.isNaN(recomputedDeliverable)
            ? (burst.calculatedValue ?? 0)
            : recomputedDeliverable

          return {
            market: lineItem.market,
            platform: lineItem.platform,
            bidStrategy: lineItem.bidStrategy,
            targeting: lineItem.creativeTargeting,
            creative: lineItem.creative,
            startDate: formatDateString(burst.startDate),
            endDate: formatDateString(burst.endDate),
            deliverables: deliverableForExcel,
            buyingDemo: lineItem.buyingDemo,
            buyType: lineItem.buyType,
            deliverablesAmount: burst.budget,
            grossMedia: String(mediaAmount),
            clientPaysForMedia: lineItem.clientPaysForMedia ?? false,
            line_item_id: lineItemId,
            lineItemId,
            line_item: lineItemIndex + 1,
            buyAmount: burst.buyAmount ?? burst.budget,
          }
        }),
    )

    startTransition(() => {
      onLineItemsChange(items)
    })
  }, [
    watchedLineItems,
    feePct,
    form,
    mbaNumber,
    onLineItemsChange,
    fieldKey,
    mediaTypeIdCode,
    billingLabel,
  ])

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      const investmentByMonth = calculateChannelInvestmentPerMonth(form, feePct || 0, fieldKey)
      const bursts = getChannelBursts(
        form,
        feePct || 0,
        mbaNumber,
        mediaTypeIdCode,
        billingLabel,
        fieldKey,
      )

      const hasInvestmentChanges =
        JSON.stringify(investmentByMonth) !== JSON.stringify(prevInvestmentRef.current)
      const hasBurstChanges = JSON.stringify(bursts) !== JSON.stringify(prevBurstsRef.current)

      if (hasInvestmentChanges) {
        onInvestmentChange(investmentByMonth)
        prevInvestmentRef.current = investmentByMonth
      }

      if (hasBurstChanges) {
        onBurstsChange(bursts)
        prevBurstsRef.current = bursts

        let totalMedia = 0
        let totalFee = 0

        bursts.forEach((burst) => {
          totalMedia += burst.mediaAmount
          totalFee += burst.feeAmount
        })
        void totalMedia
        void totalFee
      }
    }, 300)

    return () => clearTimeout(timeoutId)
  }, [
    watchedLineItems,
    feePct,
    form,
    onBurstsChange,
    onInvestmentChange,
    fieldKey,
    mbaNumber,
    mediaTypeIdCode,
    billingLabel,
  ])

  // Dead parity helper (kept from ProgDisplayContainer).
  const getBursts = () => {
    const formLineItems = form.getValues(fieldKey) || []
    return formLineItems.flatMap((item: any) =>
      (item.bursts || []).map((burst: any) => {
        const budget = parseFloat(burst.budget?.replace(/[^0-9.]/g, "") || "0")
        let mediaAmount = 0
        let feeAmount = 0

        if (item.budgetIncludesFees && item.clientPaysForMedia) {
          feeAmount = budget * ((feePct || 0) / 100)
          mediaAmount = 0
        } else if (item.budgetIncludesFees) {
          const pct = feePct || 0
          mediaAmount = (budget * (100 - pct)) / 100
          feeAmount = (budget * pct) / 100
        } else if (item.clientPaysForMedia) {
          feeAmount = (budget / (100 - (feePct || 0))) * (feePct || 0)
          mediaAmount = 0
        } else {
          mediaAmount = budget
          feeAmount = (budget * (feePct || 0)) / 100
        }

        const billingBurst: BillingBurst = {
          startDate: burst.startDate,
          endDate: burst.endDate,
          mediaAmount: mediaAmount,
          feeAmount: feeAmount,
          totalAmount: mediaAmount + feeAmount,
          mediaType: billingLabel,
          feePercentage: feePct,
          clientPaysForMedia: item.clientPaysForMedia,
          budgetIncludesFees: item.budgetIncludesFees,
          noAdserving: item.noadserving,
          deliverables: burst.calculatedValue ?? 0,
          buyType: item.buyType,
          adServingRatePct: burst.adServingRatePct,
          adServingImpressions: burst.adServingImpressions,
        }

        return billingBurst
      }),
    )
  }

  return {
    form,
    lineItemFields,
    appendLineItem,
    removeLineItem,
    collapsedLineItems,
    toggleLineItemCollapsed,
    collapseAllLineItems,
    expertModalOpen,
    expertExitConfirmOpen,
    expertRows,
    expertWeekColumns,
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
    toast,
    mbaNumber,
    reorderedRef,
    feePct,
    overallDeliverables,
    getBursts,
    fieldKey,
    config,
  }
}
