"use client"

import { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } from "react"
import { useForm, useFieldArray, UseFormReturn } from "react-hook-form"
import { useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Combobox } from "@/components/ui/combobox"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger,} from "@/components/ui/dialog"
import { PlusCircle } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import { Textarea } from "@/components/ui/textarea"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { useToast } from "@/components/ui/use-toast"
import { Label } from "@/components/ui/label";
import { getPublishersForDigiVideo, getClientInfo, getVideoSites, createVideoSite } from "@/lib/api"
import { formatBurstLabel } from "@/lib/bursts"
import { format } from "date-fns"
import { useMediaPlanContext } from "@/contexts/MediaPlanContext"
import { MEDIA_TYPE_ID_CODES, buildLineItemId } from "@/lib/mediaplan/lineItemIds"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { ChevronDown, Copy, Plus, Trash2 } from "lucide-react"
import type { BillingBurst, BillingMonth } from "@/lib/billing/types"; // ad
import type { LineItem } from '@/lib/generateMediaPlan'
import { formatMoney } from "@/lib/utils/money"
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
import { getMediaTypeThemeHex, rgbaFromHex } from "@/lib/mediaplan/mediaTypeAccents"
import {
  DigitalVideoExpertGrid,
  createEmptyDigiVideoExpertRow,
} from "@/components/media-containers/DigitalVideoExpertGrid"
import type { DigiVideoExpertScheduleRow } from "@/lib/mediaplan/expertModeWeeklySchedule"
import {
  mapDigiVideoExpertRowsToStandardLineItems,
  mapStandardDigiVideoLineItemsToExpertRows,
  type StandardDigiVideoFormLineItem,
} from "@/lib/mediaplan/expertOohRadioMappings"
import {
  mergeDigiVideoStandardFromExpertWithPrevious,
  serializeDigiVideoExpertRowsBaseline,
  serializeDigiVideoStandardLineItemsBaseline,
} from "@/lib/mediaplan/expertModeSwitch"
import { buildWeeklyGanttColumnsFromCampaign } from "@/lib/utils/weeklyGanttColumns"

// Format Dates
const formatDateString = (d?: Date | string): string => {
  if (!d) return '';
  const dateObj = d instanceof Date ? d : new Date(d);
  if (isNaN(dateObj.getTime())) {
    if (d instanceof Date && isNaN(d.getTime())) return '';
    return '';
  }

  const year = dateObj.getFullYear();
  const month = (dateObj.getMonth() + 1).toString().padStart(2, '0'); // getMonth() is 0-indexed
  const day = dateObj.getDate().toString().padStart(2, '0');
  
  return `${year}-${month}-${day}`;
};

/** Net media when budget is gross incl. fee — must match `getDigiVideoBursts` / burst row readouts (linear split). */
function netMediaFeeMarkup(rawBudget: number, budgetIncludesFees: boolean, feePct: number): number {
  if (!budgetIncludesFees) return rawBudget;
  const pct = feePct || 0;
  return (rawBudget * (100 - pct)) / 100;
}

// Exported utility function to get bursts
export function getAllBursts(form) {
  const digivideolineItems = form.getValues("digivideolineItems") || [];

  return digivideolineItems.flatMap((lineItem) =>
    lineItem.bursts.map((burst) => ({
      startDate: burst.startDate,
      endDate: burst.endDate,
      budget: burst.budget,
    }))
  );
}

const digivideoBurstSchema = z.object({
  budget: z.string().min(1, "Budget is required"),
  buyAmount: z.string().min(1, "Buy Amount is required"),
  startDate: z.date(),
  endDate: z.date(),
  calculatedValue: z.number().optional(),
  fee: z.number().optional(),
})

const digivideoLineItemSchema = z.object({
  platform: z.string().min(1, "Platform is required"),
  site: z.string().min(1, "Site is required"),
  bidStrategy: z.string().min(1, "Bid Strategy is required"),
  buyType: z.string().min(1, "Buy Type is required"),
  publisher: z.string().min(1, "Publisher is required"),
  placement: z.string(),
  size: z.string(),
  targetingAttribute: z.string(),
  creativeTargeting: z.string().min(1, "Creative Targeting is required"),
  creative: z.string().min(1, "Creative is required"),
  buyingDemo: z.string().min(1, "Buying Demo is required"),
  market: z.string().min(1, "Market is required"),
  fixedCostMedia: z.boolean(),
  clientPaysForMedia: z.boolean(),
  budgetIncludesFees: z.boolean(),
  noadserving: z.boolean(),
  bursts: z.array(digivideoBurstSchema).min(1, "At least one burst is required"),
  totalMedia: z.number().optional(),
  totalDeliverables: z.number().optional(),
  totalFee: z.number().optional(),
})

const digivideoFormSchema = z.object({
  digivideolineItems: z.array(digivideoLineItemSchema),
  overallDeliverables: z.number().optional(),
})

type DigiVideoFormValues = z.infer<typeof digivideoFormSchema>

interface Publisher {
  id: number;
  publisher_name: string;
}

interface VideoSite {
  id: number;
  platform: string;
  site: string;
}

const MEDIA_ACCENT_HEX = getMediaTypeThemeHex("digivideo")

interface DigiVideoContainerProps {
  clientId: string;
  feedigivideo: number;
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

export function getDigiVideoBursts(
  form: UseFormReturn<DigiVideoFormValues>,
  feedigivideo: number
): BillingBurst[] {
  const digivideolineItems = form.getValues("digivideolineItems") || []

  return digivideolineItems.flatMap(li =>
    li.bursts.map(burst => {
      const rawBudget = parseFloat(burst.budget.replace(/[^0-9.]/g, "")) || 0

      const pct = feedigivideo || 0
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

        mediaType:          "Digi Video",
        feePercentage:      pct,
        clientPaysForMedia: li.clientPaysForMedia,
        budgetIncludesFees: li.budgetIncludesFees,
        noAdserving: li.noadserving,
        deliverables: burst.calculatedValue ?? 0,
        buyType: li.buyType
      }
    })
  )
}

