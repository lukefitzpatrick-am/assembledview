"use client"

import { publishMediaLineItemsIfChanged } from "@/lib/mediaplan/publishMediaLineItems"
import { coerceBurstDateLocal } from '@/lib/mediaplan/burstDate'

import { subscribeMediaPlanPageSaved } from "@/lib/mediaplan/expertApplyDirtyBridge"
import { ContainerEmptyLinesPlaceholder } from "@/components/media-containers/ContainerEmptyLinesPlaceholder"
import { ExpertIncompleteRowsSummary } from "@/components/media-containers/ExpertIncompleteRowsSummary"
import { MediaContainerLoadState } from "@/components/media-containers/MediaContainerLoadState"
import {
  writeContainerEntryMode,
} from "@/lib/mediaplan/containerEntryMode"

import { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } from "react"
import { useStableHydration } from "@/hooks/useStableHydration"
import { useForm, useFieldArray, UseFormReturn } from "react-hook-form"
import { useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import {
  influencersFormSchema,
  type InfluencersFormValues,
} from "@/lib/mediaplan/schemas"
import { Badge } from "@/components/ui/badge"
import { ExpertCard } from "@/components/media-containers/ExpertCard"
import { INFLUENCERS_EXPERT_CHANNEL_CONFIG } from "@/lib/mediaplan/expertGridChannelConfig"
import {
  INFLUENCERS_CONTAINER_CONFIG,
  buildDefaultLineItem,
  mapHydrationToForm,
  mapFormToApi,
} from "@/lib/mediaplan/containerChannelConfig"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ComboboxModalProvider } from "@/components/ui/combobox"
import { Form } from "@/components/ui/form"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useToast } from "@/components/ui/use-toast"
import { computeBurstAmounts } from "@/lib/mediaplan/burstAmounts"
import { appendBurst, duplicateBurst, removeBurst, newBurstReactKey, stampBurstReactKeys } from "@/lib/mediaplan/burstOperations"
import { resolveLineItemBursts } from "@/lib/mediaplan/deriveBursts"
import { getPublishersForInfluencers, getClientInfo } from "@/lib/api"
import { format } from "date-fns"
import { useMediaPlanContext } from "@/contexts/MediaPlanContext"
import { cn } from "@/lib/utils"
import { Copy, Plus, Trash2 } from "lucide-react"
import type { BillingBurst, BillingMonth } from "@/lib/billing/types"; // ad
import {
  aggregateInvestmentDisplayRows,
  type InvestmentBurstInput,
} from "@/lib/billing/prorateInvestmentDisplay"
import type { LineItem } from '@/lib/generateMediaPlan'
import { formatMoney } from "@/lib/format/money"
import { MEDIA_TYPE_ID_CODES, buildLineItemId } from "@/lib/mediaplan/lineItemIds"
import { assignStableLineItemNumbers, reassignLineItemNumbers } from "@/lib/mediaplan/lineItemOrder"
import {
  getMediaTypeThemeHex,
  mediaTypeAccentTextStyle,
  mediaTypeLineItemBadgeStyle,
  mediaTypeSummaryStripeStyle,
  mediaTypeTotalsRowStyle,
  rgbaFromHex,
} from "@/lib/mediaplan/mediaTypeAccents"
import {
  InfluencersExpertGrid,
  createEmptyInfluencersExpertRow,
} from "@/components/media-containers/InfluencersExpertGrid"
import type { InfluencersExpertScheduleRow } from "@/lib/mediaplan/expertModeWeeklySchedule"
import {
  mapInfluencersExpertRowsToStandardLineItems,
  mapStandardInfluencersLineItemsToExpertRows,
  type StandardInfluencersFormLineItem,
} from "@/lib/mediaplan/expertChannelMappings"
import {
  mergeInfluencersStandardFromExpertWithPrevious,
  serializeInfluencersExpertRowsBaseline,
  serializeInfluencersStandardLineItemsBaseline,
} from "@/lib/mediaplan/expertModeSwitch"
import { buildWeeklyGanttColumnsFromCampaign } from "@/lib/utils/weeklyGanttColumns"
import {
  coerceBuyTypeWithDevWarn,
  computeDeliverableFromMedia,
  computeLoadedDeliverables,
} from "@/lib/mediaplan/deliverableBudget"
import { defaultMediaBurstStartDate, defaultMediaBurstEndDate } from "@/lib/date-picker-anchor"
import MediaContainerTimelineCollapsible from "@/components/media-containers/MediaContainerTimelineCollapsible"
import MediaContainerSummarySection from "@/components/media-containers/MediaContainerSummarySection"

const MEDIA_ACCENT_HEX = getMediaTypeThemeHex("influencers")

// Format Dates
const formatDateString = (d?: Date | string): string => {
  if (!d) return '';

  // Ensure we have a valid Date object.
  // If d is already a 'YYYY-MM-DD' string, new Date(d) will parse it as UTC midnight.
  // If d is a Date object from the calendar, it's typically local.
  // We want to work with the components of the date as the user sees it locally.
  const dateObj = d instanceof Date ? d : new Date(d);

  if (isNaN(dateObj.getTime())) {
    // Handle cases where 'd' might be an invalid date string after new Date(d)
    // For example, if new Date('invalid-date-string') was passed.
    // Check if 'd' itself was the Date object that was invalid.
    if (d instanceof Date && isNaN(d.getTime())) return '';
    // If 'd' was a string that resulted in an invalid date, also return empty.
    // This check might be redundant if the source 'd' is always a valid Date object or undefined.
    return '';
  }

  // Get year, month, and day based on the local representation of dateObj
  const year = dateObj.getFullYear();
  const month = (dateObj.getMonth() + 1).toString().padStart(2, '0'); // getMonth() is 0-indexed
  const day = dateObj.getDate().toString().padStart(2, '0');
  
  return `${year}-${month}-${day}`;
};

