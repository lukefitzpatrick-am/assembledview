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
import { Label } from "@/components/ui/label"
import { getPublishersForNewspapers, getClientInfo, getNewspapers, createNewspaper, getNewspapersAdSizes, createNewspaperAdSize } from "@/lib/api"
import { formatBurstLabel } from "@/lib/bursts"
import { LoadingDots } from "@/components/ui/loading-dots"
import { format } from "date-fns"
import { useMediaPlanContext } from "@/contexts/MediaPlanContext"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { CalendarIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { ChevronDown, Plus, Trash2, Copy } from "lucide-react"
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
  const newspaperlineItems = form.getValues("newspaperlineItems") || [];

  return newspaperlineItems.flatMap((lineItem) =>
    lineItem.bursts.map((burst) => ({
      startDate: burst.startDate,
      endDate: burst.endDate,
      budget: burst.budget,
    }))
  );
}

const newspaperburstSchema = z.object({
  budget: z.string().min(1, "Budget is required"),
  buyAmount: z.string().min(1, "Buy Amount is required"),
  startDate: z.date(),
  endDate: z.date(),
  calculatedValue: z.number().optional(),
  fee: z.number().optional(),
})

const newspaperlineItemSchema = z.object({
  network: z.string().min(1, "Network is required"),
  publisher: z.string().optional(),
  title: z.string().min(1, "Bid Strategy is required"),
  buyType: z.string().min(1, "Buy Type is required"),
  size: z.string().min(1, "Size is required"),
  format: z.string().min(1, "Format is required"),
  placement: z.string().min(1, "Placement is required"),
  buyingDemo: z.string().min(1, "Buying Demo is required"),
  market: z.string().min(1, "Market is required"),
  fixedCostMedia: z.boolean(),
  clientPaysForMedia: z.boolean(),
  budgetIncludesFees: z.boolean(),
  noadserving: z.boolean(),
  lineItemId: z.string().optional(),
  line_item_id: z.string().optional(),
  line_item: z.union([z.string(), z.number()]).optional(),
  lineItem: z.union([z.string(), z.number()]).optional(),
  bursts: z.array(newspaperburstSchema).min(1, "At least one burst is required"),
  totalMedia: z.number().optional(),
  totalDeliverables: z.number().optional(),
  totalFee: z.number().optional(),
})

const newspapersFormSchema = z.object({
  newspaperlineItems: z.array(newspaperlineItemSchema),
  overallDeliverables: z.number().optional(),
})

type NewspapersFormValues = z.infer<typeof newspapersFormSchema>

// Type definition for form values
interface Publisher {
  id: number;
  publisher_name: string;
}

interface Newspapers {
  id: number;
  title: string;
  network: string;
}

interface NewspapersAdSizes {
  id: number;
  adsize: string;
}

interface NewspapersContainerProps {
  clientId: string;
  feenewspapers: number;
  onTotalMediaChange: (totalMedia: number, totalFee: number) => void;
  onBurstsChange: (bursts: BillingBurst[]) => void;
  onInvestmentChange: (investmentByMonth: any) => void;
  onLineItemsChange: (items: LineItem[]) => void;
  onNewspaperLineItemsChange: (lineItems: any[]) => void;
  onMediaLineItemsChange: (lineItems: any[]) => void;
  campaignStartDate: Date;
  campaignEndDate: Date;
  campaignBudget: number;
  campaignId: string;
  mediaTypes: string[];
  initialLineItems?: any[];
}

