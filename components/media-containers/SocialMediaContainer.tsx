"use client"

import { publishMediaLineItemsIfChanged } from "@/lib/mediaplan/publishMediaLineItems"

import { subscribeMediaPlanPageSaved } from "@/lib/mediaplan/expertApplyDirtyBridge"
import { ContainerEmptyLinesPlaceholder } from "@/components/media-containers/ContainerEmptyLinesPlaceholder"
import { ExpertCard } from "@/components/media-containers/ExpertCard"
import { ExpertIncompleteRowsSummary } from "@/components/media-containers/ExpertIncompleteRowsSummary"
import { MediaContainerLoadState } from "@/components/media-containers/MediaContainerLoadState"
import { SOCIALMEDIA_EXPERT_CHANNEL_CONFIG } from "@/lib/mediaplan/expertGridChannelConfig"
import {
  writeContainerEntryMode,
} from "@/lib/mediaplan/containerEntryMode"

import { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } from "react"
import { useForm, useFieldArray, UseFormReturn } from "react-hook-form"
import { useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import {
  socialMediaFormSchema,
  type SocialMediaFormValues,
} from "@/lib/mediaplan/schemas"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Combobox, ComboboxModalProvider } from "@/components/ui/combobox"
import { Checkbox } from "@/components/ui/checkbox"
import { Textarea } from "@/components/ui/textarea"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useToast } from "@/components/ui/use-toast"
import { useStableHydration } from "@/hooks/useStableHydration"
import { getPublishersForSocialMedia, getClientInfo } from "@/lib/api"
import { formatBurstLabel } from "@/lib/bursts"
import { computeBurstAmounts } from "@/lib/mediaplan/burstAmounts"
import { appendBurst, duplicateBurst, removeBurst, newBurstReactKey, stampBurstReactKeys } from "@/lib/mediaplan/burstOperations"
import { serializeBurstsJson } from "@/lib/mediaplan/serializeBurstsJson"
import { resolveLineItemBursts } from "@/lib/mediaplan/deriveBursts"
import { format } from "date-fns"
import { useMediaPlanContext } from "@/contexts/MediaPlanContext"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { ChevronDown, Copy, Plus, Trash2 } from "lucide-react"
import type { BillingBurst, BillingMonth } from "@/lib/billing/types"; // ad
import {
  aggregateInvestmentDisplayRows,
  type InvestmentBurstInput,
} from "@/lib/billing/prorateInvestmentDisplay"
import type { LineItem } from '@/lib/generateMediaPlan'
import { formatAUD, formatMoney, parseMoneyInput } from "@/lib/format/money"
import { MEDIA_TYPE_ID_CODES, buildLineItemId } from "@/lib/mediaplan/lineItemIds"
import { assignStableLineItemNumbers, reassignLineItemNumbers } from "@/lib/mediaplan/lineItemOrder"
import {
  getSocialBurstCalculatedColumnLabel,
  SocialLineBurstCalculatedField,
} from "@/components/media-containers/burst-calculated-fields"
import {
  MP_BURST_ACTION_COLUMN,
  MP_BURST_CARD,
  MP_BURST_CARD_CONTENT,
  MP_BURST_GRID_7,
  MP_BURST_HEADER_INNER,
  MP_BURST_HEADER_ROW,
  MP_BURST_HEADER_SHELL,
  MP_BURST_LABEL_HEADING,
  MP_BURST_LABEL_COLUMN,
  MP_BURST_ROW_SHELL,
  MP_BURST_SECTION_OUTER,
} from "@/lib/mediaplan/burstSectionLayout"
import { SingleDatePicker } from "@/components/ui/single-date-picker"
import { defaultMediaBurstStartDate, defaultMediaBurstEndDate } from "@/lib/date-picker-anchor"
import MediaContainerTimelineCollapsible from "@/components/media-containers/MediaContainerTimelineCollapsible"
import MediaContainerSummarySection from "@/components/media-containers/MediaContainerSummarySection"
import {
  getMediaTypeThemeHex,
  mediaTypeSummaryStripeStyle,
  rgbaFromHex,
} from "@/lib/mediaplan/mediaTypeAccents"
import {
  SocialMediaExpertGrid,
  createEmptySocialMediaExpertRow,
} from "@/components/media-containers/SocialMediaExpertGrid"
import type { SocialMediaExpertScheduleRow } from "@/lib/mediaplan/expertModeWeeklySchedule"
import {
  mapSocialMediaExpertRowsToStandardLineItems,
  mapStandardSocialMediaLineItemsToExpertRows,
  type StandardSocialMediaFormLineItem,
} from "@/lib/mediaplan/expertChannelMappings"
import {
  mergeSocialMediaStandardFromExpertWithPrevious,
  serializeSocialMediaExpertRowsBaseline,
  serializeSocialMediaStandardLineItemsBaseline,
} from "@/lib/mediaplan/expertModeSwitch"
import { buildWeeklyGanttColumnsFromCampaign } from "@/lib/utils/weeklyGanttColumns"
import {
  coerceBuyTypeWithDevWarn,
  computeDeliverableFromMedia,
  computeLoadedDeliverables,
} from "@/lib/mediaplan/deliverableBudget"

