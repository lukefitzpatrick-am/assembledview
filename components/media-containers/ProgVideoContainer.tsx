"use client"

import { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } from "react"
import { useForm, useFieldArray, UseFormReturn, type Resolver } from "react-hook-form"
import { useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Combobox } from "@/components/ui/combobox"
import { Checkbox } from "@/components/ui/checkbox"
import { Textarea } from "@/components/ui/textarea"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { useToast } from "@/components/ui/use-toast"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { getPublishersForProgVideo } from "@/lib/api"
import { formatBurstLabel } from "@/lib/bursts"
import { format } from "date-fns"
import { useMediaPlanContext } from "@/contexts/MediaPlanContext"
import { MEDIA_TYPE_ID_CODES, buildLineItemId } from "@/lib/mediaplan/lineItemIds"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { ChevronDown, Copy, Plus, Trash2 } from "lucide-react"
import type { BillingBurst } from "@/lib/billing/types"
import type { LineItem } from '@/lib/generateMediaPlan'
import { formatMoney, parseMoneyInput } from "@/lib/format/money"
import {
  CpcFamilyBurstCalculatedField,
  getCpcFamilyBurstCalculatedColumnLabel,
} from "@/components/media-containers/burst-calculated-fields"
import {
  MP_BURST_ACTION_COLUMN,
  MP_BURST_CARD,
  MP_BURST_CARD_CONTENT,
  MP_BURST_GRID_7,
  MP_BURST_HEADER_INNER,
  MP_BURST_HEADER_SHELL,
  MP_BURST_LABEL_COLUMN,
  MP_BURST_SECTION_OUTER,

  MP_BURST_HEADER_ROW,
  MP_BURST_LABEL_HEADING,
  MP_BURST_ROW_SHELL,} from "@/lib/mediaplan/burstSectionLayout"
import { SingleDatePicker } from "@/components/ui/single-date-picker"
import { defaultMediaBurstStartDate, defaultMediaBurstEndDate } from "@/lib/date-picker-anchor"
import MediaContainerTimelineCollapsible from "@/components/media-containers/MediaContainerTimelineCollapsible"
import {
  ProgVideoExpertGrid,
  createEmptyProgVideoExpertRow,
} from "@/components/media-containers/ProgVideoExpertGrid"
import type { ProgVideoExpertScheduleRow } from "@/lib/mediaplan/expertModeWeeklySchedule"
import {
  mapProgVideoExpertRowsToStandardLineItems,
  mapStandardProgVideoLineItemsToExpertRows,
  type StandardProgVideoFormLineItem,
} from "@/lib/mediaplan/expertOohRadioMappings"
import {
  mergeProgVideoStandardFromExpertWithPrevious,
  serializeProgVideoExpertRowsBaseline,
  serializeProgVideoStandardLineItemsBaseline,
} from "@/lib/mediaplan/expertModeSwitch"
import { buildWeeklyGanttColumnsFromCampaign } from "@/lib/utils/weeklyGanttColumns"
import { getMediaTypeThemeHex, rgbaFromHex } from "@/lib/mediaplan/mediaTypeAccents"

const PROG_VIDEO_MEDIA_HEX = getMediaTypeThemeHex("progvideo")

const computeLoadedDeliverables = (buyType: string, burst: any) => {
  const budget = parseFloat(String(burst?.budget ?? "0").replace(/[^0-9.]/g, "")) || 0
  const buyAmount = parseFloat(String(burst?.buyAmount ?? "1").replace(/[^0-9.]/g, "")) || 0
  const type = (buyType || "").toLowerCase()

  switch (type) {
    case "cpc":
    case "cpv":
      return buyAmount !== 0 ? budget / buyAmount : 0
    case "cpm":
      return buyAmount !== 0 ? (budget / buyAmount) * 1000 : 0
    case "fixed_cost":
    case "package":
      return 1
    case "bonus":
      return parseFloat(String(burst?.calculatedValue ?? burst?.deliverables ?? 0).replace(/[^0-9.]/g, "")) || 0
    default:
      return parseFloat(String(burst?.calculatedValue ?? burst?.deliverables ?? burst?.impressions ?? 0).replace(/[^0-9.]/g, "")) || 0
  }
}

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

/** Net media when budget is gross incl. fee — must match `getProgVideoBursts` / burst row readouts (linear split). */
function netMediaFeeMarkup(rawBudget: number, budgetIncludesFees: boolean, feePct: number): number {
  if (!budgetIncludesFees) return rawBudget;
  const pct = feePct || 0;
  return (rawBudget * (100 - pct)) / 100;
}

// Exported utility function to get bursts
export function getAllBursts(form) {
  const lineItems = form.getValues("lineItems") || [];

  return lineItems.flatMap((lineItem) =>
    lineItem.bursts.map((burst) => ({
      startDate: burst.startDate,
      endDate: burst.endDate,
      budget: burst.budget,
    }))
  );
}

const burstSchema = z.object({
  budget: z.string().min(1, "Budget is required"),
  buyAmount: z.string().min(1, "Buy Amount is required"),
  startDate: z.date(),
  endDate: z.date(),
  calculatedValue: z.number().optional(),
  fee: z.number().optional(),
})

const lineItemSchema = z.object({
  platform: z.string().min(1, "Platform is required"),
  bidStrategy: z.string().min(1, "Bid strategy is required"),
  buyType: z.string().min(1, "Buy Type is required"),
  creativeTargeting: z.string().default(""),
  creative: z.string().default(""),
  buyingDemo: z.string().default(""),
  market: z.string().default(""),
  site: z.string().default(""),
  placement: z.string().default(""),
  size: z.string().default(""),
  targetingAttribute: z.string().default(""),
  fixedCostMedia: z.boolean().default(false),
  clientPaysForMedia: z.boolean().default(false),
  budgetIncludesFees: z.boolean().default(false),
  noadserving: z.boolean().default(false),
  bursts: z.array(burstSchema).min(1, "At least one burst is required"),
  totalMedia: z.number().optional(),
  totalDeliverables: z.number().optional(),
  totalFee: z.number().optional(),
})

const progVideoFormSchema = z.object({
  lineItems: z.array(lineItemSchema),
  overallDeliverables: z.number().optional(),
})

type ProgVideoFormValues = z.infer<typeof progVideoFormSchema>

interface Publisher {
  id: number;
  publisher_name: string;
}