export function calculateInvestmentPerMonth(form, feedigivideo) {
  const digivideolineItems = form.getValues("digivideolineItems") || [];
  let monthlyInvestment: Record<string, number> = {};

  digivideolineItems.forEach((lineItem) => {
    lineItem.bursts.forEach((burst) => {
      const startDate = new Date(burst.startDate);
      const endDate = new Date(burst.endDate);
      const lineMedia = parseFloat(burst.budget.replace(/[^0-9.]/g, "")) || 0;
      const feePercentage = feedigivideo || 0;

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
    amount: formatMoney(amount, { locale: "en-US", currency: "USD" }),
  }));
}

export function calculateBurstInvestmentPerMonth(form, feedigivideo) {
  const digivideolineItems = form.getValues("digivideolineItems") || [];
  let monthlyInvestment: Record<string, number> = {};

  digivideolineItems.forEach((lineItem) => {
    lineItem.bursts.forEach((burst) => {
      const startDate = new Date(burst.startDate);
      const endDate = new Date(burst.endDate);
      const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      const burstBudget = parseFloat(burst.budget.replace(/[^0-9.]/g, "")) || 0;
      const feePercentage = feedigivideo || 0;
      
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

export default function DigiVideoContainer({
  clientId,
  feedigivideo,
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
}: DigiVideoContainerProps) {
  // Add refs to track previous values
  const prevInvestmentRef = useRef<{ monthYear: string; amount: string }[]>([]);
  const prevBurstsRef = useRef<BillingBurst[]>([]);
  const publishersRef = useRef<Publisher[]>([]);
  const videoSitesRef = useRef<VideoSite[]>([]);
  const [publishers, setPublishers] = useState<Publisher[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [digivideoSites, setDigiVideoSites] = useState<VideoSite[]>([]);
  const { toast } = useToast()
  const { mbaNumber } = useMediaPlanContext()
  const [overallDeliverables, setOverallDeliverables] = useState(0);

  const [expertDigiVideoRows, setExpertDigiVideoRows] = useState<
    DigiVideoExpertScheduleRow[]
  >([])
  const [digiVideoExpertModalOpen, setDigiVideoExpertModalOpen] =
    useState(false)
  const [digiVideoExpertExitConfirmOpen, setDigiVideoExpertExitConfirmOpen] =
    useState(false)
  const [expertSegmentAttention, setExpertSegmentAttention] = useState(true)
  const digiVideoStandardBaselineRef = useRef("")
  const digiVideoExpertRowsBaselineRef = useRef("")
  const digiVideoExpertModalOpenRef = useRef(false)
  digiVideoExpertModalOpenRef.current = digiVideoExpertModalOpen

  const digiVideoExpertWeekColumns = useMemo(
    () => buildWeeklyGanttColumnsFromCampaign(campaignStartDate, campaignEndDate),
    [campaignStartDate, campaignEndDate]
  )

  const [isAddSiteDialogOpen, setIsAddSiteDialogOpen] = useState(false);
  const [newSiteName, setNewSiteName] = useState("");
  const [newSitePlatform, setNewSitePlatform] = useState("");
  // Store the lineItemIndex for which the "Add Station" was clicked
  const [currentLineItemIndexForNewSite, setCurrentLineItemIndexForNewSite] = useState<number | null>(null);
  const [sitesAvailable, setSitesAvailable] = useState(true); // Assume true until fetched
  // Function to re-fetch TV stations
  const fetchAndUpdateVideoSites = async () => {
    try {
      setIsLoading(true);
      const fetchedVideoSites = await getVideoSites(); //
      videoSitesRef.current = fetchedVideoSites; //
      setDigiVideoSites(fetchedVideoSites); //
    } catch (error) {
      toast({ //
        title: "Error refreshing Video Sites",
        description: (error as Error).message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false); //
    }
  };

  const handleAddNewSite = async () => {
    if (!newSiteName.trim() || !newSitePlatform.trim()) {
      toast({ //
        title: "Missing Information",
        description: "Please provide both site name and platform.",
        variant: "destructive",
      });
      return;
    }

  try {
    setIsLoading(true); //
    const newSiteData: Omit<VideoSite, 'id'> = { //
      site: newSiteName,
      platform: newSitePlatform,
  };
  const createdSite = await createVideoSite(newSiteData);

    toast({
      title: "Site Added",
      description: `${createdSite.site} has been successfully added.`,
    });
  
  await fetchAndUpdateVideoSites();

  if (currentLineItemIndexForNewSite !== null) {
    const idx = currentLineItemIndexForNewSite
    form.setValue(`digivideolineItems.${idx}.publisher`, newSitePlatform, { shouldDirty: true })
    form.setValue(`digivideolineItems.${idx}.platform`, newSitePlatform, { shouldDirty: true })
    form.setValue(`digivideolineItems.${idx}.site`, createdSite.site, { shouldDirty: true })
  }

  setIsAddSiteDialogOpen(false);
  setNewSiteName("");
  setNewSitePlatform("");
  setCurrentLineItemIndexForNewSite(null);

} catch (error) {
  toast({ //
    title: "Error Adding Site",
    description: (error as Error).message,
    variant: "destructive",
  });
} finally {
  setIsLoading(false); //
}
};
  
  // Form initialization
  const form = useForm({
    resolver: zodResolver(digivideoFormSchema),
    defaultValues: {
      digivideolineItems: [
        {
          platform: "",
          site: "",
          bidStrategy: "",
          buyType: "",
          publisher: "",
          placement: "",
          size: "",
          targetingAttribute: "",
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
  });

  // Field array hook
  const {
    fields: lineItemFields,
    append: appendLineItem,
    remove: removeLineItemBase,
  } = useFieldArray({
    control: form.control,
    name: "digivideolineItems",
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
    const items = form.getValues("digivideolineItems") || []
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

  useLayoutEffect(() => {
    digiVideoStandardBaselineRef.current =
      serializeDigiVideoStandardLineItemsBaseline(
        form.getValues("digivideolineItems")
      )
  }, [form])

  useEffect(() => {
    const id = window.setTimeout(() => setExpertSegmentAttention(false), 2800)
    return () => window.clearTimeout(id)
  }, [])

  const handleExpertDigiVideoRowsChange = useCallback(
    (next: DigiVideoExpertScheduleRow[]) => {
      setExpertDigiVideoRows(next)
    },
    []
  )

  const openDigiVideoExpertModal = useCallback(() => {
    const mapped = mapStandardDigiVideoLineItemsToExpertRows(
      (form.getValues("digivideolineItems") || []) as StandardDigiVideoFormLineItem[],
      digiVideoExpertWeekColumns,
      campaignStartDate,
      campaignEndDate
    )
    const weekKeys = digiVideoExpertWeekColumns.map((c) => c.weekKey)
    const rows: DigiVideoExpertScheduleRow[] =
      mapped.length > 0
        ? mapped
        : [
            createEmptyDigiVideoExpertRow(
              typeof crypto !== "undefined" && crypto.randomUUID
                ? crypto.randomUUID()
                : `digivideo-expert-${Date.now()}`,
              campaignStartDate,
              campaignEndDate,
              weekKeys
            ),
          ]
    digiVideoExpertRowsBaselineRef.current =
      serializeDigiVideoExpertRowsBaseline(rows)
    setExpertDigiVideoRows(rows)
    setDigiVideoExpertExitConfirmOpen(false)
    setDigiVideoExpertModalOpen(true)
  }, [campaignStartDate, campaignEndDate, form, digiVideoExpertWeekColumns])

  const dismissDigiVideoExpertExitConfirm = useCallback(() => {
    setDigiVideoExpertExitConfirmOpen(false)
  }, [])

  const confirmDigiVideoExpertExitWithoutSaving = useCallback(() => {
    setDigiVideoExpertExitConfirmOpen(false)
    collapseAllLineItems()
    setDigiVideoExpertModalOpen(false)
  }, [collapseAllLineItems])

  const handleDigiVideoExpertModalOpenChange = useCallback(
    (open: boolean) => {
      if (open) {
        setDigiVideoExpertModalOpen(true)
        return
      }
      const dirty =
        serializeDigiVideoExpertRowsBaseline(expertDigiVideoRows) !==
        digiVideoExpertRowsBaselineRef.current
      if (!dirty) {
        collapseAllLineItems()
        setDigiVideoExpertModalOpen(false)
        return
      }
      setDigiVideoExpertExitConfirmOpen(true)
    },
    [collapseAllLineItems, expertDigiVideoRows]
  )

  const handleDigiVideoExpertApply = useCallback(() => {
    const prevLineItems = form.getValues("digivideolineItems") || []
    const standard = mapDigiVideoExpertRowsToStandardLineItems(
      expertDigiVideoRows,
      digiVideoExpertWeekColumns,
      campaignStartDate,
      campaignEndDate,
      {
        feePctDigiVideo: feedigivideo,
        budgetIncludesFees: Boolean(prevLineItems[0]?.budgetIncludesFees),
      }
    )
    const merged = mergeDigiVideoStandardFromExpertWithPrevious(
      standard,
      prevLineItems as StandardDigiVideoFormLineItem[]
    )
    form.setValue("digivideolineItems", merged as any, {
      shouldDirty: true,
      shouldValidate: false,
    })
    digiVideoStandardBaselineRef.current =
      serializeDigiVideoStandardLineItemsBaseline(
        form.getValues("digivideolineItems")
      )
    setDigiVideoExpertExitConfirmOpen(false)
    collapseAllLineItems()
    setDigiVideoExpertModalOpen(false)
  }, [
    campaignStartDate,
    campaignEndDate,
    collapseAllLineItems,
    expertDigiVideoRows,
    feedigivideo,
    form,
    digiVideoExpertWeekColumns,
  ])

  const handleDuplicateLineItem = useCallback((lineItemIndex: number) => {
    const items = form.getValues("digivideolineItems") || [];
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
    name: "digivideolineItems",
    defaultValue: form.getValues("digivideolineItems")
  });

  // Data loading for edit mode
  useEffect(() => {
    if (digiVideoExpertModalOpenRef.current) return
    if (initialLineItems && initialLineItems.length > 0) {
      const transformedLineItems = initialLineItems.map((item: any) => ({
        platform: item.platform || "",
        publisher: item.publisher || "",
        site: item.site || "",
        placement: item.placement || "",
        size: item.size || "",
        bidStrategy: item.bid_strategy || "",
        buyType: item.buy_type || "",
        targetingAttribute: item.targeting_attribute || "",
        creativeTargeting: item.creative_targeting || "",
        creative: item.creative || "",
        buyingDemo: item.buying_demo || "",
        market: item.market || "",
        fixedCostMedia: item.fixed_cost_media || false,
        clientPaysForMedia: item.client_pays_for_media || false,
        budgetIncludesFees: item.budget_includes_fees || false,
        noadserving: item.no_adserving || false,
        bursts: item.bursts_json ? (typeof item.bursts_json === 'string' ? JSON.parse(item.bursts_json) : item.bursts_json).map((burst: any) => ({
          budget: burst.budget || "",
          buyAmount: burst.buyAmount || "",
          startDate: burst.startDate ? new Date(burst.startDate) : new Date(),
          endDate: burst.endDate ? new Date(burst.endDate) : new Date(),
          calculatedValue: burst.calculatedValue ?? 0,
          fee: burst.fee ?? 0,
        })) : [{
          budget: "",
          buyAmount: "",
          startDate: defaultMediaBurstStartDate(campaignStartDate, campaignEndDate),
          endDate: defaultMediaBurstEndDate(campaignStartDate, campaignEndDate),
          calculatedValue: 0,
          fee: 0,
        }],
      }));

      form.reset({
        digivideolineItems: transformedLineItems,
        overallDeliverables: 0,
      });
    }
  }, [initialLineItems, form, campaignStartDate, campaignEndDate]);

  // Transform form data to API schema format
  useEffect(() => {
    const formLineItems = form.getValues('digivideolineItems') || [];
    
    const transformedLineItems = formLineItems.map((lineItem, index) => {
      // Calculate totalMedia from raw budget amounts (for display in MBA section)
      let totalMedia = 0;
      lineItem.bursts.forEach((burst) => {
        const budget = parseFloat(burst.budget.replace(/[^0-9.]/g, "")) || 0;
        if (lineItem.budgetIncludesFees) {
          const pct = feedigivideo || 0;
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
        publisher: lineItem.publisher || "",
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
        line_item_id: buildLineItemId(mbaNumber, MEDIA_TYPE_ID_CODES.digitalVideo, index + 1),
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
  }, [watchedLineItems, mbaNumber, feedigivideo, form, onMediaLineItemsChange]);
  
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
          const pct = feedigivideo || 0;
          lineMedia += (budget * (100 - pct)) / 100;
          lineFee += (budget * pct) / 100;
        } else {
          // Budget is net media, fee calculated on top
          lineMedia += budget;
          const fee = feedigivideo ? (budget / (100 - feedigivideo)) * feedigivideo : 0;
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
  }, [watchedLineItems, feedigivideo]);
  
  // Callback handlers
  const handleLineItemValueChange = useCallback((lineItemIndex: number) => {
    const digivideolineItems = form.getValues("digivideolineItems") || [];
    let overallMedia = 0;
    let overallFee = 0;
    let overallCost = 0;
    let overallDeliverableCount = 0;

    digivideolineItems.forEach((lineItem) => {
      let lineMedia = 0;
      let lineFee = 0;
      let lineDeliverables = 0;

      lineItem.bursts.forEach((burst) => {
        const budget = parseFloat(burst?.budget?.replace(/[^0-9.]/g, "") || "0");
        if (lineItem.budgetIncludesFees) {
          const pct = feedigivideo || 0;
          lineMedia += (budget * (100 - pct)) / 100;
          lineFee += (budget * pct) / 100;
        } else {
          lineMedia += budget;
          const fee = feedigivideo ? (budget / (100 - feedigivideo)) * feedigivideo : 0;
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
  }, [form, feedigivideo, onTotalMediaChange]);

  const handleBuyTypeChange = useCallback(
    (lineItemIndex: number, value: string) => {
      form.setValue(`digivideolineItems.${lineItemIndex}.buyType`, value);

      if (value === "bonus" || value === "package_inclusions") {
        const currentBursts =
          form.getValues(`digivideolineItems.${lineItemIndex}.bursts`) || [];
        const zeroedBursts = currentBursts.map((burst: any) => ({
          ...burst,
          budget: "0",
          buyAmount: "0",
          calculatedValue: burst.calculatedValue ?? 0,
        }));

        form.setValue(
          `digivideolineItems.${lineItemIndex}.bursts`,
          zeroedBursts,
          { shouldDirty: true }
        );
      }

      handleLineItemValueChange(lineItemIndex);
    },
    [form, handleLineItemValueChange]
  );

  const handleValueChange = useCallback((lineItemIndex: number, burstIndex: number, budgetIncludesFeesOverride?: boolean) => {
    const burst = form.getValues(`digivideolineItems.${lineItemIndex}.bursts.${burstIndex}`);
    const lineItem = form.getValues(`digivideolineItems.${lineItemIndex}`);
    const rawBudget = parseFloat(burst?.budget?.replace(/[^0-9.]/g, "") || "0");
    const budgetIncludesFees = budgetIncludesFeesOverride ?? Boolean(lineItem?.budgetIncludesFees);
    const budget = netMediaFeeMarkup(rawBudget, budgetIncludesFees, feedigivideo || 0);
    const buyAmount = parseFloat(burst?.buyAmount?.replace(/[^0-9.]/g, "") || "1");
    const buyType = form.getValues(`digivideolineItems.${lineItemIndex}.buyType`);

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
    const currentValue = form.getValues(`digivideolineItems.${lineItemIndex}.bursts.${burstIndex}.calculatedValue`);
    if (currentValue !== calculatedValue && !isNaN(calculatedValue)) {
      form.setValue(`digivideolineItems.${lineItemIndex}.bursts.${burstIndex}.calculatedValue`, calculatedValue, {
        shouldValidate: false, // Changed to false to prevent validation loops
        shouldDirty: false,    // Changed to false to prevent dirty state loops
      });

      handleLineItemValueChange(lineItemIndex);
    }
  }, [feedigivideo, form, handleLineItemValueChange]);

  const handleAppendBurst = useCallback((lineItemIndex: number) => {
    const currentBursts = form.getValues(`digivideolineItems.${lineItemIndex}.bursts`) || [];
    
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
    
    form.setValue(`digivideolineItems.${lineItemIndex}.bursts`, [
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
    const currentBursts = form.getValues(`digivideolineItems.${lineItemIndex}.bursts`) || [];

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

    form.setValue(`digivideolineItems.${lineItemIndex}.bursts`, [
      ...currentBursts,
      duplicatedBurst,
    ]);

    handleLineItemValueChange(lineItemIndex);
  }, [form, handleLineItemValueChange, toast]);

  const handleRemoveBurst = useCallback((lineItemIndex: number, burstIndex: number) => {
    const currentBursts = form.getValues(`digivideolineItems.${lineItemIndex}.bursts`) || [];
    form.setValue(
      `digivideolineItems.${lineItemIndex}.bursts`,
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

        const fetchedPublishers = await getPublishersForDigiVideo();
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

  // Effect hooks for video sites
  useEffect(() => {
    const fetchVideoSites = async () => {
      try {
        // Check if we already have video sites cached
        if (videoSitesRef.current.length > 0) {
          setDigiVideoSites(videoSitesRef.current);
          setIsLoading(false);
          return;
        }

        const fetchedVideoSites = await getVideoSites();
        videoSitesRef.current = fetchedVideoSites;
        setDigiVideoSites(fetchedVideoSites);
      } catch (error) {
        toast({
          title: "Error loading video sites",
          description: error.message,
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };
  
    fetchVideoSites();
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
  const calculatedBursts = getDigiVideoBursts(form, feedigivideo || 0);
  let burstIndex = 0;

  const items: LineItem[] = form.getValues('digivideolineItems').flatMap((lineItem, lineItemIndex) =>
    lineItem.bursts.map(burst => {
      const computedBurst = calculatedBursts[burstIndex++];
      const mediaAmount = computedBurst
        ? computedBurst.mediaAmount
        : parseFloat(String(burst.budget).replace(/[^0-9.-]+/g, "")) || 0;
      const lineItemId = buildLineItemId(mbaNumber, MEDIA_TYPE_ID_CODES.digitalVideo, lineItemIndex + 1);

      return {
        market: lineItem.market,                                // or fixed value
        platform: lineItem.platform,
        site: lineItem.site,
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
        line_item_id: lineItemId,
        lineItemId,
        line_item: lineItemIndex + 1,
        buyAmount: burst.buyAmount ?? burst.budget,
      };
    })
  );
  
  // push it up to page.tsx
  onLineItemsChange(items);
}, [watchedLineItems, feedigivideo, mbaNumber, form, onLineItemsChange]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      const investmentByMonth = calculateInvestmentPerMonth(form, feedigivideo || 0);
      const bursts = getDigiVideoBursts(form, feedigivideo || 0);
      
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
  }, [watchedLineItems, feedigivideo, form, onBurstsChange, onInvestmentChange]);

  const getBursts = () => {
    const formLineItems = form.getValues("digivideolineItems") || [];
    return formLineItems.flatMap(item =>
      item.bursts.map(burst => {
        const budget = parseFloat(burst.budget?.replace(/[^0-9.]/g, "") || "0");
        let mediaAmount = 0;
        let feeAmount = 0;

        if (item.budgetIncludesFees && item.clientPaysForMedia) {
          // Both true: budget is gross, extract fee only, mediaAmount = 0
          // Media = 0
          // Fees = Budget * (Fee / 100)
          feeAmount = budget * ((feedigivideo || 0) / 100);
          mediaAmount = 0;
        } else if (item.budgetIncludesFees) {
          const pct = feedigivideo || 0;
          mediaAmount = (budget * (100 - pct)) / 100;
          feeAmount = (budget * pct) / 100;
        } else if (item.clientPaysForMedia) {
          // Only clientPaysForMedia: budget is net media, only fee is billed
          feeAmount = (budget / (100 - (feedigivideo || 0))) * (feedigivideo || 0);
          mediaAmount = 0;
        } else {
          // Neither: budget is net media, fee calculated on top
          mediaAmount = budget;
          feeAmount = (budget * (feedigivideo || 0)) / 100;
        }

        const billingBurst: BillingBurst = {
          startDate: burst.startDate,
          endDate: burst.endDate,
          mediaAmount: mediaAmount,
          feeAmount: feeAmount,
          totalAmount: mediaAmount + feeAmount,
          mediaType: 'digi video',
          feePercentage: feedigivideo,
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
                    Digi Video Media
                  </CardTitle>
                  {digiVideoExpertModalOpen ? (
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
                  aria-label="Digi Video entry mode"
                  className="inline-flex shrink-0 rounded-lg border border-border bg-muted/50 p-0.5"
                >
                  <button
                    type="button"
                    aria-pressed={!digiVideoExpertModalOpen}
                    className={cn(
                      "rounded-md px-3 py-1.5 text-xs font-medium transition-all",
                      !digiVideoExpertModalOpen
                        ? "text-white shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                    style={
                      !digiVideoExpertModalOpen
                        ? { backgroundColor: MEDIA_ACCENT_HEX }
                        : undefined
                    }
                    onClick={() => {
                      if (digiVideoExpertModalOpen) {
                        handleDigiVideoExpertModalOpenChange(false)
                      }
                    }}
                  >
                    Standard
                  </button>
                  <button
                    type="button"
                    aria-pressed={digiVideoExpertModalOpen}
                    className={cn(
                      "rounded-md px-3 py-1.5 text-xs font-medium transition-all",
                      digiVideoExpertModalOpen
                        ? "text-white shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                      expertSegmentAttention &&
                        !digiVideoExpertModalOpen &&
                        "animate-pulse"
                    )}
                    style={{
                      ...(digiVideoExpertModalOpen
                        ? { backgroundColor: MEDIA_ACCENT_HEX }
                        : {}),
                      ...(expertSegmentAttention && !digiVideoExpertModalOpen
                        ? {
                            boxShadow: `0 0 0 2px ${rgbaFromHex(MEDIA_ACCENT_HEX, 0.45)}`,
                          }
                        : {}),
                    }}
                    onClick={() => {
                      if (!digiVideoExpertModalOpen) {
                        openDigiVideoExpertModal()
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
                      {getDeliverablesLabel(form.getValues(`digivideolineItems.${item.index - 1}.buyType`))}
                    </span>
                    <span>{item.deliverables.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[11px] text-muted-foreground block">Media</span>
                    <span>{formatMoney(item.media, { locale: "en-US", currency: "USD" })}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[11px] text-muted-foreground block">Fee</span>
                    <span>{formatMoney(item.fee, { locale: "en-US", currency: "USD" })}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[11px] text-muted-foreground block">Total</span>
                    <span className="font-semibold">{formatMoney(item.totalCost, { locale: "en-US", currency: "USD" })}</span>
                  </div>
                </div>
              </div>
            ))}

            <div className="flex items-center justify-between pt-3 mt-1 border-t-2 border-primary/20">
              <span className="text-sm font-semibold">Total</span>
              <div className="flex items-center gap-6 text-sm font-semibold tabular-nums">
                <div className="text-right">
                  <span className="text-[11px] text-muted-foreground font-normal block">Media</span>
                  <span>{formatMoney(overallTotals.overallMedia, { locale: "en-US", currency: "USD" })}</span>
                </div>
                <div className="text-right">
                  <span className="text-[11px] text-muted-foreground font-normal block">Fee ({feedigivideo}%)</span>
                  <span>{formatMoney(overallTotals.overallFee, { locale: "en-US", currency: "USD" })}</span>
                </div>
                <div className="text-right">
                  <span className="text-[11px] text-muted-foreground font-normal block">Total</span>
                  <span className="text-primary">{formatMoney(overallTotals.overallCost, { locale: "en-US", currency: "USD" })}</span>
                </div>
              </div>
            </div>
            <MediaContainerTimelineCollapsible
              mediaTypeKey="digitalVideo"
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
            {digiVideoExpertModalOpen ? null : (
            <Form {...form}>
              <div className="space-y-6">
                {lineItemFields.map((field, lineItemIndex) => {
                  const getTotals = (lineItemIndex: number) => {
                    const lineItem = form.getValues(`digivideolineItems.${lineItemIndex}`);
                    let totalMedia = 0;
                    let totalCalculatedValue = 0;

                    lineItem.bursts.forEach((burst) => {
                      const budget = parseFloat(burst.budget.replace(/[^0-9.]/g, "")) || 0;
                      totalMedia += budget;
                      totalCalculatedValue += burst.calculatedValue || 0;
                    });

                    return { totalMedia, totalCalculatedValue };
                  };

                  const selectedPublisher = form.watch(`digivideolineItems.${lineItemIndex}.publisher`);

                  let filteredDigiVideoSites;
                  if (!selectedPublisher) {
                    filteredDigiVideoSites = digivideoSites; // Show all sites if no publisher is selected
                  } else {
                    filteredDigiVideoSites = digivideoSites.filter(site => site.platform === selectedPublisher);
                  }

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
                              <CardTitle className="text-sm font-semibold tracking-tight">Digi Video Line Item</CardTitle>
                              <span className="font-mono text-[11px] text-muted-foreground">{`${mbaNumber}DV${lineItemIndex + 1}`}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              <span className="block text-[11px] text-muted-foreground">Total</span>
                              <span className="text-sm font-bold tabular-nums">
                                {formatMoney(
                                  form.getValues(`digivideolineItems.${lineItemIndex}.budgetIncludesFees`)
                                    ? totalMedia
                                    : totalMedia + (totalMedia / (100 - (feedigivideo || 0))) * (feedigivideo || 0),
                                  { locale: "en-US", currency: "USD" }
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
                                  ? `Expand details for digi video line item ${lineItemIndex + 1}`
                                  : `Collapse details for digi video line item ${lineItemIndex + 1}`
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
                            <span className="font-medium">Publisher:</span> {form.watch(`digivideolineItems.${lineItemIndex}.platform`) || 'Not selected'}
                          </div>
                          <div>
                            <span className="font-medium">Buy Type:</span> {formatBuyTypeForDisplay(form.watch(`digivideolineItems.${lineItemIndex}.buyType`))}
                          </div>
                          <div>
                            <span className="font-medium">Site:</span> {form.watch(`digivideolineItems.${lineItemIndex}.site`) || 'Not selected'}
                          </div>
                          <div>
                            <span className="font-medium">Bursts:</span> {form.watch(`digivideolineItems.${lineItemIndex}.bursts`, []).length}
                          </div>
                        </div>
                      </div>
                      
                      {!collapsedLineItems.has(lineItemIndex) && (
                      <div className="space-y-6 px-6 py-5">
                          <CardContent className="space-y-5 p-0">
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-4">
                              
                              {/* Column 1 - Dropdowns */}
                              <div className="space-y-4">
                                <FormField
                                  control={form.control}
                                  name={`digivideolineItems.${lineItemIndex}.publisher`}
                                  render={({ field }) => (
                                    <FormItem className="flex flex-col space-y-1.5">
                                      <FormLabel className="text-sm text-muted-foreground font-medium">Publisher</FormLabel>
                                      <FormControl>
                                        <Combobox
                                          value={field.value}
                                          onValueChange={(value) => {
                                            field.onChange(value)
                                            form.setValue(`digivideolineItems.${lineItemIndex}.platform`, value, { shouldDirty: true })
                                            form.setValue(`digivideolineItems.${lineItemIndex}.site`, "", { shouldDirty: true })
                                          }}
                                          placeholder="Select Publisher"
                                          searchPlaceholder="Search publishers..."
                                          emptyText={publishers.length === 0 ? "No publishers available." : "No publishers found."}
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
                                name={`digivideolineItems.${lineItemIndex}.site`}
                                render={({ field }) => (
                                  <FormItem className="flex flex-col space-y-1.5">
                                    <FormLabel className="text-sm text-muted-foreground font-medium">Site</FormLabel>
                                        <div className="flex-1 flex items-center space-x-1">
                                          <FormControl>
                                            <Combobox
                                              value={field.value}
                                              onValueChange={field.onChange}
                                              disabled={!selectedPublisher}
                                              placeholder={selectedPublisher ? "Select Site" : "Select Publisher first"}
                                              searchPlaceholder="Search sites..."
                                              emptyText={
                                                selectedPublisher
                                                  ? `No sites found for "${selectedPublisher}".`
                                                  : "Select Publisher first"
                                              }
                                              buttonClassName="h-9 w-full rounded-md"
                                              options={filteredDigiVideoSites.map((digivideoSite) => ({
                                                value: digivideoSite.site || `site-${digivideoSite.id}`,
                                                label: digivideoSite.site || "(Unnamed site)",
                                              }))}
                                            />
                                          </FormControl>
                                            <Button
                                              type="button"
                                              variant="ghost"
                                              size="sm"
                                              className="p-1 h-auto"
                                              onClick={() => {
                                                const currentPublisherInForm = form.getValues(`digivideolineItems.${lineItemIndex}.platform`); //
                                                if (!currentPublisherInForm) {
                                                  toast({ //
                                                    title: "Select a Site First",
                                                    description: "Please select a Publisher before adding a site.",
                                                    variant: "default", 
                                                  });
                                                  return;
                                                }
                                                setCurrentLineItemIndexForNewSite(lineItemIndex); //
                                                setNewSiteName(""); //
                                                setNewSitePlatform(selectedPublisher); //
                                                setIsAddSiteDialogOpen(true); //
                                              }}
                                            >
                                              <PlusCircle className="h-5 w-5 text-primary" />
                                            </Button>
                                           </div>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />

                              <FormField
                                control={form.control}
                                name={`digivideolineItems.${lineItemIndex}.buyType`}
                                render={({ field }) => (
                                  <FormItem className="flex flex-col space-y-1.5">
                                    <FormLabel className="text-sm text-muted-foreground font-medium">Buy Type</FormLabel>
                                    <FormControl>
                                      <Combobox
                                        value={field.value}
                                        onValueChange={(value) => handleBuyTypeChange(lineItemIndex, value)}
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
                                    {...form.register(`digivideolineItems.${lineItemIndex}.creativeTargeting`)}
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
                                    {...form.register(`digivideolineItems.${lineItemIndex}.buyingDemo`)}
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
                                    {...form.register(`digivideolineItems.${lineItemIndex}.creative`)}
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
                                    {...form.register(`digivideolineItems.${lineItemIndex}.market`)}
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
                                  name={`digivideolineItems.${lineItemIndex}.fixedCostMedia`}
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
                                  name={`digivideolineItems.${lineItemIndex}.clientPaysForMedia`}
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
                                  name={`digivideolineItems.${lineItemIndex}.budgetIncludesFees`}
                                  render={({ field }) => (
                                    <FormItem className="flex items-center space-x-2">
                                      <FormControl>
                                        <Checkbox
                                          checked={field.value}
                                          onCheckedChange={(checked) => {
                                            field.onChange(checked);
                                            const bursts =
                                              form.getValues(`digivideolineItems.${lineItemIndex}.bursts`) || [];
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
                                  name={`digivideolineItems.${lineItemIndex}.noadserving`}
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

                      {/* Bursts Section */}
                      <div className="space-y-4">
                        {form.watch(`digivideolineItems.${lineItemIndex}.bursts`, []).map((burstField, burstIndex) => {
                          return (
                            <Card key={`${lineItemIndex}-${burstIndex}`} className={MP_BURST_CARD}>
                              <CardContent className={MP_BURST_CARD_CONTENT}>
                                <div className={MP_BURST_ROW_SHELL}>
                                  <div className="w-24 flex-shrink-0">
                                    <h4 className="text-sm font-medium">
                                      {formatBurstLabel(
                                        burstIndex + 1,
                                        form.watch(`digivideolineItems.${lineItemIndex}.bursts.${burstIndex}.startDate`),
                                        form.watch(`digivideolineItems.${lineItemIndex}.bursts.${burstIndex}.endDate`)
                                      )}
                                    </h4>
                                  </div>
                                  
                                  <div className="grid grid-cols-7 gap-3 items-center flex-grow">
                                    <FormField
                                      control={form.control}
                                      name={`digivideolineItems.${lineItemIndex}.bursts.${burstIndex}.budget`}
                                      render={({ field }) => {
                                        const buyType = form.watch(`digivideolineItems.${lineItemIndex}.buyType`);
                                        return (
                                          <FormItem>
                                            <FormLabel className="text-xs">Budget</FormLabel>
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
                                                  const formattedValue = formatMoney(Number.parseFloat(value) || 0, {
                                                    locale: "en-US",
                                                    currency: "USD",
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
                                      name={`digivideolineItems.${lineItemIndex}.bursts.${burstIndex}.buyAmount`}
                                      render={({ field }) => {
                                        const buyType = form.watch(`digivideolineItems.${lineItemIndex}.buyType`);
                                        return (
                                          <FormItem>
                                            <FormLabel className="text-xs">Buy Amount</FormLabel>
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
                                                  const formattedValue = formatMoney(Number.parseFloat(value) || 0, {
                                                    locale: "en-US",
                                                    currency: "USD",
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
                                        name={`digivideolineItems.${lineItemIndex}.bursts.${burstIndex}.startDate`}
                                        render={({ field }) => (
                                          <FormItem>
                                            <FormLabel className="text-xs">Start Date</FormLabel>
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
                                        name={`digivideolineItems.${lineItemIndex}.bursts.${burstIndex}.endDate`}
                                        render={({ field }) => (
                                          <FormItem>
                                            <FormLabel className="text-xs">End Date</FormLabel>
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
                                      name={`digivideolineItems.${lineItemIndex}.bursts.${burstIndex}.calculatedValue`}
                                      render={({ field }) => (
                                        <CpcFamilyBurstCalculatedField
                                          form={form}
                                          itemsKey="digivideolineItems"
                                          lineItemIndex={lineItemIndex}
                                          burstIndex={burstIndex}
                                          field={field}
                                          feePct={feedigivideo || 0}
                                          netMedia={netMediaFeeMarkup}
                                          variant="cpcCpvCpm"
                                        />
                                      )}
                                    />

                                    <div className="space-y-1">
                                      <FormLabel className="text-xs leading-tight">Media</FormLabel>
                                      <Input
                                        type="text"
                                        className="w-full h-10 text-sm"
                                        value={formatMoney(
                                          form.getValues(`digivideolineItems.${lineItemIndex}.budgetIncludesFees`)
                                            ? (parseFloat(form.getValues(`digivideolineItems.${lineItemIndex}.bursts.${burstIndex}.budget`)?.replace(/[^0-9.]/g, "") || "0") / 100) * (100 - (feedigivideo || 0))
                                            : parseFloat(form.getValues(`digivideolineItems.${lineItemIndex}.bursts.${burstIndex}.budget`)?.replace(/[^0-9.]/g, "") || "0")
                                        , { locale: "en-US", currency: "USD" })}
                                        readOnly
                                      />
                                    </div>
                                    <div className="space-y-1">
                                      <FormLabel className="text-xs leading-tight">Fee ({feedigivideo}%)</FormLabel>
                                      <Input
                                        type="text"
                                        className="w-full h-10 text-sm"
                                        value={formatMoney(
                                          form.getValues(`digivideolineItems.${lineItemIndex}.budgetIncludesFees`)
                                            ? (parseFloat(form.getValues(`digivideolineItems.${lineItemIndex}.bursts.${burstIndex}.budget`)?.replace(/[^0-9.]/g, "") || "0") / 100) * (feedigivideo || 0)
                                            : (parseFloat(form.getValues(`digivideolineItems.${lineItemIndex}.bursts.${burstIndex}.budget`)?.replace(/[^0-9.]/g, "") || "0") / (100 - (feedigivideo || 0))) * (feedigivideo || 0)
                                        , { locale: "en-US", currency: "USD" })}
                                        readOnly
                                      />
                                    </div>
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
                      </div>
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
                                                              site: "",
                                                              bidStrategy: "",
                                                              buyType: "",
                                                              publisher: "",
                                                              placement: "",
                                                              size: "",
                                                              targetingAttribute: "",
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
                                                                  budget: "",
                                                                  buyAmount: "",
                                                                  startDate: defaultMediaBurstStartDate(campaignStartDate, campaignEndDate),
                                                                  endDate: defaultMediaBurstEndDate(campaignStartDate, campaignEndDate),
                                                                  calculatedValue: 0,
                                                                  fee: 0,
                                                                },
                                                              ],
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
        open={digiVideoExpertModalOpen}
        onOpenChange={handleDigiVideoExpertModalOpenChange}
      >
        <DialogContent className="max-w-[95vw] w-[95vw] max-h-[95vh] h-[95vh] flex flex-col p-4 gap-0 overflow-hidden">
          <DialogHeader className="flex-shrink-0 pb-2">
            <DialogTitle>Digi Video Expert Mode</DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-auto">
            <DigitalVideoExpertGrid
              campaignStartDate={campaignStartDate}
              campaignEndDate={campaignEndDate}
              feedigivideo={feedigivideo}
              rows={expertDigiVideoRows}
              onRowsChange={handleExpertDigiVideoRowsChange}
              publishers={publishers}
              digiVideoSites={digivideoSites}
            />
          </div>
          <DialogFooter className="flex-shrink-0 border-t pt-3 mt-2">
            <Button type="button" onClick={handleDigiVideoExpertApply}>
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={digiVideoExpertExitConfirmOpen}
        onOpenChange={(open) => {
          if (!open) dismissDigiVideoExpertExitConfirm()
        }}
      >
        <DialogContent
          className="z-[100] sm:max-w-md"
          onClick={(e) => {
            if (
              (e.target as HTMLElement).closest(
                "[data-digivideo-expert-exit-yes]"
              )
            ) {
              return
            }
            dismissDigiVideoExpertExitConfirm()
          }}
        >
          <DialogHeader>
            <DialogTitle>Leave Digi Video Expert Mode?</DialogTitle>
            <DialogDescription>
              You have unsaved changes in Expert Mode. Apply saves them to the
              Digi Video section; leaving now discards those edits.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={dismissDigiVideoExpertExitConfirm}
            >
              No, keep editing
            </Button>
            <Button
              type="button"
              variant="destructive"
              data-digivideo-expert-exit-yes
              onClick={confirmDigiVideoExpertExitWithoutSaving}
            >
              Yes, leave without saving
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    {/* Add Site dialog — publisher is locked to the line item that opened it */}
<Dialog open={isAddSiteDialogOpen} onOpenChange={setIsAddSiteDialogOpen}>
  <DialogContent className="sm:max-w-[425px]">
    <DialogHeader>
      <DialogTitle>Add New Video Site</DialogTitle>
      <DialogDescription>
        Enter the details for the new Video Site.
      </DialogDescription>
    </DialogHeader>
    <div className="grid gap-4 py-4">
    <div className="grid grid-cols-4 items-center gap-4">
        <Label htmlFor="dialogDisplayNetworkName" className="text-right">
          Publisher
        </Label>
        <Input
          id="dialogDisplayNetworkName"
          value={newSitePlatform}
          readOnly
          className="col-span-3 bg-muted focus:ring-0 pointer-events-none"
        />
      </div>
      <div className="grid grid-cols-4 items-center gap-4">
        <Label htmlFor="newStationName" className="text-right">
          Station Name
        </Label>
        <Input
          id="newStationName"
          value={newSiteName}
          onChange={(e) => setNewSiteName(e.target.value)}
          className="col-span-3"
          placeholder="e.g., Channel 9"
        />
      </div>
    </div>
    <DialogFooter>
      <Button type="button" variant="outline" onClick={() => setIsAddSiteDialogOpen(false)}>Cancel</Button>
      <Button type="button" onClick={handleAddNewSite} disabled={isLoading}>
        {isLoading ? "Adding..." : "Add Site"}
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
    </div>
  );
}