const MEDIA_ACCENT_HEX_SOCIAL = getMediaTypeThemeHex("socialmedia")

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

interface SocialMediaContainerProps {
  clientId: string;
  feesocial: number;
  onTotalMediaChange: (totalMedia: number, totalFee: number) => void;
  onBurstsChange: (bursts: BillingBurst[]) => void;
  onInvestmentChange: (investmentByMonth: any) => void;
  onLineItemsChange: (items: LineItem[]) => void;
  onSocialMediaLineItemsChange: (lineItems: any[]) => void;
  onMediaLineItemsChange: (lineItems: any[]) => void;
  campaignStartDate: Date;
  campaignEndDate: Date;
  campaignBudget: number;
  campaignId: string;
  mediaTypes: string[];
  initialLineItems?: any[];
}

export function getSocialMediaBursts(
  form: UseFormReturn<SocialMediaFormValues>,
  feesocial: number
): BillingBurst[] {
  const lineItems = form.getValues("lineItems") || []

  return lineItems.flatMap(li =>
    li.bursts.map(burst => {
      const rawBudget = parseFloat(
        (burst.budget || "").toString().replace(/[^0-9.]/g, "")
      ) || 0

      const pct = feesocial || 0

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

        mediaType:          "social",
        feePercentage:      pct,
        clientPaysForMedia: li.clientPaysForMedia,
        budgetIncludesFees: li.budgetIncludesFees,
        noAdserving: false,
        deliverables:
          parseFloat((burst?.calculatedValue ?? "0").toString()) || 0,
        buyType: li.buyType,
              }
    })
  )
}