interface ProgVideoContainerProps {
  clientId: string;
  feeprogvideo: number;
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

export function getProgVideoBursts(
  form: UseFormReturn<ProgVideoFormValues>,
  feeprogvideo: number
): BillingBurst[] {
  const lineItems = form.getValues("lineItems") || []

  return lineItems.flatMap(li =>
    li.bursts.map(burst => {
      const rawBudget = parseFloat(burst.budget.replace(/[^0-9.]/g, "")) || 0

      const pct = feeprogvideo || 0
      let feeAmount = 0
      let deliveryMediaAmount = rawBudget
      let mediaAmount = rawBudget

      // Delivery schedule should always include media delivery, even if billing media is $0.
      if (li.budgetIncludesFees) {
        feeAmount = rawBudget * (pct / 100)
        const netMedia = rawBudget * ((100 - pct) / 100)
        deliveryMediaAmount = netMedia
        mediaAmount = li.clientPaysForMedia ? 0 : netMedia
      } else if (li.clientPaysForMedia) {
        // Budget is net media, only fee is billed
        feeAmount = (rawBudget / (100 - pct)) * pct
        deliveryMediaAmount = rawBudget
        mediaAmount = 0
      } else {
        // Budget is net media, fee billed on top
        feeAmount = (rawBudget * pct) / (100 - pct)
        deliveryMediaAmount = rawBudget
        mediaAmount = rawBudget
      }

      return {
        startDate: burst.startDate,
        endDate:   burst.endDate,

        mediaAmount,
        deliveryMediaAmount,
        feeAmount,
        totalAmount: mediaAmount + feeAmount,

        mediaType:          "Prog Video",
        feePercentage:      pct,
        clientPaysForMedia: li.clientPaysForMedia,
        budgetIncludesFees: li.budgetIncludesFees,
        noAdserving: li.noadserving,
        deliverables: burst.calculatedValue ?? 0,
        buyType: li.buyType,
      }
    })
  )
}

export function calculateInvestmentPerMonth(form, feeprogvideo) {
  const lineItems = form.getValues("lineItems") || [];
  let monthlyInvestment: Record<string, number> = {};

  lineItems.forEach((lineItem) => {
    lineItem.bursts.forEach((burst) => {
      const startDate = new Date(burst.startDate);
      const endDate = new Date(burst.endDate);
      const lineMedia = parseFloat(burst.budget.replace(/[^0-9.]/g, "")) || 0;
      const feePercentage = feeprogvideo || 0;

      // ✅ Corrected total investment calculation
      const totalInvestment = lineMedia + ((lineMedia / (100 - feePercentage)) * feePercentage);
      const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;

      let current = new Date(startDate);
      while (current <= endDate) {
        const monthYear = `${current.toLocaleString("default", { month: "long" })} ${current.getFullYear()}`;
        
        if (!monthlyInvestment[monthYear]) {
          monthlyInvestment[monthYear] = 0;
        }

        // ✅ Count the number of days in the current month
        const nextMonth = new Date(current.getFullYear(), current.getMonth() + 1, 1);

        const lastDayOfMonth = new Date(nextMonth.getTime() - 1);
        const daysInThisMonth = Math.min(lastDayOfMonth.getDate(), Math.ceil((endDate.getTime() - current.getTime()) / (1000 * 60 * 60 * 24)) + 1);

        const investmentForThisMonth = (totalInvestment / totalDays) * daysInThisMonth;
        monthlyInvestment[monthYear] += investmentForThisMonth;

        // Move to the next month
        current = new Date(current.getFullYear(), current.getMonth() + 1, 1);
      }
    });
  });

  return Object.entries(monthlyInvestment).map(([monthYear, amount]) => ({
    monthYear,
    amount: formatMoney(amount, { locale: "en-AU", currency: "AUD" }),
  }));
}

export function calculateBurstInvestmentPerMonth(form, feeprogvideo) {
  const lineItems = form.getValues("lineItems") || [];
  let monthlyInvestment: Record<string, number> = {};

  lineItems.forEach((lineItem) => {
    lineItem.bursts.forEach((burst) => {
      const startDate = new Date(burst.startDate);
      const endDate = new Date(burst.endDate);
      const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      const burstBudget = parseFloat(burst.budget.replace(/[^0-9.]/g, "")) || 0;
      const feePercentage = feeprogvideo || 0;
      
      // Calculate total investment including fees
      const totalInvestment = burstBudget + ((burstBudget / (100 - feePercentage)) * feePercentage);

      let current = new Date(startDate);
      while (current <= endDate) {
        const monthYear = `${current.toLocaleString("default", { month: "long" })} ${current.getFullYear()}`;

        // Find the number of days in this month that overlap with the burst
        const nextMonth = new Date(current.getFullYear(), current.getMonth() + 1, 1);
        const lastDayOfMonth = new Date(nextMonth.getTime() - 1);
        const daysInThisMonth = Math.min(
          Math.ceil((lastDayOfMonth.getTime() - current.getTime()) / (1000 * 60 * 60 * 24)) + 1,
          Math.ceil((endDate.getTime() - current.getTime()) / (1000 * 60 * 60 * 24)) + 1
        );

        const monthlyBudget = (totalInvestment / totalDays) * daysInThisMonth;

        if (!monthlyInvestment[monthYear]) {
          monthlyInvestment[monthYear] = 0;
        }

        monthlyInvestment[monthYear] += monthlyBudget;

        // Move to the next month
        current = new Date(current.getFullYear(), current.getMonth() + 1, 1);
      }
    });
  });

  return Object.entries(monthlyInvestment).map(([monthYear, amount]) => ({
    monthYear,
    amount: amount.toFixed(2),
  }));
}

export default function ProgVideoContainer({
  clientId,
  feeprogvideo,
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
}: ProgVideoContainerProps) {
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
  const form = useForm<ProgVideoFormValues>({
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
          site: "",
          placement: "",
          size: "",
          targetingAttribute: "",
          fixedCostMedia: false,
          clientPaysForMedia: false,
          budgetIncludesFees: false,
          noadserving: false,
          bursts: [
            {
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
      overallDeliverables: 0,
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

  const progvideoStandardBaselineRef = useRef("")
  const [expertProgVideoRows, setExpertProgVideoRows] = useState<
    ProgVideoExpertScheduleRow[]
  >([])
  const [progvideoExpertModalOpen, setProgVideoExpertModalOpen] =
    useState(false)
  const [progvideoExpertExitConfirmOpen, setProgVideoExpertExitConfirmOpen] =
    useState(false)
  const [expertSegmentAttention, setExpertSegmentAttention] = useState(true)
  const progvideoExpertRowsBaselineRef = useRef("")
  const progvideoExpertModalOpenRef = useRef(false)
  progvideoExpertModalOpenRef.current = progvideoExpertModalOpen

  const progvideoExpertWeekColumns = useMemo(
    () => buildWeeklyGanttColumnsFromCampaign(campaignStartDate, campaignEndDate),
    [campaignStartDate, campaignEndDate]
  )

  useLayoutEffect(() => {
    progvideoStandardBaselineRef.current =
      serializeProgVideoStandardLineItemsBaseline(
        form.getValues("lineItems") as StandardProgVideoFormLineItem[]
      )
  }, [form])

  useEffect(() => {
    const id = window.setTimeout(() => setExpertSegmentAttention(false), 2800)
    return () => window.clearTimeout(id)
  }, [])

  const handleExpertProgVideoRowsChange = useCallback(
    (next: ProgVideoExpertScheduleRow[]) => {
      setExpertProgVideoRows(next)
    },
    []
  )

  const openProgVideoExpertModal = useCallback(() => {
    const mapped = mapStandardProgVideoLineItemsToExpertRows(
      (form.getValues("lineItems") || []) as StandardProgVideoFormLineItem[],
      progvideoExpertWeekColumns,
      campaignStartDate,
      campaignEndDate
    )
    const weekKeys = progvideoExpertWeekColumns.map((c) => c.weekKey)
    const rows: ProgVideoExpertScheduleRow[] =
      mapped.length > 0
        ? mapped
        : [
            createEmptyProgVideoExpertRow(
              typeof crypto !== "undefined" && crypto.randomUUID
                ? crypto.randomUUID()
                : `progvideo-expert-${Date.now()}`,
              campaignStartDate,
              campaignEndDate,
              weekKeys
            ),
          ]
    progvideoExpertRowsBaselineRef.current =
      serializeProgVideoExpertRowsBaseline(rows)
    setExpertProgVideoRows(rows)
    setProgVideoExpertExitConfirmOpen(false)
    setProgVideoExpertModalOpen(true)
  }, [campaignStartDate, campaignEndDate, form, progvideoExpertWeekColumns])

  const dismissProgVideoExpertExitConfirm = useCallback(() => {
    setProgVideoExpertExitConfirmOpen(false)
  }, [])

  const confirmProgVideoExpertExitWithoutSaving = useCallback(() => {
    setProgVideoExpertExitConfirmOpen(false)
    collapseAllLineItems()
    setProgVideoExpertModalOpen(false)
  }, [collapseAllLineItems])

  const handleProgVideoExpertModalOpenChange = useCallback(
    (open: boolean) => {
      if (open) {
        setProgVideoExpertModalOpen(true)
        return
      }
      const dirty =
        serializeProgVideoExpertRowsBaseline(expertProgVideoRows) !==
        progvideoExpertRowsBaselineRef.current
      if (!dirty) {
        collapseAllLineItems()
        setProgVideoExpertModalOpen(false)
        return
      }
      setProgVideoExpertExitConfirmOpen(true)
    },
    [collapseAllLineItems, expertProgVideoRows]
  )

  const handleProgVideoExpertApply = useCallback(() => {
    const prevLineItems = form.getValues("lineItems") || []
    const standard = mapProgVideoExpertRowsToStandardLineItems(
      expertProgVideoRows,
      progvideoExpertWeekColumns,
      campaignStartDate,
      campaignEndDate,
      {
        feePctProgVideo: feeprogvideo,
        budgetIncludesFees: Boolean(prevLineItems[0]?.budgetIncludesFees),
      }
    )
    const merged = mergeProgVideoStandardFromExpertWithPrevious(
      standard,
      prevLineItems as StandardProgVideoFormLineItem[]
    )
    form.setValue("lineItems", merged as ProgVideoFormValues["lineItems"], {
      shouldDirty: true,
      shouldValidate: false,
    })
    progvideoStandardBaselineRef.current =
      serializeProgVideoStandardLineItemsBaseline(
        form.getValues("lineItems") as StandardProgVideoFormLineItem[]
      )
    setProgVideoExpertExitConfirmOpen(false)
    collapseAllLineItems()
    setProgVideoExpertModalOpen(false)
  }, [
    campaignStartDate,
    campaignEndDate,
    collapseAllLineItems,
    expertProgVideoRows,
    feeprogvideo,
    form,
    progvideoExpertWeekColumns,
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
        startDate: burst?.startDate ? new Date(burst.startDate) : new Date(),
        endDate: burst?.endDate ? new Date(burst.endDate) : new Date(),
        calculatedValue: burst?.calculatedValue ?? 0,
        fee: burst?.fee ?? 0,
      })),
    };

    appendLineItem(clone);
  }, [appendLineItem, form, toast]);

  // Watch hook
  const watchedLineItems = useWatch({ 
    control: form.control, 
    name: "lineItems",
    defaultValue: form.getValues("lineItems")
  });

  // Data loading for edit mode
  useEffect(() => {
    if (progvideoExpertModalOpenRef.current) return
    if (initialLineItems && initialLineItems.length > 0) {
      const transformedLineItems = initialLineItems.map((item: any) => {
        const normalizedPlatform = item.platform || item.publisher || "";
        const normalizedSite = item.site || item.publisher || normalizedPlatform;

        return {
          platform: normalizedPlatform,
          bidStrategy: item.bid_strategy || "",
          buyType: item.buy_type || "",
          creativeTargeting: item.creative_targeting || "",
          creative: item.creative || "",
          buyingDemo: item.buying_demo || "",
          market: item.market || "",
          site: normalizedSite,
          placement: item.placement || "",
          size: item.size || "",
          targetingAttribute: item.targeting_attribute || "",
          fixedCostMedia: item.fixed_cost_media || false,
          clientPaysForMedia: item.client_pays_for_media || false,
          budgetIncludesFees: item.budget_includes_fees || false,
          noadserving: item.no_adserving || false,
          bursts: item.bursts_json
            ? (typeof item.bursts_json === "string"
                ? JSON.parse(item.bursts_json)
                : item.bursts_json
              ).map((burst: any) => ({
                budget: burst.budget || "",
                buyAmount: burst.buyAmount || "",
                startDate: burst.startDate ? new Date(burst.startDate) : new Date(),
                endDate: burst.endDate ? new Date(burst.endDate) : new Date(),
                calculatedValue: computeLoadedDeliverables(item.buy_type || item.buyType, burst),
                fee: burst.fee || 0,
              }))
            : [
                {
                  budget: "",
                  buyAmount: "",
                  startDate: defaultMediaBurstStartDate(campaignStartDate, campaignEndDate),
                  endDate: defaultMediaBurstEndDate(campaignStartDate, campaignEndDate),
                  calculatedValue: computeLoadedDeliverables(item.buy_type || item.buyType, {}),
                  fee: 0,
                },
              ],
          totalMedia: item.total_media || 0,
          totalDeliverables: item.total_deliverables || 0,
          totalFee: item.total_fee || 0,
        };
      });

      form.reset({
        lineItems: transformedLineItems,
        overallDeliverables: 0,
      });
    }
  }, [initialLineItems, form, campaignStartDate, campaignEndDate]);

  // Transform form data to API schema format
  useEffect(() => {
    const formLineItems = form.getValues('lineItems') || [];
    
    const transformedLineItems = formLineItems.map((lineItem, index) => {
      // Calculate totalMedia from raw budget amounts (for display in MBA section)
      let totalMedia = 0;
      lineItem.bursts.forEach((burst) => {
        const budget = parseFloat(burst.budget.replace(/[^0-9.]/g, "")) || 0;
        if (lineItem.budgetIncludesFees) {
          const pct = feeprogvideo || 0;
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
        platform: lineItem.platform || "",
        bid_strategy: lineItem.bidStrategy || "",
        site: lineItem.site || "",
        placement: lineItem.placement || "",
        size: lineItem.size || "",
        buy_type: lineItem.buyType || "",
        targeting_attribute: lineItem.targetingAttribute || "",
        creative_targeting: lineItem.creativeTargeting || "",
        creative: lineItem.creative || "",
        buying_demo: lineItem.buyingDemo || "",
        market: lineItem.market || "",
        fixed_cost_media: lineItem.fixedCostMedia || false,
        client_pays_for_media: lineItem.clientPaysForMedia || false,
        budget_includes_fees: lineItem.budgetIncludesFees || false,
        no_adserving: lineItem.noadserving || false,
        line_item_id: buildLineItemId(mbaNumber, MEDIA_TYPE_ID_CODES.progVideo, index + 1),
        bursts_json: JSON.stringify(lineItem.bursts.map(burst => ({
          budget: burst.budget || "",
          buyAmount: burst.buyAmount || "",
          startDate: burst.startDate ? (burst.startDate instanceof Date ? burst.startDate.toISOString() : burst.startDate) : "",
          endDate: burst.endDate ? (burst.endDate instanceof Date ? burst.endDate.toISOString() : burst.endDate) : "",
          calculatedValue: burst.calculatedValue || 0,
          fee: burst.fee || 0,
        }))),
        line_item: index + 1,
        totalMedia: totalMedia,
      };
    });

    onMediaLineItemsChange(transformedLineItems);
  }, [watchedLineItems, mbaNumber, feeprogvideo, form, onMediaLineItemsChange]);
  
  // Memoized calculations
  // Note: For display purposes, always show media amounts regardless of clientPaysForMedia
  // The billing schedule will handle excluding media when clientPaysForMedia is true
  const overallTotals = useMemo(() => {
    let overallMedia = 0;
    let overallFee = 0;
    let overallCost = 0;
    
    const lineItemTotals = watchedLineItems.map((lineItem, index) => {
      let lineMedia = 0;
      let lineDeliverables = 0;
      let lineFee = 0;
      let lineCost = 0;
    
      lineItem.bursts.forEach((burst) => {
        const budget = parseFloat(burst.budget.replace(/[^0-9.]/g, "")) || 0;
        // Always calculate media for display purposes (ignore clientPaysForMedia)
        if (lineItem.budgetIncludesFees) {
          const pct = feeprogvideo || 0;
          lineMedia += (budget * (100 - pct)) / 100;
          lineFee += (budget * pct) / 100;
        } else {
          // Budget is net media, fee calculated on top
          lineMedia += budget;
          const fee = feeprogvideo ? (budget / (100 - feeprogvideo)) * feeprogvideo : 0;
          lineFee += fee;
        }
        lineDeliverables += burst.calculatedValue || 0;
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
      };
    });
    
    return { lineItemTotals, overallMedia, overallFee, overallCost };
  }, [watchedLineItems, feeprogvideo]);
  
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
          const pct = feeprogvideo || 0;
          lineMedia += (budget * (100 - pct)) / 100;
          lineFee += (budget * pct) / 100;
        } else {
          lineMedia += budget;
          const fee = feeprogvideo ? (budget / (100 - feeprogvideo)) * feeprogvideo : 0;
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
  }, [form, feeprogvideo, onTotalMediaChange]);

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
    const budget = netMediaFeeMarkup(rawBudget, budgetIncludesFees, feeprogvideo || 0);
    const buyAmount = parseFloat(burst?.buyAmount?.replace(/[^0-9.]/g, "") || "1");
    const buyType = form.getValues(`lineItems.${lineItemIndex}.buyType`);

    let calculatedValue = 0;
    switch (buyType) {
      case "cpc":
      case "cpv":
        calculatedValue = buyAmount !== 0 ? budget / buyAmount : 0;
        break;
      case "cpm":
        calculatedValue = buyAmount !== 0 ? (budget / buyAmount) * 1000 : 0;
        break;
      case "fixed_cost":
        calculatedValue = 1;
        break;
      case "bonus":
        calculatedValue = parseFloat(
          (burst?.calculatedValue ?? "0").toString().replace(/[^0-9.]/g, "")
        ) || 0;
        break;
      default:
        calculatedValue = 0;
    }

    // Only update if the calculated value is actually different to prevent infinite loops
    const currentValue = form.getValues(`lineItems.${lineItemIndex}.bursts.${burstIndex}.calculatedValue`);
    if (currentValue !== calculatedValue && !isNaN(calculatedValue)) {
      form.setValue(`lineItems.${lineItemIndex}.bursts.${burstIndex}.calculatedValue`, calculatedValue, {
        shouldValidate: false, // Changed to false to prevent validation loops
        shouldDirty: false,    // Changed to false to prevent dirty state loops
      });

      handleLineItemValueChange(lineItemIndex);
    }
  }, [feeprogvideo, form, handleLineItemValueChange]);