// Exported utility function to get bursts

interface Publisher {
  id: number
  publisher_name: string
}

interface InfluencersContainerProps {
  clientId: string;
  feeinfluencers: number;
  onTotalMediaChange: (totalMedia: number, totalFee: number) => void;
  onBurstsChange: (bursts: BillingBurst[]) => void;
  onInvestmentChange: (investmentByMonth: any) => void;
  onLineItemsChange: (items: LineItem[]) => void;
  onMediaLineItemsChange: (lineItems: any[]) => void;
  campaignStartDate: Date;
  campaignEndDate: Date;
  campaignBudget: number;
  campaignId: string;
  mediaTypes: string[];
  initialLineItems?: any[];
}

export function getInfluencersBursts(
  form: UseFormReturn<InfluencersFormValues>,
  feeinfluencers: number
): BillingBurst[] {
  const lineItems = form.getValues("lineItems") || []

  return lineItems.flatMap(li =>
    li.bursts.map(burst => {
      const rawBudget = parseFloat(burst.budget.replace(/[^0-9.]/g, "")) || 0

      const pct = feeinfluencers || 0

      const { mediaAmount, deliveryMediaAmount, feeAmount } = computeBurstAmounts({
        rawBudget,
        budgetIncludesFees: !!li.budgetIncludesFees,
        clientPaysForMedia: !!li.clientPaysForMedia,
        feePct: pct,
      })
      
      return {
        startDate: burst.startDate,
        endDate:   burst.endDate,
        
        mediaAmount,
        deliveryMediaAmount,
        feeAmount,
        totalAmount: mediaAmount + feeAmount,

        mediaType:          "influencers",
        feePercentage:      pct,
        clientPaysForMedia: li.clientPaysForMedia,
        budgetIncludesFees: li.budgetIncludesFees,
        noAdserving: false,
        deliverables: 0,
        buyType: li.buyType,
              }
    })
  )
}

