"use client"

import { useState, useEffect, useRef, useMemo, useCallback } from "react"
import { useForm, useFieldArray, UseFormReturn } from "react-hook-form"
import { useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Textarea } from "@/components/ui/textarea"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { useToast } from "@/components/ui/use-toast"
import { getPublishersForCinema, getClientInfo } from "@/lib/api"
import { formatBurstLabel } from "@/lib/bursts"
import { format } from "date-fns"
import { useMediaPlanContext } from "@/contexts/MediaPlanContext"
import { Calendar } from "@/components/ui/calendar"
import { LoadingDots } from "@/components/ui/loading-dots"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { CalendarIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { ChevronDown, Copy, Plus, Trash2, PlusCircle } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger,} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label";
import type { BillingBurst, BillingMonth } from "@/lib/billing/types"; // ad
import type { LineItem } from '@/lib/generateMediaPlan'

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
export function getAllBursts(form) {
  const cinemalineItems = form.getValues("cinemalineItems") || [];

  return cinemalineItems.flatMap((lineItem) =>
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
  network: z.string().min(1, "Network is required"),
  station: z.string().min(1, "Station is required"),
  buyType: z.string().min(1, "Buy Type is required"),
  bidStrategy: z.string().default(""),
  placement: z.string().min(1, "Placement is required"),
  format: z.string().min(1, "Format is required"),
  duration: z.string().min(1, "Duration is required"),
  buyingDemo: z.string().min(1, "Buying Demo is required"),
  market: z.string().min(1, "Market is required"),
  fixedCostMedia: z.boolean().default(false),
  clientPaysForMedia: z.boolean().default(false),
  budgetIncludesFees: z.boolean().default(false),
  noadserving: z.boolean().default(false),
  lineItemId: z.string().optional(),
  line_item_id: z.string().optional(),
  line_item: z.union([z.string(), z.number()]).optional(),
  lineItem: z.union([z.string(), z.number()]).optional(),
  bursts: z.array(burstSchema).min(1, "At least one burst is required"),
  totalMedia: z.number().optional(),
  totalDeliverables: z.number().optional(),
  totalFee: z.number().optional(),
})

const cinemaFormSchema = z.object({
  cinemalineItems: z.array(lineItemSchema),
  overallDeliverables: z.number().optional(),
})

type CinemaFormValues = z.infer<typeof cinemaFormSchema>

interface Publisher {
  id: number;
  publisher_name: string;
}

interface CinemaStation {
  id: number;
  station: string;
  network: string;
}

interface CinemaContainerProps {
  clientId: string;
  feecinema: number;
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

export function getCinemaBursts(
  form: UseFormReturn<CinemaFormValues>,
  feecinema: number
): BillingBurst[] {
  const cinemalineItems = form.getValues("cinemalineItems") || []

  return cinemalineItems.flatMap(li =>
    li.bursts.map(burst => {
      const rawBudget = parseFloat(burst.budget.replace(/[^0-9.]/g, "")) || 0

      const pct = feecinema || 0
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

        mediaType:          "cinema",
        feePercentage:      pct,
        clientPaysForMedia: li.clientPaysForMedia,
        budgetIncludesFees: li.budgetIncludesFees,
        deliverables: burst.calculatedValue ?? 0,
        buyType: li.buyType,
        noAdserving: li.noadserving,
      }
    })
  )
}