  const handleAppendBurst = useCallback((lineItemIndex: number) => {
    const currentBursts = form.getValues(`lineItems.${lineItemIndex}.bursts`) || [];
    
    // Check if we've reached the maximum number of bursts (12)
    if (currentBursts.length >= 12) {
      toast({
        title: "Maximum bursts reached",
        description: "Can't add more bursts. Each line item is limited to 12 bursts.",
        variant: "destructive",
      });
      return;
    }
    
    // Get the end date of the last burst
    let startDate = new Date();
    if (currentBursts.length > 0) {
      const lastBurst = currentBursts[currentBursts.length - 1];
      if (lastBurst.endDate) {
        // Set start date to one day after the end date of the last burst
        startDate = new Date(lastBurst.endDate);
        startDate.setDate(startDate.getDate() + 1);
      }
    }
    
    // Set end date to the last day of the month based on the start date
    const endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0);
    
    form.setValue(`lineItems.${lineItemIndex}.bursts`, [
      ...currentBursts,
      {
        budget: "",
        buyAmount: "",
        startDate: startDate,
        endDate: endDate,
        calculatedValue: 0,
        fee: 0,
      },
    ]);

    handleLineItemValueChange(lineItemIndex);
  }, [form, handleLineItemValueChange, toast]);

  const handleDuplicateBurst = useCallback((lineItemIndex: number) => {
    const currentBursts = form.getValues(`lineItems.${lineItemIndex}.bursts`) || [];

    if (currentBursts.length === 0) {
      toast({
        title: "No burst to duplicate",
        description: "Add a burst first before duplicating.",
        variant: "destructive",
      });
      return;
    }

    if (currentBursts.length >= 12) {
      toast({
        title: "Maximum bursts reached",
        description: "Can't add more bursts. Each line item is limited to 12 bursts.",
        variant: "destructive",
      });
      return;
    }

    const lastBurst = currentBursts[currentBursts.length - 1];

    let startDate = new Date();
    if (lastBurst?.endDate) {
      startDate = new Date(lastBurst.endDate);
      startDate.setDate(startDate.getDate() + 1);
    }

    const endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0);

    const duplicatedBurst = {
      budget: lastBurst?.budget ?? "",
      buyAmount: lastBurst?.buyAmount ?? "",
      startDate,
      endDate,
      calculatedValue: lastBurst?.calculatedValue ?? 0,
      fee: lastBurst?.fee ?? 0,
    };

    form.setValue(`lineItems.${lineItemIndex}.bursts`, [
      ...currentBursts,
      duplicatedBurst,
    ]);

    handleLineItemValueChange(lineItemIndex);
  }, [form, handleLineItemValueChange, toast]);

  const handleRemoveBurst = useCallback((lineItemIndex: number, burstIndex: number) => {
    const currentBursts = form.getValues(`lineItems.${lineItemIndex}.bursts`) || [];
    form.setValue(
      `lineItems.${lineItemIndex}.bursts`,
      currentBursts.filter((_, index) => index !== burstIndex),
    );

    handleLineItemValueChange(lineItemIndex);
  }, [form, handleLineItemValueChange]);

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

        const fetchedPublishers = await getPublishersForProgVideo();
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
  const calculatedBursts = getProgVideoBursts(form, feeprogvideo || 0);
  let burstIndex = 0;

  const items: LineItem[] = form.getValues('lineItems').flatMap((lineItem, lineItemIndex) =>
    lineItem.bursts.map(burst => {
      const computedBurst = calculatedBursts[burstIndex++];
      const mediaAmount = computedBurst
        ? computedBurst.mediaAmount
        : parseFloat(String(burst.budget).replace(/[^0-9.-]+/g, "")) || 0;
      const lineItemId = buildLineItemId(mbaNumber, MEDIA_TYPE_ID_CODES.progVideo, lineItemIndex + 1);

      return {
        market: lineItem.market,                                // or fixed value
        platform: lineItem.platform,
        bidStrategy: lineItem.bidStrategy,
        targeting: lineItem.creativeTargeting,
        creative:   lineItem.creative,
        startDate: formatDateString(burst.startDate),
        endDate:   formatDateString(burst.endDate),
        deliverables: burst.calculatedValue ?? 0,
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
}, [watchedLineItems, feeprogvideo, form, mbaNumber, onLineItemsChange]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      const investmentByMonth = calculateInvestmentPerMonth(form, feeprogvideo || 0);
      const bursts = getProgVideoBursts(form, feeprogvideo || 0);
      
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
  }, [watchedLineItems, feeprogvideo, form, onBurstsChange, onInvestmentChange]);

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
          feeAmount = budget * ((feeprogvideo || 0) / 100);
          mediaAmount = 0;
        } else if (item.budgetIncludesFees) {
          const pct = feeprogvideo || 0;
          mediaAmount = (budget * (100 - pct)) / 100;
          feeAmount = (budget * pct) / 100;
        } else if (item.clientPaysForMedia) {
          // Only clientPaysForMedia: budget is net media, only fee is billed
          feeAmount = (budget / (100 - (feeprogvideo || 0))) * (feeprogvideo || 0);
          mediaAmount = 0;
        } else {
          // Neither: budget is net media, fee calculated on top
          mediaAmount = budget;
          feeAmount = (budget * (feeprogvideo || 0)) / 100;
        }

        const billingBurst: BillingBurst = {
          startDate: burst.startDate,
          endDate: burst.endDate,
          mediaAmount: mediaAmount,
          feeAmount: feeAmount,
          totalAmount: mediaAmount + feeAmount,
          mediaType: 'Prog Video',
          feePercentage: feeprogvideo,
          clientPaysForMedia: item.clientPaysForMedia,
          budgetIncludesFees: item.budgetIncludesFees,
          noAdserving: item.noadserving,
          deliverables: burst.calculatedValue ?? 0,
          buyType: item.buyType
        };

        return billingBurst;
      })
    );
  };

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
                    Prog Video Media
                  </CardTitle>
                  {progvideoExpertModalOpen ? (
                    <Badge
                      variant="outline"
                      className="border-2 text-[10px] font-semibold uppercase tracking-wider shadow-sm"
                      style={{
                        borderColor: rgbaFromHex(PROG_VIDEO_MEDIA_HEX, 0.55),
                        backgroundColor: rgbaFromHex(PROG_VIDEO_MEDIA_HEX, 0.14),
                        color: PROG_VIDEO_MEDIA_HEX,
                      }}
                    >
                      Expert schedule open
                    </Badge>
                  ) : null}
                </div>
                <div
                  role="group"
                  aria-label="Prog Video Media entry mode"
                  className="inline-flex shrink-0 rounded-lg border border-border bg-muted/50 p-0.5"
                >
                  <button
                    type="button"
                    aria-pressed={!progvideoExpertModalOpen}
                    className={cn(
                      "rounded-md px-3 py-1.5 text-xs font-medium transition-all",
                      !progvideoExpertModalOpen
                        ? "text-white shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                    style={
                      !progvideoExpertModalOpen
                        ? { backgroundColor: PROG_VIDEO_MEDIA_HEX }
                        : undefined
                    }
                    onClick={() => {
                      if (progvideoExpertModalOpen) {
                        handleProgVideoExpertModalOpenChange(false)
                      }
                    }}
                  >
                    Standard
                  </button>
                  <button
                    type="button"
                    aria-pressed={progvideoExpertModalOpen}
                    className={cn(
                      "rounded-md px-3 py-1.5 text-xs font-medium transition-all",
                      progvideoExpertModalOpen
                        ? "text-white shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                      expertSegmentAttention &&
                        !progvideoExpertModalOpen &&
                        "animate-pulse"
                    )}
                    style={{
                      ...(progvideoExpertModalOpen
                        ? { backgroundColor: PROG_VIDEO_MEDIA_HEX }
                        : {}),
                      ...(expertSegmentAttention && !progvideoExpertModalOpen
                        ? {
                            boxShadow: `0 0 0 2px ${rgbaFromHex(PROG_VIDEO_MEDIA_HEX, 0.45)}`,
                          }
                        : {}),
                    }}
                    onClick={() => {
                      if (!progvideoExpertModalOpen) {
                        openProgVideoExpertModal()
                      }
                    }}
                  >
                    Expert
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
            {overallTotals.lineItemTotals.map((item) => (
              <div
                key={item.index}
                className="flex items-center justify-between py-2.5 border-b border-border/40 last:border-b-0"
              >
                <span className="text-sm font-medium text-muted-foreground">Line {item.index}</span>
                <div className="flex items-center gap-6 text-sm tabular-nums">
                  <div className="text-right">
                    <span className="text-[11px] text-muted-foreground block">
                      {getDeliverablesLabel(form.getValues(`lineItems.${item.index - 1}.buyType`))}
                    </span>
                    <span>{item.deliverables.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[11px] text-muted-foreground block">Media</span>
                    <span>{formatMoney(item.media, { locale: "en-AU", currency: "AUD" })}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[11px] text-muted-foreground block">Fee</span>
                    <span>{formatMoney(item.fee, { locale: "en-AU", currency: "AUD" })}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[11px] text-muted-foreground block">Total</span>
                    <span className="font-semibold">{formatMoney(item.totalCost, { locale: "en-AU", currency: "AUD" })}</span>
                  </div>
                </div>
              </div>
            ))}

            <div className="flex items-center justify-between pt-3 mt-1 border-t-2 border-primary/20">
              <span className="text-sm font-semibold">Total</span>
              <div className="flex items-center gap-6 text-sm font-semibold tabular-nums">
                <div className="text-right">
                  <span className="text-[11px] text-muted-foreground font-normal block">Media</span>
                  <span>{formatMoney(overallTotals.overallMedia, { locale: "en-AU", currency: "AUD" })}</span>
                </div>
                <div className="text-right">
                  <span className="text-[11px] text-muted-foreground font-normal block">Fee ({feeprogvideo}%)</span>
                  <span>{formatMoney(overallTotals.overallFee, { locale: "en-AU", currency: "AUD" })}</span>
                </div>
                <div className="text-right">
                  <span className="text-[11px] text-muted-foreground font-normal block">Total</span>
                  <span className="text-primary">{formatMoney(overallTotals.overallCost, { locale: "en-AU", currency: "AUD" })}</span>
                </div>
              </div>
            </div>
            <MediaContainerTimelineCollapsible
              mediaTypeKey="progVideo"
              lineItems={watchedLineItems}
              campaignStartDate={campaignStartDate}
              campaignEndDate={campaignEndDate}
            />
          </CardContent>
        </Card>
      </div>
  
      <div>
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <div className="relative h-10 w-10">
              <div className="absolute inset-0 rounded-full border-2 border-muted" />
              <div className="absolute inset-0 rounded-full border-2 border-t-primary animate-spin" />
            </div>
            <span className="text-sm text-muted-foreground">Loading...</span>
          </div>
        ) : (
          <div className="space-y-6">
            {progvideoExpertModalOpen ? null : (
            <Form {...form}>
              <div className="space-y-6">
                {lineItemFields.map((field, lineItemIndex) => {
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
                    <Card key={field.id} className="overflow-hidden border border-border/50 shadow-sm hover:shadow-md transition-shadow duration-200 space-y-6">
                      <CardHeader className="pb-2 bg-muted/30">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                              {lineItemIndex + 1}
                            </div>
                            <div>
                              <CardTitle className="text-sm font-semibold tracking-tight">Prog Video Line Item</CardTitle>
                              <span className="font-mono text-[11px] text-muted-foreground">{`${mbaNumber}ML${lineItemIndex + 1}`}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              <span className="block text-[11px] text-muted-foreground">Total</span>
                              <span className="text-sm font-bold tabular-nums">
                                {formatMoney(
                                  form.getValues(`lineItems.${lineItemIndex}.budgetIncludesFees`)
                                    ? totalMedia
                                    : totalMedia + (totalMedia / (100 - (feeprogvideo || 0))) * (feeprogvideo || 0),
                                  { locale: "en-AU", currency: "AUD" }
                                )}
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
                                  ? `Expand details for prog video line item ${lineItemIndex + 1}`
                                  : `Collapse details for prog video line item ${lineItemIndex + 1}`
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
                      
                      {/* Summary Row - Always visible */}
                      <div className="px-6 py-2 border-b">
                        <div className="grid grid-cols-4 gap-4 text-sm">
                          <div>
                            <span className="font-medium">Platform:</span> {form.watch(`lineItems.${lineItemIndex}.platform`) || 'Not selected'}
                          </div>
                          <div>
                            <span className="font-medium">Buy Type:</span> {form.watch(`lineItems.${lineItemIndex}.buyType`) || 'Not selected'}
                          </div>
                          <div>
                            <span className="font-medium">Bid strategy:</span> {form.watch(`lineItems.${lineItemIndex}.bidStrategy`) || 'Not selected'}
                          </div>
                          <div>
                            <span className="font-medium">Bursts:</span> {form.watch(`lineItems.${lineItemIndex}.bursts`, []).length}
                          </div>
                        </div>
                      </div>
                      
                      {!collapsedLineItems.has(lineItemIndex) && (
                      <>
                      <div className="px-6 py-5">
                          <CardContent className="space-y-5 p-0">
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-4">
                              
                              {/* Column 1 - Dropdowns */}
                              <div className="space-y-4">
                              <FormField
                                control={form.control}
                                name={`lineItems.${lineItemIndex}.platform`}
                                render={({ field }) => (
                                  <FormItem className="flex flex-col space-y-1.5">
                                    <FormLabel className="text-sm text-muted-foreground font-medium">Platform</FormLabel>
                                    <FormControl>
                                      <Combobox
                                        value={field.value}
                                        onValueChange={field.onChange}
                                        placeholder="Select"
                                        searchPlaceholder="Search platforms..."
                                        emptyText={publishers.length === 0 ? "No platforms available." : "No platforms found."}
                                        buttonClassName="h-9 w-full flex-1 rounded-md"
                                        options={publishers.map((publisher) => ({
                                          value: publisher.publisher_name,
                                          label: publisher.publisher_name,
                                        }))}
                                      />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />

                              <FormField
                                control={form.control}
                                name={`lineItems.${lineItemIndex}.bidStrategy`}
                                render={({ field }) => (
                                  <FormItem className="flex flex-col space-y-1.5">
                                    <FormLabel className="text-sm text-muted-foreground font-medium">Bid Strategy</FormLabel>
                                    <FormControl>
                                      <Combobox
                                        value={field.value}
                                        onValueChange={field.onChange}
                                        placeholder="Select"
                                        searchPlaceholder="Search bid strategies..."
                                        buttonClassName="h-9 w-full flex-1 rounded-md"
                                        options={[
                                          { value: "completed_views", label: "Completed Views" },
                                          { value: "reach", label: "Reach" },
                                          { value: "target_cpa", label: "Target CPA" },
                                          { value: "viewability", label: "Viewability" },
                                        ]}
                                      />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />

                              <FormField
                                control={form.control}
                                name={`lineItems.${lineItemIndex}.buyType`}
                                render={({ field }) => (
                                  <FormItem className="flex flex-col space-y-1.5">
                                    <FormLabel className="text-sm text-muted-foreground font-medium">Buy Type</FormLabel>
                                    <FormControl>
                                      <Combobox
                                        value={field.value}
                                        onValueChange={field.onChange}
                                        placeholder="Select"
                                        searchPlaceholder="Search buy types..."
                                        buttonClassName="h-9 w-full flex-1 rounded-md"
                                        options={[
                                          { value: "bonus", label: "Bonus" },
                                          { value: "package_inclusions", label: "Package Inclusions" },
                                          { value: "cpc", label: "CPC" },
                                          { value: "cpm", label: "CPM" },
                                          { value: "cpv", label: "CPV" },
                                          { value: "fixed_cost", label: "Fixed Cost" },
                                        ]}
                                      />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            </div>

                            {/* Column 2 - Targeting and Buying Demo */}
                            <div className="space-y-4">
                              <FormItem className="flex flex-col space-y-1.5">
                                <FormLabel className="text-sm text-muted-foreground font-medium">Targeting</FormLabel>
                                <FormControl>
                                  <Textarea
                                    {...form.register(`lineItems.${lineItemIndex}.creativeTargeting`)}
                                    placeholder="Enter targeting details"
                                    className="w-full h-24 text-sm rounded-md border border-border/50 bg-muted/30 transition-colors focus:bg-background"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>

                              <FormItem className="flex flex-col space-y-1.5">
                                <FormLabel className="text-sm text-muted-foreground font-medium">Buying Demo</FormLabel>
                                <FormControl>
                                  <Textarea
                                    {...form.register(`lineItems.${lineItemIndex}.buyingDemo`)}
                                    placeholder="Enter buying demo details"
                                    className="w-full min-h-0 h-10 text-sm rounded-md border border-border/50 bg-muted/30 transition-colors focus:bg-background"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            </div>

                            {/* Column 3 - Creative */}
                            <div className="space-y-4">
                              <FormItem className="flex flex-col space-y-1.5">
                                <FormLabel className="text-sm text-muted-foreground font-medium">Creative</FormLabel>
                                <FormControl>
                                  <Textarea
                                    {...form.register(`lineItems.${lineItemIndex}.creative`)}
                                    placeholder="Enter creative details"
                                    className="w-full h-24 text-sm rounded-md border border-border/50 bg-muted/30 transition-colors focus:bg-background"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>

                              <FormItem className="flex flex-col space-y-1.5">
                                <FormLabel className="text-sm text-muted-foreground font-medium">Market</FormLabel>
                                <FormControl>
                                  <Textarea
                                    {...form.register(`lineItems.${lineItemIndex}.market`)}
                                    placeholder="Enter market or Geo Targeting"
                                    className="w-full min-h-0 h-10 text-sm rounded-md border border-border/50 bg-muted/30 transition-colors focus:bg-background"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            </div>

                            {/* Column 4 - Checkboxes */}
                            <div className="space-y-4">
                              <div className="space-y-3 rounded-lg border border-border/30 bg-muted/20 p-4">
                                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Options</span>
                                <FormField
                                  control={form.control}
                                  name={`lineItems.${lineItemIndex}.fixedCostMedia`}
                                  render={({ field }) => (
                                    <FormItem className="flex items-center space-x-2">
                                      <FormControl>
                                        <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                                      </FormControl>
                                      <FormLabel className="text-sm">Fixed Cost Media</FormLabel>
                                    </FormItem>
                                  )}
                                />

                                <FormField
                                  control={form.control}
                                  name={`lineItems.${lineItemIndex}.clientPaysForMedia`}
                                  render={({ field }) => (
                                    <FormItem className="flex items-center space-x-2">
                                      <FormControl>
                                        <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                                      </FormControl>
                                      <FormLabel className="text-sm">Client Pays for Media</FormLabel>
                                    </FormItem>
                                  )}
                                />

                                <FormField
                                  control={form.control}
                                  name={`lineItems.${lineItemIndex}.budgetIncludesFees`}
                                  render={({ field }) => (
                                    <FormItem className="flex items-center space-x-2">
                                      <FormControl>
                                        <Checkbox
                                          checked={field.value}
                                          onCheckedChange={(checked) => {
                                            field.onChange(checked);
                                            const bursts = form.getValues(`lineItems.${lineItemIndex}.bursts`) || [];
                                            bursts.forEach((_, bi) => handleValueChange(lineItemIndex, bi, !!checked));
                                            handleLineItemValueChange(lineItemIndex);
                                          }}
                                        />
                                      </FormControl>
                                      <FormLabel className="text-sm">Budget Includes Fees</FormLabel>
                                    </FormItem>
                                  )}
                                />
                                <FormField
                                  control={form.control}
                                  name={`lineItems.${lineItemIndex}.noadserving`}
                                  render={({ field }) => (
                                    <FormItem className="flex items-center space-x-2">
                                      <FormControl>
                                        <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                                      </FormControl>
                                      <FormLabel className="text-sm">No Ad Serving</FormLabel>
                                    </FormItem>
                                  )}
                                />
                              </div>

                            </div>
                          </div>
                        </CardContent>
                      </div>

                      <div className={MP_BURST_SECTION_OUTER}>
                        <div className={MP_BURST_HEADER_SHELL}>
                          <div className={MP_BURST_HEADER_INNER}>
                            <div className={MP_BURST_LABEL_COLUMN} aria-hidden />
                            <div className={MP_BURST_HEADER_ROW}>
                              <div className={`${MP_BURST_GRID_7} text-[11px] font-semibold uppercase tracking-wider text-muted-foreground`}>
                                <span>Budget</span>
                                <span>Buy Amount</span>
                                <span>Start</span>
                                <span>End</span>
                                <span>
                                  {getCpcFamilyBurstCalculatedColumnLabel(
                                    "cpcCpvCpm",
                                    form.watch(`lineItems.${lineItemIndex}.buyType`) || ""
                                  )}
                                </span>
                                <span>Media</span>
                                <span>{`Fee (${feeprogvideo}%)`}</span>
                              </div>
                              <div className={MP_BURST_ACTION_COLUMN}>
                                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Actions</span>
                              </div>
                            </div>
                          </div>
                        </div>
                        {form.watch(`lineItems.${lineItemIndex}.bursts`, []).map((burstField, burstIndex) => {
                          return (
                            <Card key={`${lineItemIndex}-${burstIndex}`} className={MP_BURST_CARD}>
                              <CardContent className={MP_BURST_CARD_CONTENT}>
                                <div className={MP_BURST_ROW_SHELL}>
                                  <div className={MP_BURST_LABEL_COLUMN}>
                                    <h4 className={MP_BURST_LABEL_HEADING}>
                                      {formatBurstLabel(
                                        burstIndex + 1,
                                        form.watch(`lineItems.${lineItemIndex}.bursts.${burstIndex}.startDate`),
                                        form.watch(`lineItems.${lineItemIndex}.bursts.${burstIndex}.endDate`)
                                      )}
                                    </h4>
                                  </div>
                                  
                                  <div className={MP_BURST_GRID_7}>
                                    <FormField
                                      control={form.control}
                                      name={`lineItems.${lineItemIndex}.bursts.${burstIndex}.budget`}
                                      render={({ field }) => {
                                        const buyType = form.watch(`lineItems.${lineItemIndex}.buyType`);
                                        return (
<FormItem>
  <FormControl>
                                              <Input
                                                {...field}
                                                type="text"
                                                className="w-full min-w-[9rem] h-10 text-sm"
                                                value={buyType === "bonus" || buyType === "package_inclusions" ? "0" : field.value}
                                                disabled={buyType === "bonus" || buyType === "package_inclusions"}
                                                onChange={(e) => {
                                                  const value = e.target.value.replace(/[^0-9.]/g, "");
                                                  field.onChange(value);
                                                  handleValueChange(lineItemIndex, burstIndex);
                                                }}
                                                onBlur={(e) => {
                                                  const value = e.target.value;
                                                  const formattedValue = formatMoney(parseMoneyInput(value) ?? 0, {
                                                    locale: "en-AU",
                                                    currency: "AUD",
                                                  });
                                                  field.onChange(formattedValue);
                                                  handleValueChange(lineItemIndex, burstIndex);
                                                }}
                                              />
                                            </FormControl>
                                            <FormMessage />
                                          </FormItem>
                                        );
                                      }}
                                    />

                                    <FormField
                                      control={form.control}
                                      name={`lineItems.${lineItemIndex}.bursts.${burstIndex}.buyAmount`}
                                      render={({ field }) => {
                                        const buyType = form.watch(`lineItems.${lineItemIndex}.buyType`);
                                        return (
<FormItem>
  <FormControl>
                                              <Input
                                                {...field}
                                                type="text"
                                                className="w-full min-w-[9rem] h-10 text-sm"
                                                value={buyType === "bonus" || buyType === "package_inclusions" ? "0" : field.value}
                                                disabled={buyType === "bonus" || buyType === "package_inclusions"}
                                                onChange={(e) => {
                                                  const value = e.target.value.replace(/[^0-9.]/g, "");
                                                  field.onChange(value);
                                                  handleValueChange(lineItemIndex, burstIndex);
                                                }}
                                                onBlur={(e) => {
                                                  const value = e.target.value;
                                                  const formattedValue = formatMoney(parseMoneyInput(value) ?? 0, {
                                                    locale: "en-AU",
                                                    currency: "AUD",
                                                  });
                                                  field.onChange(formattedValue);
                                                  handleValueChange(lineItemIndex, burstIndex);
                                                }}
                                              />
                                            </FormControl>
                                            <FormMessage />
                                          </FormItem>
                                        );
                                      }}
                                    />

                                    <div className="grid grid-cols-2 gap-2 col-span-2">
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
                                                className="w-full h-10 pl-2 text-left font-normal text-sm"
                                                calendarContext="media-burst"
                                                mediaBurstRole="start"
                                                campaignStartDate={campaignStartDate}
                                                campaignEndDate={campaignEndDate}
                                                isDateDisabled={(date) => date > new Date("2100-01-01")}
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
                                                className="w-full h-10 pl-2 text-left font-normal text-sm"
                                                calendarContext="media-burst"
                                                mediaBurstRole="end"
                                                campaignStartDate={campaignStartDate}
                                                campaignEndDate={campaignEndDate}
                                                isDateDisabled={(date) => date > new Date("2100-01-01")}
                                              />
                                            </FormControl>
                                            <FormMessage />
                                          </FormItem>
                                        )}
                                      />
                                    </div>

                                    <FormField
                                      control={form.control}
                                      name={`lineItems.${lineItemIndex}.bursts.${burstIndex}.calculatedValue`}
                                      render={({ field }) => (
                                        <CpcFamilyBurstCalculatedField
                                          form={form}
                                          itemsKey="lineItems"
                                          lineItemIndex={lineItemIndex}
                                          burstIndex={burstIndex}
                                          field={field}
                                          feePct={feeprogvideo || 0}
                                          netMedia={netMediaFeeMarkup}
                                          variant="cpcCpvCpm"
                                          bonusInputClassName="w-full h-10 text-sm"
                                        />
                                      )}
                                    />

                                    <Input
                                        type="text"
                                        className="w-full h-10 text-sm bg-muted/30 border-border/40 text-muted-foreground"
                                        value={formatMoney(
                                          form.getValues(`lineItems.${lineItemIndex}.budgetIncludesFees`)
                                            ? (parseFloat(form.getValues(`lineItems.${lineItemIndex}.bursts.${burstIndex}.budget`)?.replace(/[^0-9.]/g, "") || "0") / 100) * (100 - (feeprogvideo || 0))
                                            : parseFloat(form.getValues(`lineItems.${lineItemIndex}.bursts.${burstIndex}.budget`)?.replace(/[^0-9.]/g, "") || "0")
                                        , { locale: "en-AU", currency: "AUD" })}
                                        readOnly
                                      />
                                    <Input
                                        type="text"
                                        className="w-full h-10 text-sm bg-muted/30 border-border/40 text-muted-foreground"
                                        value={formatMoney(
                                          form.getValues(`lineItems.${lineItemIndex}.budgetIncludesFees`)
                                            ? (parseFloat(form.getValues(`lineItems.${lineItemIndex}.bursts.${burstIndex}.budget`)?.replace(/[^0-9.]/g, "") || "0") / 100) * (feeprogvideo || 0)
                                            : (parseFloat(form.getValues(`lineItems.${lineItemIndex}.bursts.${burstIndex}.budget`)?.replace(/[^0-9.]/g, "") || "0") / (100 - (feeprogvideo || 0))) * (feeprogvideo || 0)
                                        , { locale: "en-AU", currency: "AUD" })}
                                        readOnly
                                      />
                                  </div>
                                  
                                  <div className={MP_BURST_ACTION_COLUMN}>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8"
                                      onClick={() => handleAppendBurst(lineItemIndex)}
                                      title="Add burst"
                                    >
                                      <Plus className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8"
                                      onClick={() => handleDuplicateBurst(lineItemIndex)}
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
                          );
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
                        <div className="flex items-center gap-2">
                          <Button type="button" variant="outline" size="sm" onClick={() => handleDuplicateLineItem(lineItemIndex)}>
                            <Copy className="h-3.5 w-3.5 mr-1.5" />
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
                                                          site: "",
                                                          placement: "",
                                                          size: "",
                                                          targetingAttribute: "",
                                                          fixedCostMedia: false,
                                                          clientPaysForMedia: false,
                                                          budgetIncludesFees: false,
                                                          noadserving: false,
                                                          bursts: [
                                                            {
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
                                                        })
                                                      }
                                                    >
                                                      <Plus className="h-3.5 w-3.5 mr-1.5" />
                                                      Add Line Item
                                                    </Button>
                                                  )}
                        </div>
                      </CardFooter>
                    </Card>
                  );
                })}
              </div>
            </Form>
            )}
          </div>
        )}
      </div>

      <Dialog
        open={progvideoExpertModalOpen}
        onOpenChange={handleProgVideoExpertModalOpenChange}
      >
        <DialogContent className="max-w-[95vw] w-[95vw] max-h-[95vh] h-[95vh] flex flex-col p-4 gap-0 overflow-hidden">
          <DialogHeader className="flex-shrink-0 pb-2">
            <DialogTitle>Prog Video Media Expert Mode</DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-auto">
            <ProgVideoExpertGrid
              campaignStartDate={campaignStartDate}
              campaignEndDate={campaignEndDate}
              feeprogvideo={feeprogvideo}
              rows={expertProgVideoRows}
              onRowsChange={handleExpertProgVideoRowsChange}
              publishers={publishers}
            />
          </div>
          <DialogFooter className="flex-shrink-0 border-t pt-3 mt-2">
            <Button type="button" onClick={handleProgVideoExpertApply}>
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={progvideoExpertExitConfirmOpen}
        onOpenChange={(open) => {
          if (!open) dismissProgVideoExpertExitConfirm()
        }}
      >
        <DialogContent
          className="z-[100] sm:max-w-md"
          onClick={(e) => {
            if (
              (e.target as HTMLElement).closest(
                "[data-progvideoexpert-exit-yes]"
              )
            ) {
              return
            }
            dismissProgVideoExpertExitConfirm()
          }}
        >
          <DialogHeader>
            <DialogTitle>Leave Prog Video Media Expert Mode?</DialogTitle>
            <DialogDescription>
              You have unsaved changes in Expert Mode. Apply saves them to the
              Prog Video Media section; leaving now discards those edits.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={dismissProgVideoExpertExitConfirm}
            >
              No, keep editing
            </Button>
            <Button
              type="button"
              variant="destructive"
              data-progvideoexpert-exit-yes
              onClick={confirmProgVideoExpertExitWithoutSaving}
            >
              Yes, leave without saving
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}