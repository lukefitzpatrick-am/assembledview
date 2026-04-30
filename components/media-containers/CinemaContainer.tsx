"use client"

import { useState, useEffect, useRef, useMemo, useCallback } from "react"
import { useForm, useFieldArray, UseFormReturn } from "react-hook-form"
import { useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Combobox } from "@/components/ui/combobox"
import { Checkbox } from "@/components/ui/checkbox"
import { Textarea } from "@/components/ui/textarea"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { useToast } from "@/components/ui/use-toast"
import { getPublishersForCinema, getClientInfo } from "@/lib/api"
import { formatBurstLabel } from "@/lib/bursts"
import { computeBurstAmounts } from "@/lib/mediaplan/burstAmounts"
import { format } from "date-fns"
import { useMediaPlanContext } from "@/contexts/MediaPlanContext"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { ChevronDown, Copy, Plus, Trash2, PlusCircle } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger,} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label";
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

/** Net media when budget is gross incl. fee — must match `getCinemaBursts` / burst row readouts (linear split). */
function cinemaLineBurstNetMedia(
  rawBudget: number,
  budgetIncludesFees: boolean,
  feePct: number
): number {
  if (!budgetIncludesFees) return rawBudget;
  const pct = feePct || 0;
  return (rawBudget * (100 - pct)) / 100
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
  const createLineItemId = useCallback(() => {
    const base = mbaNumber || "CIN";
    const rand =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? (crypto as any).randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
    return `${base}-${rand}`;
  }, [mbaNumber]);

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
    name: "cinemalineItems",
  });

  const [collapsedLineItems, setCollapsedLineItems] = useState<Set<number>>(
    new Set()
  );

  const toggleLineItemCollapsed = useCallback((i: number) => {
    setCollapsedLineItems((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }, []);

  const removeLineItem = useCallback(
    (i: number) => {
      setCollapsedLineItems((prev) => {
        const next = new Set<number>();
        prev.forEach((idx) => {
          if (idx < i) next.add(idx);
          else if (idx > i) next.add(idx - 1);
        });
        return next;
      });
      removeLineItemBase(i);
    },
    [removeLineItemBase]
  );

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
  }, [appendLineItem, createLineItemId, form, toast]);

  // Watch hook
  const watchedLineItems = useWatch({ 
    control: form.control, 
    name: "cinemalineItems",
    defaultValue: form.getValues("cinemalineItems")
  });

  /** Display + initial load: net fee model matches {@link netFromGross} + {@link deliverablesFromBudget}. */
  const cinemaBurstDeliverables = useCallback(
    (burst: any, buyType: string, budgetIncludesFees: boolean) => {
      const bt = coerceBuyTypeWithDevWarn(buyType, "cinemaBurstDeliverables")
      const rawBudget =
        parseFloat(String(burst?.budget ?? "").replace(/[^0-9.]/g, "")) || 0
      const netBudget = netFromGross(rawBudget, budgetIncludesFees, feecinema || 0)
      const buyAmount =
        parseFloat(String(burst?.buyAmount ?? "").replace(/[^0-9.]/g, "")) || 0

      if (bt === "bonus" || bt === "package_inclusions") {
        return (
          parseFloat(String(burst?.calculatedValue ?? "0").replace(/[^0-9.]/g, "")) ||
          0
        )
      }

      const raw = deliverablesFromBudget(bt, netBudget, buyAmount)
      if (Number.isNaN(raw)) {
        return (
          parseFloat(String(burst?.calculatedValue ?? "0").replace(/[^0-9.]/g, "")) ||
          0
        )
      }
      return roundDeliverables(bt, raw)
    },
    [feecinema]
  )

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
            calculatedValue: cinemaBurstDeliverables(burst, buyType, item.budget_includes_fees || false),
            fee: burst.fee ?? 0,
          })) : [{
            budget: "",
            buyAmount: "",
            startDate: defaultMediaBurstStartDate(campaignStartDate, campaignEndDate),
            endDate: defaultMediaBurstEndDate(campaignStartDate, campaignEndDate),
            calculatedValue: cinemaBurstDeliverables({}, buyType, false),
            fee: 0,
          }],
        };
      });

      form.reset({
        cinemalineItems: transformedLineItems,
        overallDeliverables: 0,
      });
    }
  }, [initialLineItems, form, campaignStartDate, campaignEndDate, cinemaBurstDeliverables, mbaNumber]);

  // Transform form data to API schema format
  useEffect(() => {
    const formLineItems = form.getValues('cinemalineItems') || [];
    
    const transformedLineItems = formLineItems.map((lineItem, index) => {
      // Calculate totalMedia from raw budget amounts (for display in MBA section)
      let totalMedia = 0;
      lineItem.bursts.forEach((burst) => {
        const budget = parseFloat(burst.budget.replace(/[^0-9.]/g, "")) || 0;
        if (lineItem.budgetIncludesFees) {
          const pct = feecinema || 0;
          totalMedia += (budget * (100 - pct)) / 100;
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
  }, [watchedLineItems, mbaNumber, feecinema, form, onMediaLineItemsChange]);
  
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
          const pct = feecinema || 0;
          lineMedia += (budget * (100 - pct)) / 100;
          lineFee += (budget * pct) / 100;
        } else {
          // Budget is net media, fee calculated on top
          lineMedia += budget;
          const fee = feecinema ? (budget / (100 - feecinema)) * feecinema : 0;
          lineFee += fee;
        }
        lineDeliverables += cinemaBurstDeliverables(burst, lineItem.buyType, lineItem.budgetIncludesFees);
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
  }, [watchedLineItems, feecinema, cinemaBurstDeliverables]);
  
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
        if (lineItem.budgetIncludesFees) {
          const pct = feecinema || 0;
          lineMedia += (budget * (100 - pct)) / 100;
          lineFee += (budget * pct) / 100;
        } else {
          lineMedia += budget;
          const fee = feecinema ? (budget / (100 - feecinema)) * feecinema : 0;
          lineFee += fee;
        }
        lineDeliverables += cinemaBurstDeliverables(burst, lineItem.buyType, lineItem.budgetIncludesFees);
      });

      overallMedia += lineMedia;
      overallFee += lineFee;
      overallCost += lineMedia + lineFee;
      overallDeliverableCount += lineDeliverables;
    });

    setOverallDeliverables(overallDeliverableCount);
    onTotalMediaChange(overallMedia, overallFee);
  }, [form, feecinema, onTotalMediaChange, cinemaBurstDeliverables]);

  const handleBuyTypeChange = useCallback(
    (lineItemIndex: number, value: string) => {
      form.setValue(`cinemalineItems.${lineItemIndex}.buyType`, value);

      if (value === "bonus" || value === "package_inclusions") {
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

  const handleValueChange = useCallback((lineItemIndex: number, burstIndex: number, budgetIncludesFeesOverride?: boolean) => {
    const burst = form.getValues(`cinemalineItems.${lineItemIndex}.bursts.${burstIndex}`);
    const buyType = form.getValues(`cinemalineItems.${lineItemIndex}.buyType`);
    const budgetIncludesFees =
      budgetIncludesFeesOverride ??
      Boolean(form.getValues(`cinemalineItems.${lineItemIndex}.budgetIncludesFees`));

    const calculatedValue = cinemaBurstDeliverables(burst, buyType, budgetIncludesFees);

    const currentValue =
      Number(form.getValues(`cinemalineItems.${lineItemIndex}.bursts.${burstIndex}.calculatedValue`)) || 0;
    if (Math.abs(currentValue - calculatedValue) > 1e-6) {
      form.setValue(`cinemalineItems.${lineItemIndex}.bursts.${burstIndex}.calculatedValue`, calculatedValue, {
        shouldValidate: false, // Changed to false to prevent validation loops
        shouldDirty: false,    // Changed to false to prevent dirty state loops
      });

      handleLineItemValueChange(lineItemIndex);
    }
  }, [form, handleLineItemValueChange, cinemaBurstDeliverables]);

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
    const endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0);
    
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

    const endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0);

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
}, [overallTotals.overallFee, overallTotals.overallMedia, onTotalMediaChange])

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
        grossMedia: String(mediaAmount),
        clientPaysForMedia: lineItem.clientPaysForMedia ?? false,
        line_item_id: lineItemId,
        lineItemId: lineItemId,
        line_item: lineNumber,
        lineItem: lineNumber,
      };
    })
  );
  
  // push it up to page.tsx
  onLineItemsChange(items);
}, [watchedLineItems, feecinema, createLineItemId, form, onLineItemsChange]);

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
  }, [watchedLineItems, feecinema, form, onBurstsChange, onInvestmentChange]);

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
          const pct = feecinema || 0;
          mediaAmount = (budget * (100 - pct)) / 100;
          feeAmount = (budget * pct) / 100;
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
        <Card className="overflow-hidden border-0 shadow-md">
          <div className="h-1 bg-gradient-to-r from-primary via-primary/70 to-primary/40" />
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold tracking-tight">Cinema</CardTitle>
              <span className="text-xs text-muted-foreground tabular-nums">
                {overallTotals.lineItemTotals.length} line item
                {overallTotals.lineItemTotals.length !== 1 ? "s" : ""}
              </span>
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
                      {getDeliverablesLabel(form.getValues(`cinemalineItems.${item.index - 1}.buyType`))}
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
                  <span className="text-[11px] text-muted-foreground font-normal block">Fee ({feecinema}%)</span>
                  <span>{formatMoney(overallTotals.overallFee, { locale: "en-AU", currency: "AUD" })}</span>
                </div>
                <div className="text-right">
                  <span className="text-[11px] text-muted-foreground font-normal block">Total</span>
                  <span className="text-primary">{formatMoney(overallTotals.overallCost, { locale: "en-AU", currency: "AUD" })}</span>
                </div>
              </div>
            </div>
            <MediaContainerTimelineCollapsible
              mediaTypeKey="cinema"
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
            <Form {...form}>
              <div className="space-y-6">
                {lineItemFields.map((field, lineItemIndex) => {
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
                    <Card key={field.id} className="overflow-hidden border border-border/50 shadow-sm hover:shadow-md transition-shadow duration-200 space-y-6">
                      <CardHeader className="pb-2 bg-muted/30">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                              {lineItemIndex + 1}
                            </div>
                            <div>
                              <CardTitle className="text-sm font-semibold tracking-tight">Cinema Line Item</CardTitle>
                              <span className="font-mono text-[11px] text-muted-foreground">{`${mbaNumber}CN${lineItemIndex + 1}`}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              <span className="block text-[11px] text-muted-foreground">Total</span>
                              <span className="text-sm font-bold tabular-nums">
                                {formatMoney(
                                  form.getValues(`cinemalineItems.${lineItemIndex}.budgetIncludesFees`)
                                    ? totalMedia
                                    : totalMedia + (totalMedia / (100 - (feecinema || 0))) * (feecinema || 0),
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
                                  ? `Expand details for cinema line item ${lineItemIndex + 1}`
                                  : `Collapse details for cinema line item ${lineItemIndex + 1}`
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
                      
                      {!collapsedLineItems.has(lineItemIndex) && (
                      <>
                      <div className="px-6 py-5">
                        <CardContent className="space-y-5 p-0">
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-4">
                            
                            {/* Column 1 - Dropdowns */}
                            <div className="space-y-4">
                              <FormField
                                control={form.control}
                                name={`cinemalineItems.${lineItemIndex}.network`}
                                render={({ field }) => (
                                  <FormItem className="flex flex-col space-y-1.5">
                                    <FormLabel className="text-sm text-muted-foreground font-medium">Network</FormLabel>
                                    <FormControl>
                                      <Combobox
                                        value={field.value}
                                        onValueChange={(value) => field.onChange(value)}
                                        placeholder="Select Network"
                                        searchPlaceholder="Search networks..."
                                        emptyText={publishers.length === 0 ? "No networks available." : "No networks found."}
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
                                name={`cinemalineItems.${lineItemIndex}.station`}
                                render={({ field }) => (
                                  <FormItem className="flex flex-col space-y-1.5">
                                    <FormLabel className="text-sm text-muted-foreground font-medium">Station</FormLabel>
                                    <div className="flex-1 flex items-center space-x-1">
                                      <FormControl>
                                        <Combobox
                                          value={field.value}
                                          onValueChange={field.onChange}
                                          placeholder="Select Station"
                                          searchPlaceholder="Search stations..."
                                          emptyText="No stations found."
                                          buttonClassName="h-9 w-full rounded-md"
                                          options={cinemaStations.map((station) => ({
                                            value: station.station || `station-${station.id}`,
                                            label: station.station || "(Unnamed station)",
                                          }))}
                                        />
                                      </FormControl>
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
                                        <PlusCircle className="h-5 w-5 text-primary" />
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
                                          { value: "cpm", label: "CPM" },
                                          { value: "fixed_cost", label: "Fixed Cost" },
                                          { value: "package", label: "Package" },
                                          { value: "spots", label: "Spots" },
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
                                <FormLabel className="text-sm text-muted-foreground font-medium">Placement</FormLabel>
                                <FormControl>
                                  <Textarea
                                    {...form.register(`cinemalineItems.${lineItemIndex}.placement`)}
                                    placeholder="Enter placement details"
                                    className="w-full h-24 text-sm rounded-md border border-border/50 bg-muted/30 transition-colors focus:bg-background"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>

                              <FormItem className="flex flex-col space-y-1.5">
                                <FormLabel className="text-sm text-muted-foreground font-medium">Buying Demo</FormLabel>
                                <FormControl>
                                  <Textarea
                                    {...form.register(`cinemalineItems.${lineItemIndex}.buyingDemo`)}
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
                                <FormLabel className="text-sm text-muted-foreground font-medium">Duration</FormLabel>
                                <FormControl>
                                  <Textarea
                                    {...form.register(`cinemalineItems.${lineItemIndex}.duration`)}
                                    placeholder="Enter duration details"
                                    className="w-full min-h-0 h-10 text-sm rounded-md border border-border/50 bg-muted/30 transition-colors focus:bg-background"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>

                              <FormItem className="flex flex-col space-y-1.5">
                                <FormLabel className="text-sm text-muted-foreground font-medium">Format</FormLabel>
                                <FormControl>
                                  <Textarea
                                    {...form.register(`cinemalineItems.${lineItemIndex}.format`)}
                                    placeholder="Enter format details"
                                    className="w-full min-h-0 h-10 text-sm rounded-md border border-border/50 bg-muted/30 transition-colors focus:bg-background"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>

                              <FormItem className="flex flex-col space-y-1.5">
                                <FormLabel className="text-sm text-muted-foreground font-medium">Market</FormLabel>
                                <FormControl>
                                  <Textarea
                                    {...form.register(`cinemalineItems.${lineItemIndex}.market`)}
                                    placeholder="Enter market or Geo Targeting"
                                    className="w-full min-h-0 h-10 text-sm rounded-md border border-border/50 bg-muted/30 transition-colors focus:bg-background"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            </div>

                            {/* Column 4 - Options */}
                            <div className="space-y-4">
                              <div className="space-y-3 rounded-lg border border-border/30 bg-muted/20 p-4">
                                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Options</span>
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
                                        <Checkbox
                                          checked={field.value}
                                          onCheckedChange={(checked) => {
                                            field.onChange(checked);
                                            const bursts =
                                              form.getValues(`cinemalineItems.${lineItemIndex}.bursts`) || [];
                                            bursts.forEach((_, bi) => handleValueChange(lineItemIndex, bi, !!checked));
                                            handleLineItemValueChange(lineItemIndex);
                                          }}
                                        />
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
                                    "cinema",
                                    form.watch(`cinemalineItems.${lineItemIndex}.buyType`) || ""
                                  )}
                                </span>
                                <span>Media</span>
                                <span>{`Fee (${feecinema}%)`}</span>
                              </div>
                              <div className={MP_BURST_ACTION_COLUMN}>
                                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Actions</span>
                              </div>
                            </div>
                          </div>
                        </div>
                        {form.watch(`cinemalineItems.${lineItemIndex}.bursts`, []).map((burstField, burstIndex) => {
                          return (
                            <Card key={`${lineItemIndex}-${burstIndex}`} className={MP_BURST_CARD}>
                              <CardContent className={MP_BURST_CARD_CONTENT}>
                                <div className={MP_BURST_ROW_SHELL}>
                                  <div className={MP_BURST_LABEL_COLUMN}>
                                    <h4 className={MP_BURST_LABEL_HEADING}>
                                      {formatBurstLabel(
                                        burstIndex + 1,
                                        form.watch(`cinemalineItems.${lineItemIndex}.bursts.${burstIndex}.startDate`),
                                        form.watch(`cinemalineItems.${lineItemIndex}.bursts.${burstIndex}.endDate`)
                                      )}
                                    </h4>
                                  </div>
                                  
                                  <div className={MP_BURST_GRID_7}>
                                    <FormField
                                      control={form.control}
                                      name={`cinemalineItems.${lineItemIndex}.bursts.${burstIndex}.budget`}
                                      render={({ field }) => {
                                        const buyType = form.watch(`cinemalineItems.${lineItemIndex}.buyType`);
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
                                      name={`cinemalineItems.${lineItemIndex}.bursts.${burstIndex}.buyAmount`}
                                      render={({ field }) => {
                                        const buyType = form.watch(`cinemalineItems.${lineItemIndex}.buyType`);
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
                                        name={`cinemalineItems.${lineItemIndex}.bursts.${burstIndex}.startDate`}
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
                                        name={`cinemalineItems.${lineItemIndex}.bursts.${burstIndex}.endDate`}
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
                                      name={`cinemalineItems.${lineItemIndex}.bursts.${burstIndex}.calculatedValue`}
                                      render={({ field }) => (
                                        <CpcFamilyBurstCalculatedField
                                          form={form}
                                          itemsKey="cinemalineItems"
                                          lineItemIndex={lineItemIndex}
                                          burstIndex={burstIndex}
                                          field={field}
                                          feePct={feecinema || 0}
                                          netMedia={cinemaLineBurstNetMedia}
                                          variant="cinema"
                                        />
                                      )}
                                    />

                                    <Input
                                        type="text"
                                        className="w-full h-10 text-sm bg-muted/30 border-border/40 text-muted-foreground"
                                        value={formatMoney(
                                          form.getValues(`cinemalineItems.${lineItemIndex}.budgetIncludesFees`)
                                            ? (parseFloat(form.getValues(`cinemalineItems.${lineItemIndex}.bursts.${burstIndex}.budget`)?.replace(/[^0-9.]/g, "") || "0") / 100) * (100 - (feecinema || 0))
                                            : parseFloat(form.getValues(`cinemalineItems.${lineItemIndex}.bursts.${burstIndex}.budget`)?.replace(/[^0-9.]/g, "") || "0")
                                        , { locale: "en-AU", currency: "AUD" })}
                                        readOnly
                                      />
                                    <Input
                                        type="text"
                                        className="w-full h-10 text-sm bg-muted/30 border-border/40 text-muted-foreground"
                                        value={formatMoney(
                                          form.getValues(`cinemalineItems.${lineItemIndex}.budgetIncludesFees`)
                                            ? (parseFloat(form.getValues(`cinemalineItems.${lineItemIndex}.bursts.${burstIndex}.budget`)?.replace(/[^0-9.]/g, "") || "0") / 100) * (feecinema || 0)
                                            : (parseFloat(form.getValues(`cinemalineItems.${lineItemIndex}.bursts.${burstIndex}.budget`)?.replace(/[^0-9.]/g, "") || "0") / (100 - (feecinema || 0))) * (feecinema || 0)
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
                className="col-span-3 bg-muted focus:ring-0 pointer-events-none"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="newStationNetwork" className="text-right">
                Network
              </Label>
              <Combobox
                value={newStationNetwork}
                onValueChange={setNewStationNetwork}
                placeholder="Select Network"
                searchPlaceholder="Search networks..."
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