export function calculateInvestmentPerMonth(form, feecinema) {
  const cinemalineItems = form.getValues("cinemalineItems") || [];
  let monthlyInvestment: Record<string, number> = {};

  cinemalineItems.forEach((lineItem) => {
    lineItem.bursts.forEach((burst) => {
      const startDate = new Date(burst.startDate);
      const endDate = new Date(burst.endDate);
      const lineMedia = parseFloat(burst.budget.replace(/[^0-9.]/g, "")) || 0;
      const feePercentage = feecinema || 0;

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

export function calculateBurstInvestmentPerMonth(form, feecinema) {
  const cinemalineItems = form.getValues("cinemalineItems") || [];
  let monthlyInvestment: Record<string, number> = {};

  cinemalineItems.forEach((lineItem) => {
    lineItem.bursts.forEach((burst) => {
      const startDate = new Date(burst.startDate);
      const endDate = new Date(burst.endDate);
      const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      const burstBudget = parseFloat(burst.budget.replace(/[^0-9.]/g, "")) || 0;
      const feePercentage = feecinema || 0;
      
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

export default function CinemaContainer({
  clientId,
  feecinema,
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
}: CinemaContainerProps) {
  // Add refs to track previous values
  const prevInvestmentRef = useRef<{ monthYear: string; amount: string }[]>([]);
  const prevBurstsRef = useRef<BillingBurst[]>([]);
  const publishersRef = useRef<Publisher[]>([]);
  const cinemaStationsRef = useRef<CinemaStation[]>([]);  
  const [publishers, setPublishers] = useState<Publisher[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [cinemaStations, setCinemaStations] = useState<CinemaStation[]>([]);
  const { toast } = useToast()
  const { mbaNumber } = useMediaPlanContext()
  const [overallDeliverables, setOverallDeliverables] = useState(0);

  // Stable ID generator for line items to keep duplicates distinct in exports
  const createLineItemId = () => {
    const base = mbaNumber || "CIN";
    const rand =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? (crypto as any).randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
    return `${base}-${rand}`;
  };

  const [isAddStationDialogOpen, setIsAddStationDialogOpen] = useState(false);
  const [newStationName, setNewStationName] = useState("");
  const [newStationNetwork, setNewStationNetwork] = useState("");
  // Store the lineItemIndex for which the "Add Station" was clicked
  const [currentLineItemIndexForNewStation, setCurrentLineItemIndexForNewStation] = useState<number | null>(null);
  const [networksAvailable, setNetworksAvailable] = useState(true); // Assume true until fetched
  
  // Function to re-fetch cinema stations
  const fetchAndUpdateCinemaStations = async () => {
    try {
      setIsLoading(true);
      // For now, use empty array until API is implemented
      const fetchedCinemaStations: CinemaStation[] = [];
      cinemaStationsRef.current = fetchedCinemaStations;
      setCinemaStations(fetchedCinemaStations);
    } catch (error) {
      toast({
        title: "Error refreshing Cinema Stations",
        description: (error as Error).message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddNewStation = async () => {
    if (!newStationName.trim() || !newStationNetwork.trim()) {
      toast({
        title: "Missing Information",
        description: "Please provide both station name and network.",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsLoading(true);
      const newStationData: Omit<CinemaStation, 'id'> = {
        station: newStationName,
        network: newStationNetwork,
      };
      // For now, create a mock station until API is implemented
      const createdStation: CinemaStation = {
        id: Date.now(),
        ...newStationData
      };

      toast({
        title: "Station Added",
        description: `${createdStation.station} has been successfully added.`,
      });
    
      await fetchAndUpdateCinemaStations();

      // Optionally, select the newly added station and network in the form
      if (currentLineItemIndexForNewStation !== null) {
        form.setValue(`cinemalineItems.${currentLineItemIndexForNewStation}.network`, createdStation.network);
        form.setValue(`cinemalineItems.${currentLineItemIndexForNewStation}.station`, createdStation.station);
      }

      setIsAddStationDialogOpen(false);
      setNewStationName("");
      setNewStationNetwork("");
      setCurrentLineItemIndexForNewStation(null);

    } catch (error) {
      toast({
        title: "Error Adding Station",
        description: (error as Error).message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  // Form initialization
  const form = useForm<CinemaFormValues>({
    resolver: zodResolver(cinemaFormSchema) as any,
    defaultValues: {
      cinemalineItems: [
        {
          network: "",
          station: "",
          bidStrategy: "",
          buyType: "",
          placement: "",
          format: "",
          duration: "",
          buyingDemo: "",
          market: "",
          fixedCostMedia: false,
          clientPaysForMedia: false,
          budgetIncludesFees: false,
          noadserving: false,
          ...(() => { const id = createLineItemId(); return { lineItemId: id, line_item_id: id, line_item: 1, lineItem: 1 }; })(),
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
    name: "cinemalineItems",
  });

  const handleDuplicateLineItem = useCallback((lineItemIndex: number) => {
    const items = form.getValues("cinemalineItems") || [];
    const source = items[lineItemIndex];

    if (!source) {
      toast({
        title: "No line item to duplicate",
        description: "Cannot duplicate a missing line item.",
        variant: "destructive",
      });
      return;
    }

    const newId = createLineItemId();
    const baseLineNumber = Number(
      source.line_item ?? source.lineItem ?? lineItemIndex + 1
    );
    const lineNumber =
      (Number.isFinite(baseLineNumber) ? baseLineNumber : lineItemIndex + 1) + 1;

    const clone = {
      ...source,
      lineItemId: newId,
      line_item_id: newId,
      line_item: lineNumber,
      lineItem: lineNumber,
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
    name: "cinemalineItems",
    defaultValue: form.getValues("cinemalineItems")
  });

  const computeDeliverables = useCallback((burst: any, buyType: string) => {
    const budget = parseFloat(burst?.budget?.replace(/[^0-9.]/g, "") || "0");
    const buyAmount = parseFloat(burst?.buyAmount?.replace(/[^0-9.]/g, "") || "1");

    switch (buyType) {
      case "cpc":
      case "cpv":
      case "screens":
        return buyAmount !== 0 ? budget / buyAmount : 0;
      case "cpm":
        return buyAmount !== 0 ? (budget / buyAmount) * 1000 : 0;
      case "fixed_cost":
      case "package":
        return 1;
      case "bonus":
        return (
          parseFloat(
            (burst?.calculatedValue ?? "0").toString().replace(/[^0-9.]/g, "")
          ) || 0
        );
      default:
        return burst?.calculatedValue ?? 0;
    }
  }, []);

  // Data loading for edit mode
  useEffect(() => {
    if (initialLineItems && initialLineItems.length > 0) {
      const transformedLineItems = initialLineItems.map((item: any, index: number) => {
        const lineItemId = item.line_item_id || item.lineItemId || `${mbaNumber || "CIN"}-${index + 1}`;
        const buyType = item.buy_type || item.buyType || "";

        return {
          market: item.market || "",
          network: item.network || "",
          station: item.station || "",
          placement: item.placement || "",
          format: item.format || "",
          duration: item.duration || "",
          bidStrategy: item.bid_strategy || "",
          buyType: item.buy_type || "",
          buyingDemo: item.buying_demo || "",
          fixedCostMedia: item.fixed_cost_media || false,
          clientPaysForMedia: item.client_pays_for_media || false,
          budgetIncludesFees: item.budget_includes_fees || false,
          noadserving: item.no_adserving || false,
          lineItemId,
          line_item_id: lineItemId,
          line_item: item.line_item ?? item.lineItem ?? index + 1,
          lineItem: item.lineItem ?? item.line_item ?? index + 1,
          bursts: item.bursts ? (typeof item.bursts === 'string' ? JSON.parse(item.bursts) : item.bursts).map((burst: any) => ({
            budget: burst.budget || "",
            buyAmount: burst.buyAmount || "",
            startDate: burst.startDate ? new Date(burst.startDate) : new Date(),
            endDate: burst.endDate ? new Date(burst.endDate) : new Date(),
            calculatedValue: computeDeliverables(burst, buyType),
            fee: burst.fee ?? 0,
          })) : [{
            budget: "",
            buyAmount: "",
            startDate: campaignStartDate || new Date(),
            endDate: campaignEndDate || new Date(),
            calculatedValue: computeDeliverables({}, buyType),
            fee: 0,
          }],
        };
      });

      form.reset({
        cinemalineItems: transformedLineItems,
        overallDeliverables: 0,
      });
    }
  }, [initialLineItems, form, campaignStartDate, campaignEndDate, computeDeliverables]);

  // Transform form data to API schema format
  useEffect(() => {
    const formLineItems = form.getValues('cinemalineItems') || [];
    
    const transformedLineItems = formLineItems.map((lineItem, index) => {
      // Calculate totalMedia from raw budget amounts (for display in MBA section)
      let totalMedia = 0;
      lineItem.bursts.forEach((burst) => {
        const budget = parseFloat(burst.budget.replace(/[^0-9.]/g, "")) || 0;
        if (lineItem.budgetIncludesFees) {
          // Budget is gross, extract media portion
          const base = budget / (1 + (feecinema || 0) / 100);
          totalMedia += base;
        } else {
          // Budget is net media
          totalMedia += budget;
        }
      });
      const lineItemId = lineItem.lineItemId || lineItem.line_item_id || `${mbaNumber || "CIN"}-${index + 1}`;
      const lineNumber = lineItem.line_item ?? lineItem.lineItem ?? index + 1;

      return {
        media_plan_version: 0,
        mba_number: mbaNumber || "",
        mp_client_name: "",
        mp_plannumber: "",
        market: lineItem.market || "",
        network: lineItem.network || "",
        station: lineItem.station || "",
        placement: lineItem.placement || "",
        format: lineItem.format || "",
        duration: lineItem.duration || "",
        buy_type: lineItem.buyType || "",
        buying_demo: lineItem.buyingDemo || "",
        fixed_cost_media: lineItem.fixedCostMedia || false,
        client_pays_for_media: lineItem.clientPaysForMedia || false,
        budget_includes_fees: lineItem.budgetIncludesFees || false,
        no_adserving: lineItem.noadserving || false,
        line_item_id: lineItemId,
        bursts_json: JSON.stringify(lineItem.bursts.map(burst => ({
          budget: burst.budget || "",
          buyAmount: burst.buyAmount || "",
          startDate: burst.startDate ? (burst.startDate instanceof Date ? burst.startDate.toISOString() : burst.startDate) : "",
          endDate: burst.endDate ? (burst.endDate instanceof Date ? burst.endDate.toISOString() : burst.endDate) : "",
          calculatedValue: burst.calculatedValue || 0,
          fee: burst.fee || 0,
        }))),
        line_item: lineNumber,
        bid_strategy: lineItem.bidStrategy || "",
        totalMedia: totalMedia,
      };
    });

    onMediaLineItemsChange(transformedLineItems);
  }, [watchedLineItems, mbaNumber, feecinema, onMediaLineItemsChange]);
  
  // Memoized calculations
  // Note: For display purposes, always show media amounts regardless of clientPaysForMedia
  // The billing schedule will handle excluding media when clientPaysForMedia is true
  const overallTotals = useMemo(() => {
    let overallMedia = 0;
    let overallFee = 0;
    let overallCost = 0;
    let overallDeliverableCount = 0;
    
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
          const base = budget / (1 + (feecinema || 0) / 100);
          lineMedia += base;
          lineFee += budget - base;
        } else {
          // Budget is net media, fee calculated on top
          lineMedia += budget;
          const fee = feecinema ? (budget / (100 - feecinema)) * feecinema : 0;
          lineFee += fee;
        }
        lineDeliverables += computeDeliverables(burst, lineItem.buyType);
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
  }, [watchedLineItems, feecinema, computeDeliverables]);
  
  // Callback handlers
  const handleLineItemValueChange = useCallback((lineItemIndex: number) => {
    const cinemalineItems = form.getValues("cinemalineItems") || [];
    let overallMedia = 0;
    let overallFee = 0;
    let overallCost = 0;
    let overallDeliverableCount = 0;

    cinemalineItems.forEach((lineItem) => {
      let lineMedia = 0;
      let lineFee = 0;
      let lineDeliverables = 0;

      lineItem.bursts.forEach((burst) => {
        const budget = parseFloat(burst?.budget?.replace(/[^0-9.]/g, "") || "0");
        lineMedia += budget;
        lineDeliverables += computeDeliverables(burst, lineItem.buyType);
      });

      lineFee = feecinema ? (lineMedia / (100 - feecinema)) * feecinema : 0;
      overallMedia += lineMedia;
      overallFee += lineFee;
      overallCost += lineMedia + lineFee;
      overallDeliverableCount += lineDeliverables;
    });

    setOverallDeliverables(overallDeliverableCount);
    onTotalMediaChange(overallMedia, overallFee);
  }, [form, feecinema, onTotalMediaChange, computeDeliverables]);

  const handleBuyTypeChange = useCallback(
    (lineItemIndex: number, value: string) => {
      form.setValue(`cinemalineItems.${lineItemIndex}.buyType`, value);

      if (value === "bonus") {
        const currentBursts =
          form.getValues(`cinemalineItems.${lineItemIndex}.bursts`) || [];
        const zeroedBursts = currentBursts.map((burst: any) => ({
          ...burst,
          budget: "0",
          buyAmount: "0",
          calculatedValue: burst.calculatedValue ?? 0,
        }));

        form.setValue(
          `cinemalineItems.${lineItemIndex}.bursts`,
          zeroedBursts,
          { shouldDirty: true }
        );
      }

      handleLineItemValueChange(lineItemIndex);
    },
    [form, handleLineItemValueChange]
  );

  const handleValueChange = useCallback((lineItemIndex: number, burstIndex: number) => {
    const burst = form.getValues(`cinemalineItems.${lineItemIndex}.bursts.${burstIndex}`);
    const buyType = form.getValues(`cinemalineItems.${lineItemIndex}.buyType`);

    const calculatedValue = computeDeliverables(burst, buyType);

    // Only update if the calculated value is actually different to prevent infinite loops
    const currentValue = form.getValues(`cinemalineItems.${lineItemIndex}.bursts.${burstIndex}.calculatedValue`);
    if (currentValue !== calculatedValue && !isNaN(calculatedValue)) {
      form.setValue(`cinemalineItems.${lineItemIndex}.bursts.${burstIndex}.calculatedValue`, calculatedValue, {
        shouldValidate: false, // Changed to false to prevent validation loops
        shouldDirty: false,    // Changed to false to prevent dirty state loops
      });

      handleLineItemValueChange(lineItemIndex);
    }
  }, [form, handleLineItemValueChange, computeDeliverables]);

  const handleAppendBurst = useCallback((lineItemIndex: number) => {
    const currentBursts = form.getValues(`cinemalineItems.${lineItemIndex}.bursts`) || [];
    
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
    
    form.setValue(`cinemalineItems.${lineItemIndex}.bursts`, [
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
    const currentBursts = form.getValues(`cinemalineItems.${lineItemIndex}.bursts`) || [];

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

    form.setValue(`cinemalineItems.${lineItemIndex}.bursts`, [
      ...currentBursts,
      duplicatedBurst,
    ]);

    handleLineItemValueChange(lineItemIndex);
  }, [form, handleLineItemValueChange, toast]);

  const handleRemoveBurst = useCallback((lineItemIndex: number, burstIndex: number) => {
    const currentBursts = form.getValues(`cinemalineItems.${lineItemIndex}.bursts`) || [];
    form.setValue(
      `cinemalineItems.${lineItemIndex}.bursts`,
      currentBursts.filter((_, index) => index !== burstIndex),
    );

    handleLineItemValueChange(lineItemIndex);
  }, [form, handleLineItemValueChange]);

  const getDeliverablesLabel = useCallback((buyType: string) => {
    if (!buyType) return "Deliverables";
    
    switch (buyType.toLowerCase()) {
      case "spots":
        return "Spots";
      case "package":
        return "Package";
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

        const fetchedPublishers = await getPublishersForCinema();
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
    const fetchCinemaStations = async () => {
      try {
        // Check if we already have cinema stations cached
        if (cinemaStationsRef.current.length > 0) {
          setCinemaStations(cinemaStationsRef.current);
          setIsLoading(false);
          return;
        }

        // For now, use empty array until API is implemented
        const fetchedCinemaStations: CinemaStation[] = [];
        cinemaStationsRef.current = fetchedCinemaStations;
        setCinemaStations(fetchedCinemaStations);
      } catch (error) {
        toast({
          title: "Error loading Cinema Stations",
          description: error.message,
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };
  
    fetchCinemaStations();
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
  const calculatedBursts = getCinemaBursts(form, feecinema || 0);
  let burstIndex = 0;

  const items: LineItem[] = form.getValues('cinemalineItems').flatMap((lineItem, lineItemIndex) =>
    lineItem.bursts.map(burst => {
      const computedBurst = calculatedBursts[burstIndex++];
      const mediaAmount = computedBurst
        ? computedBurst.mediaAmount
        : parseFloat(String(burst.budget).replace(/[^0-9.-]+/g, "")) || 0;
      let lineItemId = lineItem.lineItemId || lineItem.line_item_id;
      if (!lineItemId) {
        lineItemId = createLineItemId();
        form.setValue(`cinemalineItems.${lineItemIndex}.lineItemId`, lineItemId);
        form.setValue(`cinemalineItems.${lineItemIndex}.line_item_id`, lineItemId);
      }
      const lineNumber = lineItem.line_item ?? lineItem.lineItem ?? lineItemIndex + 1;

      return {
        market: lineItem.market,                                // or fixed value
        network: lineItem.network,
        station: lineItem.station,
        bidStrategy: lineItem.bidStrategy,
        targeting: lineItem.placement,
        placement: lineItem.placement,                            // Add placement field for Excel export
        creative:   lineItem.format,
        duration:   lineItem.duration,
        startDate: formatDateString(burst.startDate),
        endDate:   formatDateString(burst.endDate),
        deliverables: burst.calculatedValue ?? 0,
        buyingDemo:   lineItem.buyingDemo,
        buyType:      lineItem.buyType,
        deliverablesAmount: burst.budget,
        grossMedia: mediaAmount.toFixed(2),
        line_item_id: lineItemId,
        lineItemId: lineItemId,
        line_item: lineNumber,
        lineItem: lineNumber,
      };
    })
  );
  
  // push it up to page.tsx
  onLineItemsChange(items);
}, [watchedLineItems, feecinema]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      const investmentByMonth = calculateInvestmentPerMonth(form, feecinema || 0);
      const bursts = getCinemaBursts(form, feecinema || 0);
      
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
  }, [watchedLineItems, feecinema]); // Removed callback dependencies to prevent infinite loops

  const getBursts = () => {
    const formLineItems = form.getValues("cinemalineItems") || [];
    return formLineItems.flatMap(item =>
      item.bursts.map(burst => {
        const budget = parseFloat(burst.budget?.replace(/[^0-9.]/g, "") || "0");
        let mediaAmount = 0;
        let feeAmount = 0;

        if (item.budgetIncludesFees && item.clientPaysForMedia) {
          // Both true: budget is gross, extract fee only, mediaAmount = 0
          // Media = 0
          // Fees = Budget * (Fee / 100)
          feeAmount = budget * ((feecinema || 0) / 100);
          mediaAmount = 0;
        } else if (item.budgetIncludesFees) {
          // Only budgetIncludesFees: budget is gross, split into media and fee
          const base = budget / (1 + (feecinema || 0)/100);
          feeAmount = budget - base;
          mediaAmount = base;
        } else if (item.clientPaysForMedia) {
          // Only clientPaysForMedia: budget is net media, only fee is billed
          feeAmount = (budget / (100 - (feecinema || 0))) * (feecinema || 0);
          mediaAmount = 0;
        } else {
          // Neither: budget is net media, fee calculated on top
          mediaAmount = budget;
          feeAmount = (budget * (feecinema || 0)) / 100;
        }

        const billingBurst: BillingBurst = {
          startDate: burst.startDate,
          endDate: burst.endDate,
          mediaAmount: mediaAmount,
          feeAmount: feeAmount,
          totalAmount: mediaAmount + feeAmount,
          mediaType: 'cinema',
          feePercentage: feecinema,
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
            <CardTitle className="pt-4 border-t font-bold text-lg flex justify-between">Cinema</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {overallTotals.lineItemTotals.map((item) => (
              <div key={item.index} className="flex justify-between border-b pb-2">
                <span className="font-medium">Line Item {item.index}</span>
                <div className="flex space-x-4">
                  <span>
                    {getDeliverablesLabel(form.getValues(`cinemalineItems.${item.index - 1}.buyType`))}: {item.deliverables.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </span>
                  <span>Media: ${item.media.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                  <span>Fee: ${item.fee.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                  <span>Total Cost: ${item.totalCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
              </div>
            ))}
  
            {/* Overall Totals */}
            <div className="pt-4 border-t font-medium flex justify-between">
              <span>Cinema Totals:</span>
              <div className="flex space-x-4">
                <span>Media: ${overallTotals.overallMedia.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                <span>Fees ({feecinema}%): ${overallTotals.overallFee.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                <span>Total Cost: ${overallTotals.overallCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
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
                  const sectionId = `cinema-line-item-${lineItemIndex}`;
                  const burstsId = `${sectionId}-bursts`;
                  const footerId = `${sectionId}-footer`;
                  const getTotals = (lineItemIndex: number) => {
                    const lineItem = form.getValues(`cinemalineItems.${lineItemIndex}`);
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
                    <Card key={field.id} className="space-y-6">
                      <CardHeader className="pb-2">
                        <div className="flex justify-between items-center">
                          <div className="flex items-center space-x-2">
                            <CardTitle className="text-lg font-medium">Cinema Line Item {lineItemIndex + 1}</CardTitle>
                            <div className="text-sm text-muted-foreground">ID: {`${mbaNumber}CN${lineItemIndex + 1}`}</div>
                          </div>
                          <div className="flex items-center space-x-2">
                            <div className="text-sm font-medium">
                              Total: {new Intl.NumberFormat('en-US', {
                                style: 'currency',
                                currency: 'USD',
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2
                              }).format(
                                form.getValues(`cinemalineItems.${lineItemIndex}.budgetIncludesFees`)
                                  ? totalMedia
                                  : totalMedia + (totalMedia / (100 - (feecinema || 0))) * (feecinema || 0)
                              )}
                            </div>
                            <Button
                              type="button"
                              variant="outline" 
                              size="sm"
                              onClick={() => {
                                const element = document.getElementById(sectionId);
                                const bursts = document.getElementById(burstsId);
                                const footer = document.getElementById(footerId);
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
                            <span className="font-medium">Network:</span> {form.watch(`cinemalineItems.${lineItemIndex}.network`) || 'Not selected'}
                          </div>
                          <div>
                            <span className="font-medium">Buy Type:</span> {formatBuyTypeForDisplay(form.watch(`cinemalineItems.${lineItemIndex}.buyType`))}
                          </div>
                          <div>
                            <span className="font-medium">Bid Strategy:</span> {form.watch(`cinemalineItems.${lineItemIndex}.bidStrategy`) || 'Not selected'}
                          </div>
                          <div>
                            <span className="font-medium">Bursts:</span> {form.watch(`cinemalineItems.${lineItemIndex}.bursts`, []).length}
                          </div>
                        </div>
                      </div>
                      
                      {/* Detailed Content - Collapsible */}
                      <div
                        id={sectionId}
                        className="bg-white rounded-xl shadow p-6 mb-6"
                      >
                        <CardContent className="space-y-6">
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                            
                            {/* Column 1 - Dropdowns */}
                            <div className="space-y-4">
                              <FormField
                                control={form.control}
                                name={`cinemalineItems.${lineItemIndex}.network`}
                                render={({ field }) => (
                                  <FormItem className="flex items-center space-x-2">
                                    <FormLabel className="w-24 text-sm">Network</FormLabel>
                                    <Select
                                      onValueChange={(value) => {
                                        field.onChange(value)
                                      }}
                                      value={field.value}
                                    >
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
                                name={`cinemalineItems.${lineItemIndex}.station`}
                                render={({ field }) => (
                                  <FormItem className="flex items-center space-x-2">
                                    <FormLabel className="w-24 text-sm">Station</FormLabel>
                                    <div className="flex-1 flex items-center space-x-1">
                                      <Select
                                        onValueChange={field.onChange}
                                        value={field.value}
                                      >
                                        <FormControl>
                                          <SelectTrigger className="h-9 w-full rounded-md border">
                                            <SelectValue placeholder="Select Station" />
                                          </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                          {cinemaStations.length > 0 ? (
                                            cinemaStations.map((station) => (
                                              <SelectItem 
                                                key={station.id} 
                                                value={station.station || `station-${station.id}`}
                                              >
                                                {station.station}
                                              </SelectItem>
                                            ))
                                          ) : (
                                            <div className="p-2 text-sm text-muted-foreground text-center">
                                              No stations found.<br />
                                              Click the <PlusCircle className="inline h-4 w-4 mx-1 text-blue-500" /> icon to add one.
                                            </div>
                                          )}
                                        </SelectContent>
                                      </Select>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="p-1 h-auto"
                                        onClick={() => {
                                          const currentNetworkInForm = form.getValues(`cinemalineItems.${lineItemIndex}.network`);
                                          if (!currentNetworkInForm) {
                                            toast({
                                              title: "Select a Network First",
                                              description: "Please select a network before adding a station.",
                                              variant: "default", 
                                            });
                                            return;
                                          }
                                          setCurrentLineItemIndexForNewStation(lineItemIndex);
                                          setNewStationName("");
                                          setNewStationNetwork(currentNetworkInForm);
                                          setIsAddStationDialogOpen(true);
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
                                name={`cinemalineItems.${lineItemIndex}.buyType`}
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
                                        <SelectItem value="spots">Spots</SelectItem>
                                        <SelectItem value="cpm">CPM</SelectItem>
                                        <SelectItem value="package">Package</SelectItem>
                                        <SelectItem value="bonus">Bonus</SelectItem>
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
                                <FormLabel className="block text-sm mb-1 self-start mt-4">Placement</FormLabel>
                                <FormControl>
                                  <Textarea
                                    {...form.register(`cinemalineItems.${lineItemIndex}.placement`)}
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
                                    {...form.register(`cinemalineItems.${lineItemIndex}.buyingDemo`)}
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
                                <FormLabel className="block text-sm mb-1">Duration</FormLabel>
                                <FormControl>
                                  <Textarea
                                    {...form.register(`cinemalineItems.${lineItemIndex}.duration`)}
                                    placeholder="Enter duration details"
                                    className="w-full min-h-0 h-10 text-sm rounded-md border"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>

                              <FormItem className="flex items-center space-x-2">
                                <FormLabel className="block text-sm mb-1">Format</FormLabel>
                                <FormControl>
                                  <Textarea
                                    {...form.register(`cinemalineItems.${lineItemIndex}.format`)}
                                    placeholder="Enter format details"
                                    className="w-full min-h-0 h-10 text-sm rounded-md border"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>

                              <FormItem className="flex items-center space-x-2">
                                <FormLabel className="block text-sm mb-1">Market</FormLabel>
                                <FormControl>
                                  <Textarea
                                    {...form.register(`cinemalineItems.${lineItemIndex}.market`)}
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
                                  name={`cinemalineItems.${lineItemIndex}.fixedCostMedia`}
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
                                  name={`cinemalineItems.${lineItemIndex}.clientPaysForMedia`}
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
                                  name={`cinemalineItems.${lineItemIndex}.budgetIncludesFees`}
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

                            </div>
                          </div>
                        </CardContent>
                      </div>

                      {/* Bursts Section */}
                      <div id={burstsId} className="space-y-4">
                        {form.watch(`cinemalineItems.${lineItemIndex}.bursts`, []).map((burstField, burstIndex) => {
                          return (
                            <Card key={`${lineItemIndex}-${burstIndex}`} className="border border-gray-200 bg-muted/30 mx-2">
                              <CardContent className="py-2 px-4">
                                <div className="flex items-center gap-3">
                                  <div className="w-24 flex-shrink-0">
                                    <h4 className="text-sm font-medium">
                                      {formatBurstLabel(
                                        burstIndex + 1,
                                        form.watch(`cinemalineItems.${lineItemIndex}.bursts.${burstIndex}.startDate`),
                                        form.watch(`cinemalineItems.${lineItemIndex}.bursts.${burstIndex}.endDate`)
                                      )}
                                    </h4>
                                  </div>
                                  
                                  <div className="grid grid-cols-7 gap-3 items-center flex-grow">
                                    <FormField
                                      control={form.control}
                                      name={`cinemalineItems.${lineItemIndex}.bursts.${burstIndex}.budget`}
                                      render={({ field }) => {
                                        const buyType = form.watch(`cinemalineItems.${lineItemIndex}.buyType`);
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
                                        );
                                      }}
                                    />

                                    <FormField
                                      control={form.control}
                                      name={`cinemalineItems.${lineItemIndex}.bursts.${burstIndex}.buyAmount`}
                                      render={({ field }) => {
                                        const buyType = form.watch(`cinemalineItems.${lineItemIndex}.buyType`);
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
                                        );
                                      }}
                                    />

                                    <div className="grid grid-cols-2 gap-2 col-span-2">
                                      <FormField
                                        control={form.control}
                                        name={`cinemalineItems.${lineItemIndex}.bursts.${burstIndex}.startDate`}
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
                                        name={`cinemalineItems.${lineItemIndex}.bursts.${burstIndex}.endDate`}
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
                                      name={`cinemalineItems.${lineItemIndex}.bursts.${burstIndex}.calculatedValue`}
                                      render={({ field }) => {
                                        const buyType = useWatch({
                                          control: form.control,
                                          name: `cinemalineItems.${lineItemIndex}.buyType`,
                                        });
                                        const budgetValue = useWatch({
                                          control: form.control,
                                          name: `cinemalineItems.${lineItemIndex}.bursts.${burstIndex}.budget`,
                                        });
                                        const buyAmountValue = useWatch({
                                          control: form.control,
                                          name: `cinemalineItems.${lineItemIndex}.bursts.${burstIndex}.buyAmount`,
                                        });

                                        const calculatedValue = useMemo(() => {
                                          const budget = parseFloat(
                                            String(budgetValue)?.replace(/[^0-9.]/g, "") || "0"
                                          );
                                          const buyAmount = parseFloat(
                                            String(buyAmountValue)?.replace(/[^0-9.]/g, "") || "1"
                                          );

                                          switch (buyType) {
                                            case "spots":
                                            case "package":
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
                                          case "spots":
                                            title = "Spots";
                                            break;
                                          case "cpm":
                                            title = "Impressions";
                                            break;
                                          case "fixed_cost":
                                            title = "Fixed Cost";
                                            break;
                                          case "package":
                                            title = "Package";
                                            break;
                                        }

                                        return (
                                          <FormItem>
                                            <FormLabel className="text-xs">{title}</FormLabel>
                                            <FormControl>
                                              <Input
                                                type="text"
                                                className="w-full min-w-[8rem] h-10 text-sm"
                                                value={Number(calculatedValue).toLocaleString(undefined, { maximumFractionDigits: 0 })}
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
                                        value={new Intl.NumberFormat("en-US", {
                                          style: "currency",
                                          currency: "USD",
                                          minimumFractionDigits: 2,
                                          maximumFractionDigits: 2,
                                        }).format(
                                          form.getValues(`cinemalineItems.${lineItemIndex}.budgetIncludesFees`)
                                            ? (parseFloat(form.getValues(`cinemalineItems.${lineItemIndex}.bursts.${burstIndex}.budget`)?.replace(/[^0-9.]/g, "") || "0") / 100) * (100 - (feecinema || 0))
                                            : parseFloat(form.getValues(`cinemalineItems.${lineItemIndex}.bursts.${burstIndex}.budget`)?.replace(/[^0-9.]/g, "") || "0")
                                        )}
                                        readOnly
                                      />
                                    </div>
                                    <div className="space-y-1">
                                      <FormLabel className="text-xs leading-tight">Fee ({feecinema}%)</FormLabel>
                                      <Input
                                        type="text"
                                        className="w-full h-10 text-sm"
                                        value={new Intl.NumberFormat("en-US", {
                                          style: "currency",
                                          currency: "USD",
                                          minimumFractionDigits: 2,
                                          maximumFractionDigits: 2,
                                        }).format(
                                          form.getValues(`cinemalineItems.${lineItemIndex}.budgetIncludesFees`)
                                            ? (parseFloat(form.getValues(`cinemalineItems.${lineItemIndex}.bursts.${burstIndex}.budget`)?.replace(/[^0-9.]/g, "") || "0") / 100) * (feecinema || 0)
                                            : (parseFloat(form.getValues(`cinemalineItems.${lineItemIndex}.bursts.${burstIndex}.budget`)?.replace(/[^0-9.]/g, "") || "0") / (100 - (feecinema || 0))) * (feecinema || 0)
                                        )}
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

                      <CardFooter id={footerId} className="flex justify-end space-x-2 pt-2">
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
                                network: "",
                                station: "",
                                bidStrategy: "",
                                buyType: "",
                                placement: "",
                                format: "",
                                duration: "",
                                buyingDemo: "",
                                market: "",
                                fixedCostMedia: false,
                                clientPaysForMedia: false,
                                budgetIncludesFees: false,
                                noadserving: false,
                                ...(() => { const id = createLineItemId(); return { lineItemId: id, line_item_id: id, line_item: lineItemFields.length + 1, lineItem: lineItemFields.length + 1 }; })(),
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
            <DialogTitle>Add New Cinema Station</DialogTitle>
            <DialogDescription>
              Enter the details for the new Cinema station.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="dialogDisplayNetworkName" className="text-right">
                Network
              </Label>
              <Input
                id="dialogDisplayNetworkName"
                value={newStationNetwork}
                readOnly
                className="col-span-3 bg-gray-100 focus:ring-0 pointer-events-none"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="newStationNetwork" className="text-right">
                Network
              </Label>
              <Select
                value={newStationNetwork}
                onValueChange={setNewStationNetwork}
              >
                <SelectTrigger className="col-span-3 h-9">
                  <SelectValue placeholder="Select Network" />
                </SelectTrigger>
                <SelectContent>
                  {publishers.map((publisher) => (
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
                placeholder="e.g., Cinema Complex Name"
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
