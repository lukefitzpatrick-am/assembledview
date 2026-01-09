"use client"

import { useState, useEffect, useRef, useMemo, useCallback } from "react"
import { useForm, useFieldArray, UseFormReturn } from "react-hook-form"
import { useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger,} from "@/components/ui/dialog"
import { PlusCircle } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import { Textarea } from "@/components/ui/textarea"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { useToast } from "@/components/ui/use-toast"
import { Label } from "@/components/ui/label";
import { getPublishersForTelevision, getClientInfo, getTVStations, createTVStation} from "@/lib/api"
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
  const televisionlineItems = form.getValues("televisionlineItems") || [];

  return televisionlineItems.flatMap((lineItem) =>
    lineItem.bursts.map((burst) => ({
      startDate: burst.startDate,
      endDate: burst.endDate,
      budget: burst.budget,
    }))
  );
}

const televisionBurstSchema = z.object({
  budget: z.string().min(1, "Budget for this burst is required"),
  buyAmount: z.string().min(1, "Buy Amount for this burst is required"), // e.g., CPP, Cost per Spot, Fixed Price for this burst
  startDate: z.date({ message: "Start date for this burst is required." }),
  endDate: z.date({ message: "End date for this burst is required." }),
  size: z.string().min(1, "Ad Size/Length for this burst is required"), // e.g., "30s", "15s"
  tarps: z.string().min(1, "TARPs for this burst are required").regex(/^\d+(\.\d+)?$/, "TARPs must be a number"), // TARPs for this specific burst
  calculatedValue: z.number().optional(),
  fee: z.number().optional(),
}).refine(data => data.endDate >= data.startDate, {
  message: "End date cannot be earlier than start date",
  path: ["endDate"],
})

const televisionlineItemSchema = z.object({
  market: z.string().min(1, "Market is required"),
  network: z.string().min(1, "Network is required"), // This can replace/be used instead of a generic 'platform'
  station: z.string().min(1, "Station is required"),
  daypart: z.string().min(1, "Daypart is required"),
  placement: z.string().min(1, "Placement is required"),
  bidStrategy: z.string().default("").optional(), // e.g., "Reach", "Frequency" or N/A for some TV buys
  buyType: z.string().min(1, "Buy Type is required"), // e.g., CPP, Fixed Spot Rate, Sponsorship
  creativeTargeting: z.string().default("").optional(), // May be less relevant or could describe specific program targeting
  creative: z.string().default("").optional(), // Could be "Ad Copy Name" or general creative theme
  buyingDemo: z.string().default(""), // e.g., "Adults 25-54"
  fixedCostMedia: z.boolean().default(false),
  clientPaysForMedia: z.boolean().default(false),
  budgetIncludesFees: z.boolean().default(false),
  noadserving: z.boolean().default(false), // Typically for digital, but kept for consistency
  bursts: z.array(televisionBurstSchema).min(1, "At least one burst is required"),
  totalMedia: z.number().optional(),
  totalDeliverables: z.number().optional(),
})

const televisionFormSchema = z.object({
  televisionlineItems: z.array(televisionlineItemSchema),
  overallDeliverables: z.number().optional(),
})

type TelevisionFormValues = z.infer<typeof televisionFormSchema>

interface Publisher {
  id: number;
  publisher_name: string;
}

interface TVStation {
  id: number;
  station: string;
  network: string;
}

interface TelevisionContainerProps {
  clientId: string;
  feetelevision: number;
  onTotalMediaChange: (totalMedia: number, totalFee: number) => void;
  onBurstsChange: (bursts: BillingBurst[]) => void;
  onInvestmentChange: (investmentByMonth: any) => void;
  onLineItemsChange: (items: LineItem[]) => void;
  onTelevisionLineItemsChange: (lineItems: any[]) => void;
  onMediaLineItemsChange: (lineItems: any[]) => void; // New callback for raw line item data
  campaignStartDate: Date;
  campaignEndDate: Date;
  campaignBudget: number;
  campaignId: string;
  mediaTypes: string[];
  initialLineItems?: any[]; // For edit mode data loading
}

export function getTelevisionBursts(
  form: UseFormReturn<TelevisionFormValues>,
  feetelevision: number
): BillingBurst[] {
  const televisionlineItems = form.getValues("televisionlineItems") || []

  return televisionlineItems.flatMap(li =>
    li.bursts.map(burst => {
      let mediaAmount = parseFloat(
        burst.budget.replace(/[^0-9.]/g, "")
      ) || 0

      const pct = feetelevision || 0
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

        mediaType:          "television",
        feePercentage:      pct,
        clientPaysForMedia: li.clientPaysForMedia,
        budgetIncludesFees: li.budgetIncludesFees,
        deliverables: parseFloat(
          burst?.tarps?.replace(/[^0-9.]/g, "") || "0"
        ) || 0,
        buyType: li.buyType,
        noAdserving: false,
      }
    })
  )
}