export function calculateInvestmentPerMonth(form, feeinfluencers) {
  const items = form.getValues("lineItems") || []
  const bursts: InvestmentBurstInput[] = []
  items.forEach((lineItem: any) => {
    (lineItem.bursts || []).forEach((burst: any) => {
      const lineMedia = parseFloat(String(burst.budget).replace(/[^0-9.]/g, "")) || 0
      const feePct = feeinfluencers || 0
      const totalInvestment = lineMedia + ((lineMedia / (100 - feePct)) * feePct)
      bursts.push({ amount: totalInvestment, start: burst.startDate, end: burst.endDate })
    })
  })
  return aggregateInvestmentDisplayRows(bursts)
}
export default function InfluencersContainer({
  clientId,
  feeinfluencers,
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
  initialLineItems
}: InfluencersContainerProps) {
  // Add refs to track previous values
  const prevInvestmentRef = useRef<{ monthYear: string; amount: string }[]>([]);
  const prevBurstsRef = useRef<BillingBurst[]>([]);
  const publishersRef = useRef<Publisher[]>([]);

  const [publishers, setPublishers] = useState<Publisher[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const { toast } = useToast()
  const { mbaNumber } = useMediaPlanContext()
  const [overallDeliverables, setOverallDeliverables] = useState(0);
  
  // Form initialization
  const form = useForm<InfluencersFormValues>({
    resolver: zodResolver<InfluencersFormValues, any, InfluencersFormValues>(influencersFormSchema),
    defaultValues: {
      lineItems: [
        {
          ...buildDefaultLineItem(INFLUENCERS_CONTAINER_CONFIG.fieldMap),
          bursts: [
            {
              budget: "",
              buyAmount: "",
              startDate: defaultMediaBurstStartDate(campaignStartDate, campaignEndDate),
              endDate: defaultMediaBurstEndDate(campaignStartDate, campaignEndDate),
              calculatedValue: 0,
              fee: 0,
              _reactKey: newBurstReactKey(),
            } as InfluencersFormValues["lineItems"][number]["bursts"][number] & { _reactKey: string },
          ],
          totalMedia: 0,
          totalDeliverables: 0,
          totalFee: 0,
        },
      ],
    },
  });

   // Field array hook
   const {
    fields: lineItemFields,
    append: appendLineItem,
    insert: insertLineItem,
    remove: removeLineItemBase,
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

  const collapseAllLineItems = useCallback(() => {
    const items = form.getValues("lineItems") || []
    setCollapsedLineItems(new Set(items.map((_, i) => i)))
  }, [form])

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

  const influencersStandardBaselineRef = useRef("")
  const [expertInfluencersRows, setExpertInfluencersRows] = useState<
    InfluencersExpertScheduleRow[]
  >([])
  const [influencersExpertModalOpen, setInfluencersExpertModalOpen] =
    useState(false)
  const [expertApplyPendingPageSave, setExpertApplyPendingPageSave] = useState(false)
  useEffect(() => {
    return subscribeMediaPlanPageSaved(() => setExpertApplyPendingPageSave(false))
  }, [])
  const mediaLineItemsPublishFpRef = useRef("")

  const [influencersExpertExitConfirmOpen, setInfluencersExpertExitConfirmOpen] =
    useState(false)
  const [expertSegmentAttention, setExpertSegmentAttention] = useState(true)
  const influencersExpertRowsBaselineRef = useRef("")
  const reorderedRef = useRef(false)
  const influencersExpertModalOpenRef = useRef(false)
  influencersExpertModalOpenRef.current = influencersExpertModalOpen

  const influencersExpertWeekColumns = useMemo(
    () => buildWeeklyGanttColumnsFromCampaign(campaignStartDate, campaignEndDate),
    [campaignStartDate, campaignEndDate]
  )

  useLayoutEffect(() => {
    influencersStandardBaselineRef.current =
      serializeInfluencersStandardLineItemsBaseline(form.getValues("lineItems"))
  }, [form])

  useEffect(() => {
    const id = window.setTimeout(() => setExpertSegmentAttention(false), 2800)
    return () => window.clearTimeout(id)
  }, [])

  const handleExpertInfluencersRowsChange = useCallback(
    (next: InfluencersExpertScheduleRow[]) => {
      setExpertInfluencersRows(next)
    },
    []
  )

  const openInfluencersExpertModal = useCallback(() => {
    const mapped = mapStandardInfluencersLineItemsToExpertRows(
      (form.getValues("lineItems") || []) as StandardInfluencersFormLineItem[],
      influencersExpertWeekColumns,
      campaignStartDate,
      campaignEndDate
    )
    const weekKeys = influencersExpertWeekColumns.map((c) => c.weekKey)
    const rows: InfluencersExpertScheduleRow[] =
      mapped.length > 0
        ? mapped
        : [
            createEmptyInfluencersExpertRow(
              typeof crypto !== "undefined" && crypto.randomUUID
                ? crypto.randomUUID()
                : `influencers-expert-${Date.now()}`,
              campaignStartDate,
              campaignEndDate,
              weekKeys
            ),
          ]
    influencersExpertRowsBaselineRef.current =
      serializeInfluencersExpertRowsBaseline(rows)
    setExpertInfluencersRows(rows)
    setInfluencersExpertExitConfirmOpen(false)
    setInfluencersExpertModalOpen(true)
  }, [campaignStartDate, campaignEndDate, form, influencersExpertWeekColumns])



  const dismissInfluencersExpertExitConfirm = useCallback(() => {
    setInfluencersExpertExitConfirmOpen(false)
  }, [])

  const confirmInfluencersExpertExitWithoutSaving = useCallback(() => {
    setInfluencersExpertExitConfirmOpen(false)
    collapseAllLineItems()
    setInfluencersExpertModalOpen(false)
  }, [collapseAllLineItems])

  const handleInfluencersExpertModalOpenChange = useCallback(
    (open: boolean) => {
      if (open) {
        setInfluencersExpertModalOpen(true)
        return
      }
      const dirty =
        serializeInfluencersExpertRowsBaseline(expertInfluencersRows) !==
        influencersExpertRowsBaselineRef.current
      if (!dirty) {
        collapseAllLineItems()
        setInfluencersExpertModalOpen(false)
        return
      }
      setInfluencersExpertExitConfirmOpen(true)
    },
    [collapseAllLineItems, expertInfluencersRows]
  )

  const handleInfluencersExpertApply = useCallback(() => {
    const prevLineItems = form.getValues("lineItems") || []
    const standard = mapInfluencersExpertRowsToStandardLineItems(
      expertInfluencersRows,
      influencersExpertWeekColumns,
      campaignStartDate,
      campaignEndDate,
      {
        feePctInfluencers: feeinfluencers,
        budgetIncludesFees: Boolean(prevLineItems[0]?.budgetIncludesFees),
      }
    )
    const merged = mergeInfluencersStandardFromExpertWithPrevious(
      standard,
      prevLineItems as StandardInfluencersFormLineItem[]
    )
    const orderedForApply = reorderedRef.current
      ? reassignLineItemNumbers(merged, mbaNumber, MEDIA_TYPE_ID_CODES.influencers)
      : merged
    reorderedRef.current = false
    const keyedMerged = stampBurstReactKeys(orderedForApply)
    form.setValue("lineItems", keyedMerged as InfluencersFormValues["lineItems"], {
      shouldDirty: true,
      shouldValidate: false,
    })
    influencersStandardBaselineRef.current =
      serializeInfluencersStandardLineItemsBaseline(form.getValues("lineItems"))
    setInfluencersExpertExitConfirmOpen(false)
    collapseAllLineItems()
    setExpertApplyPendingPageSave(true)
    setInfluencersExpertModalOpen(false)
  }, [
    campaignStartDate,
    campaignEndDate,
    collapseAllLineItems,
    expertInfluencersRows,
    feeinfluencers,
    form,
    influencersExpertWeekColumns,
  ])

  // Watch hook
  const watchedLineItems = useWatch({ 
    control: form.control, 
    name: "lineItems",
    defaultValue: form.getValues("lineItems")
  });

  // Data loading for edit mode
  useStableHydration(
    initialLineItems,
    (items) => {
      const transformedLineItems = items.map((item: any, idx: number) => {
        const parsedBursts = resolveLineItemBursts(item);
        return {
        ...mapHydrationToForm(INFLUENCERS_CONTAINER_CONFIG.fieldMap, item),
        lineItemId:
          item.line_item_id ||
          item.lineItemId ||
          buildLineItemId(mbaNumber, MEDIA_TYPE_ID_CODES.influencers, idx + 1),
        line_item_id:
          item.line_item_id ||
          item.lineItemId ||
          buildLineItemId(mbaNumber, MEDIA_TYPE_ID_CODES.influencers, idx + 1),
        line_item: item.line_item ?? item.lineItem ?? idx + 1,
        lineItem: item.lineItem ?? item.line_item ?? idx + 1,
        bursts: parsedBursts.length > 0 ? parsedBursts.map((burst: any) => ({
          budget: burst.budget || "",
          buyAmount: burst.buyAmount || "",
          startDate: coerceBurstDateLocal(burst.startDate) ?? new Date(),
          endDate: coerceBurstDateLocal(burst.endDate) ?? new Date(),
          calculatedValue: computeLoadedDeliverables(
            item.buy_type || item.buyType || "",
            burst,
            Boolean(item.budget_includes_fees || item.budgetIncludesFees),
            feeinfluencers ?? 0,
          ),
        })) : [{
          budget: "",
          buyAmount: "",
          startDate: defaultMediaBurstStartDate(campaignStartDate, campaignEndDate),
          endDate: defaultMediaBurstEndDate(campaignStartDate, campaignEndDate),
        }],
      };
      });

      form.reset({
        lineItems: stampBurstReactKeys(transformedLineItems),
        overallDeliverables: 0,
      });
    },
    influencersExpertModalOpenRef,
  )

  // Transform form data to API schema format
  useEffect(() => {
    const formLineItems = form.getValues('lineItems') || [];
    const stableInfluencersItems = assignStableLineItemNumbers<any>(
      formLineItems,
      mbaNumber,
      MEDIA_TYPE_ID_CODES.influencers,
    )
    
    const transformedLineItems = stableInfluencersItems.map((lineItem, index) => {
      const li = lineItem as { lineItemId?: string; line_item_id?: string }
      const lineItemId =
        li.line_item_id ||
        li.lineItemId ||
        buildLineItemId(mbaNumber, MEDIA_TYPE_ID_CODES.influencers, index + 1);
      // Calculate totalMedia from raw budget amounts (for display in MBA section)
      let totalMedia = 0;
      lineItem.bursts?.forEach((burst: any) => {
        const budget = parseFloat(burst.budget?.replace(/[^0-9.]/g, "") || "0") || 0;
        if (lineItem.budgetIncludesFees) {
          const pct = feeinfluencers || 0;
          totalMedia += (budget * (100 - pct)) / 100;
        } else {
          // Budget is net media
          totalMedia += budget;
        }
      });

      return {
        media_plan_version: 0,
        mba_number: mbaNumber || "",
        mp_client_name: "",
        mp_plannumber: "",
        ...mapFormToApi(INFLUENCERS_CONTAINER_CONFIG.fieldMap, lineItem),
        line_item_id: lineItemId,
        line_item: lineItem.line_item,
        bursts: lineItem.bursts || [],
        feePct: feeinfluencers || 0,
        totalMedia: totalMedia,
      };
    });

    publishMediaLineItemsIfChanged(mediaLineItemsPublishFpRef, transformedLineItems, onMediaLineItemsChange);
  }, [watchedLineItems, mbaNumber, feeinfluencers, form, onMediaLineItemsChange]);

  // Memoized calculations
  // Note: For display purposes, always show media amounts regardless of clientPaysForMedia
  // The billing schedule will handle excluding media when clientPaysForMedia is true
  const overallTotals = useMemo(() => {
    let overallMedia = 0;
    let overallFee = 0;
    let overallCost = 0;

    const lineItemTotals = watchedLineItems.map((lineItem, index) => {
      let lineMedia = 0;
      let lineFee = 0;
      let lineDeliverables = 0;
      let lineCost = 0;
      const summaryBursts: InvestmentBurstInput[] = [];

      lineItem.bursts.forEach((burst) => {
        const budget = parseFloat(burst.budget.replace(/[^0-9.]/g, "")) || 0;
        let burstMedia = 0;
        let burstFee = 0;
        // Always calculate media for display purposes (ignore clientPaysForMedia)
        if (lineItem.budgetIncludesFees) {
          const pct = feeinfluencers || 0;
          burstMedia = (budget * (100 - pct)) / 100;
          burstFee = (budget * pct) / 100;
        } else {
          // Budget is net media, fee calculated on top
          burstMedia = budget;
          burstFee = feeinfluencers ? (budget / (100 - feeinfluencers)) * feeinfluencers : 0;
        }
        lineMedia += burstMedia;
        lineFee += burstFee;
        lineDeliverables += burst.calculatedValue || 0;
        summaryBursts.push({
          amount: burstMedia + burstFee,
          start: burst.startDate,
          end: burst.endDate,
        });
      });

      lineCost = lineMedia + lineFee;

      overallMedia += lineMedia;
      overallFee += lineFee;
      overallCost += lineCost;

      return {
        index: index + 1,
        deliverables: lineDeliverables,
        media: lineMedia,
        fee: lineFee,
        totalCost: lineCost,
        buyType: lineItem.buyType || "",
        dimensions: {
          Platform: lineItem.platform || "",
          "Bid Strategy": lineItem.bidStrategy || "",
          "Buy Type": lineItem.buyType || "",
        },
        bursts: summaryBursts,
      };
    });

    return { lineItemTotals, overallMedia, overallFee, overallCost };
  }, [watchedLineItems, feeinfluencers]);

  // Callback handlers
  const handleLineItemValueChange = useCallback((lineItemIndex: number) => {
    const lineItems = form.getValues("lineItems") || [];
    let overallMedia = 0;
    let overallFee = 0;
    let overallCost = 0;
    let overallDeliverableCount = 0;

    lineItems.forEach((lineItem) => {
      let lineMedia = 0;
      let lineFee = 0;
      let lineDeliverables = 0;

      lineItem.bursts.forEach((burst) => {
        const budget = parseFloat(burst?.budget?.replace(/[^0-9.]/g, "") || "0");
        if (lineItem.budgetIncludesFees) {
          const pct = feeinfluencers || 0;
          lineMedia += (budget * (100 - pct)) / 100;
          lineFee += (budget * pct) / 100;
        } else {
          lineMedia += budget;
          const fee = feeinfluencers ? (budget / (100 - feeinfluencers)) * feeinfluencers : 0;
          lineFee += fee;
        }
        lineDeliverables += burst?.calculatedValue || 0;
      });

      overallMedia += lineMedia;
      overallFee += lineFee;
      overallCost += lineMedia + lineFee;
      overallDeliverableCount += lineDeliverables;
    });

    setOverallDeliverables(overallDeliverableCount);
    onTotalMediaChange(overallMedia, overallFee);
  }, [form, feeinfluencers, onTotalMediaChange]);

  const handleBuyTypeChange = useCallback(
    (lineItemIndex: number, value: string) => {
      form.setValue(`lineItems.${lineItemIndex}.buyType`, value);

      if (value === "bonus" || value === "package_inclusions") {
        const currentBursts =
          form.getValues(`lineItems.${lineItemIndex}.bursts`) || [];
        const zeroedBursts = currentBursts.map((burst: any) => ({
          ...burst,
          budget: "0",
          buyAmount: "0",
          calculatedValue: burst.calculatedValue ?? 0,
        }));

        form.setValue(`lineItems.${lineItemIndex}.bursts`, zeroedBursts, {
          shouldDirty: true,
        });
      }

      handleLineItemValueChange(lineItemIndex);
    },
    [form, handleLineItemValueChange]
  );

   const handleValueChange = useCallback((lineItemIndex: number, burstIndex: number, budgetIncludesFeesOverride?: boolean) => {
    const burst = form.getValues(`lineItems.${lineItemIndex}.bursts.${burstIndex}`);
    const lineItem = form.getValues(`lineItems.${lineItemIndex}`);
    const rawBudget = parseFloat(burst?.budget?.replace(/[^0-9.]/g, "") || "0");
    const budgetIncludesFees = budgetIncludesFeesOverride ?? Boolean(lineItem?.budgetIncludesFees);
    const buyAmount = parseFloat(burst?.buyAmount?.replace(/[^0-9.]/g, "") || "1");
    const buyTypeRaw = form.getValues(`lineItems.${lineItemIndex}.buyType`);

    const buyTypeLower = String(buyTypeRaw || "").toLowerCase();
    if (
      buyTypeLower === "bonus" ||
      buyTypeLower === "package_inclusions" ||
      buyTypeLower === "package"
    ) {
      return;
    }

    const bt = coerceBuyTypeWithDevWarn(String(buyTypeRaw || ""), "InfluencersContainer.handleValueChange");
    const calculatedValue = computeDeliverableFromMedia({
      buyType: bt,
      rawBudget,
      buyAmount,
      budgetIncludesFees,
      feePct: feeinfluencers || 0,
    });

    const currentValue = form.getValues(`lineItems.${lineItemIndex}.bursts.${burstIndex}.calculatedValue`);
    if (currentValue !== calculatedValue && !isNaN(calculatedValue)) {
      form.setValue(`lineItems.${lineItemIndex}.bursts.${burstIndex}.calculatedValue`, calculatedValue, {
        shouldValidate: false, // Changed to false to prevent validation loops
        shouldDirty: false,    // Changed to false to prevent dirty state loops
      });

      handleLineItemValueChange(lineItemIndex);
    }
  }, [feeinfluencers, form, handleLineItemValueChange]);

  const handleAppendBurst = useCallback((lineItemIndex: number) => {
    appendBurst({
      form,
      fieldKey: "lineItems",
      lineItemIndex,
      campaignStartDate,
      campaignEndDate,
      onAfter: handleLineItemValueChange,
      toast: toast as Parameters<typeof appendBurst>[0]["toast"],
    })
  }, [form, handleLineItemValueChange, toast, campaignStartDate, campaignEndDate]);

  const handleDuplicateLineItem = useCallback((lineItemIndex: number) => {
    const source = form.getValues(`lineItems.${lineItemIndex}`) as any
    if (!source) return
    const clone = {
      ...source,
      // Path A: a duplicate is a NEW line - clear identity so assignStableLineItemNumbers
      // mints a fresh number above max at save (source keeps its id).
      line_item: undefined,
      lineItem: undefined,
      line_item_id: undefined,
      lineItemId: undefined,
      bursts: (source.bursts || []).map((burst: any) => ({
        ...burst,
        _reactKey: newBurstReactKey(),
        startDate: coerceBurstDateLocal(burst?.startDate) ?? new Date(),
        endDate: coerceBurstDateLocal(burst?.endDate) ?? new Date(),
        calculatedValue: burst?.calculatedValue ?? 0,
        fee: burst?.fee ?? 0,
      })),
    }
    insertLineItem(lineItemIndex + 1, clone as InfluencersFormValues["lineItems"][number])
  }, [form, insertLineItem])
  
  const handleDuplicateBurst = useCallback((lineItemIndex: number) => {
    duplicateBurst({
      form,
      fieldKey: "lineItems",
      lineItemIndex,
      onAfter: handleLineItemValueChange,
      toast: toast as Parameters<typeof duplicateBurst>[0]["toast"],
    })
  }, [form, handleLineItemValueChange, toast]);
  
  const handleRemoveBurst = useCallback((lineItemIndex: number, burstIndex: number) => {
    removeBurst({
      form,
      fieldKey: "lineItems",
      lineItemIndex,
      burstIndex,
      onAfter: handleLineItemValueChange,
      toast: toast as Parameters<typeof removeBurst>[0]["toast"],
    })
  }, [form, handleLineItemValueChange, toast]);
  
  const getDeliverablesLabel = useCallback((buyType: string) => {
    if (!buyType) return "Deliverables";
    
    switch (buyType.toLowerCase()) {
      case "cpc":
        return "Clicks";
      case "cpv":
        return "Views";
      case "cpm":
        return "Impressions";
      case "fixed_cost":
        return "Fixed Fee";
      default:
        return "Deliverables";
    }
  }, []);

  const formatBuyTypeForDisplay = useCallback((buyType: string) => {
    if (!buyType) return "Not selected";
    
    switch (buyType.toLowerCase()) {
      case "cpt":
        return "CPT";
      case "cpm":
        return "CPM";
      case "cpv":
        return "CPV";
      case "cpc":
        return "CPC";
      case "spots":
        return "Spots";
      case "package":
        return "Package";
      case "bonus":
        return "Bonus";
      case "package_inclusions":
        return "Package Inclusions";
      case "fixed_cost":
        return "Fixed Cost";
      case "guaranteed_leads":
        return "Guaranteed Leads";
      case "insertions":
        return "Insertions";
      case "panels":
        return "Panels";
      case "screens":
        return "Screens";
      default:
        return buyType;
    }
  }, []);

  // Effect hooks
  useEffect(() => {
    const fetchPublishers = async () => {
      try {
        // Check if we already have publishers cached
        if (publishersRef.current.length > 0) {
          setPublishers(publishersRef.current);
          setIsLoading(false);
          return;
        }

        const fetchedPublishers = await getPublishersForInfluencers();
        publishersRef.current = fetchedPublishers;
        setPublishers(fetchedPublishers);
      } catch (error) {
        toast({
          title: "Error loading publishers",
          description: error.message,
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };
  
    fetchPublishers();
  }, [clientId, toast]);
  
  // report raw totals (ignoring clientPaysForMedia) for MBA-Details
useEffect(() => {
  onTotalMediaChange(
    overallTotals.overallMedia,
    overallTotals.overallFee
  )
}, [overallTotals.overallFee, overallTotals.overallMedia, onTotalMediaChange])

  useEffect(() => {
    // convert each form lineItem into the shape needed for Excel
  const calculatedBursts = getInfluencersBursts(form, feeinfluencers || 0);
  let burstIndex = 0;

  const items: LineItem[] = form.getValues('lineItems').flatMap(lineItem =>
    lineItem.bursts.map(burst => {
        const computedBurst = calculatedBursts[burstIndex++];
        const mediaAmount = computedBurst
          ? computedBurst.mediaAmount
          : parseFloat(String(burst.budget).replace(/[^0-9.-]+/g, "")) || 0;
        const recomputedDeliverable = computeDeliverableFromMedia({
          buyType: lineItem.buyType as Parameters<typeof computeDeliverableFromMedia>[0]["buyType"],
          rawBudget: parseFloat(String(burst.budget).replace(/[^0-9.-]+/g, "")) || 0,
          buyAmount: parseFloat(String(burst.buyAmount ?? burst.budget).replace(/[^0-9.-]+/g, "")) || 0,
          budgetIncludesFees: !!lineItem.budgetIncludesFees,
          feePct: feeinfluencers || 0,
        });
        // computeDeliverableFromMedia returns NaN for bonus / package_inclusions
        // (manual qty). Preserve the saved value in that case.
        const deliverableForExcel = Number.isNaN(recomputedDeliverable)
          ? (burst.calculatedValue ?? 0)
          : recomputedDeliverable;

        return {
          market: lineItem.market,                                // or fixed value
          platform: lineItem.platform,
          bidStrategy: lineItem.bidStrategy,
          targeting: lineItem.creativeTargeting,
          creative:   lineItem.creative,
          startDate: formatDateString(burst.startDate),
          endDate:   formatDateString(burst.endDate),
          deliverables: deliverableForExcel,
          buyingDemo:   lineItem.buyingDemo,
          buyType:      lineItem.buyType,
          deliverablesAmount: burst.budget,
          grossMedia: String(mediaAmount),
          clientPaysForMedia: lineItem.clientPaysForMedia ?? false,
        };
      })
    );

    // push it up to page.tsx
  onLineItemsChange(items);
}, [watchedLineItems, feeinfluencers, form, onLineItemsChange]);

  useEffect(() => {
      const timeoutId = setTimeout(() => {
        const investmentByMonth = calculateInvestmentPerMonth(form, feeinfluencers || 0);
        const bursts = getInfluencersBursts(form, feeinfluencers || 0);
    
        const hasInvestmentChanges = JSON.stringify(investmentByMonth) !== JSON.stringify(prevInvestmentRef.current);
        const hasBurstChanges = JSON.stringify(bursts) !== JSON.stringify(prevBurstsRef.current);
    
        if (hasInvestmentChanges) {
          onInvestmentChange(investmentByMonth);
          prevInvestmentRef.current = investmentByMonth;
        }
    
        if (hasBurstChanges) {
        onBurstsChange(bursts);
      prevBurstsRef.current = bursts;
      
      // Calculate total media and fee for billing
      let totalMedia = 0;
      let totalFee = 0;
      
      bursts.forEach(burst => {
        totalMedia += burst.mediaAmount;
        totalFee += burst.feeAmount;
      });
    }
  }, 300); // 300ms debounce

  return () => clearTimeout(timeoutId);
}, [watchedLineItems, feeinfluencers, form, onBurstsChange, onInvestmentChange]);

const getBursts = () => {
  const formLineItems = form.getValues("lineItems") || [];
  return formLineItems.flatMap(item =>
    item.bursts.map(burst => {
      const budget = parseFloat(burst.budget?.replace(/[^0-9.]/g, "") || "0");
      let mediaAmount = 0;
      let feeAmount = 0;

      if (item.budgetIncludesFees && item.clientPaysForMedia) {
        feeAmount = budget * ((feeinfluencers || 0) / 100);
        mediaAmount = 0;
      } else if (item.budgetIncludesFees) {
        const pct = feeinfluencers || 0;
        mediaAmount = (budget * (100 - pct)) / 100;
        feeAmount = (budget * pct) / 100;
      } else if (item.clientPaysForMedia) {
        feeAmount = (budget / (100 - (feeinfluencers || 0))) * (feeinfluencers || 0);
        mediaAmount = 0;
      } else {
        mediaAmount = budget;
        feeAmount =
          (budget * (feeinfluencers || 0)) / (100 - (feeinfluencers || 0));
      }

      const billingBurst: BillingBurst = {
        startDate: burst.startDate,
        endDate: burst.endDate,
        mediaAmount: mediaAmount,
        feeAmount: feeAmount,
        totalAmount: mediaAmount + feeAmount,
        mediaType: 'influencers',
        feePercentage: feeinfluencers,
        clientPaysForMedia: item.clientPaysForMedia,
        budgetIncludesFees: item.budgetIncludesFees,
        noAdserving: false,
        deliverables: 0,
        buyType: item.buyType,
      };

      return billingBurst;
    })
  );
};

  return (
    <div className="space-y-6">
      <div className="mb-6">
        <Card className="overflow-hidden border-0 shadow-md">
          <div className="h-1" style={mediaTypeSummaryStripeStyle(MEDIA_ACCENT_HEX)} />
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <CardTitle className="text-base font-semibold tracking-tight">
                    Influencers Media
                  </CardTitle>
                  {influencersExpertModalOpen ? (
                    <Badge
                      variant="outline"
                      className="border-2 text-[10px] font-semibold uppercase tracking-wider shadow-sm"
                      style={{
                        borderColor: rgbaFromHex(MEDIA_ACCENT_HEX, 0.55),
                        backgroundColor: rgbaFromHex(MEDIA_ACCENT_HEX, 0.14),
                        color: MEDIA_ACCENT_HEX,
                      }}
                    >
                      Schedule grid open
                    </Badge>
                  ) : null}
                  {expertApplyPendingPageSave ? (
                    <Badge variant="outline" className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Not saved to plan yet
                    </Badge>
                  ) : null}
                </div>
                <div
                  role="group"
                  aria-label="Influencers Media entry mode"
                  className="inline-flex shrink-0 rounded-lg border border-border bg-muted/50 p-0.5"
                >
                  <button
                    type="button"
                    aria-pressed={!influencersExpertModalOpen}
                    className={cn(
                      "rounded-md px-3 py-1.5 text-xs font-medium transition-all",
                      !influencersExpertModalOpen
                        ? "text-white shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                    style={
                      !influencersExpertModalOpen
                        ? { backgroundColor: MEDIA_ACCENT_HEX }
                        : undefined
                    }
                    onClick={() => {
                      if (influencersExpertModalOpen) {
                        writeContainerEntryMode("card")
                        handleInfluencersExpertModalOpenChange(false)
                      }
                    }}
                  >Card entry</button>
                  <button
                    type="button"
                    aria-pressed={influencersExpertModalOpen}
                    className={cn(
                      "rounded-md px-3 py-1.5 text-xs font-medium transition-all",
                      influencersExpertModalOpen
                        ? "text-white shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                      expertSegmentAttention &&
                        !influencersExpertModalOpen &&
                        "animate-pulse"
                    )}
                    style={{
                      ...(influencersExpertModalOpen
                        ? { backgroundColor: MEDIA_ACCENT_HEX }
                        : {}),
                      ...(expertSegmentAttention && !influencersExpertModalOpen
                        ? {
                            boxShadow: `0 0 0 2px ${rgbaFromHex(MEDIA_ACCENT_HEX, 0.45)}`,
                          }
                        : {}),
                    }}
                    onClick={() => {
                      if (!influencersExpertModalOpen) {
                        writeContainerEntryMode("schedule")
                          openInfluencersExpertModal()
                      }
                    }}
                  >Schedule grid</button>
                </div>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted-foreground">
                  One card per line - or switch to Schedule grid for week quantities.
                </p>
                <span className="text-xs text-muted-foreground tabular-nums sm:text-right">
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
              feeLabel={`Fee (${feeinfluencers}%)`}
              accentHex={MEDIA_ACCENT_HEX}
              dimensions={["Platform", "Bid Strategy", "Buy Type"]}
              deliverablesLabelFor={getDeliverablesLabel}
            />
            <MediaContainerTimelineCollapsible
              mediaTypeKey="influencers"
              lineItems={watchedLineItems}
              campaignStartDate={campaignStartDate}
              campaignEndDate={campaignEndDate}
            />
          </CardContent>
        </Card>
      </div>

    <div>
      {isLoading ? (
        <MediaContainerLoadState loading label="Influencers" />
      ) : (
        <div className="space-y-6">
          {influencersExpertModalOpen ? null : (
          <Form {...form}>
            <div className="space-y-6">
                {lineItemFields.length === 0 ? (
                  <ContainerEmptyLinesPlaceholder
                    onAdd={() => appendLineItem({
                                                          ...buildDefaultLineItem(INFLUENCERS_CONTAINER_CONFIG.fieldMap),
                                                          bursts: [
                                                            {
                                                              budget: "",
                                                              buyAmount: "",
                                                              startDate: defaultMediaBurstStartDate(campaignStartDate, campaignEndDate),
                                                              endDate: defaultMediaBurstEndDate(campaignStartDate, campaignEndDate),
                                                              calculatedValue: 0,
                                                              fee: 0,
                                                              _reactKey: newBurstReactKey(),
                                                            } as InfluencersFormValues["lineItems"][number]["bursts"][number] & { _reactKey: string },
                                                          ],
                                                        })}
                  />
                ) : null}
                {lineItemFields.map((field, lineItemIndex) => {
                  const lineItemId = buildLineItemId(
                    mbaNumber,
                    MEDIA_TYPE_ID_CODES.influencers,
                    lineItemIndex + 1
                  );
                  const getTotals = (lineItemIndex: number) => {
                  const lineItem = form.getValues(`lineItems.${lineItemIndex}`);
                  let totalMedia = 0;
                  let totalCalculatedValue = 0;

                  lineItem.bursts.forEach((burst) => {
                    const budget = parseFloat(burst.budget.replace(/[^0-9.]/g, "")) || 0;
                    totalMedia += budget;
                    totalCalculatedValue += burst.calculatedValue || 0;
                  });

                  return { totalMedia, totalCalculatedValue };
                };

                const { totalMedia, totalCalculatedValue } = getTotals(lineItemIndex);

                return (
                  <ExpertCard<InfluencersFormValues>
                      key={field.id}
                      config={INFLUENCERS_EXPERT_CHANNEL_CONFIG}
                      form={form}
                      itemsKey="lineItems"
                      lineItemIndex={lineItemIndex}
                      lineItemId={lineItemId}
                      collapsed={collapsedLineItems.has(lineItemIndex)}
                      onToggleCollapsed={() => toggleLineItemCollapsed(lineItemIndex)}
                      totalDisplay={formatMoney(
                        form.getValues(`lineItems.${lineItemIndex}.budgetIncludesFees`)
                          ? totalMedia
                          : totalMedia + (totalMedia / (100 - (feeinfluencers || 0))) * (feeinfluencers || 0),
                        { locale: "en-AU", currency: "AUD" }
                      )}
                      publishers={publishers}
                      feePct={feeinfluencers || 0}
                      calculatedVariant="cpcCpvCpm"
                      campaignStartDate={campaignStartDate}
                      campaignEndDate={campaignEndDate}
                      onBurstValueChange={handleValueChange}
                      onAppendBurst={handleAppendBurst}
                      onDuplicateBurst={(li, _bi) => handleDuplicateBurst(li)}
                      onRemoveBurst={handleRemoveBurst}
                      onBudgetIncludesFeesChange={(li, checked) => {
                        const bursts = form.getValues(`lineItems.${li}.bursts`) || [];
                        bursts.forEach((_, bi) => handleValueChange(li, bi, !!checked));
                      }}
                      onComboboxValueChange={(key, li, value) => {
                        if (key === "buyType") handleBuyTypeChange(li, value);
                      }}
                      summaryRow={
                        <div className="border-b px-6 py-2">
                          <div className="grid grid-cols-4 gap-4 text-sm">
                            <div>
                              <span className="font-medium">Platform:</span>{" "}
                              {form.watch(`lineItems.${lineItemIndex}.platform`) ||
                                "Not selected"}
                            </div>
                            <div>
                              <span className="font-medium">Buy Type:</span>{" "}
                              {formatBuyTypeForDisplay(
                                form.watch(`lineItems.${lineItemIndex}.buyType`)
                              )}
                            </div>
                            <div>
                              <span className="font-medium">Bid Strategy:</span>{" "}
                              {form.watch(`lineItems.${lineItemIndex}.bidStrategy`) ||
                                "Not selected"}
                            </div>
                            <div>
                              <span className="font-medium">Bursts:</span>{" "}
                              {form.watch(`lineItems.${lineItemIndex}.bursts`, []).length}
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
                              onClick={() => handleDuplicateLineItem(lineItemIndex)}
                            >
                              <Copy className="mr-1.5 h-3.5 w-3.5" />
                              Duplicate
                            </Button>
                            {lineItemIndex === lineItemFields.length - 1 && (
                              <Button
                                type="button"
                                size="sm"
                                onClick={() =>
                                  appendLineItem({
                                    ...buildDefaultLineItem(INFLUENCERS_CONTAINER_CONFIG.fieldMap),
                                    bursts: [
                                      {
                                        budget: "",
                                        buyAmount: "",
                                        startDate: defaultMediaBurstStartDate(
                                          campaignStartDate,
                                          campaignEndDate
                                        ),
                                        endDate: defaultMediaBurstEndDate(
                                          campaignStartDate,
                                          campaignEndDate
                                        ),
                                        calculatedValue: 0,
                                        fee: 0,
                                        _reactKey: newBurstReactKey(),
                                      } as InfluencersFormValues["lineItems"][number]["bursts"][number] & {
                                        _reactKey: string;
                                      },
                                    ],
                                  })
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
                  );
                })}
              </div>
            </Form>
          )}
          </div>
        )}
      </div>

      <Dialog
        open={influencersExpertModalOpen}
        onOpenChange={handleInfluencersExpertModalOpenChange}
      >
        <DialogContent className="max-w-[95vw] w-[95vw] max-h-[95vh] h-[95vh] flex flex-col p-4 gap-0 overflow-hidden">
          <DialogHeader className="flex-shrink-0 pb-2">
            <DialogTitle>Influencers Media Expert Mode</DialogTitle>
          </DialogHeader>
          <ComboboxModalProvider>
            <div className="flex-1 min-h-0 overflow-auto">
              <InfluencersExpertGrid
                campaignStartDate={campaignStartDate}
                campaignEndDate={campaignEndDate}
                feeinfluencers={feeinfluencers}
                rows={expertInfluencersRows}
                onRowsChange={handleExpertInfluencersRowsChange}
                publishers={publishers}
                onReorder={() => {
                  reorderedRef.current = true;
                }}
              />
            </div>
          </ComboboxModalProvider>
          <DialogFooter className="flex-shrink-0 border-t pt-3 mt-2">
            <div className="mr-auto flex flex-col gap-1.5">
              <ExpertIncompleteRowsSummary rows={expertInfluencersRows} />
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
            <Button type="button" onClick={handleInfluencersExpertApply}>
              Apply to plan (not saved yet)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={influencersExpertExitConfirmOpen}
        onOpenChange={(open) => {
          if (!open) dismissInfluencersExpertExitConfirm()
        }}
      >
        <DialogContent
          className="z-[100] sm:max-w-md"
          onClick={(e) => {
            if (
              (e.target as HTMLElement).closest(
                "[data-influencersexpert-exit-yes]"
              )
            ) {
              return
            }
            dismissInfluencersExpertExitConfirm()
          }}
        >
          <DialogHeader>
            <DialogTitle>Leave Influencers Media Expert Mode?</DialogTitle>
            <DialogDescription>
              You have unsaved changes in Expert Mode. Apply saves them to the
              Influencers Media section; leaving now discards those edits.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={dismissInfluencersExpertExitConfirm}
            >
              No, keep editing
            </Button>
            <Button
              type="button"
              variant="destructive"
              data-influencersexpert-exit-yes
              onClick={confirmInfluencersExpertExitWithoutSaving}
            >
              Yes, leave without saving
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