export function calculateInvestmentPerMonth(form, feesocial) {
  const items = form.getValues("lineItems") || []
  const bursts: InvestmentBurstInput[] = []
  items.forEach((lineItem: any) => {
    (lineItem.bursts || []).forEach((burst: any) => {
      const lineMedia = parseFloat(String(burst.budget).replace(/[^0-9.]/g, "")) || 0
      const feePct = feesocial || 0
      const totalInvestment = lineMedia + ((lineMedia / (100 - feePct)) * feePct)
      bursts.push({ amount: totalInvestment, start: burst.startDate, end: burst.endDate })
    })
  })
  return aggregateInvestmentDisplayRows(bursts)
}
export default function SocialMediaContainer({
  clientId,
  feesocial,
  onTotalMediaChange,
  onBurstsChange,
  onInvestmentChange,
  onLineItemsChange,
  onSocialMediaLineItemsChange,
  onMediaLineItemsChange,
  campaignStartDate,
  campaignEndDate,
  campaignBudget,
  campaignId,
  mediaTypes,
  initialLineItems
}: SocialMediaContainerProps) {
  // Add refs to track previous values
  const prevInvestmentRef = useRef<{ monthYear: string; amount: string }[]>([]);
  const prevBurstsRef = useRef<BillingBurst[]>([]);
  const publishersRef = useRef<Publisher[]>([]);

  const [publishers, setPublishers] = useState<Publisher[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const { toast } = useToast()
  const { mbaNumber } = useMediaPlanContext()
  const [overallDeliverables, setOverallDeliverables] = useState(0);

  const [expertSocialRows, setExpertSocialRows] = useState<
    SocialMediaExpertScheduleRow[]
  >([])
  const [socialExpertModalOpen, setSocialExpertModalOpen] = useState(false)

  const [expertApplyPendingPageSave, setExpertApplyPendingPageSave] = useState(false)
  useEffect(() => {
    return subscribeMediaPlanPageSaved(() => setExpertApplyPendingPageSave(false))
  }, [])
  const mediaLineItemsPublishFpRef = useRef("")
  const [socialExpertExitConfirmOpen, setSocialExpertExitConfirmOpen] =
    useState(false)
  const [expertSegmentAttention, setExpertSegmentAttention] = useState(true)
  const socialStandardBaselineRef = useRef("")
  const socialExpertRowsBaselineRef = useRef("")
  const reorderedRef = useRef(false)
  const socialExpertModalOpenRef = useRef(false)
  socialExpertModalOpenRef.current = socialExpertModalOpen

  const socialExpertWeekColumns = useMemo(
    () => buildWeeklyGanttColumnsFromCampaign(campaignStartDate, campaignEndDate),
    [campaignStartDate, campaignEndDate]
  )
  
  // Form initialization
  const form = useForm({
    defaultValues: {
      lineItems: [
        {
          platform: "",
          bidStrategy: "",
          buyType: "",
          creativeTargeting: "",
          creative: "",
          buyingDemo: "",   
          market: "",
          fixedCostMedia: false,
          clientPaysForMedia: false,
          budgetIncludesFees: false,
          noadserving: false,
          bursts: [
            {
              _reactKey: newBurstReactKey(),
              budget: "",
              buyAmount: "",
              startDate: defaultMediaBurstStartDate(campaignStartDate, campaignEndDate),
              endDate: defaultMediaBurstEndDate(campaignStartDate, campaignEndDate),
              calculatedValue: 0,
              fee: 0,
            },
          ],
          totalMedia: 0,
          totalDeliverables: 0,
          totalFee: 0,
        },
      ],
    },
  }) as any;

   // Field array hook
   const {
    fields: lineItemFields,
    append: appendLineItem,
    remove: removeLineItemBase,
  } = useFieldArray({
    control: form.control,
    name: "lineItems",
  });

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

  useLayoutEffect(() => {
    socialStandardBaselineRef.current =
      serializeSocialMediaStandardLineItemsBaseline(
        form.getValues("lineItems")
      )
  }, [form])

  useEffect(() => {
    const id = window.setTimeout(() => setExpertSegmentAttention(false), 2800)
    return () => window.clearTimeout(id)
  }, [])

  const handleExpertSocialRowsChange = useCallback(
    (next: SocialMediaExpertScheduleRow[]) => {
      setExpertSocialRows(next)
    },
    []
  )

  const openSocialExpertModal = useCallback(() => {
    const mapped = mapStandardSocialMediaLineItemsToExpertRows(
      (form.getValues("lineItems") || []) as StandardSocialMediaFormLineItem[],
      socialExpertWeekColumns,
      campaignStartDate,
      campaignEndDate
    )
    const weekKeys = socialExpertWeekColumns.map((c) => c.weekKey)
    const rows: SocialMediaExpertScheduleRow[] =
      mapped.length > 0
        ? mapped
        : [
            createEmptySocialMediaExpertRow(
              typeof crypto !== "undefined" && crypto.randomUUID
                ? crypto.randomUUID()
                : `socialmedia-expert-${Date.now()}`,
              campaignStartDate,
              campaignEndDate,
              weekKeys
            ),
          ]
    socialExpertRowsBaselineRef.current =
      serializeSocialMediaExpertRowsBaseline(rows)
    setExpertSocialRows(rows)
    setSocialExpertExitConfirmOpen(false)
    setSocialExpertModalOpen(true)
  }, [campaignStartDate, campaignEndDate, form, socialExpertWeekColumns])



  const dismissSocialExpertExitConfirm = useCallback(() => {
    setSocialExpertExitConfirmOpen(false)
  }, [])

  const confirmSocialExpertExitWithoutSaving = useCallback(() => {
    setSocialExpertExitConfirmOpen(false)
    setSocialExpertModalOpen(false)
  }, [])

  const handleSocialExpertModalOpenChange = useCallback(
    (open: boolean) => {
      if (open) {
        setSocialExpertModalOpen(true)
        return
      }
      const dirty =
        serializeSocialMediaExpertRowsBaseline(expertSocialRows) !==
        socialExpertRowsBaselineRef.current
      if (!dirty) {
        setSocialExpertModalOpen(false)
        return
      }
      setSocialExpertExitConfirmOpen(true)
    },
    [expertSocialRows]
  )

  const handleSocialExpertApply = useCallback(() => {
    const prevLineItems = form.getValues("lineItems") || []
    const standard = mapSocialMediaExpertRowsToStandardLineItems(
      expertSocialRows,
      socialExpertWeekColumns,
      campaignStartDate,
      campaignEndDate,
      {
        feePctSocial: feesocial,
        budgetIncludesFees: Boolean(prevLineItems[0]?.budgetIncludesFees),
      }
    )
    const merged = mergeSocialMediaStandardFromExpertWithPrevious(
      standard,
      prevLineItems as StandardSocialMediaFormLineItem[]
    )
    const orderedForApply = reorderedRef.current
      ? reassignLineItemNumbers(merged, mbaNumber, MEDIA_TYPE_ID_CODES.socialMedia)
      : merged
    reorderedRef.current = false
    const keyedMerged = stampBurstReactKeys(orderedForApply);
    form.setValue("lineItems", keyedMerged as any, {
      shouldDirty: true,
      shouldValidate: false,
    })
    socialStandardBaselineRef.current =
      serializeSocialMediaStandardLineItemsBaseline(
        form.getValues("lineItems")
      )
    setSocialExpertExitConfirmOpen(false)
    setExpertApplyPendingPageSave(true)
    setSocialExpertModalOpen(false)
  }, [
    campaignStartDate,
    campaignEndDate,
    expertSocialRows,
    feesocial,
    form,
    socialExpertWeekColumns,
  ])

  const handleDuplicateLineItem = useCallback((lineItemIndex: number) => {
    const items = form.getValues("lineItems") || [];
    const source = items[lineItemIndex];

    if (!source) {
      toast({
        title: "No line item to duplicate",
        description: "Cannot duplicate a missing line item.",
        variant: "destructive",
      });
      return;
    }

    const clone = {
      ...source,
      bursts: (source.bursts || []).map((burst: any) => ({
        ...burst,
        _reactKey: newBurstReactKey(),
        startDate: burst?.startDate ? new Date(burst.startDate) : new Date(),
        endDate: burst?.endDate ? new Date(burst.endDate) : new Date(),
        calculatedValue: burst?.calculatedValue ?? 0,
        fee: burst?.fee ?? 0,
      })),
    };

    appendLineItem(clone);
  }, [appendLineItem, form, toast]);

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
          lineMedia += (budget * (100 - (feesocial || 0))) / 100;
          lineFee += (budget * (feesocial || 0)) / 100;
        } else {
          lineMedia += budget;
          const fee = feesocial ? (budget * feesocial) / (100 - feesocial) : 0;
          lineFee += fee;
        }
        lineDeliverables += parseFloat(
          (burst?.calculatedValue ?? "0").toString()
        ) || 0;
      });

      overallMedia += lineMedia;
      overallFee += lineFee;
      overallCost += lineMedia + lineFee;
      overallDeliverableCount += lineDeliverables;
    });

    setOverallDeliverables(overallDeliverableCount);
    onTotalMediaChange(overallMedia, overallFee);
  }, [feesocial, form, onTotalMediaChange]);
  
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
      console.log("[SocialMediaContainer] Loading initialLineItems:", items);
      
      const transformedLineItems = items.map((item: any, index: number) => {
        // Log each item for debugging
        console.log(`[SocialMediaContainer] Processing item ${index}:`, {
          platform: item.platform,
          bid_strategy: item.bid_strategy,
          buy_type: item.buy_type,
          bursts_json: item.bursts_json,
          bursts_json_type: typeof item.bursts_json,
        });

        const parsedBursts = resolveLineItemBursts(item);

        const bursts = parsedBursts.length > 0 ? parsedBursts.map((burst: any) => {
          // Calculate calculatedValue based on buyType, budget, and buyAmount
          const calculatedValue = computeLoadedDeliverables(
            String(item.buy_type || ""),
            burst,
            Boolean(item.budget_includes_fees),
            feesocial || 0
          );
          
          return {
            budget: burst.budget || "",
            buyAmount: burst.buyAmount || "",
            startDate: burst.startDate ? new Date(burst.startDate) : defaultMediaBurstStartDate(campaignStartDate, campaignEndDate),
            endDate: burst.endDate ? new Date(burst.endDate) : defaultMediaBurstEndDate(campaignStartDate, campaignEndDate),
            calculatedValue: calculatedValue,
            fee: burst.fee || 0,
          };
        }) : [{
          budget: "",
          buyAmount: "",
          startDate: defaultMediaBurstStartDate(campaignStartDate, campaignEndDate),
          endDate: defaultMediaBurstEndDate(campaignStartDate, campaignEndDate),
          calculatedValue: 0,
          fee: 0,
        }];

        const lineNum = Number(item.line_item ?? item.lineItem ?? index + 1) || index + 1
        const lineItemId = item.line_item_id || item.lineItemId || buildLineItemId(mbaNumber, MEDIA_TYPE_ID_CODES.socialMedia, lineNum)

        return {
          platform: item.platform || "",
          bidStrategy: item.bid_strategy || "",
          buyType: item.buy_type || "",
          creativeTargeting: item.creative_targeting || "",
          creative: item.creative || "",
          buyingDemo: item.buying_demo || "",
          market: item.market || "",
          fixedCostMedia: item.fixed_cost_media || false,
          clientPaysForMedia: item.client_pays_for_media || false,
          budgetIncludesFees: item.budget_includes_fees || false,
          noadserving: item.no_adserving || false,
          lineItemId,
          line_item_id: lineItemId,
          line_item: item.line_item ?? item.lineItem ?? index + 1,
          lineItem: item.lineItem ?? item.line_item ?? index + 1,
          bursts: bursts,
        };
      });

      console.log("[SocialMediaContainer] Transformed line items:", transformedLineItems);

      form.reset({
        lineItems: stampBurstReactKeys(transformedLineItems),
        overallDeliverables: 0,
      });

      // Recalculate calculatedValue for all bursts after form reset
      // This ensures deliverables are calculated correctly
      setTimeout(() => {
        transformedLineItems.forEach((lineItem, lineItemIndex) => {
          lineItem.bursts.forEach((burst, burstIndex) => {
            const calculatedValue = computeLoadedDeliverables(
              String(lineItem.buyType || ""),
              burst,
              Boolean(lineItem.budgetIncludesFees),
              feesocial || 0
            );
            
            if (calculatedValue !== burst.calculatedValue) {
              form.setValue(`lineItems.${lineItemIndex}.bursts.${burstIndex}.calculatedValue`, calculatedValue, {
                shouldValidate: false,
                shouldDirty: false,
              });
            }
          });
        });
      }, 100);
    },
    socialExpertModalOpenRef,
  )

  // Transform form data to API schema format
  useEffect(() => {
    const formLineItems = form.getValues('lineItems') || [];
    const stableSocialItems = assignStableLineItemNumbers<any>(
      formLineItems,
      mbaNumber,
      MEDIA_TYPE_ID_CODES.socialMedia,
    )
    
    const transformedLineItems = stableSocialItems.map((lineItem, index) => {
      // Calculate totalMedia from raw budget amounts (for display in MBA section)
      let totalMedia = 0;
      lineItem.bursts.forEach((burst) => {
        const budget = parseFloat((burst.budget || "").toString().replace(/[^0-9.]/g, "")) || 0;
        if (lineItem.budgetIncludesFees) {
          // Budget is gross, extract media portion
          // Media = Budget * ((100 - Fee) / 100)
          totalMedia += (budget * (100 - (feesocial || 0))) / 100;
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
        platform: lineItem.platform || "",
        bid_strategy: lineItem.bidStrategy || "",
        buy_type: lineItem.buyType || "",
        creative_targeting: lineItem.creativeTargeting || "",
        creative: lineItem.creative || "",
        buying_demo: lineItem.buyingDemo || "",
        market: lineItem.market || "",
        fixed_cost_media: lineItem.fixedCostMedia || false,
        client_pays_for_media: lineItem.clientPaysForMedia || false,
        budget_includes_fees: lineItem.budgetIncludesFees || false,
        no_adserving: lineItem.noadserving || false,
        line_item_id: lineItem.line_item_id,
        bursts: lineItem.bursts,
        feePct: feesocial || 0,
        line_item: lineItem.line_item,
        totalMedia: totalMedia,
      };
    });

    publishMediaLineItemsIfChanged(mediaLineItemsPublishFpRef, transformedLineItems, onMediaLineItemsChange);
  }, [watchedLineItems, mbaNumber, feesocial, form, onMediaLineItemsChange]);

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
        const budget = parseFloat((burst.budget || "").toString().replace(/[^0-9.]/g, "")) || 0;
        let burstMedia = 0;
        let burstFee = 0;
        // Always calculate media for display purposes (ignore clientPaysForMedia)
        if (lineItem.budgetIncludesFees) {
          // Budget is gross, split into media and fee
          // Media = Budget * ((100 - Fee) / 100)
          // Fees = Budget * (Fee / 100)
          burstMedia = (budget * (100 - (feesocial || 0))) / 100;
          burstFee = (budget * (feesocial || 0)) / 100;
        } else {
          // Budget is net media, fee calculated on top
          // Media = Budget (unchanged)
          // Fees = Budget * (Fee / (100 - Fee))
          burstMedia = budget;
          burstFee = feesocial ? (budget * feesocial) / (100 - feesocial) : 0;
        }
        lineMedia += burstMedia;
        lineFee += burstFee;
        lineDeliverables += parseFloat(
          (burst.calculatedValue ?? "0").toString()
        ) || 0;
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
  }, [watchedLineItems, feesocial]);

  // Callback handlers

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

    const bt = coerceBuyTypeWithDevWarn(String(buyTypeRaw || ""), "SocialMediaContainer.handleValueChange");
    const calculatedValue = computeDeliverableFromMedia({
      buyType: bt,
      rawBudget,
      buyAmount,
      budgetIncludesFees,
      feePct: feesocial || 0,
    });

    const currentValue = form.getValues(`lineItems.${lineItemIndex}.bursts.${burstIndex}.calculatedValue`);
    if (currentValue !== calculatedValue && !isNaN(calculatedValue)) {
      form.setValue(`lineItems.${lineItemIndex}.bursts.${burstIndex}.calculatedValue`, calculatedValue, {
        shouldValidate: false, // Changed to false to prevent validation loops
        shouldDirty: false,    // Changed to false to prevent dirty state loops
      });

      handleLineItemValueChange(lineItemIndex);
    }
  }, [feesocial, form, handleLineItemValueChange]);

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
      case "bonus":
        return "Bonus";
      case "package_inclusions":
        return "Package Inclusions";
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

        const fetchedPublishers = await getPublishersForSocialMedia();
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
  const calculatedBursts = getSocialMediaBursts(form, feesocial || 0);
  let burstIndex = 0;

  const items: LineItem[] = form.getValues('lineItems').flatMap((lineItem, lineItemIndex) =>
    lineItem.bursts.map(burst => {
      const computedBurst = calculatedBursts[burstIndex++];
      const mediaAmount = computedBurst
        ? computedBurst.mediaAmount
        : parseFloat(String(burst.budget).replace(/[^0-9.-]+/g, "")) || 0;
      const lineItemId = buildLineItemId(mbaNumber, MEDIA_TYPE_ID_CODES.socialMedia, lineItemIndex + 1);
      const recomputedDeliverable = computeDeliverableFromMedia({
        buyType: lineItem.buyType,
        rawBudget: parseFloat(String(burst.budget).replace(/[^0-9.-]+/g, "")) || 0,
        buyAmount: parseFloat(String(burst.buyAmount ?? burst.budget).replace(/[^0-9.-]+/g, "")) || 0,
        budgetIncludesFees: !!lineItem.budgetIncludesFees,
        feePct: feesocial || 0,
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
        line_item_id: lineItemId,
        lineItemId,
        line_item: lineItemIndex + 1,
        buyAmount: burst.buyAmount ?? burst.budget,
      };
    })
  );

  // push it up to page.tsx
  onLineItemsChange(items);
}, [watchedLineItems, feesocial, form, mbaNumber, onLineItemsChange]);

