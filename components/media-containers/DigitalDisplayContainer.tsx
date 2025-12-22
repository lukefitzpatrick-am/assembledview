"use client"

import { useState, useEffect, useRef, useMemo, useCallback } from "react"
import { useForm, useFieldArray, UseFormReturn } from "react-hook-form"
import { useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { PlusCircle } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import { Textarea } from "@/components/ui/textarea"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { useToast } from "@/components/ui/use-toast"
import { Label } from "@/components/ui/label"
import { getPublishersForDigiDisplay, getClientInfo, getDisplaySites, createDisplaySite } from "@/lib/api"
import { format } from "date-fns"
import { useMediaPlanContext } from "@/contexts/MediaPlanContext"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { CalendarIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { ChevronDown, Trash2 } from "lucide-react"
import type { BillingBurst, BillingMonth } from "@/lib/billing/types"; // ad
import type { LineItem } from '@/lib/generateMediaPlan'

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
  const digidisplaylineItems = form.getValues("digidisplaylineItems") || [];

  return digidisplaylineItems.flatMap((lineItem) =>
    lineItem.bursts.map((burst) => ({
      startDate: burst.startDate,
      endDate: burst.endDate,
      budget: burst.budget,
    }))
  );
}

const digidisplayburstSchema = z.object({
  budget: z.string().min(1, "Budget is required"),
  buyAmount: z.string().min(1, "Buy Amount is required"),
  startDate: z.date(),
  endDate: z.date(),
  calculatedValue: z.number().optional(),
  fee: z.number().optional(),
})

const digidisplaylineItemSchema = z.object({
  platform: z.string().min(1, "Platform is required"),
  site: z.string().min(1, "Site is required"),
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
  bursts: z.array(digidisplayburstSchema).min(1, "At least one burst is required"),
  totalMedia: z.number().optional(),
  totalDeliverables: z.number().optional(),
  totalFee: z.number().optional(),
})

const digidisplayFormSchema = z.object({
  digidisplaylineItems: z.array(digidisplaylineItemSchema),
  overallDeliverables: z.number().optional(),
})

type DigiDisplayFormValues = z.infer<typeof digidisplayFormSchema>

// Type definition for form values

interface Publisher {
  id: number;
  publisher_name: string;
}

interface DigiDisplaySite {
  id: number;
  site: string;
  platform: string;
}

interface DigiDisplayContainerProps {
  clientId: string;
  feedigidisplay: number;
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

export function getDigiDisplayBursts(
  form: UseFormReturn<DigiDisplayFormValues>,
  feedigidisplay: number
): BillingBurst[] {
  const digidisplaylineItems = form.getValues("digidisplaylineItems") || []

  return digidisplaylineItems.flatMap(li =>
    li.bursts.map(burst => {
      let mediaAmount = parseFloat(
        burst.budget.replace(/[^0-9.]/g, "")
      ) || 0

      const pct = feedigidisplay || 0
      let feeAmount = 0

      if (li.budgetIncludesFees && li.clientPaysForMedia) {
        // Both true: budget is gross, extract fee only, mediaAmount = 0
        // Media = 0
        // Fees = Budget * (Fee / 100)
        feeAmount = mediaAmount * (pct / 100)
        mediaAmount = 0
      } else if (li.budgetIncludesFees) {
        // Only budgetIncludesFees: budget is gross, split into media and fee
        // Media = Budget * ((100 - Fee) / 100)
        // Fees = Budget * (Fee / 100)
        feeAmount = mediaAmount * (pct / 100)
        mediaAmount = mediaAmount * ((100 - pct) / 100)
      } else if (li.clientPaysForMedia) {
        // Only clientPaysForMedia: budget is net media, only fee is billed
        feeAmount   = (mediaAmount / (100 - pct)) * pct
        mediaAmount = 0
      } else {
        // Neither: budget is net media, fee calculated on top
        // Media = Budget (unchanged)
        // Fees = Budget * (Fee / (100 - Fee))
        feeAmount = (mediaAmount * pct) / (100 - pct)
      }

      return {
        startDate: burst.startDate,
        endDate:   burst.endDate,

        mediaAmount,
        feeAmount,
        totalAmount: mediaAmount + feeAmount,

        mediaType:          "digi display",
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

export function calculateInvestmentPerMonth(form, feedigidisplay) {
  const digidisplaylineItems = form.getValues("digidisplaylineItems") || [];
  let monthlyInvestment: Record<string, number> = {};

  digidisplaylineItems.forEach((lineItem) => {
    lineItem.bursts.forEach((burst) => {
      const startDate = new Date(burst.startDate);
      const endDate = new Date(burst.endDate);
      const lineMedia = parseFloat(burst.budget.replace(/[^0-9.]/g, "")) || 0;
      const feePercentage = feedigidisplay || 0;

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
    amount: `$${amount.toFixed(2)}`,
  }));
}

export function calculateBurstInvestmentPerMonth(form, feedigidisplay) {
  const digidisplaylineItems = form.getValues("digidisplaylineItems") || [];
  let monthlyInvestment: Record<string, number> = {};

  digidisplaylineItems.forEach((lineItem) => {
    lineItem.bursts.forEach((burst) => {
      const startDate = new Date(burst.startDate);
      const endDate = new Date(burst.endDate);
      const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      const burstBudget = parseFloat(burst.budget.replace(/[^0-9.]/g, "")) || 0;
      const feePercentage = feedigidisplay || 0;
      
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
    amount: amount.toFixed(2),
  }));
}

export default function DigiDisplayContainer({
  clientId,
  feedigidisplay,
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
}: DigiDisplayContainerProps) {
  // Add refs to track previous values
  const prevInvestmentRef = useRef<{ monthYear: string; amount: string }[]>([]);
  const prevBurstsRef = useRef<BillingBurst[]>([]);
  const publishersRef = useRef<Publisher[]>([]);
  const digidisplaySitesRef = useRef<DigiDisplaySite[]>([]);
  const [publishers, setPublishers] = useState<Publisher[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [digidisplaySites, setDigiDisplaySites] = useState<DigiDisplaySite[]>([]);
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
  const fetchAndUpdateDigiDisplaySites = async () => {
    try {
      setIsLoading(true);
      const fetchedDigiDisplaySites = await getDisplaySites(); //
      digidisplaySitesRef.current = fetchedDigiDisplaySites; //
      setDigiDisplaySites(fetchedDigiDisplaySites); //
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
    const newSiteData: Omit<DigiDisplaySite, 'id'> = { //
      site: newSiteName,
      platform: newSitePlatform,
  };
  const createdSite = await createDisplaySite(newSiteData);

    toast({
      title: "Site Added",
      description: `${createdSite.site} has been successfully added.`,
    });
  
  await fetchAndUpdateDigiDisplaySites();

  // Optionally, select the newly added station and network in the form
  if (currentLineItemIndexForNewSite !== null) {
    form.setValue(`digidisplaylineItems.${currentLineItemIndexForNewSite}.platform`, createdSite.platform); //
    form.setValue(`digidisplaylineItems.${currentLineItemIndexForNewSite}.site`, createdSite.site); //
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

  const form = useForm({
    resolver: zodResolver(digidisplayFormSchema),
    defaultValues: {
      digidisplaylineItems: [
        {
          platform: "",
          site: "",
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
    name: "digidisplaylineItems",
  });

  const handleDuplicateLineItem = useCallback((lineItemIndex: number) => {
    const items = form.getValues("digidisplaylineItems") || [];
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
    name: "digidisplaylineItems",
    defaultValue: form.getValues("digidisplaylineItems")
  });

  // Data loading for edit mode
  useEffect(() => {
    if (initialLineItems && initialLineItems.length > 0) {
      console.log("[DigitalDisplayContainer] Loading initialLineItems:", initialLineItems);
      
      const transformedLineItems = initialLineItems.map((item: any, index: number) => {
        console.log(`[DigitalDisplayContainer] Processing item ${index}:`, {
          site: item.site,
          placement: item.placement,
          buy_type: item.buy_type,
          bursts_json: item.bursts_json,
          bursts_json_type: typeof item.bursts_json,
        });

        // Safely parse bursts_json
        let parsedBursts: any[] = [];
        if (item.bursts_json) {
          try {
            if (typeof item.bursts_json === 'string') {
              const trimmed = item.bursts_json.trim();
              if (trimmed) {
                parsedBursts = JSON.parse(trimmed);
              }
            } else if (Array.isArray(item.bursts_json)) {
              parsedBursts = item.bursts_json;
            } else if (typeof item.bursts_json === 'object') {
              parsedBursts = [item.bursts_json];
            }
          } catch (parseError) {
            console.error(`[DigitalDisplayContainer] Error parsing bursts_json for item ${index}:`, parseError, item.bursts_json);
            parsedBursts = [];
          }
        }

        if (!Array.isArray(parsedBursts)) {
          parsedBursts = [];
        }

        const bursts = parsedBursts.length > 0 ? parsedBursts.map((burst: any) => ({
          budget: burst.budget || "",
          buyAmount: burst.buyAmount || "",
          startDate: burst.startDate ? new Date(burst.startDate) : (campaignStartDate || new Date()),
          endDate: burst.endDate ? new Date(burst.endDate) : (campaignEndDate || new Date()),
        })) : [{
          budget: "",
          buyAmount: "",
          startDate: campaignStartDate || new Date(),
          endDate: campaignEndDate || new Date(),
        }];

        return {
          platform: item.publisher || item.platform || "",
          publisher: item.publisher || item.platform || "",
          site: item.site || "",
          placement: item.placement || "",
          size: item.size || "",
          buyType: item.buy_type || "",
          creativeTargeting: item.creative_targeting || item.targeting_attribute || "",
          creative: item.creative || "",
          buyingDemo: item.buying_demo || "",
          market: item.market || "",
          targetingAttribute: item.targeting_attribute || "",
          fixedCostMedia: item.fixed_cost_media || false,
          clientPaysForMedia: item.client_pays_for_media || false,
          budgetIncludesFees: item.budget_includes_fees || false,
          noadserving: item.no_adserving || false,
          bursts: bursts,
        };
      });

      console.log("[DigitalDisplayContainer] Transformed line items:", transformedLineItems);

      form.reset({
        digidisplaylineItems: transformedLineItems,
        overallDeliverables: 0,
      });
    }
  }, [initialLineItems, form, campaignStartDate, campaignEndDate]);

  // Transform form data to API schema format
  useEffect(() => {
    const formLineItems = form.getValues('digidisplaylineItems') || [];
    
    const transformedLineItems = formLineItems.map((lineItem, index) => {
      // Calculate totalMedia from raw budget amounts (for display in MBA section)
      let totalMedia = 0;
      lineItem.bursts.forEach((burst) => {
        const budget = parseFloat(burst.budget.replace(/[^0-9.]/g, "")) || 0;
        if (lineItem.budgetIncludesFees) {
          // Budget is gross, extract media portion
          const base = budget / (1 + (feedigidisplay || 0) / 100);
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
        platform: lineItem.platform || lineItem.publisher || "",
        publisher: lineItem.publisher || lineItem.platform || "",
        site: lineItem.site || "",
        buy_type: lineItem.buyType || "",
        creative_targeting: lineItem.creativeTargeting || "",
        creative: lineItem.creative || "",
        buying_demo: lineItem.buyingDemo || "",
        market: lineItem.market || "",
        fixed_cost_media: lineItem.fixedCostMedia || false,
        client_pays_for_media: lineItem.clientPaysForMedia || false,
        budget_includes_fees: lineItem.budgetIncludesFees || false,
        no_adserving: lineItem.noadserving || false,
        line_item_id: `${mbaNumber || 'DD'}${index + 1}`,
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
  }, [watchedLineItems, mbaNumber, feedigidisplay, onMediaLineItemsChange]);
  
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
          const base = budget / (1 + (feedigidisplay || 0) / 100);
          lineMedia += base;
          lineFee += budget - base;
        } else {
          // Budget is net media, fee calculated on top
          lineMedia += budget;
          const fee = feedigidisplay ? (budget / (100 - feedigidisplay)) * feedigidisplay : 0;
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
  }, [watchedLineItems, feedigidisplay]);
  
  // Callback handlers
  const handleLineItemValueChange = useCallback((lineItemIndex: number) => {
    const digidisplaylineItems = form.getValues("digidisplaylineItems") || [];
    let overallMedia = 0;
    let overallFee = 0;
    let overallCost = 0;

    digidisplaylineItems.forEach((lineItem) => {
      let lineMedia = 0;
      let lineFee = 0;
      let lineDeliverables = 0;

      lineItem.bursts.forEach((burst) => {
        const budget = parseFloat(burst?.budget?.replace(/[^0-9.]/g, "") || "0");
        lineMedia += budget;
        lineDeliverables += burst?.calculatedValue || 0;
      });

      lineFee = feedigidisplay ? (lineMedia / (100 - feedigidisplay)) * feedigidisplay : 0;
      overallMedia += lineMedia;
      overallFee += lineFee;
      overallCost += lineMedia + lineFee;
    });

    setOverallDeliverables(overallMedia);
    onTotalMediaChange(overallMedia, overallFee);
  }, [feedigidisplay]); // Removed onTotalMediaChange dependency to prevent infinite loops

  const handleValueChange = useCallback((lineItemIndex: number, burstIndex: number) => {
    const burst = form.getValues(`digidisplaylineItems.${lineItemIndex}.bursts.${burstIndex}`);
    const budget = parseFloat(burst?.budget?.replace(/[^0-9.]/g, "") || "0");
    const buyAmount = parseFloat(burst?.buyAmount?.replace(/[^0-9.]/g, "") || "1");
    const buyType = form.getValues(`digidisplaylineItems.${lineItemIndex}.buyType`);

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
      default:
        calculatedValue = 0;
    }

    // Only update if the calculated value is actually different to prevent infinite loops
    const currentValue = form.getValues(`digidisplaylineItems.${lineItemIndex}.bursts.${burstIndex}.calculatedValue`);
    if (currentValue !== calculatedValue && !isNaN(calculatedValue)) {
      form.setValue(`digidisplaylineItems.${lineItemIndex}.bursts.${burstIndex}.calculatedValue`, calculatedValue, {
        shouldValidate: false, // Changed to false to prevent validation loops
        shouldDirty: false,    // Changed to false to prevent dirty state loops
      });

      handleLineItemValueChange(lineItemIndex);
    }
  }, [handleLineItemValueChange]);

  const handleAppendBurst = useCallback((lineItemIndex: number) => {
    const currentBursts = form.getValues(`digidisplaylineItems.${lineItemIndex}.bursts`) || [];
    
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
    
    form.setValue(`digidisplaylineItems.${lineItemIndex}.bursts`, [
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
  }, [handleLineItemValueChange, toast]);

  const handleDuplicateBurst = useCallback((lineItemIndex: number) => {
    const currentBursts = form.getValues(`digidisplaylineItems.${lineItemIndex}.bursts`) || [];

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
      calculatedValue: 0,
      fee: 0,
    };

    form.setValue(`digidisplaylineItems.${lineItemIndex}.bursts`, [
      ...currentBursts,
      duplicatedBurst,
    ]);

    handleLineItemValueChange(lineItemIndex);
  }, [form, handleLineItemValueChange, toast]);

  const handleRemoveBurst = useCallback((lineItemIndex: number, burstIndex: number) => {
    const currentBursts = form.getValues(`digidisplaylineItems.${lineItemIndex}.bursts`) || [];
    form.setValue(
      `digidisplaylineItems.${lineItemIndex}.bursts`,
      currentBursts.filter((_, index) => index !== burstIndex),
    );

    handleLineItemValueChange(lineItemIndex);
  }, [handleLineItemValueChange]);

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

        const fetchedPublishers = await getPublishersForDigiDisplay();
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

  // Effect hooks for display sites
  useEffect(() => {
    const fetchDigiDisplaySites = async () => {
      try {
        // Check if we already have display sites cached
        if (digidisplaySitesRef.current.length > 0) {
          setDigiDisplaySites(digidisplaySitesRef.current);
          setIsLoading(false);
          return;
        }

        const fetchedDigiDisplaySites = await getDisplaySites();
        digidisplaySitesRef.current = fetchedDigiDisplaySites;
        setDigiDisplaySites(fetchedDigiDisplaySites);
      } catch (error) {
        toast({
          title: "Error loading display sites",
          description: error.message,
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };
  
    fetchDigiDisplaySites();
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
  const calculatedBursts = getDigiDisplayBursts(form, feedigidisplay || 0);
  let burstIndex = 0;

  const items: LineItem[] = form.getValues('digidisplaylineItems').flatMap(lineItem =>
    lineItem.bursts.map(burst => {
      const computedBurst = calculatedBursts[burstIndex++];
      const mediaAmount = computedBurst
        ? computedBurst.mediaAmount
        : parseFloat(String(burst.budget).replace(/[^0-9.-]+/g, "")) || 0;

      return {
        market: lineItem.market,
        site: lineItem.site,
        platform: lineItem.platform,
        targeting: lineItem.creativeTargeting,
        creative:   lineItem.creative,
        startDate: formatDateString(burst.startDate),
        endDate:   formatDateString(burst.endDate),
        deliverables: burst.calculatedValue ?? 0,
        buyingDemo:   lineItem.buyingDemo,
        buyType:      lineItem.buyType,
        deliverablesAmount: burst.budget,
        grossMedia: mediaAmount.toFixed(2),
      };
    })
  );
  
  // push it up to page.tsx
  onLineItemsChange(items);
}, [watchedLineItems, feedigidisplay]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      const investmentByMonth = calculateInvestmentPerMonth(form, feedigidisplay || 0);
      const bursts = getDigiDisplayBursts(form, feedigidisplay || 0);
      
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
  }, [watchedLineItems, feedigidisplay]); // Removed callback dependencies to prevent infinite loops

  const getBursts = () => {
    const formLineItems = form.getValues("digidisplaylineItems") || [];
    return formLineItems.flatMap(item =>
      item.bursts.map(burst => {
        const budget = parseFloat(burst.budget?.replace(/[^0-9.]/g, "") || "0");
        let mediaAmount = 0;
        let feeAmount = 0;

        if (item.budgetIncludesFees && item.clientPaysForMedia) {
          // Both true: budget is gross, extract fee only, mediaAmount = 0
          // Media = 0
          // Fees = Budget * (Fee / 100)
          feeAmount = budget * ((feedigidisplay || 0) / 100);
          mediaAmount = 0;
        } else if (item.budgetIncludesFees) {
          // Only budgetIncludesFees: budget is gross, split into media and fee
          const base = budget / (1 + (feedigidisplay || 0)/100);
          feeAmount = budget - base;
          mediaAmount = base;
        } else if (item.clientPaysForMedia) {
          // Only clientPaysForMedia: budget is net media, only fee is billed
          feeAmount = (budget / (100 - (feedigidisplay || 0))) * (feedigidisplay || 0);
          mediaAmount = 0;
        } else {
          // Neither: budget is net media, fee calculated on top
          mediaAmount = budget;
          feeAmount = (budget * (feedigidisplay || 0)) / 100;
        }

        const billingBurst: BillingBurst = {
          startDate: burst.startDate,
          endDate: burst.endDate,
          mediaAmount: mediaAmount,
          feeAmount: feeAmount,
          totalAmount: mediaAmount + feeAmount,
          mediaType: 'digi display',
          feePercentage: feedigidisplay,
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
            <CardTitle className="pt-4 border-t font-bold text-lg flex justify-between">Digital Display</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {overallTotals.lineItemTotals.map((item) => (
              <div key={item.index} className="flex justify-between border-b pb-2">
                <span className="font-medium">Line Item {item.index}</span>
                <div className="flex space-x-4">
                  <span>
                    {getDeliverablesLabel(form.getValues(`digidisplaylineItems.${item.index - 1}.buyType`))}: {item.deliverables.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </span>
                  <span>Media: ${item.media.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                  <span>Fee: ${item.fee.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                  <span>Total Cost: ${item.totalCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
              </div>
            ))}
  
            {/* Overall Totals */}
            <div className="pt-4 border-t font-medium flex justify-between">
              <span>Digital Display Totals:</span>
              <div className="flex space-x-4">
                <span>Media: ${overallTotals.overallMedia.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                <span>Fees ({feedigidisplay}%): ${overallTotals.overallFee.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                <span>Total Cost: ${overallTotals.overallCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
  
      <div>
        {isLoading ? (
          <div className="flex justify-center items-center h-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : (
          <div className="space-y-6">
            <Form {...form}>
              <div className="space-y-6">
                {lineItemFields.map((field, lineItemIndex) => {
                  const getTotals = (lineItemIndex: number) => {
                    const lineItem = form.getValues(`digidisplaylineItems.${lineItemIndex}`);
                    let totalMedia = 0;
                    let totalCalculatedValue = 0;

                    lineItem.bursts.forEach((burst) => {
                      const budget = parseFloat(burst.budget.replace(/[^0-9.]/g, "")) || 0;
                      totalMedia += budget;
                      totalCalculatedValue += burst.calculatedValue || 0;
                    });

                    return { totalMedia, totalCalculatedValue };
                  };

                  const selectedPublisher = form.watch(`digidisplaylineItems.${lineItemIndex}.platform`);

                  let filteredDigiDisplaySites;
                  if (!selectedPublisher) {
                    filteredDigiDisplaySites = digidisplaySites; // Show all sites if no publisher is selected
                  } else {
                    filteredDigiDisplaySites = digidisplaySites.filter(site => site.platform === selectedPublisher);
                  }


                  const { totalMedia, totalCalculatedValue } = getTotals(lineItemIndex);

                  return (
                    <Card key={field.id} className="space-y-6">
                      <CardHeader className="pb-2">
                        <div className="flex justify-between items-center">
                          <div className="flex items-center space-x-2">
                            <CardTitle className="text-lg font-medium">Digital Display Line Item {lineItemIndex + 1}</CardTitle>
                            <div className="text-sm text-muted-foreground">ID: {`${mbaNumber}ML${lineItemIndex + 1}`}</div>
                          </div>
                          <div className="flex items-center space-x-2">
                            <div className="text-sm font-medium">
                              Total: {new Intl.NumberFormat('en-US', {
                                style: 'currency',
                                currency: 'USD',
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2
                              }).format(
                                form.getValues(`digidisplaylineItems.${lineItemIndex}.budgetIncludesFees`)
                                  ? totalMedia
                                  : totalMedia + (totalMedia / (100 - (feedigidisplay || 0))) * (feedigidisplay || 0)
                              )}
                            </div>
                            <Button
                              type="button"
                              variant="outline" 
                              size="sm"
                              onClick={() => {
                                const element = document.getElementById(`line-item-${lineItemIndex}`);
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
                            <span className="font-medium">Publisher:</span> {form.watch(`digidisplaylineItems.${lineItemIndex}.platform`) || 'Not selected'}
                          </div>
                          <div>
                            <span className="font-medium">Buy Type:</span> {formatBuyTypeForDisplay(form.watch(`digidisplaylineItems.${lineItemIndex}.buyType`))}
                          </div>
                          <div>
                            <span className="font-medium">Site:</span> {form.watch(`digidisplaylineItems.${lineItemIndex}.site`) || 'Not selected'}
                          </div>
                          <div>
                            <span className="font-medium">Bursts:</span> {form.watch(`digidisplaylineItems.${lineItemIndex}.bursts`, []).length}
                          </div>
                        </div>
                      </div>
                      
                      {/* Detailed Content & Bursts - Collapsible */}
                      <div id={`line-item-${lineItemIndex}`} className="space-y-6">
                        <div className="bg-white rounded-xl shadow p-6 mb-6">
                          <CardContent className="space-y-6">
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                              
                              {/* Column 1 - Dropdowns */}
                              <div className="space-y-4">
                              <FormField
                                  control={form.control}
                                  name={`digidisplaylineItems.${lineItemIndex}.platform`}
                                  render={({ field }) => (
                                    <FormItem className="flex items-center space-x-2">
                                      <FormLabel className="w-24 text-sm">Publisher</FormLabel>
                                       <Select onValueChange={(value) => {
                                        field.onChange(value);
                                        form.setValue(`digidisplaylineItems.${lineItemIndex}.publisher`, value, { shouldValidate: false });
                                         }} defaultValue={field.value}>
                                        <FormControl>
                                          <SelectTrigger className="h-9 w-full flex-1 rounded-md border">
                                            <SelectValue placeholder="Select Publisher" />
                                          </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                          {publishers.map((publisher) => (
                                            <SelectItem key={publisher.id} value={publisher.publisher_name}>
                                              {publisher.publisher_name}
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />

                              <FormField
                                control={form.control}
                                name={`digidisplaylineItems.${lineItemIndex}.site`}
                                render={({ field }) => (
                                  <FormItem className="flex items-center space-x-2">
                                    <FormLabel className="w-24 text-sm">Site</FormLabel>
                                        <div className="flex-1 flex items-center space-x-1">
                                          <Select
                                            onValueChange={field.onChange}
                                            value={field.value} // Ensure value is controlled
                                            disabled={!selectedPublisher} // Disable if no network is selected
                                          >
                                            <FormControl>
                                              <SelectTrigger className="h-9 w-full rounded-md border">
                                                <SelectValue placeholder={selectedPublisher ? "Select Site" : "Select Publisher first"} />
                                              </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                              {filteredDigiDisplaySites.length > 0 ? (
                                                filteredDigiDisplaySites.map((digidisplaySite) => ( //
                                                  <SelectItem 
                                                  key={digidisplaySite.id} 
                                                  value={digidisplaySite.site || `site-${digidisplaySite.id}`} // Guard against empty string
                                                >
                                                  {digidisplaySite.site}
                                                  </SelectItem>
                                                ))
                                              ) : (
                                                selectedPublisher && ( <div className="p-2 text-sm text-muted-foreground text-center">
                                                No sites found for "{selectedPublisher}".<br />
                                                Click the <PlusCircle className="inline h-4 w-4 mx-1 text-blue-500" /> icon to add one.
                                              </div>
                                            )
                                              )}
                                            </SelectContent>
                                          </Select>
                                            <Button
                                              type="button"
                                              variant="ghost"
                                              size="sm"
                                              className="p-1 h-auto"
                                              onClick={() => {
                                                const currentPublisherInForm = form.getValues(`digidisplaylineItems.${lineItemIndex}.platform`); //
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
                                name={`digidisplaylineItems.${lineItemIndex}.buyType`}
                                render={({ field }) => (
                                  <FormItem className="flex items-center space-x-2">
                                    <FormLabel className="w-24 text-sm">Buy Type</FormLabel>
                                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                                      <FormControl>
                                        <SelectTrigger className="h-9 w-full flex-1 rounded-md border">
                                          <SelectValue placeholder="Select" />
                                        </SelectTrigger>
                                      </FormControl>
                                      <SelectContent>
                                        <SelectItem value="cpc">CPC</SelectItem>
                                        <SelectItem value="cpm">CPM</SelectItem>
                                        <SelectItem value="cpv">CPV</SelectItem>
                                        <SelectItem value="fixed_cost">Fixed Cost</SelectItem>
                                      </SelectContent>
                                    </Select>
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
                                    {...form.register(`digidisplaylineItems.${lineItemIndex}.creativeTargeting`)}
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
                                    {...form.register(`digidisplaylineItems.${lineItemIndex}.buyingDemo`)}
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
                                    {...form.register(`digidisplaylineItems.${lineItemIndex}.creative`)}
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
                                    {...form.register(`digidisplaylineItems.${lineItemIndex}.market`)}
                                    placeholder="Enter market or Geo Targeting"
                                    className="w-full min-h-0 h-10 text-sm rounded-md border"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            </div>

                            {/* Column 4 - Checkboxes and Add Burst */}
                            <div className="flex flex-col justify-between">
                              <div className="space-y-3">
                                <FormField
                                  control={form.control}
                                  name={`digidisplaylineItems.${lineItemIndex}.fixedCostMedia`}
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
                                  name={`digidisplaylineItems.${lineItemIndex}.clientPaysForMedia`}
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
                                  name={`digidisplaylineItems.${lineItemIndex}.budgetIncludesFees`}
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
                                  name={`digidisplaylineItems.${lineItemIndex}.noadserving`}
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

                              <div className="flex space-x-2 self-end mt-4">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="default"
                                  onClick={() => handleDuplicateBurst(lineItemIndex)}
                                >
                                  Duplicate Burst
                                </Button>
                                <Button
                                  type="button"
                                  size="default"
                                  onClick={() => handleAppendBurst(lineItemIndex)}
                                >
                                  Add Burst
                                </Button>
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </div>

                      {/* Bursts Section */}
                      <div className="space-y-4">
                        {form.watch(`digidisplaylineItems.${lineItemIndex}.bursts`, []).map((burstField, burstIndex) => {
                          return (
                            <Card key={`${lineItemIndex}-${burstIndex}`} className="border border-gray-200">
                              <CardContent className="py-2 px-4">
                                <div className="flex items-center space-x-4">
                                  <div className="w-24 flex-shrink-0">
                                    <h4 className="text-sm font-medium">Burst {burstIndex + 1}</h4>
                                  </div>
                                  
                                  <div className="grid grid-cols-5 gap-4 items-center flex-grow">
                                    <FormField
                                      control={form.control}
                                      name={`digidisplaylineItems.${lineItemIndex}.bursts.${burstIndex}.budget`}
                                      render={({ field }) => (
                                        <FormItem>
                                          <FormLabel className="text-xs">Budget</FormLabel>
                                          <FormControl>
                                            <Input
                                              {...field}
                                              type="text"
                                              className="w-full"
                                              onChange={(e) => {
                                                const value = e.target.value.replace(/[^0-9.]/g, "");
                                                field.onChange(value);
                                                handleValueChange(lineItemIndex, burstIndex);
                                              }}
                                              onBlur={(e) => {
                                                const value = e.target.value;
                                                const formattedValue = new Intl.NumberFormat("en-US", {
                                                  style: "currency",
                                                  currency: "USD",
                                                  minimumFractionDigits: 2,
                                                  maximumFractionDigits: 2,
                                                }).format(Number.parseFloat(value) || 0);
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
                                      name={`digidisplaylineItems.${lineItemIndex}.bursts.${burstIndex}.buyAmount`}
                                      render={({ field }) => (
                                        <FormItem>
                                          <FormLabel className="text-xs">Buy Amount</FormLabel>
                                          <FormControl>
                                            <Input
                                              {...field}
                                              type="text"
                                              className="w-full"
                                              onChange={(e) => {
                                                const value = e.target.value.replace(/[^0-9.]/g, "");
                                                field.onChange(value);
                                                handleValueChange(lineItemIndex, burstIndex);
                                              }}
                                              onBlur={(e) => {
                                                const value = e.target.value;
                                                const formattedValue = new Intl.NumberFormat("en-US", {
                                                  style: "currency",
                                                  currency: "USD",
                                                  minimumFractionDigits: 2,
                                                  maximumFractionDigits: 2,
                                                }).format(Number.parseFloat(value) || 0);
                                                field.onChange(formattedValue);
                                                handleValueChange(lineItemIndex, burstIndex);
                                              }}
                                            />
                                          </FormControl>
                                          <FormMessage />
                                        </FormItem>
                                      )}
                                    />

                                    <div className="grid grid-cols-2 gap-2">
                                      <FormField
                                        control={form.control}
                                        name={`digidisplaylineItems.${lineItemIndex}.bursts.${burstIndex}.startDate`}
                                        render={({ field }) => (
                                          <FormItem>
                                            <FormLabel className="text-xs">Start Date</FormLabel>
                                            <Popover>
                                              <PopoverTrigger asChild>
                                                <FormControl>
                                                  <Button
                                                    variant={"outline"}
                                                    className={cn(
                                                      "w-full pl-2 text-left font-normal text-xs h-8",
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
                                        name={`digidisplaylineItems.${lineItemIndex}.bursts.${burstIndex}.endDate`}
                                        render={({ field }) => (
                                          <FormItem>
                                            <FormLabel className="text-xs">End Date</FormLabel>
                                            <Popover>
                                              <PopoverTrigger asChild>
                                                <FormControl>
                                                  <Button
                                                    variant={"outline"}
                                                    className={cn(
                                                      "w-full pl-2 text-left font-normal text-xs h-8",
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
                                      name={`digidisplaylineItems.${lineItemIndex}.bursts.${burstIndex}.calculatedValue`}
                                      render={({ field }) => {
                                        const buyType = useWatch({
                                          control: form.control,
                                          name: `digidisplaylineItems.${lineItemIndex}.buyType`,
                                        });

                                        const calculatedValue = useMemo(() => {
                                          const budget = parseFloat(form.getValues(`digidisplaylineItems.${lineItemIndex}.bursts.${burstIndex}.budget`)?.replace(/[^0-9.]/g, "") || "0");
                                          const buyAmount = parseFloat(form.getValues(`digidisplaylineItems.${lineItemIndex}.bursts.${burstIndex}.buyAmount`)?.replace(/[^0-9.]/g, "") || "1");

                                          switch (buyType) {
                                            case "cpc":
                                            case "cpv":
                                              return buyAmount !== 0 ? (budget / buyAmount) : "0";
                                            case "cpm":
                                              return buyAmount !== 0 ? ((budget / buyAmount) * 1000) : "0";
                                            case "fixed_cost":
                                              return "1";
                                            default:
                                              return "0";
                                          }
                                        }, [
                                          form.getValues(`digidisplaylineItems.${lineItemIndex}.bursts.${burstIndex}.budget`),
                                          form.getValues(`digidisplaylineItems.${lineItemIndex}.bursts.${burstIndex}.buyAmount`),
                                          buyType
                                        ]);

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
                                                className="w-full"
                                                value={calculatedValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                                readOnly
                                              />
                                            </FormControl>
                                          </FormItem>
                                        );
                                      }}
                                    />

                                    {/* Add Fee and Media Calculation Fields */}
                                    <div className="flex flex-col space-y-2">
                                      <div className="grid grid-cols-2 gap-2">
                                        <div className="flex flex-col">
                                          <FormLabel className="text-xs">Media</FormLabel>
                                          <Input
                                            type="text"
                                            className="w-full"
                                            value={new Intl.NumberFormat("en-US", {
                                              style: "currency",
                                              currency: "USD",
                                              minimumFractionDigits: 2,
                                              maximumFractionDigits: 2,
                                            }).format(
                                              form.getValues(`digidisplaylineItems.${lineItemIndex}.budgetIncludesFees`)
                                                ? (parseFloat(form.getValues(`digidisplaylineItems.${lineItemIndex}.bursts.${burstIndex}.budget`)?.replace(/[^0-9.]/g, "") || "0") / 100) * (100 - (feedigidisplay || 0))
                                                : parseFloat(form.getValues(`digidisplaylineItems.${lineItemIndex}.bursts.${burstIndex}.budget`)?.replace(/[^0-9.]/g, "") || "0")
                                            )}
                                            readOnly
                                          />
                                        </div>
                                        <div className="flex flex-col">
                                          <FormLabel className="text-xs">Fee ({feedigidisplay}%)</FormLabel>
                                          <Input
                                            type="text"
                                            className="w-full"
                                            value={new Intl.NumberFormat("en-US", {
                                              style: "currency",
                                              currency: "USD",
                                              minimumFractionDigits: 2,
                                              maximumFractionDigits: 2,
                                            }).format(
                                              form.getValues(`digidisplaylineItems.${lineItemIndex}.budgetIncludesFees`)
                                                ? (parseFloat(form.getValues(`digidisplaylineItems.${lineItemIndex}.bursts.${burstIndex}.budget`)?.replace(/[^0-9.]/g, "") || "0") / 100) * (feedigidisplay || 0)
                                                : (parseFloat(form.getValues(`digidisplaylineItems.${lineItemIndex}.bursts.${burstIndex}.budget`)?.replace(/[^0-9.]/g, "") || "0") / (100 - (feedigidisplay || 0))) * (feedigidisplay || 0)
                                            )}
                                            readOnly
                                          />
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                  
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 p-0"
                                    onClick={() => handleRemoveBurst(lineItemIndex, burstIndex)}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
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
                            Duplicate Line Item
                          </Button>
                          {lineItemIndex === lineItemFields.length - 1 && (
                            <Button
                              type="button"
                              onClick={() =>
                                appendLineItem({
                                  platform: "",
                                  site: "",
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
                              Add Line Item
                            </Button>
                          )}
                          <Button type="button" variant="destructive" onClick={() => removeLineItem(lineItemIndex)}>
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
      <DialogTitle>Add New Display Site</DialogTitle>
      <DialogDescription>
        Enter the details for the new Display Site.
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
          Publisher
        </Label>
        {/* Assuming 'publishers' contains the list of available networks */}
        <Select
          value={newSitePlatform}
          onValueChange={setNewSitePlatform}
        >
          <SelectTrigger className="col-span-3 h-9">
            <SelectValue placeholder="Select Network" />
          </SelectTrigger>
          <SelectContent>
            {publishers.map((publisher) => ( //
              <SelectItem key={publisher.id} value={publisher.publisher_name}>
                {publisher.publisher_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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