export function calculateInvestmentPerMonth(form, feetelevision) {
  const televisionlineItems = form.getValues("televisionlineItems") || [];
  let monthlyInvestment: Record<string, number> = {};

  televisionlineItems.forEach((lineItem) => {
    lineItem.bursts.forEach((burst) => {
      const startDate = new Date(burst.startDate);
      const endDate = new Date(burst.endDate);
      const lineMedia = parseFloat(burst.budget.replace(/[^0-9.]/g, "")) || 0;
      const feePercentage = feetelevision || 0;

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

export function calculateBurstInvestmentPerMonth(form, feetelevision) {
  const televisionlineItems = form.getValues("televisionlineItems") || [];
  let monthlyInvestment: Record<string, number> = {};

  televisionlineItems.forEach((lineItem) => {
    lineItem.bursts.forEach((burst) => {
      const startDate = new Date(burst.startDate);
      const endDate = new Date(burst.endDate);
      const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      const burstBudget = parseFloat(burst.budget.replace(/[^0-9.]/g, "")) || 0;
      const feePercentage = feetelevision || 0;
      
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

export default function TelevisionContainer({
  clientId,
  feetelevision,
  onTotalMediaChange,
  onBurstsChange,
  onInvestmentChange,
  onLineItemsChange,
  onTelevisionLineItemsChange,
  onMediaLineItemsChange,
  campaignStartDate,
  campaignEndDate,
  campaignBudget,
  campaignId,
  mediaTypes,
  initialLineItems
}: TelevisionContainerProps) {
  // Add refs to track previous values
  const prevInvestmentRef = useRef<{ monthYear: string; amount: string }[]>([]);
  const prevBurstsRef = useRef<BillingBurst[]>([]);
  const publishersRef = useRef<Publisher[]>([]);
  const tvStationsRef = useRef<TVStation[]>([]);
  const hasProcessedInitialLineItemsRef = useRef(false);
  const lastProcessedLineItemsRef = useRef<string>('');
  const [publishers, setPublishers] = useState<Publisher[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [tvStations, setTvStations] = useState<TVStation[]>([]);
  const { toast } = useToast()
  const { mbaNumber } = useMediaPlanContext()
  const [overallDeliverables, setOverallDeliverables] = useState(0);

  const [isAddStationDialogOpen, setIsAddStationDialogOpen] = useState(false);
  const [newStationName, setNewStationName] = useState("");
  const [newStationNetwork, setNewStationNetwork] = useState("");
  // Store the lineItemIndex for which the "Add Station" was clicked
  const [currentLineItemIndexForNewStation, setCurrentLineItemIndexForNewStation] = useState<number | null>(null);

  // Function to re-fetch TV stations
  const fetchAndUpdateTvStations = async () => {
    try {
      setIsLoading(true);
      const fetchedTvStations = await getTVStations(); //
      tvStationsRef.current = fetchedTvStations; //
      setTvStations(fetchedTvStations); //
    } catch (error) {
      toast({ //
        title: "Error refreshing TV Stations",
        description: (error as Error).message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false); //
    }
  };

  const handleAddNewStation = async () => {
    if (!newStationName.trim() || !newStationNetwork.trim()) {
      toast({ //
        title: "Missing Information",
        description: "Please provide both station name and network.",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsLoading(true); //
      const newStationData: Omit<TVStation, 'id'> = { //
        station: newStationName,
        network: newStationNetwork,
      };
      const createdStation = await createTVStation(newStationData); //

      toast({ //
        title: "Station Added",
        description: `${createdStation.station} has been successfully added.`,
      });

      // Refresh the TV stations list
      await fetchAndUpdateTvStations();

      // Optionally, select the newly added station and network in the form
      if (currentLineItemIndexForNewStation !== null) {
        form.setValue(`televisionlineItems.${currentLineItemIndexForNewStation}.network`, createdStation.network); //
        form.setValue(`televisionlineItems.${currentLineItemIndexForNewStation}.station`, createdStation.station); //
      }

      setIsAddStationDialogOpen(false);
      setNewStationName("");
      setNewStationNetwork("");
      setCurrentLineItemIndexForNewStation(null);

    } catch (error) {
      toast({ //
        title: "Error Adding Station",
        description: (error as Error).message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false); //
    }
  };
  
  // Form initialization
  const form = useForm({
    defaultValues: {
      televisionlineItems: [
        {
          // Line Item Level Defaults
          market: "",
          network: "",
          station: "",
          daypart: "",
          placement: "",
          bidStrategy: "", // Default if kept
          buyType: "CPP",  // Example default
          creativeTargeting: "", // Default if kept
          creative: "",         // Default if kept
          buyingDemo: "",
          fixedCostMedia: false,
          clientPaysForMedia: false,
          budgetIncludesFees: false,
          noadserving: false,
          // Burst Level Defaults
          bursts: [
            {
              budget: "",
              buyAmount: "",
              startDate: campaignStartDate || new Date(), // Use prop if available
              endDate: campaignEndDate || new Date(),     // Use prop if available
              size: "30s", // Example default
              tarps: "",
              calculatedValue: 0,
              fee: 0,
            },
          ],
        },
      ],
    },
  }) as any;

  // Data loading for edit mode
  useEffect(() => {
    if (initialLineItems && initialLineItems.length > 0) {
      // Create a unique key from the line items to detect if they've changed
      const lineItemsKey = JSON.stringify(initialLineItems.map((item: any) => ({
        id: item.id,
        market: item.market,
        network: item.network,
        station: item.station,
        daypart: item.daypart,
        placement: item.placement,
      })));
      
      // Skip if we've already processed these exact line items
      if (hasProcessedInitialLineItemsRef.current && lastProcessedLineItemsRef.current === lineItemsKey) {
        console.log("[TelevisionContainer] Skipping duplicate initialLineItems load");
        return;
      }
      
      console.log("[TelevisionContainer] Loading initialLineItems:", initialLineItems);
      
      // Mark as processed and store the key
      hasProcessedInitialLineItemsRef.current = true;
      lastProcessedLineItemsRef.current = lineItemsKey;
      
      const transformedLineItems = initialLineItems.map((item: any, index: number) => {
        // Log each item for debugging
        console.log(`[TelevisionContainer] Processing item ${index}:`, {
          market: item.market,
          network: item.network,
          station: item.station,
          daypart: item.daypart,
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
              // If it's an object, try to convert to array
              parsedBursts = [item.bursts_json];
            }
          } catch (parseError) {
            console.error(`[TelevisionContainer] Error parsing bursts_json for item ${index}:`, parseError, item.bursts_json);
            parsedBursts = [];
          }
        }

        // Ensure parsedBursts is an array
        if (!Array.isArray(parsedBursts)) {
          parsedBursts = [];
        }

        const bursts = parsedBursts.length > 0 ? parsedBursts.map((burst: any) => ({
          budget: burst.budget || "",
          buyAmount: burst.buyAmount || "",
          startDate: burst.startDate ? new Date(burst.startDate) : (campaignStartDate || new Date()),
          endDate: burst.endDate ? new Date(burst.endDate) : (campaignEndDate || new Date()),
          size: burst.size || "",
          tarps: burst.tarps || "",
        })) : [{
          budget: "",
          buyAmount: "",
          startDate: campaignStartDate || new Date(),
          endDate: campaignEndDate || new Date(),
          size: "30s",
          tarps: "",
        }];

        return {
          market: item.market || "",
          network: item.network || "",
          station: item.station || "",
          daypart: item.daypart || "",
          placement: item.placement || "",
          bidStrategy: item.bid_strategy || "",
          buyType: item.buy_type || "",
          creativeTargeting: item.creative_targeting || "",
          creative: item.creative || "",
          buyingDemo: item.buying_demo || "",
          fixedCostMedia: item.fixed_cost_media || false,
          clientPaysForMedia: item.client_pays_for_media || false,
          budgetIncludesFees: item.budget_includes_fees || false,
          noadserving: item.no_adserving || false,
          bursts: bursts,
        };
      });

      console.log("[TelevisionContainer] Transformed line items:", transformedLineItems);

      form.reset({
        televisionlineItems: transformedLineItems,
        overallDeliverables: 0,
      });
    }
  }, [initialLineItems, form, campaignStartDate, campaignEndDate]);

  // Field array hook
  const {
    fields: lineItemFields,
    append: appendLineItem,
    remove: removeLineItem,
  } = useFieldArray({
    control: form.control,
    name: "televisionlineItems",
  });

  // Callback handlers
  const handleLineItemValueChange = useCallback((lineItemIndex: number) => {
    const televisionlineItems = form.getValues("televisionlineItems") || [];
    let overallMedia = 0;
    let overallFee = 0;
    let overallCost = 0;

    televisionlineItems.forEach((lineItem) => {
      let lineMedia = 0;
      let lineFee = 0;
      let lineDeliverables = 0;

      lineItem.bursts.forEach((burst) => {
        const budget = parseFloat(burst?.budget?.replace(/[^0-9.]/g, "") || "0");
        lineMedia += budget;
        lineDeliverables += parseFloat(burst.tarps.replace(/[^0-9.]/g, "")) || 0; // Parse TARPs
      });

      lineFee = feetelevision ? (lineMedia / (100 - feetelevision)) * feetelevision : 0;
      overallMedia += lineMedia;
      overallFee += lineFee;
      overallCost += lineMedia + lineFee;
    });

    setOverallDeliverables(overallMedia);
    onTotalMediaChange(overallMedia, overallFee);
  }, [feetelevision, onTotalMediaChange]);

  const handleDuplicateLineItem = useCallback((lineItemIndex: number) => {
    const items = form.getValues("televisionlineItems") || [];
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
        tarps: burst?.tarps ?? "",
        size: burst?.size ?? "30s",
        calculatedValue: burst?.calculatedValue ?? 0,
        fee: burst?.fee ?? 0,
      })),
    };

    appendLineItem(clone);
  }, [appendLineItem, form, toast]);

  const handleBuyTypeChange = useCallback(
    (lineItemIndex: number, value: string) => {
      form.setValue(`televisionlineItems.${lineItemIndex}.buyType`, value);

      if (value === "bonus") {
        const currentBursts =
          form.getValues(`televisionlineItems.${lineItemIndex}.bursts`) || [];
        const zeroedBursts = currentBursts.map((burst: any) => ({
          ...burst,
          budget: "0",
          buyAmount: "0",
        }));

        form.setValue(
          `televisionlineItems.${lineItemIndex}.bursts`,
          zeroedBursts,
          { shouldDirty: true }
        );
      }

      handleLineItemValueChange(lineItemIndex);
    },
    [form, handleLineItemValueChange]
  );

  // Watch hook
  const watchedLineItems = useWatch({ 
    control: form.control, 
    name: "televisionlineItems",
    defaultValue: []
  } as any) || [];
  
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
          const base = budget / (1 + (feetelevision || 0) / 100);
          lineMedia += base;
          lineFee += budget - base;
        } else {
          // Budget is net media, fee calculated on top
          lineMedia += budget;
          const fee = feetelevision ? (budget / (100 - feetelevision)) * feetelevision : 0;
          lineFee += fee;
        }
        lineDeliverables += parseFloat(burst.tarps.replace(/[^0-9.]/g, "")) || 0; // Parse TARPs
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
  }, [watchedLineItems, feetelevision]);

  // In TelevisionContainer.tsx
const handleValueChange = useCallback((lineItemIndex: number, burstIndex: number) => {
  // This function is called when budget, buyAmount, or tarps of a burst might change.
  // Its main role is to trigger recalculation of line item and overall totals.
  // TARPs is a direct input on the form.
  handleLineItemValueChange(lineItemIndex);
}, [handleLineItemValueChange]);

  const handleAppendBurst = useCallback((lineItemIndex: number) => {
    const currentBursts = form.getValues(`televisionlineItems.${lineItemIndex}.bursts`) || [];
    
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
    
    form.setValue(`televisionlineItems.${lineItemIndex}.bursts`, [
      ...currentBursts,
      {
        budget: "",
        buyAmount: "",
        startDate: startDate,
        endDate: endDate,
        tarps: "",
        size: "30s",
      },
    ]);

    handleLineItemValueChange(lineItemIndex);
  }, [handleLineItemValueChange, toast]);

  const handleDuplicateBurst = useCallback((lineItemIndex: number) => {
    const currentBursts = form.getValues(`televisionlineItems.${lineItemIndex}.bursts`) || [];

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
      tarps: lastBurst?.tarps ?? "",
      size: lastBurst?.size ?? "30s",
      calculatedValue: lastBurst?.calculatedValue ?? 0,
      fee: lastBurst?.fee ?? 0,
    };

    form.setValue(`televisionlineItems.${lineItemIndex}.bursts`, [
      ...currentBursts,
      duplicatedBurst,
    ]);

    handleLineItemValueChange(lineItemIndex);
  }, [form, handleLineItemValueChange, toast]);

  const handleRemoveBurst = useCallback((lineItemIndex: number, burstIndex: number) => {
    const currentBursts = form.getValues(`televisionlineItems.${lineItemIndex}.bursts`) || [];
    form.setValue(
      `televisionlineItems.${lineItemIndex}.bursts`,
      currentBursts.filter((_, index) => index !== burstIndex),
    );

    handleLineItemValueChange(lineItemIndex);
  }, [handleLineItemValueChange]);

  const getDeliverablesLabel = useCallback((buyType: string) => {
    if (!buyType) return "Deliverables";
    
    switch (buyType.toLowerCase()) {
      case "cpt":
        return "TARPs";
      case "spots":
        return "Spots";
      case "cpm":
        return "Impressions";
      case "fixed_cost":
        return "Fixed Fee";
      case "package":
        return "Package";
      case "bonus":
        return "Bonus";
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

        const fetchedPublishers = await getPublishersForTelevision();
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

  // Effect hooks
  useEffect(() => {
    const fetchTvStations = async () => {
      try {
        // Check if we already have publishers cached
        if (tvStationsRef.current.length > 0) {
          setTvStations(tvStationsRef.current);
          setIsLoading(false);
          return;
        }

        const fetchedTvStations = await getTVStations();
        tvStationsRef.current = fetchedTvStations;
        setTvStations(fetchedTvStations);
      } catch (error) {
        toast({
          title: "Error loading TV Stations",
          description: error.message,
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };
  
    fetchTvStations();
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
  const calculatedBursts = getTelevisionBursts(form, feetelevision || 0);
  let burstIndex = 0;

  const items: LineItem[] = form.getValues('televisionlineItems').flatMap(lineItem =>
    lineItem.bursts.map(burst => {
      const computedBurst = calculatedBursts[burstIndex++];
      const mediaAmount = computedBurst
        ? computedBurst.mediaAmount
        : parseFloat(String(burst.budget).replace(/[^0-9.-]+/g, "")) || 0;

      return {
        market: lineItem.market,                                // or fixed value
        network: lineItem.network,
        station: lineItem.station,
        daypart: lineItem.daypart,
        placement: lineItem.placement,
        bidStrategy: lineItem.bidStrategy,
        creative: lineItem.creative,
        size: burst.size, // Add the size field from burst
        startDate: formatDateString(burst.startDate),
        endDate:   formatDateString(burst.endDate),
        deliverables: burst.tarps ?? 0,
        buyingDemo:   lineItem.buyingDemo,
        buyType:      lineItem.buyType,
        deliverablesAmount: burst.budget,
        grossMedia: mediaAmount.toFixed(2),
      };
    })
  );
  
  // push it up to page.tsx
  onLineItemsChange(items);
}, [watchedLineItems, feetelevision]); // Removed onLineItemsChange dependency to prevent infinite loops

// Add new useEffect to capture raw television line items data
useEffect(() => {
  const rawLineItems = form.getValues('televisionlineItems') || [];
  onTelevisionLineItemsChange(rawLineItems);
}, [watchedLineItems]); // Removed onTelevisionLineItemsChange dependency to prevent infinite loops

// Transform form data to API schema format
useEffect(() => {
  const formLineItems = form.getValues('televisionlineItems') || [];
  
  const transformedLineItems = formLineItems.map((lineItem, index) => {
    // Calculate totalMedia from raw budget amounts (for display in MBA section)
    let totalMedia = 0;
    lineItem.bursts.forEach((burst) => {
      const budget = parseFloat(burst.budget.replace(/[^0-9.]/g, "")) || 0;
      if (lineItem.budgetIncludesFees) {
        // Budget is gross, extract media portion
        const base = budget / (1 + (feetelevision || 0) / 100);
        totalMedia += base;
      } else {
        // Budget is net media
        totalMedia += budget;
      }
    });

    return {
      media_plan_version: 0, // Will be set by parent component
      mba_number: mbaNumber || "",
      mp_client_name: "", // Will be set by parent component
      mp_plannumber: "", // Will be set by parent component
      market: lineItem.market || "",
      network: lineItem.network || "",
      station: lineItem.station || "",
      daypart: lineItem.daypart || "",
      placement: lineItem.placement || "",
      buy_type: lineItem.buyType || "",
      buying_demo: lineItem.buyingDemo || "",
      fixed_cost_media: lineItem.fixedCostMedia || false,
      client_pays_for_media: lineItem.clientPaysForMedia || false,
      budget_includes_fees: lineItem.budgetIncludesFees || false,
      line_item_id: `${mbaNumber || 'TV'}${index + 1}`,
      creative: lineItem.creative || "",
      bursts_json: JSON.stringify(lineItem.bursts.map(burst => ({
        budget: burst.budget || "",
        buyAmount: burst.buyAmount || "",
        startDate: burst.startDate ? (burst.startDate instanceof Date ? burst.startDate.toISOString() : burst.startDate) : "",
        endDate: burst.endDate ? (burst.endDate instanceof Date ? burst.endDate.toISOString() : burst.endDate) : "",
        size: burst.size || "",
        tarps: burst.tarps || "",
        calculatedValue: burst.calculatedValue || 0,
        fee: burst.fee || 0,
      }))),
      line_item: index + 1,
      totalMedia: totalMedia,
    };
  });

  onMediaLineItemsChange(transformedLineItems);
}, [watchedLineItems, mbaNumber, feetelevision]); // Removed onMediaLineItemsChange dependency to prevent infinite loops

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      const investmentByMonth = calculateInvestmentPerMonth(form, feetelevision || 0);
      const bursts = getTelevisionBursts(form, feetelevision || 0);
      
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
  }, [watchedLineItems, feetelevision]); // Removed callback dependencies to prevent infinite loops

  const getBursts = () => {
    const formLineItems = form.getValues("televisionlineItems") || [];
    return formLineItems.flatMap(item =>
      item.bursts.map(burst => {
        const budget = parseFloat(burst.budget?.replace(/[^0-9.]/g, "") || "0");
        let mediaAmount = 0;
        let feeAmount = 0;

        if (item.budgetIncludesFees && item.clientPaysForMedia) {
          // Both true: budget is gross, extract fee only, mediaAmount = 0
          // Media = 0
          // Fees = Budget * (Fee / 100)
          feeAmount = budget * ((feetelevision || 0) / 100);
          mediaAmount = 0;
        } else if (item.budgetIncludesFees) {
          // Only budgetIncludesFees: budget is gross, split into media and fee
          const base = budget / (1 + (feetelevision || 0)/100);
          feeAmount = budget - base;
          mediaAmount = base;
        } else if (item.clientPaysForMedia) {
          // Only clientPaysForMedia: budget is net media, only fee is billed
          feeAmount = (budget / (100 - (feetelevision || 0))) * (feetelevision || 0);
          mediaAmount = 0;
        } else {
          // Neither: budget is net media, fee calculated on top
          mediaAmount = budget;
          feeAmount = (budget * (feetelevision || 0)) / 100;
        }

        const billingBurst: BillingBurst = {
          startDate: burst.startDate,
          endDate: burst.endDate,
          mediaAmount: mediaAmount,
          feeAmount: feeAmount,
          deliverables: parseFloat(burst?.tarps?.replace(/[^0-9.]/g, "") || "0") || 0,
          totalAmount: mediaAmount + feeAmount,
          mediaType: 'television',
          feePercentage: feetelevision,
          clientPaysForMedia: item.clientPaysForMedia,
          budgetIncludesFees: item.budgetIncludesFees,
          noAdserving: item.noadserving,
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
            <CardTitle className="pt-4 border-t font-bold text-lg flex justify-between">Television Media</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {overallTotals.lineItemTotals.map((item) => (
              <div key={item.index} className="flex justify-between border-b pb-2">
                <span className="font-medium">Line Item {item.index}</span>
                <div className="flex space-x-4">
                  <span>
                    {getDeliverablesLabel(form.getValues(`televisionlineItems.${item.index - 1}.buyType`))}: {item.deliverables.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </span>
                  <span>Media: ${item.media.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                  <span>Fee: ${item.fee.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                  <span>Total Cost: ${item.totalCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
              </div>
            ))}
  
            {/* Overall Totals */}
            <div className="pt-4 border-t font-medium flex justify-between">
              <span>Television Media Totals:</span>
              <div className="flex space-x-4">
                <span>Media: ${overallTotals.overallMedia.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                <span>Fees ({feetelevision}%): ${overallTotals.overallFee.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
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
                    const lineItem = form.getValues(`televisionlineItems.${lineItemIndex}`);
                    let totalMedia = 0;
                    let totalTarps = 0;

                    lineItem.bursts.forEach((burst) => {
                      const budget = parseFloat(burst.budget.replace(/[^0-9.]/g, "")) || 0;
                      totalMedia += budget;
                      totalTarps += parseFloat(burst.tarps.replace(/[^0-9.]/g, "")) || 0; // Parse TARPs
                    });

                    return { totalMedia, totalTarps };
                  };

                  const selectedNetwork = form.watch(`televisionlineItems.${lineItemIndex}.network`);

                  // const selectedNetwork = form.watch(`televisionlineItems.${lineItemIndex}.network`); // Already exists above

                  let filteredTvStations;
                  if (!selectedNetwork) {
                    filteredTvStations = tvStations; // Show all stations if no network is selected
                  } else {
                    filteredTvStations = tvStations.filter(station => station.network === selectedNetwork);
                  }

                  const { totalMedia, totalTarps } = getTotals(lineItemIndex);

                  return (
                    <Card key={field.id} className="space-y-6">
                      <CardHeader className="pb-2">
                        <div className="flex justify-between items-center">
                          <div className="flex items-center space-x-2">
                            <CardTitle className="text-lg font-medium">Television Line Item {lineItemIndex + 1}</CardTitle>
                            <div className="text-sm text-muted-foreground">ID: {`${mbaNumber}TV${lineItemIndex + 1}`}</div>
                          </div>
                          <div className="flex items-center space-x-2">
                            <div className="text-sm font-medium">
                              Total: {new Intl.NumberFormat('en-US', {
                                style: 'currency',
                                currency: 'USD',
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2
                              }).format(
                                form.getValues(`televisionlineItems.${lineItemIndex}.budgetIncludesFees`)
                                  ? totalMedia
                                  : totalMedia + (totalMedia / (100 - (feetelevision || 0))) * (feetelevision || 0)
                              )}
                            </div>
                            <Button
                              type="button"
                              variant="outline" 
                              size="sm"
                              onClick={() => {
                                const element = document.getElementById(`line-item-${lineItemIndex}`);
                                const bursts = document.getElementById(`line-item-${lineItemIndex}-bursts`);
                                const footer = document.getElementById(`line-item-${lineItemIndex}-footer`);
                                element?.classList.toggle('hidden');
                                bursts?.classList.toggle('hidden');
                                footer?.classList.toggle('hidden');
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
                            <span className="font-medium">Network:</span> {form.watch(`televisionlineItems.${lineItemIndex}.network`) || 'Not selected'}
                          </div>
                          <div>
                            <span className="font-medium">Buy Type:</span> {formatBuyTypeForDisplay(form.watch(`televisionlineItems.${lineItemIndex}.buyType`))}
                          </div>
                          <div>
                            <span className="font-medium">Station:</span> {form.watch(`televisionlineItems.${lineItemIndex}.station`) || 'Not selected'}
                          </div>
                          <div>
                            <span className="font-medium">Bursts:</span> {form.watch(`televisionlineItems.${lineItemIndex}.bursts`, []).length}
                          </div>
                        </div>
                      </div>
                      
                      {/* Detailed Content - Collapsible */}
                      <div
                        id={`line-item-${lineItemIndex}`}
                        className="bg-white rounded-xl shadow p-6 mb-6"
                      >
                        <CardContent className="space-y-6">
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                            
                            {/* Column 1 - Dropdowns */}
                            <div className="space-y-4">
                              <FormField
                                control={form.control}
                                name={`televisionlineItems.${lineItemIndex}.network`}
                                render={({ field }) => (
                                  <FormItem className="flex items-center space-x-2">
                                    <FormLabel className="w-24 text-sm">Network</FormLabel>
                                    <Select onValueChange={(value) => {
                                      field.onChange(value);
                                       }} defaultValue={field.value}>
                                      <FormControl>
                                        <SelectTrigger className="h-9 w-full flex-1 rounded-md border">
                                          <SelectValue placeholder="Select Network" />
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
                                    name={`televisionlineItems.${lineItemIndex}.station`}
                                    render={({ field }) => (
                                      <FormItem className="flex items-center space-x-2">
                                        <FormLabel className="w-24 text-sm">Station</FormLabel>
                                        <div className="flex-1 flex items-center space-x-1">
                                          <Select
                                            onValueChange={field.onChange}
                                            value={field.value} // Ensure value is controlled
                                            disabled={!selectedNetwork} // Disable if no network is selected
                                          >
                                            <FormControl>
                                              <SelectTrigger className="h-9 w-full rounded-md border">
                                                <SelectValue placeholder={selectedNetwork ? "Select Station" : "Select Network first"} />
                                              </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                              {filteredTvStations.length > 0 ? (
                                                filteredTvStations.map((tvStation) => ( //
                                                  <SelectItem 
                                                  key={tvStation.id} 
                                                  value={tvStation.station || 'station-${tvStation.id}'}
                                                  >
                                                    {tvStation.station}
                                                  </SelectItem>
                                                ))
                                              ) : (
                                                selectedNetwork && ( <div className="p-2 text-sm text-muted-foreground text-center">
                                                  No stations found for "{selectedNetwork}".<br />
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
                                                const currentNetworkInForm = form.getValues(`televisionlineItems.${lineItemIndex}.network`); //
                                                if (!currentNetworkInForm) {
                                                  toast({ //
                                                    title: "Select a Network First",
                                                    description: "Please select a network before adding a station.",
                                                    variant: "default", 
                                                  });
                                                  return;
                                                }
                                                setCurrentLineItemIndexForNewStation(lineItemIndex); //
                                                setNewStationName(""); //
                                                setNewStationNetwork(currentNetworkInForm); //
                                                setIsAddStationDialogOpen(true); //
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
                                name={`televisionlineItems.${lineItemIndex}.buyType`}
                                render={({ field }) => (
                                  <FormItem className="flex items-center space-x-2">
                                    <FormLabel className="w-24 text-sm">Buy Type</FormLabel>
                                    <Select
                                      onValueChange={(value) =>
                                        handleBuyTypeChange(lineItemIndex, value)
                                      }
                                      defaultValue={field.value}
                                    >
                                      <FormControl>
                                        <SelectTrigger className="h-9 w-full flex-1 rounded-md border">
                                          <SelectValue placeholder="Select" />
                                        </SelectTrigger>
                                      </FormControl>
                                      <SelectContent>
                                        <SelectItem value="cpt">CPT</SelectItem>
                                        <SelectItem value="cpm">CPM</SelectItem>
                                        <SelectItem value="spots">Spots</SelectItem>
                                        <SelectItem value="fixed_cost">Fixed Cost</SelectItem>
                                        <SelectItem value="package">Package</SelectItem>
                                        <SelectItem value="bonus">Bonus</SelectItem>
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
                                <FormLabel className="block text-sm mb-1 self-start mt-4">Placement</FormLabel>
                                <FormControl>
                                  <Textarea
                                    {...form.register(`televisionlineItems.${lineItemIndex}.placement`)}
                                    placeholder="Enter placement details"
                                    className="w-full h-24 text-sm rounded-md border"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>

                              <FormItem className="flex items-center space-x-2">
                                <FormLabel className="block text-sm mb-1">Buying Demo</FormLabel>
                                <FormControl>
                                  <Textarea
                                    {...form.register(`televisionlineItems.${lineItemIndex}.buyingDemo`)}
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
                                <FormLabel className="block text-sm mb-1 self-start mt-4">Daypart</FormLabel>
                                <FormControl>
                                  <Textarea
                                    {...form.register(`televisionlineItems.${lineItemIndex}.daypart`)}
                                    placeholder="Enter daypart details"
                                    className="w-full min-h-0 h-10 text-sm rounded-md border"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>

                              <FormItem className="flex items-center space-x-2">
                                <FormLabel className="block text-sm mb-1 self-start mt-4">Creative Length</FormLabel>
                                <FormControl>
                                  <Textarea
                                    {...form.register(`televisionlineItems.${lineItemIndex}.creative`)}
                                    placeholder="Enter daypart details"
                                    className="w-full min-h-0 h-10 text-sm rounded-md border"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>

                              <FormItem className="flex items-center space-x-2">
                                <FormLabel className="block text-sm mb-1">Market</FormLabel>
                                <FormControl>
                                  <Textarea
                                    {...form.register(`televisionlineItems.${lineItemIndex}.market`)}
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
                                  name={`televisionlineItems.${lineItemIndex}.fixedCostMedia`}
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
                                  name={`televisionlineItems.${lineItemIndex}.clientPaysForMedia`}
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
                                  name={`televisionlineItems.${lineItemIndex}.budgetIncludesFees`}
                                  render={({ field }) => (
                                    <FormItem className="flex items-center space-x-2">
                                      <FormControl>
                                        <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                                      </FormControl>
                                      <FormLabel className="text-sm">Budget Includes Fees</FormLabel>
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
                      <div id={`line-item-${lineItemIndex}-bursts`} className="space-y-4">
                        {form.watch(`televisionlineItems.${lineItemIndex}.bursts`, []).map((burstField, burstIndex) => {
                          const buyType = form.watch(`televisionlineItems.${lineItemIndex}.buyType`);
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
                                      name={`televisionlineItems.${lineItemIndex}.bursts.${burstIndex}.budget`}
                                      render={({ field }) => (
                                        <FormItem>
                                          <FormLabel className="text-xs">Budget</FormLabel>
                                          <FormControl>
                                            <Input
                                              {...field}
                                              type="text"
                                              className="w-full"
                                              value={buyType === "bonus" ? "0" : field.value}
                                              disabled={buyType === "bonus"}
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
                                      name={`televisionlineItems.${lineItemIndex}.bursts.${burstIndex}.buyAmount`}
                                      render={({ field }) => (
                                        <FormItem>
                                          <FormLabel className="text-xs">Buy Amount</FormLabel>
                                          <FormControl>
                                            <Input
                                              {...field}
                                              type="text"
                                              className="w-full"
                                              value={buyType === "bonus" ? "0" : field.value}
                                              disabled={buyType === "bonus"}
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
                                        name={`televisionlineItems.${lineItemIndex}.bursts.${burstIndex}.startDate`}
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
                                        name={`televisionlineItems.${lineItemIndex}.bursts.${burstIndex}.endDate`}
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
                                      name={`televisionlineItems.${lineItemIndex}.bursts.${burstIndex}.tarps`}
                                      render={({ field }) => {
                                        // Hooks must always run in the same order, so keep these at the top.
                                        const buyTypeWatch = useWatch({
                                          control: form.control,
                                          name: `televisionlineItems.${lineItemIndex}.buyType`,
                                        });
                                        const budgetValue = useWatch({
                                          control: form.control,
                                          name: `televisionlineItems.${lineItemIndex}.bursts.${burstIndex}.budget`,
                                        });
                                        const buyAmountValue = useWatch({
                                          control: form.control,
                                          name: `televisionlineItems.${lineItemIndex}.bursts.${burstIndex}.buyAmount`,
                                        });

                                        const calculatedValue = useMemo(() => {
                                          const budget = parseFloat(String(budgetValue)?.replace(/[^0-9.]/g, "") || "0");
                                          const buyAmount = parseFloat(String(buyAmountValue)?.replace(/[^0-9.]/g, "") || "1");

                                          switch (buyTypeWatch) {
                                            case "cpt":
                                            case "spots":
                                              return buyAmount !== 0 ? budget / buyAmount : "0";
                                            case "cpm":
                                              return buyAmount !== 0 ? (budget / buyAmount) * 1000 : "0";
                                            case "fixed_cost":
                                              return "1";
                                            default:
                                              return "0";
                                          }
                                        }, [budgetValue, buyAmountValue, buyTypeWatch]);

                                        useEffect(() => {
                                          if (buyTypeWatch === "bonus") return;
                                          const currentValue = form.getValues(
                                            `televisionlineItems.${lineItemIndex}.bursts.${burstIndex}.tarps`
                                          );
                                          const newValue = String(calculatedValue);

                                          if (currentValue !== newValue) {
                                            form.setValue(
                                              `televisionlineItems.${lineItemIndex}.bursts.${burstIndex}.tarps`,
                                              newValue
                                            );
                                          }
                                        }, [calculatedValue, lineItemIndex, burstIndex, form, buyTypeWatch]);

                                        if (buyTypeWatch === "bonus") {
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
                                        switch (buyTypeWatch) {
                                          case "cpt":
                                            title = "TARPs";
                                            break;
                                          case "spots":
                                            title = "Spots";
                                            break;
                                          case "package":
                                            title = "Package";
                                            break;
                                          case "bonus":
                                            title = "Bonus";
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
                                              form.getValues(`televisionlineItems.${lineItemIndex}.budgetIncludesFees`)
                                                ? (parseFloat(form.getValues(`televisionlineItems.${lineItemIndex}.bursts.${burstIndex}.budget`)?.replace(/[^0-9.]/g, "") || "0") / 100) * (100 - (feetelevision || 0))
                                                : parseFloat(form.getValues(`televisionlineItems.${lineItemIndex}.bursts.${burstIndex}.budget`)?.replace(/[^0-9.]/g, "") || "0")
                                            )}
                                            readOnly
                                          />
                                        </div>
                                        <div className="flex flex-col">
                                          <FormLabel className="text-xs">Fee ({feetelevision}%)</FormLabel>
                                          <Input
                                            type="text"
                                            className="w-full"
                                            value={new Intl.NumberFormat("en-US", {
                                              style: "currency",
                                              currency: "USD",
                                              minimumFractionDigits: 2,
                                              maximumFractionDigits: 2,
                                            }).format(
                                              form.getValues(`televisionlineItems.${lineItemIndex}.budgetIncludesFees`)
                                                ? (parseFloat(form.getValues(`televisionlineItems.${lineItemIndex}.bursts.${burstIndex}.budget`)?.replace(/[^0-9.]/g, "") || "0") / 100) * (feetelevision || 0)
                                                : (parseFloat(form.getValues(`televisionlineItems.${lineItemIndex}.bursts.${burstIndex}.budget`)?.replace(/[^0-9.]/g, "") || "0") / (100 - (feetelevision || 0))) * (feetelevision || 0)
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

                      <CardFooter id={`line-item-${lineItemIndex}-footer`} className="flex justify-end space-x-2 pt-2">
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
                                network: "",
                                bidStrategy: "",
                                station: "",
                                daypart: "",
                                placement: "",
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
                                    budget: "",
                                    buyAmount: "",
                                    startDate: new Date(),
                                    endDate: new Date(),
                                    size: "30s",
                                    tarps: "",
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
                    </Card>
                  );
                })}
              </div>
            </Form>
          </div>
        )}
      </div>
      {/* Add Station Dialog */}
<Dialog open={isAddStationDialogOpen} onOpenChange={setIsAddStationDialogOpen}>
  <DialogContent className="sm:max-w-[425px]">
    <DialogHeader>
      <DialogTitle>Add New TV Station</DialogTitle>
      <DialogDescription>
        Enter the details for the new TV station.
      </DialogDescription>
    </DialogHeader>
    <div className="grid gap-4 py-4">
    <div className="grid grid-cols-4 items-center gap-4">
        <Label htmlFor="dialogDisplayNetworkName" className="text-right">
          Network
        </Label>
        <Input
          id="dialogDisplayNetworkName"
          value={newStationNetwork} // This is pre-filled from the line item
          readOnly
          className="col-span-3 bg-gray-100 focus:ring-0 pointer-events-none" // Style to indicate read-only
        />
      </div>
      <div className="grid grid-cols-4 items-center gap-4">
        <Label htmlFor="newStationNetwork" className="text-right">
          Network
        </Label>
        {/* Assuming 'publishers' contains the list of available networks */}
        <Select
          value={newStationNetwork}
          onValueChange={setNewStationNetwork}
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
          value={newStationName}
          onChange={(e) => setNewStationName(e.target.value)}
          className="col-span-3"
          placeholder="e.g., Channel 9"
        />
      </div>
    </div>
    <DialogFooter>
      <Button type="button" variant="outline" onClick={() => setIsAddStationDialogOpen(false)}>Cancel</Button>
      <Button type="button" onClick={handleAddNewStation} disabled={isLoading}>
        {isLoading ? "Adding..." : "Add Station"}
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
    </div>
  );
}