export function getNewspapersBursts(
  form: UseFormReturn<NewspapersFormValues>,
  feenewspapers: number
): BillingBurst[] {
  const newspaperlineItems = form.getValues("newspaperlineItems") || []

  return newspaperlineItems.flatMap(li =>
    li.bursts.map(burst => {
      const rawBudget = parseFloat(burst.budget.replace(/[^0-9.]/g, "")) || 0

      const pct = feenewspapers || 0
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

        mediaType:          "newspapers",
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

export function calculateInvestmentPerMonth(form, feenewspapers) {
  const newspaperlineItems = form.getValues("newspaperlineItems") || [];
  let monthlyInvestment: Record<string, number> = {};

  newspaperlineItems.forEach((lineItem) => {
    lineItem.bursts.forEach((burst) => {
      const startDate = new Date(burst.startDate);
      const endDate = new Date(burst.endDate);
      const lineMedia = parseFloat(burst.budget.replace(/[^0-9.]/g, "")) || 0;
      const feePercentage = feenewspapers || 0;

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

export function calculateBurstInvestmentPerMonth(form, feenewspapers) {
  const newspaperlineItems = form.getValues("newspaperlineItems") || [];
  let monthlyInvestment: Record<string, number> = {};

  newspaperlineItems.forEach((lineItem) => {
    lineItem.bursts.forEach((burst) => {
      const startDate = new Date(burst.startDate);
      const endDate = new Date(burst.endDate);
      const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      const burstBudget = parseFloat(burst.budget.replace(/[^0-9.]/g, "")) || 0;
      const feePercentage = feenewspapers || 0;
      
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

const computeLoadedDeliverables = (buyType: string, burst: any) => {
  const budget = parseFloat(String(burst?.budget ?? "0").replace(/[^0-9.]/g, "")) || 0;
  const buyAmount = parseFloat(String(burst?.buyAmount ?? "1").replace(/[^0-9.]/g, "")) || 0;

  switch (buyType) {
    case "cpc":
    case "cpv":
    case "insertions":
      return buyAmount !== 0 ? budget / buyAmount : 0;
    case "cpm":
      return buyAmount !== 0 ? (budget / buyAmount) * 1000 : 0;
    case "fixed_cost":
    case "package":
      return 1;
    case "bonus":
      return parseFloat(String(burst?.calculatedValue ?? 0).replace(/[^0-9.]/g, "")) || 0;
    default:
      return parseFloat(String(burst?.calculatedValue ?? 0).replace(/[^0-9.]/g, "")) || 0;
  }
};

export default function NewspapersContainer({
  clientId,
  feenewspapers,
  onTotalMediaChange,
  onBurstsChange,
  onInvestmentChange,
  onLineItemsChange,
  onNewspaperLineItemsChange,
  onMediaLineItemsChange,
  campaignStartDate,
  campaignEndDate,
  campaignBudget,
  campaignId,
  mediaTypes,
  initialLineItems
}: NewspapersContainerProps) {
  // Add refs to track previous values
  const prevInvestmentRef = useRef<{ monthYear: string; amount: string }[]>([]);
  const prevBurstsRef = useRef<BillingBurst[]>([]);
  const publishersRef = useRef<Publisher[]>([]);
  const newspapersRef = useRef<Newspapers[]>([]); 
  const newspapersAdSizesRef = useRef<NewspapersAdSizes[]>([]);
  const [publishers, setPublishers] = useState<Publisher[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [newspapers, setNewspapers] = useState<Newspapers[]>([]);
  const [newspapersAdSizes, setNewspapersAdSizes] = useState<NewspapersAdSizes[]>([]);  
  const { toast } = useToast()
  const { mbaNumber } = useMediaPlanContext()
  const [overallDeliverables, setOverallDeliverables] = useState(0);
  
  // Stable ID generator for line items to keep duplicates distinct in exports
  const createLineItemId = () => {
    const base = mbaNumber || "NEWS";
    const rand =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? (crypto as any).randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
    return `${base}-${rand}`;
  };

  const [isAddNewspaperAdSizeDialogOpen, setIsAddNewspaperAdSizeDialogOpen] = useState(false);
  const [newTitleName, setNewTitleName] = useState("");
  const [newTitleNetwork, setNewTitleNetwork] = useState("");
  const [currentLineItemIndexForNewTitle, setCurrentLineItemIndexForNewTitle] = useState<number | null>(null);
  const [networksAvailable, setNetworksAvailable] = useState(true); // Assume true until fetched
  const [isAddTitleDialogOpen, setIsAddTitleDialogOpen] = useState(false);

  const [newAdSizeName, setNewAdSizeName] = useState(""); // <<< ADD THIS
  const [currentLineItemIndexForNewAdSize, setCurrentLineItemIndexForNewAdSize] = useState<number | null>(null);

  const fetchAndUpdateNewspapers = async () => {
    try {
      setIsLoading(true);
      const fetchedNewspapers = await getNewspapers(); //
      newspapersRef.current = fetchedNewspapers; //
      setNewspapers(fetchedNewspapers); //
    } catch (error) {
      toast({ //
        title: "Error refreshing Newspapers",
        description: (error as Error).message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false); //
    }
  };

const fetchAndUpdateNewspaperAdSizes = async () => {
  try {
    // setIsLoading(true); // Optional: if you want a loading state specific to this
    const fetchedAdSizes = await getNewspapersAdSizes(); //
    newspapersAdSizesRef.current = fetchedAdSizes; //
    setNewspapersAdSizes(fetchedAdSizes); //
  } catch (error) {
    toast({ //
      title: "Error refreshing Ad Sizes",
      description: (error as Error).message,
      variant: "destructive",
    });
  } finally {
    // setIsLoading(false); // Optional
  }
};

  const handleAddNewTitle = async () => {
    if (!newTitleName.trim() || !newTitleNetwork.trim()) {
      toast({ //
        title: "Missing Information",
        description: "Please provide both newspaper title and network.",
        variant: "destructive",
      });
      return;
    }

  try {
    setIsLoading(true); //
    const newNewspaperData: Omit<Newspapers, 'id'> = { //
      title: newTitleName,
      network: newTitleNetwork,
  };
  const createdNewspaper = await createNewspaper(newNewspaperData);

    toast({
      title: "Newspaper Added",
      description: `${createdNewspaper.title} has been successfully added.`,
    });
  
  await fetchAndUpdateNewspapers();

  if (currentLineItemIndexForNewTitle !== null) {
    form.setValue(`newspaperlineItems.${currentLineItemIndexForNewTitle}.network`, createdNewspaper.network); //
    form.setValue(`newspaperlineItems.${currentLineItemIndexForNewTitle}.title`, createdNewspaper.title); //
  }

  setIsAddTitleDialogOpen(false);
  setNewTitleName("");
  setNewTitleNetwork("");
  setCurrentLineItemIndexForNewTitle(null);

} catch (error) {
  toast({ //
    title: "Error Adding Newspaper",
    description: (error as Error).message,
    variant: "destructive",
  });
} finally {
  setIsLoading(false); //
}
};

// ... inside NewspapersContainer component

const handleAddNewNewspaperAdSize = async () => {
  if (!newAdSizeName.trim()) {
    toast({ //
      title: "Missing Information",
      description: "Please provide the ad size name.",
      variant: "destructive",
    });
    return;
  }

  try {
    setIsLoading(true); //
    const newAdSizeData = { adsize: newAdSizeName }; //
    const createdAdSize = await createNewspaperAdSize(newAdSizeData); //

    toast({ //
      title: "Ad Size Added",
      description: `${createdAdSize.adsize} has been successfully added.`,
    });

    await fetchAndUpdateNewspaperAdSizes(); // Refresh the list

    // If a line item context was set (i.e., adding from a specific line item),
    // update that line item's size field with the new ad size.
    if (currentLineItemIndexForNewAdSize !== null) {
      form.setValue(`newspaperlineItems.${currentLineItemIndexForNewAdSize}.size`, createdAdSize.adsize, { shouldValidate: true, shouldDirty: true }); //
      setCurrentLineItemIndexForNewAdSize(null); // Reset context
    }

    setIsAddNewspaperAdSizeDialogOpen(false); //
    setNewAdSizeName(""); // Reset input
  } catch (error) {
    toast({ //
      title: "Error Adding Ad Size",
      description: (error as Error).message,
      variant: "destructive",
    });
  } finally {
    setIsLoading(false); //
  }
};
  // Form initialization
  const form = useForm({
    resolver: zodResolver(newspapersFormSchema),
    defaultValues: {
      newspaperlineItems: [
        {
          network: "",
          title: "",
          buyType: "",
          format: "",
          placement: "",
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
    name: "newspaperlineItems",
  });

  // Watch hook
  const watchedLineItems = useWatch({ 
    control: form.control, 
    name: "newspaperlineItems",
    defaultValue: form.getValues("newspaperlineItems")
  });

  // Data loading for edit mode
  useEffect(() => {
    if (initialLineItems && initialLineItems.length > 0) {
      const transformedLineItems = initialLineItems.map((item: any, index: number) => {
        const lineItemId = item.line_item_id || item.lineItemId || `${mbaNumber || "NEWS"}-${index + 1}`;

        return {
          network: item.network || item.publisher || "",
          title: item.title || item.publication || "",
          placement: item.placement || "",
          size: item.size || "",
          format: item.format || "",
          buyType: item.buy_type || "",
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
          bursts: item.bursts_json ? (typeof item.bursts_json === 'string' ? JSON.parse(item.bursts_json) : item.bursts_json).map((burst: any) => ({
            budget: burst.budget || "",
            buyAmount: burst.buyAmount || "",
            startDate: burst.startDate ? new Date(burst.startDate) : new Date(),
            endDate: burst.endDate ? new Date(burst.endDate) : new Date(),
            calculatedValue: computeLoadedDeliverables(item.buy_type || item.buyType, burst),
            fee: burst.fee ?? 0,
          })) : [{
            budget: "",
            buyAmount: "",
            startDate: campaignStartDate || new Date(),
            endDate: campaignEndDate || new Date(),
            calculatedValue: computeLoadedDeliverables(item.buy_type || item.buyType, {}),
            fee: 0,
          }],
        };
      });

      form.reset({
        newspaperlineItems: transformedLineItems,
        overallDeliverables: 0,
      });
    }
  }, [initialLineItems, form, campaignStartDate, campaignEndDate]);

  // Transform form data to API schema format
  useEffect(() => {
    const formLineItems = watchedLineItems || [];
    
    const transformedLineItems = formLineItems.map((lineItem, index) => {
      // Calculate totalMedia from raw budget amounts (for display in MBA section)
      let totalMedia = 0;
      lineItem.bursts.forEach((burst) => {
        const budget = parseFloat(burst.budget.replace(/[^0-9.]/g, "")) || 0;
        if (lineItem.budgetIncludesFees) {
          // Budget is gross, extract media portion
          const base = budget / (1 + (feenewspapers || 0) / 100);
          totalMedia += base;
        } else {
          // Budget is net media
          totalMedia += budget;
        }
      });
      const lineItemId = lineItem.lineItemId || lineItem.line_item_id || `${mbaNumber || "NEWS"}-${index + 1}`;
      const lineNumber = lineItem.line_item ?? lineItem.lineItem ?? index + 1;

      return {
        media_plan_version: 0,
        mba_number: mbaNumber || "",
        mp_client_name: "",
        mp_plannumber: "",
        network: lineItem.network || "",
        publisher: lineItem.publisher || lineItem.network || "",
        title: lineItem.title || "",
        buy_type: lineItem.buyType || "",
        size: lineItem.size || "",
        format: lineItem.format || "",
        placement: lineItem.placement || "",
        buying_demo: lineItem.buyingDemo || "",
        market: lineItem.market || "",
        fixed_cost_media: lineItem.fixedCostMedia || false,
        client_pays_for_media: lineItem.clientPaysForMedia || false,
        budget_includes_fees: lineItem.budgetIncludesFees || false,
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
        totalMedia: totalMedia,
      };
    });

    onMediaLineItemsChange(transformedLineItems);
  }, [watchedLineItems, mbaNumber, onMediaLineItemsChange]);
  
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
          const base = budget / (1 + (feenewspapers || 0) / 100);
          lineMedia += base;
          lineFee += budget - base;
        } else {
          // Budget is net media, fee calculated on top
          lineMedia += budget;
          const fee = feenewspapers ? (budget / (100 - feenewspapers)) * feenewspapers : 0;
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
  }, [watchedLineItems, feenewspapers]);
  
  // Callback handlers
  const handleLineItemValueChange = useCallback((lineItemIndex: number) => {
    const newspaperlineItems = form.getValues("newspaperlineItems") || [];
    let overallMedia = 0;
    let overallFee = 0;
    let overallCost = 0;

    newspaperlineItems.forEach((lineItem) => {
      let lineMedia = 0;
      let lineFee = 0;
      let lineDeliverables = 0;

      lineItem.bursts.forEach((burst) => {
        const budget = parseFloat(burst?.budget?.replace(/[^0-9.]/g, "") || "0");
        lineMedia += budget;
        lineDeliverables += burst?.calculatedValue || 0;
      });

      lineFee = feenewspapers ? (lineMedia / (100 - feenewspapers)) * feenewspapers : 0;
      overallMedia += lineMedia;
      overallFee += lineFee;
      overallCost += lineMedia + lineFee;
    });

    setOverallDeliverables(overallMedia);
    onTotalMediaChange(overallMedia, overallFee);
  }, [form, feenewspapers, onTotalMediaChange]);

  const handleDuplicateLineItem = useCallback((lineItemIndex: number) => {
    const items = form.getValues("newspaperlineItems") || [];
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
    const baseLineItem = source.line_item ?? source.lineItem;
    const normalizedLineItemNumber: number =
      typeof baseLineItem === "string"
        ? Number.parseFloat(baseLineItem) || 0
        : baseLineItem ?? lineItemIndex + 1;
    const nextLineItemNumber = normalizedLineItemNumber + 1;

    const clone = {
      ...source,
      lineItemId: newId,
      line_item_id: newId,
      line_item: nextLineItemNumber,
      lineItem: nextLineItemNumber,
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

  const handleBuyTypeChange = useCallback(
    (lineItemIndex: number, value: string) => {
      form.setValue(`newspaperlineItems.${lineItemIndex}.buyType`, value);

      if (value === "bonus") {
        const currentBursts =
          form.getValues(`newspaperlineItems.${lineItemIndex}.bursts`) || [];
        const zeroedBursts = currentBursts.map((burst: any) => ({
          ...burst,
          budget: "0",
          buyAmount: "0",
          calculatedValue: burst.calculatedValue ?? 0,
        }));

        form.setValue(
          `newspaperlineItems.${lineItemIndex}.bursts`,
          zeroedBursts,
          { shouldDirty: true }
        );
      }

      handleLineItemValueChange(lineItemIndex);
    },
    [form, handleLineItemValueChange]
  );

  const handleValueChange = useCallback((lineItemIndex: number, burstIndex: number) => {
    const burst = form.getValues(`newspaperlineItems.${lineItemIndex}.bursts.${burstIndex}`);
    const budget = parseFloat(burst?.budget?.replace(/[^0-9.]/g, "") || "0");
    const buyAmount = parseFloat(burst?.buyAmount?.replace(/[^0-9.]/g, "") || "1");
    const buyType = form.getValues(`newspaperlineItems.${lineItemIndex}.buyType`);

    let calculatedValue = 0;
    switch (buyType) {
      case "cpc":
      case "cpv":
      case "insertions":
        calculatedValue = buyAmount !== 0 ? budget / buyAmount : 0;
        break;
      case "cpm":
        calculatedValue = buyAmount !== 0 ? (budget / buyAmount) * 1000 : 0;
        break;
      case "fixed_cost":
      case "package":
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
    const currentValue = form.getValues(`newspaperlineItems.${lineItemIndex}.bursts.${burstIndex}.calculatedValue`);
    if (currentValue !== calculatedValue && !isNaN(calculatedValue)) {
      form.setValue(`newspaperlineItems.${lineItemIndex}.bursts.${burstIndex}.calculatedValue`, calculatedValue, {
        shouldValidate: false, // Changed to false to prevent validation loops
        shouldDirty: false,    // Changed to false to prevent dirty state loops
      });

      handleLineItemValueChange(lineItemIndex);
    }
  }, [form, handleLineItemValueChange]);

  const handleAppendBurst = useCallback((lineItemIndex: number) => {
    const currentBursts = form.getValues(`newspaperlineItems.${lineItemIndex}.bursts`) || [];
    
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
    
    form.setValue(`newspaperlineItems.${lineItemIndex}.bursts`, [
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
    const currentBursts = form.getValues(`newspaperlineItems.${lineItemIndex}.bursts`) || [];

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

    form.setValue(`newspaperlineItems.${lineItemIndex}.bursts`, [
      ...currentBursts,
      duplicatedBurst,
    ]);

    handleLineItemValueChange(lineItemIndex);
  }, [form, handleLineItemValueChange, toast]);

  const handleRemoveBurst = useCallback((lineItemIndex: number, burstIndex: number) => {
    const currentBursts = form.getValues(`newspaperlineItems.${lineItemIndex}.bursts`) || [];
    form.setValue(
      `newspaperlineItems.${lineItemIndex}.bursts`,
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
      case "package":
        return "Package";
      case "insertions":
        return "Insertions";
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
  // It's good practice to rename this function if it's fetching more than just publishers
  const fetchInitialData = async () => {
    setIsLoading(true); // Set loading state at the beginning of fetches
    try {
      // Fetch Publishers
      if (publishersRef.current.length === 0) {
        const fetchedPublishers = await getPublishersForNewspapers();
        publishersRef.current = fetchedPublishers;
        setPublishers(fetchedPublishers);
      } else {
        setPublishers(publishersRef.current);
      }

      // Fetch Newspapers (for Titles dropdown)
      // Using your existing fetchAndUpdateNewspapers function
      if (newspapersRef.current.length === 0) {
        // This function handles its own setIsLoading, which is slightly redundant here
        // but okay for now. Consider centralizing isLoading for initial batch fetches in future.
        await fetchAndUpdateNewspapers();
      } else {
        setNewspapers(newspapersRef.current);
      }
      
      // Fetch Newspaper Ad Sizes (for Ad Size dropdown)
      // Using your existing fetchAndUpdateNewspaperAdSizes function
      if (newspapersAdSizesRef.current.length === 0) {
        // fetchAndUpdateNewspaperAdSizes in your file doesn't manage isLoading,
        // so the main isLoading state from this useEffect will cover it.
        await fetchAndUpdateNewspaperAdSizes();
      } else {
        setNewspapersAdSizes(newspapersAdSizesRef.current);
      }

    } catch (error) {
      toast({
        title: "Error loading initial data", // More generic title
        description: (error as Error).message, // Ensure error is cast to Error type
        variant: "destructive",
      });
    } finally {
      setIsLoading(false); // Set loading state to false after all fetches complete or fail
    }
  };

  fetchInitialData(); // Call the updated function
}, [clientId, toast]); // Dependencies remain the same
  
  // report raw totals (ignoring clientPaysForMedia) for MBA-Details
useEffect(() => {
  onTotalMediaChange(
    overallTotals.overallMedia,
    overallTotals.overallFee
  )
}, [overallTotals.overallMedia, overallTotals.overallFee, onTotalMediaChange]) // Added missing dependency

useEffect(() => {
  // convert each form lineItem into the shape needed for Excel
  const calculatedBursts = getNewspapersBursts(form, feenewspapers || 0);
  let burstIndex = 0;

  const items: LineItem[] = form.getValues('newspaperlineItems').flatMap((lineItem, lineItemIndex) =>
    lineItem.bursts.map(burst => {
      const computedBurst = calculatedBursts[burstIndex++];
      const mediaAmount = computedBurst
        ? computedBurst.mediaAmount
        : parseFloat(String(burst.budget).replace(/[^0-9.-]+/g, "")) || 0;
      let lineItemId = lineItem.lineItemId || lineItem.line_item_id;
      if (!lineItemId) {
        lineItemId = createLineItemId();
        form.setValue(`newspaperlineItems.${lineItemIndex}.lineItemId`, lineItemId);
        form.setValue(`newspaperlineItems.${lineItemIndex}.line_item_id`, lineItemId);
      }
      const lineNumber = lineItem.line_item ?? lineItem.lineItem ?? lineItemIndex + 1;

      return {
        market: lineItem.market || "",                                // or fixed value
        network: lineItem.network,
        title: lineItem.title,
        size: lineItem.size,
        placement: lineItem.placement || "",
        buyingDemo: lineItem.buyingDemo || "",
        fixedCostMedia: lineItem.fixedCostMedia || false,
        clientPaysForMedia: lineItem.clientPaysForMedia || false,
        budgetIncludesFees: lineItem.budgetIncludesFees || false,
        startDate: formatDateString(burst.startDate),
        endDate:   formatDateString(burst.endDate),
        deliverables: burst.calculatedValue ?? 0,
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
}, [watchedLineItems, feenewspapers, onLineItemsChange]);

// Add new useEffect to capture raw newspaper line items data
useEffect(() => {
  const rawLineItems = watchedLineItems || [];
  onNewspaperLineItemsChange(rawLineItems);
}, [watchedLineItems, onNewspaperLineItemsChange]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      const investmentByMonth = calculateInvestmentPerMonth(form, feenewspapers || 0);
      const bursts = getNewspapersBursts(form, feenewspapers || 0);
      
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
  }, [watchedLineItems, feenewspapers, onInvestmentChange, onBurstsChange]); // Added missing dependencies

  const getBursts = () => {
    const formLineItems = form.getValues("newspaperlineItems") || [];
    return formLineItems.flatMap(item =>
      item.bursts.map(burst => {
        const budget = parseFloat(burst.budget?.replace(/[^0-9.]/g, "") || "0");
        let mediaAmount = 0;
        let feeAmount = 0;

        if (item.budgetIncludesFees && item.clientPaysForMedia) {
          // Both true: budget is gross, extract fee only, mediaAmount = 0
          // Media = 0
          // Fees = Budget * (Fee / 100)
          feeAmount = budget * ((feenewspapers || 0) / 100);
          mediaAmount = 0;
        } else if (item.budgetIncludesFees) {
          // Only budgetIncludesFees: budget is gross, split into media and fee
          const base = budget / (1 + (feenewspapers || 0)/100);
          feeAmount = budget - base;
          mediaAmount = base;
        } else if (item.clientPaysForMedia) {
          // Only clientPaysForMedia: budget is net media, only fee is billed
          feeAmount = (budget / (100 - (feenewspapers || 0))) * (feenewspapers || 0);
          mediaAmount = 0;
        } else {
          // Neither: budget is net media, fee calculated on top
          mediaAmount = budget;
          feeAmount = (budget * (feenewspapers || 0)) / 100;
        }

        const billingBurst: BillingBurst = {
          startDate: burst.startDate,
          endDate: burst.endDate,
          mediaAmount: mediaAmount,
          feeAmount: feeAmount,
          totalAmount: mediaAmount + feeAmount,
          mediaType: 'newspapers',
          feePercentage: feenewspapers,
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
            <CardTitle className="pt-4 border-t font-bold text-lg flex justify-between">Newspapers Media</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {overallTotals.lineItemTotals.map((item) => (
              <div key={item.index} className="flex justify-between border-b pb-2">
                <span className="font-medium">Line Item {item.index}</span>
                <div className="flex space-x-4">
                  <span>
                    {getDeliverablesLabel(form.watch(`newspaperlineItems.${item.index - 1}.buyType`))}: {item.deliverables.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </span>
                  <span>Media: ${item.media.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                  <span>Fee: ${item.fee.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                  <span>Total Cost: ${item.totalCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
              </div>
            ))}
  
            {/* Overall Totals */}
            <div className="pt-4 border-t font-medium flex justify-between">
              <span>Newspapers Media Totals:</span>
              <div className="flex space-x-4">
                <span>Media: ${overallTotals.overallMedia.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                <span>Fees ({feenewspapers}%): ${overallTotals.overallFee.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
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
                  const sectionId = `newspaper-line-item-${lineItemIndex}`;
                  const burstsId = `${sectionId}-bursts`;
                  const footerId = `${sectionId}-footer`;
                  const getTotals = (lineItemIndex: number) => {
                    const lineItem = form.watch(`newspaperlineItems.${lineItemIndex}`);
                    let totalMedia = 0;
                    let totalCalculatedValue = 0;

                    lineItem.bursts.forEach((burst) => {
                      const budget = parseFloat(burst.budget.replace(/[^0-9.]/g, "")) || 0;
                      totalMedia += budget;
                      totalCalculatedValue += burst.calculatedValue || 0;
                    });

                    return { totalMedia, totalCalculatedValue };
                  };

                  const selectedNetwork = form.watch(`newspaperlineItems.${lineItemIndex}.network`);

                  // const selectedNetwork = form.watch(`televisionlineItems.${lineItemIndex}.network`); // Already exists above

                  let filteredNewspapers;
                  if (!selectedNetwork) {
                    filteredNewspapers = newspapers; // Show all newspapers if no network is selected
                  } else {
                    filteredNewspapers = newspapers.filter(newspaper => newspaper.network === selectedNetwork);
                  }

                  const { totalMedia, totalCalculatedValue } = getTotals(lineItemIndex);

                  return (
                    <Card key={field.id} className="space-y-6">
                      <CardHeader className="pb-2">
                        <div className="flex justify-between items-center">
                          <div className="flex items-center space-x-2">
                            <CardTitle className="text-lg font-medium">Newspapers Line Item {lineItemIndex + 1}</CardTitle>
                            <div className="text-sm text-muted-foreground">ID: {`${mbaNumber}NP${lineItemIndex + 1}`}</div>
                          </div>
                          <div className="flex items-center space-x-2">
                            <div className="text-sm font-medium">
                              Total: {new Intl.NumberFormat('en-US', {
                                style: 'currency',
                                currency: 'USD',
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2
                              }).format(
                                form.watch(`newspaperlineItems.${lineItemIndex}.budgetIncludesFees`)
                                  ? totalMedia
                                  : totalMedia + (totalMedia / (100 - (feenewspapers || 0))) * (feenewspapers || 0)
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
                            <span className="font-medium">Network:</span> {form.watch(`newspaperlineItems.${lineItemIndex}.network`) || 'Not selected'}
                          </div>
                          <div>
                            <span className="font-medium">Buy Type:</span> {formatBuyTypeForDisplay(form.watch(`newspaperlineItems.${lineItemIndex}.buyType`))}
                          </div>
                          <div>
                            <span className="font-medium">Title:</span> {form.watch(`newspaperlineItems.${lineItemIndex}.title`) || 'Not selected'}
                          </div>
                          <div>
                            <span className="font-medium">Bursts:</span> {form.watch(`newspaperlineItems.${lineItemIndex}.bursts`, []).length}
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
                                name={`newspaperlineItems.${lineItemIndex}.network`}
                                render={({ field }) => (
                                  <FormItem className="flex items-center space-x-2">
                                    <FormLabel className="w-24 text-sm">Network</FormLabel>
                                    <Select onValueChange={field.onChange} value={field.value}>
                                      <FormControl>
                                        <SelectTrigger className="h-9 w-full flex-1 rounded-md border">
                                          <SelectValue placeholder="Select" />
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
                                    name={`newspaperlineItems.${lineItemIndex}.title`}
                                    render={({ field }) => (
                                      <FormItem className="flex items-center space-x-2">
                                        <FormLabel className="w-24 text-sm">Title</FormLabel>
                                        <div className="flex-1 flex items-center space-x-1">
                                          <Select
                                            onValueChange={field.onChange}
                                            value={field.value} // Ensure value is controlled
                                            disabled={!selectedNetwork} // Disable if no network is selected
                                          >
                                            <FormControl>
                                              <SelectTrigger className="h-9 w-full rounded-md border">
                                                <SelectValue placeholder={selectedNetwork ? "Select Title" : "Select Network first"} />
                                              </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                              {filteredNewspapers.length > 0 ? (
                                                filteredNewspapers.map((newspaper) => ( //
                                                  <SelectItem 
                                                  key={newspaper.id} 
                                                  value={newspaper.title || `title-${newspaper.id}`} // Guard against empty string
                                                >
                                                  {newspaper.title}
                                                  </SelectItem>
                                                ))
                                              ) : (
                                                selectedNetwork && ( <div className="p-2 text-sm text-muted-foreground text-center">
                                                No titles found for "{selectedNetwork}".<br />
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
                                                const currentNetworkInForm = form.watch(`newspaperlineItems.${lineItemIndex}.network`); //
                                                if (!currentNetworkInForm) {
                                                  toast({ //
                                                    title: "Select a Title First",
                                                    description: "Please select a network before adding a title.",
                                                    variant: "default", 
                                                  });
                                                  return;
                                                }
                                                setCurrentLineItemIndexForNewTitle(lineItemIndex); //
                                                setNewTitleName(""); //
                                                setNewTitleNetwork(currentNetworkInForm); //
                                                setIsAddTitleDialogOpen(true); //
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
                                name={`newspaperlineItems.${lineItemIndex}.buyType`}
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
                                        <SelectItem value="insertions">Insertions</SelectItem>
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

                            {/* Column 2 - Placement and Buying Demo */}
                            <div className="space-y-4">
                              <FormItem className="flex items-center space-x-2"> 
                                <FormLabel className="block text-sm mb-1 self-start mt-4">Placement</FormLabel>
                                <FormControl>
                                  <Textarea
                                    {...form.register(`newspaperlineItems.${lineItemIndex}.placement`)}
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
                                    {...form.register(`newspaperlineItems.${lineItemIndex}.buyingDemo`)}
                                    placeholder="Enter buying demo details"
                                    className="w-full min-h-0 h-10 text-sm rounded-md border"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            </div>

                            {/* Column 3 - Creative */}
                            <div className="space-y-4">
  <FormField
    control={form.control}
    name={`newspaperlineItems.${lineItemIndex}.size`} // Ad Size field
    render={({ field }) => (
      <FormItem className="flex items-center space-x-2">
        <FormLabel className="w-24 text-sm self-start mt-2.5">Ad Size</FormLabel>
        <div className="flex-1 flex items-center space-x-1">
          <Select
            onValueChange={field.onChange}
            value={field.value}
          >
            <FormControl>
              <SelectTrigger className="h-9 w-full rounded-md border">
                <SelectValue placeholder="Select Ad Size" />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              {newspapersAdSizes.length > 0 ? (
                newspapersAdSizes.map((adSize) => (
                  <SelectItem
                    key={adSize.id}
                    value={adSize.adsize || `adsize-${adSize.id}`} // Guard against empty string
                  >
                    {adSize.adsize}
                  </SelectItem>
                ))
              ) : (
                <div className="p-2 text-sm text-muted-foreground text-center">
                  No ad sizes found. Click the <PlusCircle className="inline h-4 w-4 mx-1 text-blue-500" /> icon to add one.
                </div>
              )}
            </SelectContent>
          </Select>
          <Button
            variant="ghost"
            size="sm"
            className="p-1 h-auto"
            onClick={() => {
              setCurrentLineItemIndexForNewAdSize(lineItemIndex); // Set context for which line item
              setNewAdSizeName(""); // Clear previous input
              setIsAddNewspaperAdSizeDialogOpen(true); // Open the dialog
            }}
          >
            <PlusCircle className="h-5 w-5 text-blue-500" />
          </Button>
        </div>
        <FormMessage />
      </FormItem>
    )}
  />

                              <FormItem className="flex items-center space-x-2">
                                <FormLabel className="block text-sm mb-1">Market</FormLabel>
                                <FormControl>
                                  <Textarea
                                    {...form.register(`newspaperlineItems.${lineItemIndex}.market`)}
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
                                  name={`newspaperlineItems.${lineItemIndex}.fixedCostMedia`}
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
                                  name={`newspaperlineItems.${lineItemIndex}.clientPaysForMedia`}
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
                                  name={`newspaperlineItems.${lineItemIndex}.budgetIncludesFees`}
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
                        {form.watch(`newspaperlineItems.${lineItemIndex}.bursts`, []).map((burstField, burstIndex) => {
                          const buyType = form.watch(`newspaperlineItems.${lineItemIndex}.buyType`);
                          return (
                            <Card key={`${lineItemIndex}-${burstIndex}`} className="border border-gray-200 bg-muted/30 mx-2">
                              <CardContent className="py-2 px-4">
                                <div className="flex items-center gap-3">
                                  <div className="w-24 flex-shrink-0">
                                    <h4 className="text-sm font-medium">
                                      {formatBurstLabel(
                                        burstIndex + 1,
                                        form.watch(`newspaperlineItems.${lineItemIndex}.bursts.${burstIndex}.startDate`),
                                        form.watch(`newspaperlineItems.${lineItemIndex}.bursts.${burstIndex}.endDate`)
                                      )}
                                    </h4>
                                  </div>
                                  
                                  <div className="grid grid-cols-7 gap-3 items-center flex-grow">
                                    <FormField
                                      control={form.control}
                                      name={`newspaperlineItems.${lineItemIndex}.bursts.${burstIndex}.budget`}
                                      render={({ field }) => (
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
                                      )}
                                    />

                                    <FormField
                                      control={form.control}
                                      name={`newspaperlineItems.${lineItemIndex}.bursts.${burstIndex}.buyAmount`}
                                      render={({ field }) => (
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
                                      )}
                                    />

                                    <div className="grid grid-cols-2 gap-2 col-span-2">
                                      <FormField
                                        control={form.control}
                                        name={`newspaperlineItems.${lineItemIndex}.bursts.${burstIndex}.startDate`}
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
                                        name={`newspaperlineItems.${lineItemIndex}.bursts.${burstIndex}.endDate`}
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
                                      name={`newspaperlineItems.${lineItemIndex}.bursts.${burstIndex}.calculatedValue`}
                                      render={({ field }) => {
                                        const buyTypeWatch = useWatch({
                                          control: form.control,
                                          name: `newspaperlineItems.${lineItemIndex}.buyType`,
                                        });
                                        const budgetValue = useWatch({
                                          control: form.control,
                                          name: `newspaperlineItems.${lineItemIndex}.bursts.${burstIndex}.budget`,
                                        });
                                        const buyAmountValue = useWatch({
                                          control: form.control,
                                          name: `newspaperlineItems.${lineItemIndex}.bursts.${burstIndex}.buyAmount`,
                                        });

                                        const calculatedValue = useMemo(() => {
                                          const budget = parseFloat(
                                            String(budgetValue)?.replace(/[^0-9.]/g, "") || "0"
                                          );
                                          const buyAmount = parseFloat(
                                            String(buyAmountValue)?.replace(/[^0-9.]/g, "") || "1"
                                          );

                                          switch (buyTypeWatch) {
                                            case "cpc":
                                            case "insertions":
                                            case "cpv":
                                              return buyAmount !== 0 ? budget / buyAmount : "0";
                                            case "cpm":
                                              return buyAmount !== 0 ? (budget / buyAmount) * 1000 : "0";
                                            case "fixed_cost":
                                            case "package":
                                              return "1";
                                            default:
                                              return "0";
                                          }
                                        }, [budgetValue, buyAmountValue, buyTypeWatch]);

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
                                          case "package":
                                            title = "Package";
                                            break;
                                          case "insertions":
                                            title = "Insertions";
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
                                          form.watch(`newspaperlineItems.${lineItemIndex}.budgetIncludesFees`)
                                            ? (parseFloat(form.watch(`newspaperlineItems.${lineItemIndex}.bursts.${burstIndex}.budget`)?.replace(/[^0-9.]/g, "") || "0") / 100) * (100 - (feenewspapers || 0))
                                            : parseFloat(form.watch(`newspaperlineItems.${lineItemIndex}.bursts.${burstIndex}.budget`)?.replace(/[^0-9.]/g, "") || "0")
                                        )}
                                        readOnly
                                      />
                                    </div>
                                    <div className="space-y-1">
                                      <FormLabel className="text-xs leading-tight">Fee ({feenewspapers}%)</FormLabel>
                                      <Input
                                        type="text"
                                        className="w-full h-10 text-sm"
                                        value={new Intl.NumberFormat("en-US", {
                                          style: "currency",
                                          currency: "USD",
                                          minimumFractionDigits: 2,
                                          maximumFractionDigits: 2,
                                        }).format(
                                          form.watch(`newspaperlineItems.${lineItemIndex}.budgetIncludesFees`)
                                            ? (parseFloat(form.watch(`newspaperlineItems.${lineItemIndex}.bursts.${burstIndex}.budget`)?.replace(/[^0-9.]/g, "") || "0") / 100) * (feenewspapers || 0)
                                            : (parseFloat(form.watch(`newspaperlineItems.${lineItemIndex}.bursts.${burstIndex}.budget`)?.replace(/[^0-9.]/g, "") || "0") / (100 - (feenewspapers || 0))) * (feenewspapers || 0)
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
                                title: "",
                                buyType: "",
                                format: "",
                                size: "",
                                placement: "",
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
      {/* Add Title Dialog */}
<Dialog open={isAddTitleDialogOpen} onOpenChange={setIsAddTitleDialogOpen}>
  <DialogContent className="sm:max-w-[425px]">
    <DialogHeader>
      <DialogTitle>Add New Newspaper Title</DialogTitle>
      <DialogDescription>
        Enter the details for the new Newspaper title.
      </DialogDescription>
    </DialogHeader>
    <div className="grid gap-4 py-4">
    <div className="grid grid-cols-4 items-center gap-4">
        <Label htmlFor="dialogDisplayNetworkName" className="text-right">
          Network
        </Label>
        <Input
          id="dialogDisplayNetworkName"
          value={newTitleNetwork} // This is pre-filled from the line item
          readOnly
          className="col-span-3 bg-gray-100 focus:ring-0 pointer-events-none" // Style to indicate read-only
        />
      </div>
      <div className="grid grid-cols-4 items-center gap-4">
        <Label htmlFor="newTitleNetwork" className="text-right">
          Network
        </Label>
        {/* Assuming 'publishers' contains the list of available networks */}
        <Select
          value={newTitleNetwork}
          onValueChange={setNewTitleNetwork}
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
        <Label htmlFor="newTitleName" className="text-right">
          Title Name
        </Label>
        <Input
          id="newTitleName"
          value={newTitleName}
          onChange={(e) => setNewTitleName(e.target.value)}
          className="col-span-3"
          placeholder="e.g., The Age"
        />
      </div>
    </div>
    <DialogFooter>
      <Button type="button" variant="outline" onClick={() => setIsAddTitleDialogOpen(false)}>Cancel</Button>
      <Button type="button" onClick={handleAddNewTitle} disabled={isLoading}>
        {isLoading ? "Adding..." : "Add Title"}
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>

<Dialog open={isAddNewspaperAdSizeDialogOpen} onOpenChange={setIsAddNewspaperAdSizeDialogOpen}>
  <DialogContent className="sm:max-w-[425px]">
    <DialogHeader>
      <DialogTitle>Add New Newspaper Ad Size</DialogTitle>
      <DialogDescription>
        Enter the name for the new newspaper ad size.
      </DialogDescription>
    </DialogHeader>
    <div className="grid gap-4 py-4">
      <div className="grid grid-cols-4 items-center gap-4">
        <Label htmlFor="newAdSizeName" className="text-right">
          Ad Size
        </Label>
        <Input
          id="newAdSizeName"
          value={newAdSizeName}
          onChange={(e) => setNewAdSizeName(e.target.value)}
          className="col-span-3"
          placeholder="e.g., Full Page, 15x2"
        />
      </div>
    </div>
    <DialogFooter>
      <Button type="button" variant="outline" onClick={() => setIsAddNewspaperAdSizeDialogOpen(false)}>Cancel</Button>
      <Button type="button" onClick={handleAddNewNewspaperAdSize} disabled={isLoading}>
        {isLoading ? "Adding..." : "Add Ad Size"}
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
    </div>
  );
}