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
import { getPublishersForDigiAudio, getClientInfo, getAudioSites, createAudioSite } from "@/lib/api"
import { formatBurstLabel } from "@/lib/bursts"
import { computeBurstAmounts } from "@/lib/mediaplan/burstAmounts"
import { format } from "date-fns"
import { useMediaPlanContext } from "@/contexts/MediaPlanContext"
import { MEDIA_TYPE_ID_CODES, buildLineItemId } from "@/lib/mediaplan/lineItemIds"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { ChevronDown, Copy, Plus, Trash2 } from "lucide-react"
import type { BillingBurst, BillingMonth } from "@/lib/billing/types"; // ad
import type { LineItem } from '@/lib/generateMediaPlan'
import { formatMoney, parseMoneyInput } from "@/lib/format/money"
import {
  coerceBuyTypeWithDevWarn,
  deliverablesFromBudget,
  netFromGross,
  roundDeliverables,
} from "@/lib/mediaplan/deliverableBudget"
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
  DigitalAudioExpertGrid,
  createEmptyDigitalAudioExpertRow,
} from "@/components/media-containers/DigitalAudioExpertGrid"
import type { DigitalAudioExpertScheduleRow } from "@/lib/mediaplan/expertModeWeeklySchedule"
import {
  mapDigitalAudioExpertRowsToStandardLineItems,
  mapStandardDigiAudioLineItemsToExpertRows,
  type StandardDigiAudioFormLineItem,
} from "@/lib/mediaplan/expertOohRadioMappings"
import {
  mergeDigiAudioStandardFromExpertWithPrevious,
  serializeDigiAudioExpertRowsBaseline,
  serializeDigiAudioStandardLineItemsBaseline,
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

function computeDigiAudioLoadedDeliverables(
  burst: { budget?: string; buyAmount?: string; calculatedValue?: number | string },
  buyType: string,
  budgetIncludesFees: boolean,
  feePct: number
): number {
  const bt = coerceBuyTypeWithDevWarn(
    buyType,
    "DigitalAudioContainer.computeDigiAudioLoadedDeliverables"
  )
  const rawBudget =
    parseFloat(String(burst?.budget ?? "").replace(/[^0-9.]/g, "")) || 0
  const net = netFromGross(rawBudget, budgetIncludesFees, feePct)
  const buyAmount =
    parseFloat(String(burst?.buyAmount ?? "").replace(/[^0-9.]/g, "")) || 0
  if (bt === "bonus" || bt === "package_inclusions") {
    return (
      parseFloat(String(burst?.calculatedValue ?? "0").replace(/[^0-9.]/g, "")) ||
      0
    )
  }
  const raw = deliverablesFromBudget(bt, net, buyAmount)
  if (Number.isNaN(raw)) {
    return (
      parseFloat(String(burst?.calculatedValue ?? "0").replace(/[^0-9.]/g, "")) ||
      0
    )
  }
  return roundDeliverables(bt, raw)
}

// Exported utility function to get bursts
export function getAllBursts(form) {
  const digiaudiolineItems = form.getValues("digiaudiolineItems") || [];

  return digiaudiolineItems.flatMap((lineItem) =>
    lineItem.bursts.map((burst) => ({
      startDate: burst.startDate,
      endDate: burst.endDate,
      budget: burst.budget,
    }))
  );
}

const digiaudioburstSchema = z.object({
  budget: z.string().min(1, "Budget is required"),
  buyAmount: z.string().min(1, "Buy Amount is required"),
  startDate: z.date(),
  endDate: z.date(),
  calculatedValue: z.number().optional(),
  fee: z.number().optional(),
})

const digiaudiolineItemSchema = z.object({
  platform: z.string().min(1, "Platform is required"),
  site: z.string().min(1, "Site is required"),
  bidStrategy: z.string().min(1, "Bid Strategy is required"),
  buyType: z.string().min(1, "Buy Type is required"),
  publisher: z.string().min(1, "Publisher is required"),
  targetingAttribute: z.string(),
  creativeTargeting: z.string().min(1, "Creative Targeting is required"),
  creative: z.string().min(1, "Creative is required"),
  buyingDemo: z.string().min(1, "Buying Demo is required"),
  market: z.string().min(1, "Market is required"),
  fixedCostMedia: z.boolean(),
  clientPaysForMedia: z.boolean(),
  budgetIncludesFees: z.boolean(),
  noadserving: z.boolean(),
  bursts: z.array(digiaudioburstSchema).min(1, "At least one burst is required"),
  totalMedia: z.number().optional(),
  totalDeliverables: z.number().optional(),
  totalFee: z.number().optional(),
})

const digiAudioFormSchema = z.object({
  digiaudiolineItems: z.array(digiaudiolineItemSchema),
  overallDeliverables: z.number().optional(),
})

type DigiAudioFormValues = z.infer<typeof digiAudioFormSchema>

// Type definition for form values

interface Publisher {
  id: number;
  publisher_name: string;
}

interface AudioSite {
  id: number;
  platform: string;
  site: string;
}

const MEDIA_ACCENT_HEX = getMediaTypeThemeHex("digiaudio")

interface DigiAudioContainerProps {
  clientId: string;
  feedigiaudio: number;
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

export function getDigiAudioBursts(
  form: UseFormReturn<DigiAudioFormValues>,
  feedigiaudio: number
): BillingBurst[] {
  const digiaudiolineItems = form.getValues("digiaudiolineItems") || []

  return digiaudiolineItems.flatMap(li =>
    li.bursts.map(burst => {
      const rawBudget = parseFloat(burst.budget.replace(/[^0-9.]/g, "")) || 0

      const pct = feedigiaudio || 0

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

        mediaType:          "digi audio",
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

export function calculateInvestmentPerMonth(form, feedigiaudio) {
  const digiaudiolineItems = form.getValues("digiaudiolineItems") || [];
  let monthlyInvestment: Record<string, number> = {};

  digiaudiolineItems.forEach((lineItem) => {
    lineItem.bursts.forEach((burst) => {
      const startDate = new Date(burst.startDate);
      const endDate = new Date(burst.endDate);
      const lineMedia = parseFloat(burst.budget.replace(/[^0-9.]/g, "")) || 0;
      const feePercentage = feedigiaudio || 0;

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

export function calculateBurstInvestmentPerMonth(form, feedigiaudio) {
  const digiaudiolineItems = form.getValues("digiaudiolineItems") || [];
  let monthlyInvestment: Record<string, number> = {};

  digiaudiolineItems.forEach((lineItem) => {
    lineItem.bursts.forEach((burst) => {
      const startDate = new Date(burst.startDate);
      const endDate = new Date(burst.endDate);
      const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      const burstBudget = parseFloat(burst.budget.replace(/[^0-9.]/g, "")) || 0;
      const feePercentage = feedigiaudio || 0;
      
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

export default function DigiAudioContainer({
  clientId,
  feedigiaudio,
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
}: DigiAudioContainerProps) {
  // Add refs to track previous values
  const prevInvestmentRef = useRef<{ monthYear: string; amount: string }[]>([]);
  const prevBurstsRef = useRef<BillingBurst[]>([]);
  const publishersRef = useRef<Publisher[]>([]);
  const audioSitesRef = useRef<AudioSite[]>([]);
  const [publishers, setPublishers] = useState<Publisher[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [audioSites, setAudioSites] = useState<AudioSite[]>([]);
  const { toast } = useToast()
  const { mbaNumber } = useMediaPlanContext()
  const [overallDeliverables, setOverallDeliverables] = useState(0);

  const [expertDigiAudioRows, setExpertDigiAudioRows] = useState<
    DigitalAudioExpertScheduleRow[]
  >([])
  const [digiAudioExpertModalOpen, setDigiAudioExpertModalOpen] =
    useState(false)
  const [digiAudioExpertExitConfirmOpen, setDigiAudioExpertExitConfirmOpen] =
    useState(false)
  const [expertSegmentAttention, setExpertSegmentAttention] = useState(true)
  const digiAudioStandardBaselineRef = useRef("")
  const digiAudioExpertRowsBaselineRef = useRef("")
  const digiAudioExpertModalOpenRef = useRef(false)
  digiAudioExpertModalOpenRef.current = digiAudioExpertModalOpen

  const digiAudioExpertWeekColumns = useMemo(
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
      const fetchedAudioSites = await getAudioSites(); //
      audioSitesRef.current = fetchedAudioSites; //
      setAudioSites(fetchedAudioSites); //
    } catch (error) {
      toast({ //
        title: "Error refreshing Audio Sites",
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
    const newSiteData: Omit<AudioSite, 'id'> = { //
      site: newSiteName,
      platform: newSitePlatform,
  };
  const createdSite = await createAudioSite(newSiteData);

    toast({
      title: "Site Added",
      description: `${createdSite.site} has been successfully added.`,
    });
  
  await fetchAndUpdateVideoSites();

  // Optionally, select the newly added station and network in the form
  if (currentLineItemIndexForNewSite !== null) {
    form.setValue(`digiaudiolineItems.${currentLineItemIndexForNewSite}.publisher`, createdSite.platform, { shouldDirty: true })
    form.setValue(`digiaudiolineItems.${currentLineItemIndexForNewSite}.platform`, createdSite.platform, { shouldDirty: true })
    form.setValue(`digiaudiolineItems.${currentLineItemIndexForNewSite}.site`, createdSite.site, { shouldDirty: true })
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
    resolver: zodResolver(digiAudioFormSchema),
    defaultValues: {
      digiaudiolineItems: [
        {
          site: "",
          platform: "",
          bidStrategy: "",
          buyType: "",
          publisher: "",
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
    name: "digiaudiolineItems",
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

  const collapseAllLineItems = useCallback(() => {
    const items = form.getValues("digiaudiolineItems") || []
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
    digiAudioStandardBaselineRef.current =
      serializeDigiAudioStandardLineItemsBaseline(
        form.getValues("digiaudiolineItems")
      )
  }, [form])

  useEffect(() => {
    const id = window.setTimeout(() => setExpertSegmentAttention(false), 2800)
    return () => window.clearTimeout(id)
  }, [])

  const handleExpertDigiAudioRowsChange = useCallback(
    (next: DigitalAudioExpertScheduleRow[]) => {
      setExpertDigiAudioRows(next)
    },
    []
  )

  const openDigiAudioExpertModal = useCallback(() => {
    const mapped = mapStandardDigiAudioLineItemsToExpertRows(
      (form.getValues("digiaudiolineItems") || []) as StandardDigiAudioFormLineItem[],
      digiAudioExpertWeekColumns,
      campaignStartDate,
      campaignEndDate
    )
    const weekKeys = digiAudioExpertWeekColumns.map((c) => c.weekKey)
    const rows: DigitalAudioExpertScheduleRow[] =
      mapped.length > 0
        ? mapped
        : [
            createEmptyDigitalAudioExpertRow(
              typeof crypto !== "undefined" && crypto.randomUUID
                ? crypto.randomUUID()
                : `digiaudio-expert-${Date.now()}`,
              campaignStartDate,
              campaignEndDate,
              weekKeys
            ),
          ]
    digiAudioExpertRowsBaselineRef.current =
      serializeDigiAudioExpertRowsBaseline(rows)
    setExpertDigiAudioRows(rows)
    setDigiAudioExpertExitConfirmOpen(false)
    setDigiAudioExpertModalOpen(true)
  }, [campaignStartDate, campaignEndDate, form, digiAudioExpertWeekColumns])

  const dismissDigiAudioExpertExitConfirm = useCallback(() => {
    setDigiAudioExpertExitConfirmOpen(false)
  }, [])

  const confirmDigiAudioExpertExitWithoutSaving = useCallback(() => {
    setDigiAudioExpertExitConfirmOpen(false)
    collapseAllLineItems()
    setDigiAudioExpertModalOpen(false)
  }, [collapseAllLineItems])

  const handleDigiAudioExpertModalOpenChange = useCallback(
    (open: boolean) => {
      if (open) {
        setDigiAudioExpertModalOpen(true)
        return
      }
      const dirty =
        serializeDigiAudioExpertRowsBaseline(expertDigiAudioRows) !==
        digiAudioExpertRowsBaselineRef.current
      if (!dirty) {
        collapseAllLineItems()
        setDigiAudioExpertModalOpen(false)
        return
      }
      setDigiAudioExpertExitConfirmOpen(true)
    },
    [collapseAllLineItems, expertDigiAudioRows]
  )

  const handleDigiAudioExpertApply = useCallback(() => {
    const prevLineItems = form.getValues("digiaudiolineItems") || []
    const standard = mapDigitalAudioExpertRowsToStandardLineItems(
      expertDigiAudioRows,
      digiAudioExpertWeekColumns,
      campaignStartDate,
      campaignEndDate,
      {
        feePctDigiAudio: feedigiaudio,
        budgetIncludesFees: Boolean(prevLineItems[0]?.budgetIncludesFees),
      }
    )
    const merged = mergeDigiAudioStandardFromExpertWithPrevious(
      standard,
      prevLineItems as StandardDigiAudioFormLineItem[]
    )
    form.setValue("digiaudiolineItems", merged as any, {
      shouldDirty: true,
      shouldValidate: false,
    })
    digiAudioStandardBaselineRef.current =
      serializeDigiAudioStandardLineItemsBaseline(
        form.getValues("digiaudiolineItems")
      )
    setDigiAudioExpertExitConfirmOpen(false)
    collapseAllLineItems()
    setDigiAudioExpertModalOpen(false)
  }, [
    campaignStartDate,
    campaignEndDate,
    collapseAllLineItems,
    expertDigiAudioRows,
    feedigiaudio,
    form,
    digiAudioExpertWeekColumns,
  ])

  const handleDuplicateLineItem = useCallback((lineItemIndex: number) => {
    const items = form.getValues("digiaudiolineItems") || [];
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
    name: "digiaudiolineItems",
    defaultValue: form.getValues("digiaudiolineItems")
  });

  // Data loading for edit mode
  useEffect(() => {
    if (digiAudioExpertModalOpenRef.current) return
    if (initialLineItems && initialLineItems.length > 0) {
      const transformedLineItems = initialLineItems.map((item: any) => ({
        platform: item.platform || "",
        publisher: item.publisher || "",
        site: item.site || "",
        placement: item.placement || "",
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
          calculatedValue: computeDigiAudioLoadedDeliverables(
            burst,
            item.buy_type || item.buyType || "",
            !!item.budget_includes_fees,
            feedigiaudio || 0
          ),
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
        digiaudiolineItems: transformedLineItems,
        overallDeliverables: 0,
      });
    }
  }, [initialLineItems, form, campaignStartDate, campaignEndDate, feedigiaudio]);

  // Transform form data to API schema format
  useEffect(() => {
    const formLineItems = form.getValues('digiaudiolineItems') || [];
    
    const transformedLineItems = formLineItems.map((lineItem, index) => {
      // Calculate totalMedia from raw budget amounts (for display in MBA section)
      let totalMedia = 0;
      lineItem.bursts.forEach((burst) => {
        const budget = parseFloat(burst.budget.replace(/[^0-9.]/g, "")) || 0;
        if (lineItem.budgetIncludesFees) {
          const pct = feedigiaudio || 0;
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
        line_item_id: buildLineItemId(mbaNumber, MEDIA_TYPE_ID_CODES.digitalAudio, index + 1),
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
  }, [watchedLineItems, mbaNumber, feedigiaudio, form, onMediaLineItemsChange]);
  
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
          const pct = feedigiaudio || 0;
          lineMedia += (budget * (100 - pct)) / 100;
          lineFee += (budget * pct) / 100;
        } else {
          // Budget is net media, fee calculated on top
          lineMedia += budget;
          const fee = feedigiaudio ? (budget / (100 - feedigiaudio)) * feedigiaudio : 0;
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
  }, [watchedLineItems, feedigiaudio]);
  
  // Callback handlers
  const handleLineItemValueChange = useCallback((lineItemIndex: number) => {
    const digiaudiolineItems = form.getValues("digiaudiolineItems") || [];
    let overallMedia = 0;
    let overallFee = 0;
    let overallCost = 0;
    let overallDeliverableCount = 0;

    digiaudiolineItems.forEach((lineItem) => {
      let lineMedia = 0;
      let lineFee = 0;
      let lineDeliverables = 0;

      lineItem.bursts.forEach((burst) => {
        const budget = parseFloat(burst?.budget?.replace(/[^0-9.]/g, "") || "0");
        if (lineItem.budgetIncludesFees) {
          const pct = feedigiaudio || 0;
          lineMedia += (budget * (100 - pct)) / 100;
          lineFee += (budget * pct) / 100;
        } else {
          lineMedia += budget;
          const fee = feedigiaudio ? (budget / (100 - feedigiaudio)) * feedigiaudio : 0;
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
  }, [form, feedigiaudio, onTotalMediaChange]);

  const handleBuyTypeChange = useCallback(
    (lineItemIndex: number, value: string) => {
      form.setValue(`digiaudiolineItems.${lineItemIndex}.buyType`, value);

      if (value === "bonus" || value === "package_inclusions") {
        const currentBursts =
          form.getValues(`digiaudiolineItems.${lineItemIndex}.bursts`) || [];
        const zeroedBursts = currentBursts.map((burst: any) => ({
          ...burst,
          budget: "0",
          buyAmount: "0",
          calculatedValue: burst.calculatedValue ?? 0,
        }));

        form.setValue(
          `digiaudiolineItems.${lineItemIndex}.bursts`,
          zeroedBursts,
          { shouldDirty: true }
        );
      }

      handleLineItemValueChange(lineItemIndex);
    },
    [form, handleLineItemValueChange]
  );

  const handleValueChange = useCallback((lineItemIndex: number, burstIndex: number, budgetIncludesFeesOverride?: boolean) => {
    const burst = form.getValues(`digiaudiolineItems.${lineItemIndex}.bursts.${burstIndex}`);
    const lineItem = form.getValues(`digiaudiolineItems.${lineItemIndex}`);
    const budgetIncludesFees = budgetIncludesFeesOverride ?? Boolean(lineItem?.budgetIncludesFees);
    const buyType = form.getValues(`digiaudiolineItems.${lineItemIndex}.buyType`);
    const calculatedValue = computeDigiAudioLoadedDeliverables(
      burst,
      buyType,
      budgetIncludesFees,
      feedigiaudio || 0
    );

    const currentValue =
      Number(form.getValues(`digiaudiolineItems.${lineItemIndex}.bursts.${burstIndex}.calculatedValue`)) || 0;
    if (Math.abs(currentValue - calculatedValue) > 1e-6) {
      form.setValue(`digiaudiolineItems.${lineItemIndex}.bursts.${burstIndex}.calculatedValue`, calculatedValue, {
        shouldValidate: false, // Changed to false to prevent validation loops
        shouldDirty: false,    // Changed to false to prevent dirty state loops
      });

      handleLineItemValueChange(lineItemIndex);
    }
  }, [feedigiaudio, form, handleLineItemValueChange]);

  const handleAppendBurst = useCallback((lineItemIndex: number) => {
    const currentBursts = form.getValues(`digiaudiolineItems.${lineItemIndex}.bursts`) || [];
    
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
    
    form.setValue(`digiaudiolineItems.${lineItemIndex}.bursts`, [
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
    const currentBursts = form.getValues(`digiaudiolineItems.${lineItemIndex}.bursts`) || [];

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

    form.setValue(`digiaudiolineItems.${lineItemIndex}.bursts`, [
      ...currentBursts,
      duplicatedBurst,
    ]);

    handleLineItemValueChange(lineItemIndex);
  }, [form, handleLineItemValueChange, toast]);

  const handleRemoveBurst = useCallback((lineItemIndex: number, burstIndex: number) => {
    const currentBursts = form.getValues(`digiaudiolineItems.${lineItemIndex}.bursts`) || [];
    form.setValue(
      `digiaudiolineItems.${lineItemIndex}.bursts`,
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

        const fetchedPublishers = await getPublishersForDigiAudio();
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

  // Effect hooks for audio sites
  useEffect(() => {
    const fetchAudioSites = async () => {
      try {
        // Check if we already have audio sites cached
        if (audioSitesRef.current.length > 0) {
          setAudioSites(audioSitesRef.current);
          setIsLoading(false);
          return;
        }

        const fetchedAudioSites = await getAudioSites();
        audioSitesRef.current = fetchedAudioSites;
        setAudioSites(fetchedAudioSites);
      } catch (error) {
        toast({
          title: "Error loading audio sites",
          description: error.message,
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };
  
    fetchAudioSites();
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
  const calculatedBursts = getDigiAudioBursts(form, feedigiaudio || 0);
  let burstIndex = 0;

  const items: LineItem[] = form.getValues('digiaudiolineItems').flatMap((lineItem, lineItemIndex) =>
    lineItem.bursts.map(burst => {
      const computedBurst = calculatedBursts[burstIndex++];
      const mediaAmount = computedBurst
        ? computedBurst.mediaAmount
        : parseFloat(String(burst.budget).replace(/[^0-9.-]+/g, "")) || 0;
      const lineItemId = buildLineItemId(mbaNumber, MEDIA_TYPE_ID_CODES.digitalAudio, lineItemIndex + 1);

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
}, [watchedLineItems, feedigiaudio, mbaNumber, form, onLineItemsChange]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      const investmentByMonth = calculateInvestmentPerMonth(form, feedigiaudio || 0);
      const bursts = getDigiAudioBursts(form, feedigiaudio || 0);
      
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
  }, [watchedLineItems, feedigiaudio, form, onBurstsChange, onInvestmentChange]);

  const getBursts = () => {
    const formLineItems = form.getValues("digiaudiolineItems") || [];
    return formLineItems.flatMap(item =>
      item.bursts.map(burst => {
        const budget = parseFloat(burst.budget?.replace(/[^0-9.]/g, "") || "0");
        let mediaAmount = 0;
        let feeAmount = 0;

        if (item.budgetIncludesFees && item.clientPaysForMedia) {
          // Both true: budget is gross, extract fee only, mediaAmount = 0
          // Media = 0
          // Fees = Budget * (Fee / 100)
          feeAmount = budget * ((feedigiaudio || 0) / 100);
          mediaAmount = 0;
        } else if (item.budgetIncludesFees) {
          const pct = feedigiaudio || 0;
          mediaAmount = (budget * (100 - pct)) / 100;
          feeAmount = (budget * pct) / 100;
        } else if (item.clientPaysForMedia) {
          // Only clientPaysForMedia: budget is net media, only fee is billed
          feeAmount = (budget / (100 - (feedigiaudio || 0))) * (feedigiaudio || 0);
          mediaAmount = 0;
        } else {
          // Neither: budget is net media, fee calculated on top
          mediaAmount = budget;
          feeAmount = (budget * (feedigiaudio || 0)) / 100;
        }

        const billingBurst: BillingBurst = {
          startDate: burst.startDate,
          endDate: burst.endDate,
          mediaAmount: mediaAmount,
          feeAmount: feeAmount,
          totalAmount: mediaAmount + feeAmount,
          mediaType: 'digi audio',
          feePercentage: feedigiaudio,
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
                    Digital Audio
                  </CardTitle>
                  {digiAudioExpertModalOpen ? (
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
                  aria-label="Digital Audio entry mode"
                  className="inline-flex shrink-0 rounded-lg border border-border bg-muted/50 p-0.5"
                >
                  <button
                    type="button"
                    aria-pressed={!digiAudioExpertModalOpen}
                    className={cn(
                      "rounded-md px-3 py-1.5 text-xs font-medium transition-all",
                      !digiAudioExpertModalOpen
                        ? "text-white shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                    style={
                      !digiAudioExpertModalOpen
                        ? { backgroundColor: MEDIA_ACCENT_HEX }
                        : undefined
                    }
                    onClick={() => {
                      if (digiAudioExpertModalOpen) {
                        handleDigiAudioExpertModalOpenChange(false)
                      }
                    }}
                  >
                    Standard
                  </button>
                  <button
                    type="button"
                    aria-pressed={digiAudioExpertModalOpen}
                    className={cn(
                      "rounded-md px-3 py-1.5 text-xs font-medium transition-all",
                      digiAudioExpertModalOpen
                        ? "text-white shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                      expertSegmentAttention &&
                        !digiAudioExpertModalOpen &&
                        "animate-pulse"
                    )}
                    style={{
                      ...(digiAudioExpertModalOpen
                        ? { backgroundColor: MEDIA_ACCENT_HEX }
                        : {}),
                      ...(expertSegmentAttention && !digiAudioExpertModalOpen
                        ? {
                            boxShadow: `0 0 0 2px ${rgbaFromHex(MEDIA_ACCENT_HEX, 0.45)}`,
                          }
                        : {}),
                    }}
                    onClick={() => {
                      if (!digiAudioExpertModalOpen) {
                        openDigiAudioExpertModal()
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
                      {getDeliverablesLabel(form.getValues(`digiaudiolineItems.${item.index - 1}.buyType`))}
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
                  <span className="text-[11px] text-muted-foreground font-normal block">Fee ({feedigiaudio}%)</span>
                  <span>{formatMoney(overallTotals.overallFee, { locale: "en-AU", currency: "AUD" })}</span>
                </div>
                <div className="text-right">
                  <span className="text-[11px] text-muted-foreground font-normal block">Total</span>
                  <span className="text-primary">{formatMoney(overallTotals.overallCost, { locale: "en-AU", currency: "AUD" })}</span>
                </div>
              </div>
            </div>
            <MediaContainerTimelineCollapsible
              mediaTypeKey="digitalAudio"
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
            {digiAudioExpertModalOpen ? null : (
            <Form {...form}>
              <div className="space-y-6">
                {lineItemFields.map((field, lineItemIndex) => {
                  const getTotals = (lineItemIndex: number) => {
                    const lineItem = form.getValues(`digiaudiolineItems.${lineItemIndex}`);
                    let totalMedia = 0;
                    let totalCalculatedValue = 0;

                    lineItem.bursts.forEach((burst) => {
                      const budget = parseFloat(burst.budget.replace(/[^0-9.]/g, "")) || 0;
                      totalMedia += budget;
                      totalCalculatedValue += burst.calculatedValue || 0;
                    });

                    return { totalMedia, totalCalculatedValue };
                  };

                  const selectedPublisher = form.watch(`digiaudiolineItems.${lineItemIndex}.publisher`);

                  let filteredDigiAudioSites;
                  if (!selectedPublisher) {
                    filteredDigiAudioSites = audioSites; // Show all sites if no publisher is selected
                  } else {
                    filteredDigiAudioSites = audioSites.filter(site => site.platform === selectedPublisher);
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
                              <CardTitle className="text-sm font-semibold tracking-tight">Digital Audio Line Item</CardTitle>
                              <span className="font-mono text-[11px] text-muted-foreground">{`${mbaNumber}DA${lineItemIndex + 1}`}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              <span className="block text-[11px] text-muted-foreground">Total</span>
                              <span className="text-sm font-bold tabular-nums">
                                {formatMoney(
                                  form.getValues(`digiaudiolineItems.${lineItemIndex}.budgetIncludesFees`)
                                    ? totalMedia
                                    : totalMedia + (totalMedia / (100 - (feedigiaudio || 0))) * (feedigiaudio || 0),
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
                                  ? `Expand details for digital audio line item ${lineItemIndex + 1}`
                                  : `Collapse details for digital audio line item ${lineItemIndex + 1}`
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
                            <span className="font-medium">Publisher:</span> {form.watch(`digiaudiolineItems.${lineItemIndex}.publisher`) || 'Not selected'}
                          </div>
                          <div>
                            <span className="font-medium">Station:</span> {form.watch(`digiaudiolineItems.${lineItemIndex}.site`) || 'Not selected'}
                          </div>
                          <div>
                            <span className="font-medium">Station:</span> {form.watch(`digiaudiolineItems.${lineItemIndex}.site`) || 'Not selected'}
                          </div>
                          <div>
                            <span className="font-medium">Bursts:</span> {form.watch(`digiaudiolineItems.${lineItemIndex}.bursts`, []).length}
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
                                name={`digiaudiolineItems.${lineItemIndex}.publisher`}
                                render={({ field }) => (
                                  <FormItem className="flex flex-col space-y-1.5">
                                    <FormLabel className="text-sm text-muted-foreground font-medium">Publisher</FormLabel>
                                    <FormControl>
                                      <Combobox
                                        value={field.value}
                                        onValueChange={(value) => {
                                          field.onChange(value)
                                          form.setValue(`digiaudiolineItems.${lineItemIndex}.platform`, value, { shouldDirty: true })
                                          form.setValue(`digiaudiolineItems.${lineItemIndex}.site`, "", { shouldDirty: true })
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
                                name={`digiaudiolineItems.${lineItemIndex}.site`}
                                render={({ field }) => (
                                  <FormItem className="flex flex-col space-y-1.5">
                                    <FormLabel className="text-sm text-muted-foreground font-medium">Station</FormLabel>
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
                                                  ? `No sites found for \"${selectedPublisher}\".`
                                                  : "Select Publisher first"
                                              }
                                              buttonClassName="h-9 w-full rounded-md"
                                              options={filteredDigiAudioSites.map((digiaudioSite) => ({
                                                value: digiaudioSite.site || `site-${digiaudioSite.id}`,
                                                label: digiaudioSite.site || "(Unnamed site)",
                                              }))}
                                            />
                                          </FormControl>
                                            <Button
                                              type="button"
                                              variant="ghost"
                                              size="sm"
                                              className="p-1 h-auto"
                                              onClick={() => {
                                                const currentPublisherInForm = form.getValues(`digiaudiolineItems.${lineItemIndex}.platform`); //
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
                                name={`digiaudiolineItems.${lineItemIndex}.buyType`}
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
                                    {...form.register(`digiaudiolineItems.${lineItemIndex}.creativeTargeting`)}
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
                                    {...form.register(`digiaudiolineItems.${lineItemIndex}.buyingDemo`)}
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
                                    {...form.register(`digiaudiolineItems.${lineItemIndex}.creative`)}
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
                                    {...form.register(`digiaudiolineItems.${lineItemIndex}.market`)}
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
                                  name={`digiaudiolineItems.${lineItemIndex}.fixedCostMedia`}
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
                                  name={`digiaudiolineItems.${lineItemIndex}.clientPaysForMedia`}
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
                                  name={`digiaudiolineItems.${lineItemIndex}.budgetIncludesFees`}
                                  render={({ field }) => (
                                    <FormItem className="flex items-center space-x-2">
                                      <FormControl>
                                        <Checkbox
                                          checked={field.value}
                                          onCheckedChange={(checked) => {
                                            field.onChange(checked);
                                            const bursts =
                                              form.getValues(`digiaudiolineItems.${lineItemIndex}.bursts`) || [];
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
                                  name={`digiaudiolineItems.${lineItemIndex}.noadserving`}
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
                              <div
                                className={`${MP_BURST_GRID_7} text-[11px] font-semibold uppercase tracking-wider text-muted-foreground`}
                              >
                                <span>Budget</span>
                                <span>Buy Amount</span>
                                <div className="col-span-2 grid grid-cols-2 gap-2">
                                  <span>Start Date</span>
                                  <span>End Date</span>
                                </div>
                                <span>
                                  {getCpcFamilyBurstCalculatedColumnLabel(
                                    "cpcCpvCpm",
                                    form.watch(`digiaudiolineItems.${lineItemIndex}.buyType`) || ""
                                  )}
                                </span>
                                <span>Media</span>
                                <span>{`Fee (${feedigiaudio}%)`}</span>
                              </div>
                              <div className={MP_BURST_ACTION_COLUMN}>
                                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Actions</span>
                              </div>
                            </div>
                          </div>
                        </div>
                        {form.watch(`digiaudiolineItems.${lineItemIndex}.bursts`, []).map((burstField, burstIndex) => {
                          return (
                            <Card key={`${lineItemIndex}-${burstIndex}`} className={MP_BURST_CARD}>
                              <CardContent className={MP_BURST_CARD_CONTENT}>
                                <div className={MP_BURST_ROW_SHELL}>
                                  <div className={MP_BURST_LABEL_COLUMN}>
                                    <h4 className={MP_BURST_LABEL_HEADING}>
                                      {formatBurstLabel(
                                        burstIndex + 1,
                                        form.watch(`digiaudiolineItems.${lineItemIndex}.bursts.${burstIndex}.startDate`),
                                        form.watch(`digiaudiolineItems.${lineItemIndex}.bursts.${burstIndex}.endDate`)
                                      )}
                                    </h4>
                                  </div>
                                  
                                  <div className={MP_BURST_GRID_7}>
                                    <FormField
                                      control={form.control}
                                      name={`digiaudiolineItems.${lineItemIndex}.bursts.${burstIndex}.budget`}
                                      render={({ field }) => (
<FormItem>
  <FormControl>
                                            <Input
                                              {...field}
                                              type="text"
                                                  className="w-full min-w-[9rem] h-10 text-sm"
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
                                      )}
                                    />

                                    <FormField
                                      control={form.control}
                                      name={`digiaudiolineItems.${lineItemIndex}.bursts.${burstIndex}.buyAmount`}
                                      render={({ field }) => (
<FormItem>
  <FormControl>
                                            <Input
                                              {...field}
                                              type="text"
                                                  className="w-full min-w-[9rem] h-10 text-sm"
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
                                      )}
                                    />

                                    <div className="grid grid-cols-2 gap-2 col-span-2">
                                      <FormField
                                        control={form.control}
                                        name={`digiaudiolineItems.${lineItemIndex}.bursts.${burstIndex}.startDate`}
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
                                        name={`digiaudiolineItems.${lineItemIndex}.bursts.${burstIndex}.endDate`}
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
                                      name={`digiaudiolineItems.${lineItemIndex}.bursts.${burstIndex}.calculatedValue`}
                                      render={({ field }) => (
                                        <CpcFamilyBurstCalculatedField
                                          form={form}
                                          itemsKey="digiaudiolineItems"
                                          lineItemIndex={lineItemIndex}
                                          burstIndex={burstIndex}
                                          field={field}
                                          feePct={feedigiaudio || 0}
                                          netMedia={netFromGross}
                                          variant="cpcCpvCpm"
                                        />
                                      )}
                                    />

                                    <Input
                                        type="text"
                                        className="w-full h-10 text-sm bg-muted/30 border-border/40 text-muted-foreground"
                                        value={formatMoney(
                                          form.getValues(`digiaudiolineItems.${lineItemIndex}.budgetIncludesFees`)
                                            ? (parseFloat(form.getValues(`digiaudiolineItems.${lineItemIndex}.bursts.${burstIndex}.budget`)?.replace(/[^0-9.]/g, "") || "0") / 100) * (100 - (feedigiaudio || 0))
                                            : parseFloat(form.getValues(`digiaudiolineItems.${lineItemIndex}.bursts.${burstIndex}.budget`)?.replace(/[^0-9.]/g, "") || "0")
                                        , { locale: "en-AU", currency: "AUD" })}
                                        readOnly
                                      />
                                    <Input
                                        type="text"
                                        className="w-full h-10 text-sm bg-muted/30 border-border/40 text-muted-foreground"
                                        value={formatMoney(
                                          form.getValues(`digiaudiolineItems.${lineItemIndex}.budgetIncludesFees`)
                                            ? (parseFloat(form.getValues(`digiaudiolineItems.${lineItemIndex}.bursts.${burstIndex}.budget`)?.replace(/[^0-9.]/g, "") || "0") / 100) * (feedigiaudio || 0)
                                            : (parseFloat(form.getValues(`digiaudiolineItems.${lineItemIndex}.bursts.${burstIndex}.budget`)?.replace(/[^0-9.]/g, "") || "0") / (100 - (feedigiaudio || 0))) * (feedigiaudio || 0)
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
                                                          site: "",
                                                          bidStrategy: "",
                                                          buyType: "",
                                                          publisher: "",
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
        open={digiAudioExpertModalOpen}
        onOpenChange={handleDigiAudioExpertModalOpenChange}
      >
        <DialogContent className="max-w-[95vw] w-[95vw] max-h-[95vh] h-[95vh] flex flex-col p-4 gap-0 overflow-hidden">
          <DialogHeader className="flex-shrink-0 pb-2">
            <DialogTitle>Digital Audio Expert Mode</DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-auto">
            <DigitalAudioExpertGrid
              campaignStartDate={campaignStartDate}
              campaignEndDate={campaignEndDate}
              feedigiaudio={feedigiaudio}
              rows={expertDigiAudioRows}
              onRowsChange={handleExpertDigiAudioRowsChange}
              publishers={publishers}
              digiAudioSites={audioSites}
            />
          </div>
          <DialogFooter className="flex-shrink-0 border-t pt-3 mt-2">
            <Button type="button" onClick={handleDigiAudioExpertApply}>
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={digiAudioExpertExitConfirmOpen}
        onOpenChange={(open) => {
          if (!open) dismissDigiAudioExpertExitConfirm()
        }}
      >
        <DialogContent
          className="z-[100] sm:max-w-md"
          onClick={(e) => {
            if (
              (e.target as HTMLElement).closest(
                "[data-digiaudio-expert-exit-yes]"
              )
            ) {
              return
            }
            dismissDigiAudioExpertExitConfirm()
          }}
        >
          <DialogHeader>
            <DialogTitle>Leave Digital Audio Expert Mode?</DialogTitle>
            <DialogDescription>
              You have unsaved changes in Expert Mode. Apply saves them to the
              Digital Audio section; leaving now discards those edits.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={dismissDigiAudioExpertExitConfirm}
            >
              No, keep editing
            </Button>
            <Button
              type="button"
              variant="destructive"
              data-digiaudio-expert-exit-yes
              onClick={confirmDigiAudioExpertExitWithoutSaving}
            >
              Yes, leave without saving
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Station Dialog */}
<Dialog open={isAddSiteDialogOpen} onOpenChange={setIsAddSiteDialogOpen}>
  <DialogContent className="sm:max-w-[425px]">
    <DialogHeader>
      <DialogTitle>Add New Audio Site</DialogTitle>
      <DialogDescription>
        Enter the details for the new Audio Site.
      </DialogDescription>
    </DialogHeader>
    <div className="grid gap-4 py-4">
    <div className="grid grid-cols-4 items-center gap-4">
        <Label htmlFor="dialogDisplayNetworkName" className="text-right">
          Publisher
        </Label>
        <Input
          id="dialogDisplayNetworkName"
          value={newSitePlatform} // This is pre-filled from the line item
          readOnly
          className="col-span-3 bg-muted focus:ring-0 pointer-events-none" // Style to indicate read-only
        />
      </div>
      <div className="grid grid-cols-4 items-center gap-4">
        <Label htmlFor="newStationNetwork" className="text-right">
          
        </Label>
        {/* Assuming 'publishers' contains the list of available networks */}
        <Combobox
          value={newSitePlatform}
          onValueChange={setNewSitePlatform}
          placeholder="Select Publisher"
          searchPlaceholder="Search publishers..."
          buttonClassName="col-span-3 h-9"
          options={publishers.map((publisher) => ({
            value: publisher.publisher_name,
            label: publisher.publisher_name,
          }))}
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