// Add new useEffect to capture raw social media line items data
useEffect(() => {
  const rawLineItems = form.getValues('lineItems') || [];
  onSocialMediaLineItemsChange(rawLineItems);
}, [watchedLineItems, form, onSocialMediaLineItemsChange]);

  useEffect(() => {
      const timeoutId = setTimeout(() => {
        const investmentByMonth = calculateInvestmentPerMonth(form, feesocial || 0);
        const bursts = getSocialMediaBursts(form, feesocial || 0);
    
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
}, [watchedLineItems, feesocial, form, onBurstsChange, onInvestmentChange]);

const getBursts = () => {
  const formLineItems = form.getValues("lineItems") || [];
  return formLineItems.flatMap(item =>
    item.bursts.map(burst => {
      const budget = parseFloat(burst.budget?.replace(/[^0-9.]/g, "") || "0");
      let mediaAmount = 0;
      let feeAmount = 0;

      if (item.budgetIncludesFees && item.clientPaysForMedia) {
        // Both true: budget is gross, extract fee only, mediaAmount = 0
        // Media = 0
        // Fees = Budget * (Fee / 100)
        feeAmount = budget * ((feesocial || 0) / 100);
        mediaAmount = 0;
      } else if (item.budgetIncludesFees) {
        // Only budgetIncludesFees: budget is gross, split into media and fee
        // Media = Budget * ((100 - Fee) / 100)
        // Fees = Budget * (Fee / 100)
        mediaAmount = (budget * (100 - (feesocial || 0))) / 100;
        feeAmount = (budget * (feesocial || 0)) / 100;
      } else if (item.clientPaysForMedia) {
        // Only clientPaysForMedia: budget is net media, only fee is billed
        feeAmount = (budget / (100 - (feesocial || 0))) * (feesocial || 0);
        mediaAmount = 0;
      } else {
        // Neither: budget is net media, fee calculated on top
        // Media = Budget (unchanged)
        // Fees = Budget * (Fee / (100 - Fee))
        mediaAmount = budget;
        feeAmount = (budget * (feesocial || 0)) / (100 - (feesocial || 0));
      }

      const billingBurst: BillingBurst = {
        startDate: burst.startDate,
        endDate: burst.endDate,
        mediaAmount: mediaAmount,
        feeAmount: feeAmount,
        totalAmount: mediaAmount + feeAmount,
        mediaType: 'social',
        feePercentage: feesocial,
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
          <div
            className="h-1"
            style={mediaTypeSummaryStripeStyle(MEDIA_ACCENT_HEX_SOCIAL)}
          />
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <CardTitle className="text-base font-semibold tracking-tight">
                    Social Media
                  </CardTitle>
                  {socialExpertModalOpen ? (
                    <Badge
                      variant="outline"
                      className="border-2 text-[10px] font-semibold uppercase tracking-wider shadow-sm"
                      style={{
                        borderColor: rgbaFromHex(MEDIA_ACCENT_HEX_SOCIAL, 0.55),
                        backgroundColor: rgbaFromHex(
                          MEDIA_ACCENT_HEX_SOCIAL,
                          0.14
                        ),
                        color: MEDIA_ACCENT_HEX_SOCIAL,
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
                  aria-label="Social Media entry mode"
                  className="inline-flex shrink-0 rounded-lg border border-border bg-muted/50 p-0.5"
                >
                  <button
                    type="button"
                    aria-pressed={!socialExpertModalOpen}
                    className={cn(
                      "rounded-md px-3 py-1.5 text-xs font-medium transition-all",
                      !socialExpertModalOpen
                        ? "text-white shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                    style={
                      !socialExpertModalOpen
                        ? { backgroundColor: MEDIA_ACCENT_HEX_SOCIAL }
                        : undefined
                    }
                    onClick={() => {
                      if (socialExpertModalOpen) {
                        writeContainerEntryMode("card")
                        handleSocialExpertModalOpenChange(false)
                      }
                    }}
                  >Card entry</button>
                  <button
                    type="button"
                    aria-pressed={socialExpertModalOpen}
                    className={cn(
                      "rounded-md px-3 py-1.5 text-xs font-medium transition-all",
                      socialExpertModalOpen
                        ? "text-white shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                      expertSegmentAttention &&
                        !socialExpertModalOpen &&
                        "animate-pulse"
                    )}
                    style={{
                      ...(socialExpertModalOpen
                        ? { backgroundColor: MEDIA_ACCENT_HEX_SOCIAL }
                        : {}),
                      ...(expertSegmentAttention && !socialExpertModalOpen
                        ? {
                            boxShadow: `0 0 0 2px ${rgbaFromHex(MEDIA_ACCENT_HEX_SOCIAL, 0.45)}`,
                          }
                        : {}),
                    }}
                    onClick={() => {
                      if (!socialExpertModalOpen) {
                        writeContainerEntryMode("schedule")
                          openSocialExpertModal()
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
              feeLabel={`Fee (${feesocial}%)`}
              accentHex={MEDIA_ACCENT_HEX_SOCIAL}
              dimensions={["Platform", "Bid Strategy", "Buy Type"]}
              deliverablesLabelFor={getDeliverablesLabel}
            />
            <MediaContainerTimelineCollapsible
              mediaTypeKey="socialMedia"
              lineItems={watchedLineItems}
              campaignStartDate={campaignStartDate}
              campaignEndDate={campaignEndDate}
            />
          </CardContent>
        </Card>
      </div>

      <div>
      {isLoading ? (
        <MediaContainerLoadState loading label="Social Media" />
      ) : (
        <div className="space-y-6">
          {socialExpertModalOpen ? null : (
          <Form {...form}>
            <div className="space-y-6">
                {lineItemFields.length === 0 ? (
                  <ContainerEmptyLinesPlaceholder
                    onAdd={() => appendLineItem({
                                                          platform: "",
                                                          bidStrategy: "",
                                                          buyType: "",
                                                          creativeTargeting: "",
                                                          creative: "",
                                                          buyingDemo: "",
                                                          market: "",
                                                          fixedCostMedia: false,
                                                          clientPaysForMedia: false,
                                                          budgetIncludesFees: false,
                                                          noadserving: false,
                                                          bursts: [
                                                            {
                                                              _reactKey: newBurstReactKey(),
                                                              budget: "",
                                                              buyAmount: "",
                                                              startDate: defaultMediaBurstStartDate(campaignStartDate, campaignEndDate),
                                                              endDate: defaultMediaBurstEndDate(campaignStartDate, campaignEndDate),
                                                              calculatedValue: 0,
                                                              fee: 0,
                                                            },
                                                          ],
                                                        })}
                  />
                ) : null}
                {lineItemFields.map((field, lineItemIndex) => {
                const lineItemId = buildLineItemId(
                  mbaNumber,
                  MEDIA_TYPE_ID_CODES.socialMedia,
                  lineItemIndex + 1
                );
                const getTotals = (lineItemIndex: number) => {
                  const lineItem = form.getValues(`lineItems.${lineItemIndex}`);
                  let totalMedia = 0;
                  let totalCalculatedValue = 0;

                  lineItem.bursts.forEach((burst) => {
                    const budget = parseFloat((burst.budget || "").toString().replace(/[^0-9.]/g, "")) || 0;
                    totalMedia += budget;
                    totalCalculatedValue += burst.calculatedValue || 0;
                  });

                  return { totalMedia, totalCalculatedValue };
                };

                const { totalMedia, totalCalculatedValue } = getTotals(lineItemIndex);

                return (
                    <ExpertCard<SocialMediaFormValues>
                      key={field.id}
                      config={SOCIALMEDIA_EXPERT_CHANNEL_CONFIG}
                      form={form}
                      itemsKey="lineItems"
                      lineItemIndex={lineItemIndex}
                      lineItemId={lineItemId}
                      collapsed={collapsedLineItems.has(lineItemIndex)}
                      onToggleCollapsed={() => toggleLineItemCollapsed(lineItemIndex)}
                      totalDisplay={formatMoney(
                        form.getValues(`lineItems.${lineItemIndex}.budgetIncludesFees`)
                          ? totalMedia
                          : totalMedia + (totalMedia / (100 - (feesocial || 0))) * (feesocial || 0),
                        { locale: "en-AU", currency: "AUD" }
                      )}
                      publishers={publishers}
                      feePct={feesocial || 0}
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
                              <span className="font-medium">Bid strategy:</span>{" "}
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
                                    platform: "",
                                    bidStrategy: "",
                                    buyType: "",
                                    creativeTargeting: "",
                                    creative: "",
                                    buyingDemo: "",
                                    market: "",
                                    fixedCostMedia: false,
                                    clientPaysForMedia: false,
                                    budgetIncludesFees: false,
                                    noadserving: false,
                                    bursts: [
                                      {
                                        _reactKey: newBurstReactKey(),
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
        open={socialExpertModalOpen}
        onOpenChange={handleSocialExpertModalOpenChange}
      >
        <DialogContent className="max-w-[95vw] w-[95vw] max-h-[95vh] h-[95vh] flex flex-col p-4 gap-0 overflow-hidden">
          <DialogHeader className="flex-shrink-0 pb-2">
            <DialogTitle>Social Media Expert Mode</DialogTitle>
          </DialogHeader>
          <ComboboxModalProvider>
            <div className="flex-1 min-h-0 overflow-auto">
              <SocialMediaExpertGrid
                campaignStartDate={campaignStartDate}
                campaignEndDate={campaignEndDate}
                feesocial={feesocial}
                rows={expertSocialRows}
                onRowsChange={handleExpertSocialRowsChange}
                publishers={publishers}
                onReorder={() => {
                  reorderedRef.current = true;
                }}
              />
            </div>
          </ComboboxModalProvider>
          <DialogFooter className="flex-shrink-0 border-t pt-3 mt-2">
            <div className="mr-auto flex flex-col gap-1.5">
              <ExpertIncompleteRowsSummary rows={expertSocialRows} />
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
            <Button type="button" onClick={handleSocialExpertApply}>
              Apply to plan (not saved yet)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={socialExpertExitConfirmOpen}
        onOpenChange={(open) => {
          if (!open) dismissSocialExpertExitConfirm()
        }}
      >
        <DialogContent
          className="z-[100] sm:max-w-md"
          onClick={(e) => {
            if (
              (e.target as HTMLElement).closest(
                "[data-socialmedia-expert-exit-yes]"
              )
            ) {
              return
            }
            dismissSocialExpertExitConfirm()
          }}
        >
          <DialogHeader>
            <DialogTitle>Leave Social Media Expert Mode?</DialogTitle>
            <DialogDescription>
              You have unsaved changes in Expert Mode. Apply saves them to the
              Social Media section; leaving now discards those edits.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={dismissSocialExpertExitConfirm}
            >
              No, keep editing
            </Button>
            <Button
              type="button"
              variant="destructive"
              data-socialmedia-expert-exit-yes
              onClick={confirmSocialExpertExitWithoutSaving}
            >
              Yes, leave without saving
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
