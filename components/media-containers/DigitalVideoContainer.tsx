"use client"

import { useState, useEffect, useRef, useMemo, useCallback } from "react"
import { useForm, useFieldArray, UseFormReturn } from "react-hook-form"
import { useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { Button } from "@/components/ui/button"
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
import { LoadingDots } from "@/components/ui/loading-dots"
import { format } from "date-fns"
import { useMediaPlanContext } from "@/contexts/MediaPlanContext"
import { MEDIA_TYPE_ID_CODES, buildLineItemId } from "@/lib/mediaplan/lineItemIds"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { CalendarIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { ChevronDown, Copy, Plus, Trash2 } from "lucide-react"
import type { BillingBurst, BillingMonth } from "@/lib/billing/types"; // ad
import type { LineItem } from '@/lib/generateMediaPlan'
import { formatMoney } from "@/lib/utils/money"

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
        const nextMonth = new Date(current);
        nextMonth.setMonth(nextMonth.getMonth() + 1);
        nextMonth.setDate(1);

        const lastDayOfMonth = new Date(nextMonth.getTime() - 1);
        const daysInThisMonth = Math.min(lastDayOfMonth.getDate(), Math.ceil((endDate.getTime() - current.getTime()) / (1000 * 60 * 60 * 24)) + 1);

        const investmentForThisMonth = (totalInvestment / totalDays) * daysInThisMonth;
        monthlyInvestment[monthYear] += investmentForThisMonth;

        // Move to the next month
        current.setMonth(current.getMonth() + 1);
        current.setDate(1);
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
        const nextMonth = new Date(current);
        nextMonth.setMonth(nextMonth.getMonth() + 1);
        nextMonth.setDate(1);
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
        current.setMonth(current.getMonth() + 1);
        current.setDate(1);
      }
    });
  });

  return Object.entries(monthlyInvestment).map(([monthYear, amount]) => ({
    monthYear,
    amount: amount.toFixed(4),
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

  // Optionally, select the newly added station and network in the form
  if (currentLineItemIndexForNewSite !== null) {
    form.setValue(`digivideolineItems.${currentLineItemIndexForNewSite}.platform`, createdSite.platform); //
    form.setValue(`digivideolineItems.${currentLineItemIndexForNewSite}.site`, createdSite.site); //
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
              startDate: new Date(),
              endDate: new Date(),
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
    remove: removeLineItem,
  } = useFieldArray({
    control: form.control,
    name: "digivideolineItems",
  });

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
          startDate: campaignStartDate || new Date(),
          endDate: campaignEndDate || new Date(),
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
          // Budget is gross, extract media portion
          const base = budget / (1 + (feedigivideo || 0) / 100);
          totalMedia += base;
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
  }, [watchedLineItems, mbaNumber, feedigivideo, onMediaLineItemsChange]);
  
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
          // Budget is gross, split into media and fee
          const base = budget / (1 + (feedigivideo || 0) / 100);
          lineMedia += base;
          lineFee += budget - base;
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

    digivideolineItems.forEach((lineItem) => {
      let lineMedia = 0;
      let lineFee = 0;
      let lineDeliverables = 0;

      lineItem.bursts.forEach((burst) => {
        const budget = parseFloat(burst?.budget?.replace(/[^0-9.]/g, "") || "0");
        lineMedia += budget;
        lineDeliverables += burst?.calculatedValue || 0;
      });

      lineFee = feedigivideo ? (lineMedia / (100 - feedigivideo)) * feedigivideo : 0;
      overallMedia += lineMedia;
      overallFee += lineFee;
      overallCost += lineMedia + lineFee;
    });

    setOverallDeliverables(overallMedia);
    onTotalMediaChange(overallMedia, overallFee);
  }, [form, feedigivideo, onTotalMediaChange]);

  const handleBuyTypeChange = useCallback(
    (lineItemIndex: number, value: string) => {
      form.setValue(`digivideolineItems.${lineItemIndex}.buyType`, value);

      if (value === "bonus") {
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

  const handleValueChange = useCallback((lineItemIndex: number, burstIndex: number) => {
    const burst = form.getValues(`digivideolineItems.${lineItemIndex}.bursts.${burstIndex}`);
    const budget = parseFloat(burst?.budget?.replace(/[^0-9.]/g, "") || "0");
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
  }, [form, handleLineItemValueChange]);

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
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + 1); // Move to the first day of next month
    endDate.setDate(0); // Set to the last day of the current month
    
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

    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + 1);
    endDate.setDate(0);

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
}, [overallTotals.overallMedia, overallTotals.overallFee]) // Removed onTotalMediaChange dependency to prevent infinite loops

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
}, [watchedLineItems, feedigivideo, mbaNumber]);

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
  }, [watchedLineItems, feedigivideo]); // Removed callback dependencies to prevent infinite loops

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
          // Only budgetIncludesFees: budget is gross, split into media and fee
          const base = budget / (1 + (feedigivideo || 0)/100);
          feeAmount = budget - base;
          mediaAmount = base;
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
        <Card>
          <CardHeader>
            <CardTitle className="pt-4 border-t font-bold text-lg flex justify-between">Digi Video Media</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {overallTotals.lineItemTotals.map((item) => (
              <div key={item.index} className="flex justify-between border-b pb-2">
                <span className="font-medium">Line Item {item.index}</span>
                <div className="flex space-x-4">
                  <span>
                    {getDeliverablesLabel(form.getValues(`digivideolineItems.${item.index - 1}.buyType`))}: {item.deliverables.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </span>
                  <span>Media: {formatMoney(item.media, { locale: "en-US", currency: "USD" })}</span>
                  <span>Fee: {formatMoney(item.fee, { locale: "en-US", currency: "USD" })}</span>
                  <span>Total Cost: {formatMoney(item.totalCost, { locale: "en-US", currency: "USD" })}</span>
                </div>
              </div>
            ))}
  
            {/* Overall Totals */}
            <div className="pt-4 border-t font-medium flex justify-between">
              <span>Digi Video Media Totals:</span>
              <div className="flex space-x-4">
                <span>Media: {formatMoney(overallTotals.overallMedia, { locale: "en-US", currency: "USD" })}</span>
                <span>Fees ({feedigivideo}%): {formatMoney(overallTotals.overallFee, { locale: "en-US", currency: "USD" })}</span>
                <span>Total Cost: {formatMoney(overallTotals.overallCost, { locale: "en-US", currency: "USD" })}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
  
      <div>
        {isLoading ? (
          <div className="flex justify-center items-center h-20">
          <LoadingDots size="md" />
          </div>
        ) : (
          <div className="space-y-6">
            <Form {...form}>
              <div className="space-y-6">
                {lineItemFields.map((field, lineItemIndex) => {
                  const sectionId = `digivideo-line-item-${lineItemIndex}`;
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
                    <Card key={field.id} className="space-y-6">
                      <CardHeader className="pb-2">
                        <div className="flex justify-between items-center">
                          <div className="flex items-center space-x-2">
                            <CardTitle className="text-lg font-medium">Digi Video Line Item {lineItemIndex + 1}</CardTitle>
                            <div className="text-sm text-muted-foreground">ID: {`${mbaNumber}DV${lineItemIndex + 1}`}</div>
                          </div>
                          <div className="flex items-center space-x-2">
                            <div className="text-sm font-medium">
                              Total: {formatMoney(
                                form.getValues(`digivideolineItems.${lineItemIndex}.budgetIncludesFees`)
                                  ? totalMedia
                                  : totalMedia + (totalMedia / (100 - (feedigivideo || 0))) * (feedigivideo || 0),
                                { locale: "en-US", currency: "USD" }
                              )}
                            </div>
                            <Button
                              type="button"
                              variant="outline" 
                              size="sm"
                              onClick={() => {
                                const element = document.getElementById(sectionId);
                                if (element) {
                                  element.classList.toggle('hidden');
                                }
                              }}
                            >
                              <ChevronDown className="h-4 w-4" />
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
                      
                      {/* Detailed Content & Bursts - Collapsible */}
                      <div id={sectionId} className="space-y-6">
                        <div className="bg-white rounded-xl shadow p-6 mb-6">
                          <CardContent className="space-y-6">
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                              
                              {/* Column 1 - Dropdowns */}
                              <div className="space-y-4">
                                <FormField
                                  control={form.control}
                                  name={`digivideolineItems.${lineItemIndex}.publisher`}
                                  render={({ field }) => (
                                    <FormItem className="flex items-center space-x-2">
                                      <FormLabel className="w-24 text-sm">Publisher</FormLabel>
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
                                  <FormItem className="flex items-center space-x-2">
                                    <FormLabel className="w-24 text-sm">Site</FormLabel>
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
                                              <PlusCircle className="h-5 w-5 text-blue-500" />
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
                                  <FormItem className="flex items-center space-x-2">
                                    <FormLabel className="w-24 text-sm">Buy Type</FormLabel>
                                    <FormControl>
                                      <Combobox
                                        value={field.value}
                                        onValueChange={(value) => handleBuyTypeChange(lineItemIndex, value)}
                                        placeholder="Select"
                                        searchPlaceholder="Search buy types..."
                                        buttonClassName="h-9 w-full flex-1 rounded-md"
                                        options={[
                                          { value: "bonus", label: "Bonus" },
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
                              <FormItem className="flex items-center space-x-2"> 
                                <FormLabel className="block text-sm mb-1 self-start mt-4">Targeting</FormLabel>
                                <FormControl>
                                  <Textarea
                                    {...form.register(`digivideolineItems.${lineItemIndex}.creativeTargeting`)}
                                    placeholder="Enter targeting details"
                                    className="w-full h-24 text-sm rounded-md border"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>

                              <FormItem className="flex items-center space-x-2">
                                <FormLabel className="block text-sm mb-1">Buying Demo</FormLabel>
                                <FormControl>
                                  <Textarea
                                    {...form.register(`digivideolineItems.${lineItemIndex}.buyingDemo`)}
                                    placeholder="Enter buying demo details"
                                    className="w-full min-h-0 h-10 text-sm rounded-md border"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            </div>

                            {/* Column 3 - Creative */}
                            <div className="space-y-4">
                              <FormItem className="flex items-center space-x-2">
                                <FormLabel className="block text-sm mb-1 self-start mt-4">Creative</FormLabel>
                                <FormControl>
                                  <Textarea
                                    {...form.register(`digivideolineItems.${lineItemIndex}.creative`)}
                                    placeholder="Enter creative details"
                                    className="w-full h-24 text-sm rounded-md border"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>

                              <FormItem className="flex items-center space-x-2">
                                <FormLabel className="block text-sm mb-1">Market</FormLabel>
                                <FormControl>
                                  <Textarea
                                    {...form.register(`digivideolineItems.${lineItemIndex}.market`)}
                                    placeholder="Enter market or Geo Targeting"
                                    className="w-full min-h-0 h-10 text-sm rounded-md border"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            </div>

                            {/* Column 4 - Checkboxes */}
                            <div className="flex flex-col justify-between">
                              <div className="space-y-3">
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
                                        <Checkbox checked={field.value} onCheckedChange={field.onChange} />
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
                      </div>

                      {/* Bursts Section */}
                      <div className="space-y-4">
                        {form.watch(`digivideolineItems.${lineItemIndex}.bursts`, []).map((burstField, burstIndex) => {
                          return (
                            <Card key={`${lineItemIndex}-${burstIndex}`} className="border border-gray-200 bg-muted/30 mx-2">
                              <CardContent className="py-2 px-4">
                                <div className="flex items-center gap-3">
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
                                                value={buyType === "bonus" ? "0" : field.value}
                                                disabled={buyType === "bonus"}
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
                                                value={buyType === "bonus" ? "0" : field.value}
                                                disabled={buyType === "bonus"}
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
                                            <Popover>
                                              <PopoverTrigger asChild>
                                                <FormControl>
                                                  <Button
                                                    variant={"outline"}
                                                    className={cn(
                                                      "w-full h-10 pl-2 text-left font-normal text-sm",
                                                      !field.value && "text-muted-foreground",
                                                    )}
                                                  >
                                                    {field.value ? format(field.value, "dd/MM/yy") : <span>Pick date</span>}
                                                    <CalendarIcon className="ml-auto h-3 w-3 opacity-50" />
                                                  </Button>
                                                </FormControl>
                                              </PopoverTrigger>
                                              <PopoverContent className="w-auto p-0" align="start">
                                                <Calendar
                                                  mode="single"
                                                  selected={field.value}
                                                  onSelect={field.onChange}
                                                  disabled={(date) =>
                                                    date > new Date("2100-01-01")
                                                  }
                                                  initialFocus
                                                />
                                              </PopoverContent>
                                            </Popover>
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
                                            <Popover>
                                              <PopoverTrigger asChild>
                                                <FormControl>
                                                  <Button
                                                    variant={"outline"}
                                                    className={cn(
                                                      "w-full h-10 pl-2 text-left font-normal text-sm",
                                                      !field.value && "text-muted-foreground",
                                                    )}
                                                  >
                                                    {field.value ? format(field.value, "dd/MM/yy") : <span>Pick date</span>}
                                                    <CalendarIcon className="ml-auto h-3 w-3 opacity-50" />
                                                  </Button>
                                                </FormControl>
                                              </PopoverTrigger>
                                              <PopoverContent className="w-auto p-0" align="start">
                                                <Calendar
                                                  mode="single"
                                                  selected={field.value}
                                                  onSelect={field.onChange}
                                                  disabled={(date) =>
                                                    date > new Date("2100-01-01")
                                                  }
                                                  initialFocus
                                                />
                                              </PopoverContent>
                                            </Popover>
                                            <FormMessage />
                                          </FormItem>
                                        )}
                                      />
                                    </div>

                                    <FormField
                                      control={form.control}
                                      name={`digivideolineItems.${lineItemIndex}.bursts.${burstIndex}.calculatedValue`}
                                      render={({ field }) => {
                                        const buyType = useWatch({
                                          control: form.control,
                                          name: `digivideolineItems.${lineItemIndex}.buyType`,
                                        });
                                        const budgetValue = useWatch({
                                          control: form.control,
                                          name: `digivideolineItems.${lineItemIndex}.bursts.${burstIndex}.budget`,
                                        });
                                        const buyAmountValue = useWatch({
                                          control: form.control,
                                          name: `digivideolineItems.${lineItemIndex}.bursts.${burstIndex}.buyAmount`,
                                        });

                                        const calculatedValue = useMemo(() => {
                                          const budget = parseFloat(
                                            String(budgetValue)?.replace(/[^0-9.]/g, "") || "0"
                                          );
                                          const buyAmount = parseFloat(
                                            String(buyAmountValue)?.replace(/[^0-9.]/g, "") || "1"
                                          );

                                          switch (buyType) {
                                            case "cpc":
                                            case "cpv":
                                              return buyAmount !== 0 ? budget / buyAmount : "0";
                                            case "cpm":
                                              return buyAmount !== 0 ? (budget / buyAmount) * 1000 : "0";
                                            case "fixed_cost":
                                              return "1";
                                            default:
                                              return "0";
                                          }
                                        }, [budgetValue, buyAmountValue, buyType]);

                                        if (buyType === "bonus") {
                                          return (
                                            <FormItem>
                                              <FormLabel className="text-xs">Bonus Deliverables</FormLabel>
                                              <FormControl>
                                                <Input
                                                  type="number"
                                                  min={0}
                                                  step={1}
                                                  className="w-full"
                                                  value={field.value ?? ""}
                                                  onChange={(e) => {
                                                    const value = e.target.value.replace(/[^0-9]/g, "");
                                                    field.onChange(value);
                                                  }}
                                                />
                                              </FormControl>
                                              <FormMessage />
                                            </FormItem>
                                          );
                                        }

                                        let title = "Calculated Value";
                                        switch (buyType) {
                                          case "cpc":
                                            title = "Clicks";
                                            break;
                                          case "cpv":
                                            title = "Views";
                                            break;
                                          case "cpm":
                                            title = "Impressions";
                                            break;
                                          case "fixed_cost":
                                            title = "Fixed Cost";
                                            break;
                                        }

                                        return (
                                          <FormItem>
                                            <FormLabel className="text-xs">{title}</FormLabel>
                                            <FormControl>
                                              <Input
                                                type="text"
                                                className="w-full min-w-[8rem] h-10 text-sm"
                                                value={calculatedValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                                readOnly
                                              />
                                            </FormControl>
                                          </FormItem>
                                        );
                                      }}
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
                                  
                                  <div className="flex items-end gap-2 self-end pb-1">
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      className="h-10 text-sm px-3"
                                      onClick={() => handleAppendBurst(lineItemIndex)}
                                    >
                                      <Plus className="h-4 w-4 mr-1" />
                                      Add
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      className="h-10 text-sm px-3"
                                      onClick={() => handleDuplicateBurst(lineItemIndex)}
                                    >
                                      <Copy className="h-4 w-4 mr-1" />
                                      Duplicate
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      className="h-10 text-sm px-3"
                                      onClick={() => handleRemoveBurst(lineItemIndex, burstIndex)}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          );
                        })}
                      </div>

                        <CardFooter className="flex justify-end space-x-2 pt-2">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => handleDuplicateLineItem(lineItemIndex)}
                          >
                            <Copy className="h-4 w-4 mr-2" />
                            Duplicate Line Item
                          </Button>
                          {lineItemIndex === lineItemFields.length - 1 && (
                            <Button
                              type="button"
                              onClick={() =>
                                appendLineItem({
                                  platform: "",
                                  site: "",
                                  bidStrategy: "",
                                  buyType: "",
                                  publisher: "",
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
                                      startDate: new Date(),
                                      endDate: new Date(),
                                      calculatedValue: 0,
                                      fee: 0,
                                    },
                                  ],
                                })
                              }
                            >
                              <Plus className="h-4 w-4 mr-2" />
                              Add Line Item
                            </Button>
                          )}
                          <Button type="button" variant="destructive" onClick={() => removeLineItem(lineItemIndex)}>
                            <Trash2 className="h-4 w-4 mr-2" />
                            Remove Line Item
                          </Button>
                        </CardFooter>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </Form>
          </div>
        )}
      </div>
    {/* Add Station Dialog */}
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
          value={newSitePlatform} // This is pre-filled from the line item
          readOnly
          className="col-span-3 bg-gray-100 focus:ring-0 pointer-events-none" // Style to indicate read-only
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