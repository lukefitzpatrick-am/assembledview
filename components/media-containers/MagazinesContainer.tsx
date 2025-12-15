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
import { getPublishersForMagazines, getClientInfo, getMagazinesAdSizes, createMagazineAdSize, getMagazines, createMagazine, getNewspapers, getNewspapersAdSizes, createNewspaper, createNewspaperAdSize } from "@/lib/api"
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
  const lineItems = form.getValues("lineItems") || [];

  return lineItems.flatMap((lineItem) =>
    lineItem.bursts.map((burst) => ({
      startDate: burst.startDate,
      endDate: burst.endDate,
      budget: burst.budget,
    }))
  );
}

const magazinesburstSchema = z.object({
  budget: z.string().min(1, "Budget is required"),
  buyAmount: z.string().min(1, "Buy Amount is required"),
  startDate: z.date(),
  endDate: z.date(),
  calculatedValue: z.number().optional(),
  fee: z.number().optional(),
})

const magazineslineItemSchema = z.object({
  network: z.string().min(1, "Network is required"),
  title: z.string().min(1, "Title is required"),
  buyType: z.string().min(1, "Buy Type is required"),
  size: z.string().min(1, "Size is required"),
  placement: z.string().default(""),
  buyingDemo: z.string().default(""),
  market: z.string().default(""),
  fixedCostMedia: z.boolean().default(false),
  clientPaysForMedia: z.boolean().default(false),
  budgetIncludesFees: z.boolean().default(false),
  noadserving: z.boolean().default(false),
  bursts: z.array(magazinesburstSchema).min(1, "At least one burst is required"),
  totalMedia: z.number().optional(),
  totalDeliverables: z.number().optional(),
  totalFee: z.number().optional(),
})

const magazinesFormSchema = z.object({
  magazineslineItems: z.array(magazineslineItemSchema),
  overallDeliverables: z.number().optional(),
})

type MagazinesFormValues = z.infer<typeof magazinesFormSchema>

interface Publisher {
  id: number;
  publisher_name: string;
}

interface Magazines {
  id: number;
  title: string;
  network: string;
}

interface MagazinesAdSizes {
  id: number;
  adsize: string;
}

interface MagazinesContainerProps {
  clientId: string;
  feemagazines: number;
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

export function getMagazinesBursts(
  form: UseFormReturn<MagazinesFormValues>,
  feemagazines: number
): BillingBurst[] {
  const lineItems = form.getValues("magazineslineItems") || []

  return lineItems.flatMap(li =>
    li.bursts.map(burst => {
      let mediaAmount = parseFloat(
        burst.budget.replace(/[^0-9.]/g, "")
      ) || 0

      const pct = feemagazines || 0
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

        mediaType:          "magazines",
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

export function calculateInvestmentPerMonth(form, feemagazines) {
  const magazineslineItems = form.getValues("magazineslineItems") || [];
  let monthlyInvestment: Record<string, number> = {};

  magazineslineItems.forEach((lineItem) => {
    lineItem.bursts.forEach((burst) => {
      const startDate = new Date(burst.startDate);
      const endDate = new Date(burst.endDate);
      const lineMedia = parseFloat(burst.budget.replace(/[^0-9.]/g, "")) || 0;
      const feePercentage = feemagazines || 0;

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

export function calculateBurstInvestmentPerMonth(form, feemagazines) {
  const magazineslineItems = form.getValues("magazineslineItems") || [];
  let monthlyInvestment: Record<string, number> = {};

  magazineslineItems.forEach((lineItem) => {
    lineItem.bursts.forEach((burst) => {
      const startDate = new Date(burst.startDate);
      const endDate = new Date(burst.endDate);
      const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      const burstBudget = parseFloat(burst.budget.replace(/[^0-9.]/g, "")) || 0;
      const feePercentage = feemagazines || 0;
      
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

export default function MagazinesContainer({
  clientId,
  feemagazines,
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
}: MagazinesContainerProps) {
  // Add refs to track previous values
  const prevInvestmentRef = useRef<{ monthYear: string; amount: string }[]>([]);
  const prevBurstsRef = useRef<BillingBurst[]>([]);
  const publishersRef = useRef<Publisher[]>([]);
  const magazinesRef = useRef<Magazines[]>([]);
  const magazinesAdSizesRef = useRef<MagazinesAdSizes[]>([]);
  const [publishers, setPublishers] = useState<Publisher[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [magazines, setMagazines] = useState<Magazines[]>([])
  const [magazinesAdSizes, setMagazinesAdSizes] = useState<MagazinesAdSizes[]>([])
  const { toast } = useToast()
  const { mbaNumber } = useMediaPlanContext()
  const [overallDeliverables, setOverallDeliverables] = useState(0);

  const [isAddMagazinesAdSizeDialogOpen, setIsAddMagazinesAdSizeDialogOpen] = useState(false);
  const [newTitleName, setNewTitleName] = useState("");
  const [newTitleNetwork, setNewTitleNetwork] = useState("");
  const [currentLineItemIndexForNewTitle, setCurrentLineItemIndexForNewTitle] = useState<number | null>(null);
  const [isAddTitleDialogOpen, setIsAddTitleDialogOpen] = useState(false);
  
  const [newAdSizeName, setNewAdSizeName] = useState("");
  const [currentLineItemIndexForNewAdSize, setCurrentLineItemIndexForNewAdSize] = useState<number | null>(null);

  const fetchAndUpdateMagazines = async () => {
    try {
      setIsLoading(true);
      const fetchedMagazines = await getMagazines(); //
      magazinesRef.current = fetchedMagazines; //
      setMagazines(fetchedMagazines); //
    } catch (error) {
      toast({ //
        title: "Error refreshing Magazines",
        description: (error as Error).message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false); //
    }
  };

const fetchAndUpdateMagazinesAdSizes = async () => {
  try {
    // setIsLoading(true); // Optional: if you want a loading state specific to this
    const fetchedAdSizes = await getMagazinesAdSizes(); //
    magazinesAdSizesRef.current = fetchedAdSizes; //
    setMagazinesAdSizes(fetchedAdSizes); //
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
    const newMagazinesData: Omit<Magazines, 'id'> = { //
      title: newTitleName,
      network: newTitleNetwork,
  };
  const createdMagazines = await createMagazine(newMagazinesData);

    toast({
      title: "Magazine Added",
      description: `${createdMagazines.title} has been successfully added.`,
    });
  
  await fetchAndUpdateMagazines();

  if (currentLineItemIndexForNewTitle !== null) {
    form.setValue(`magazineslineItems.${currentLineItemIndexForNewTitle}.network`, createdMagazines.network); //
    form.setValue(`magazineslineItems.${currentLineItemIndexForNewTitle}.title`, createdMagazines.title); //
  }

  setIsAddTitleDialogOpen(false);
  setNewTitleName("");
  setNewTitleNetwork("");
  setCurrentLineItemIndexForNewTitle(null);

} catch (error) {
  toast({ //
    title: "Error Adding Magazine",
    description: (error as Error).message,
    variant: "destructive",
  });
} finally {
  setIsLoading(false); //
}
};

// ... inside NewspapersContainer component

const handleAddNewMagazinesAdSize = async () => {
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
    const createdAdSize = await createMagazineAdSize(newAdSizeData); //

    toast({ //
      title: "Ad Size Added",
      description: `${createdAdSize.adsize} has been successfully added.`,
    });

    await fetchAndUpdateMagazinesAdSizes(); // Refresh the list

    // If a line item context was set (i.e., adding from a specific line item),
    // update that line item's size field with the new ad size.
    if (currentLineItemIndexForNewAdSize !== null) {
      form.setValue(`magazineslineItems.${currentLineItemIndexForNewAdSize}.size`, createdAdSize.adsize, { shouldValidate: true, shouldDirty: true }); //
      setCurrentLineItemIndexForNewAdSize(null); // Reset context
    }

    setIsAddTitleDialogOpen(false); //
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
  // @ts-ignore - Type mismatch between form and schema
  const form = useForm({
    resolver: zodResolver(magazinesFormSchema),
    defaultValues: {
      magazineslineItems: [
        {
          network: "",
          title: "",
          buyType: "",
          size: "",
          placement: "",
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
    name: "magazineslineItems",
  });

  const handleDuplicateLineItem = useCallback((lineItemIndex: number) => {
    const items = form.getValues("magazineslineItems") || [];
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
    name: "magazineslineItems",
    defaultValue: form.getValues("magazineslineItems")
  });

  // Data loading for edit mode
  useEffect(() => {
    if (initialLineItems && initialLineItems.length > 0) {
      const transformedLineItems = initialLineItems.map((item: any) => ({
        network: item.network || item.publisher || "",
        title: item.title || item.publication || "",
        placement: item.placement || "",
        size: item.size || "",
        buyType: item.buy_type || "",
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
        })) : [{
          budget: "",
          buyAmount: "",
          startDate: campaignStartDate || new Date(),
          endDate: campaignEndDate || new Date(),
        }],
      }));

      form.reset({
        magazineslineItems: transformedLineItems,
        overallDeliverables: 0,
      });
    }
  }, [initialLineItems, form, campaignStartDate, campaignEndDate]);

  // Transform form data to API schema format
  useEffect(() => {
    const formLineItems = form.getValues('magazineslineItems') || [];
    
    const transformedLineItems = formLineItems.map((lineItem, index) => {
      // Calculate totalMedia from raw budget amounts (for display in MBA section)
      let totalMedia = 0;
      lineItem.bursts.forEach((burst) => {
        const budget = parseFloat(burst.budget.replace(/[^0-9.]/g, "")) || 0;
        if (lineItem.budgetIncludesFees) {
          // Budget is gross, extract media portion
          const base = budget / (1 + (feemagazines || 0) / 100);
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
        network: lineItem.network || "",
        publisher: lineItem.publisher || lineItem.network || "",
        title: lineItem.title || "",
        buy_type: lineItem.buyType || "",
        size: lineItem.size || "",
        format: "",
        placement: lineItem.placement || "",
        buying_demo: lineItem.buyingDemo || "",
        market: lineItem.market || "",
        fixed_cost_media: lineItem.fixedCostMedia || false,
        client_pays_for_media: lineItem.clientPaysForMedia || false,
        budget_includes_fees: lineItem.budgetIncludesFees || false,
        line_item_id: `${mbaNumber || 'MAG'}${index + 1}`,
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
          const base = budget / (1 + (feemagazines || 0) / 100);
          lineMedia += base;
          lineFee += budget - base;
        } else {
          // Budget is net media, fee calculated on top
          lineMedia += budget;
          const fee = feemagazines ? (budget / (100 - feemagazines)) * feemagazines : 0;
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
  }, [watchedLineItems, feemagazines]);
  
  // Callback handlers
  const handleLineItemValueChange = useCallback((lineItemIndex: number) => {
    const magazineslineItems = form.getValues("magazineslineItems") || [];
    let overallMedia = 0;
    let overallFee = 0;
    let overallCost = 0;

    magazineslineItems.forEach((lineItem) => {
      let lineMedia = 0;
      let lineFee = 0;
      let lineDeliverables = 0;

      lineItem.bursts.forEach((burst) => {
        const budget = parseFloat(burst?.budget?.replace(/[^0-9.]/g, "") || "0");
        lineMedia += budget;
        lineDeliverables += burst?.calculatedValue || 0;
      });

      lineFee = feemagazines ? (lineMedia / (100 - feemagazines)) * feemagazines : 0;
      overallMedia += lineMedia;
      overallFee += lineFee;
      overallCost += lineMedia + lineFee;
    });

    setOverallDeliverables(overallMedia);
    onTotalMediaChange(overallMedia, overallFee);
  }, [form, feemagazines]); // Removed onTotalMediaChange dependency to prevent infinite loops

  const handleValueChange = useCallback((lineItemIndex: number, burstIndex: number) => {
    const burst = form.getValues(`magazineslineItems.${lineItemIndex}.bursts.${burstIndex}`);
    const budget = parseFloat(burst?.budget?.replace(/[^0-9.]/g, "") || "0");
    const buyAmount = parseFloat(burst?.buyAmount?.replace(/[^0-9.]/g, "") || "1");
    const buyType = form.getValues(`magazineslineItems.${lineItemIndex}.buyType`);

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
      default:
        calculatedValue = 0;
    }

    // Only update if the calculated value is actually different to prevent infinite loops
    const currentValue = form.getValues(`magazineslineItems.${lineItemIndex}.bursts.${burstIndex}.calculatedValue`);
    if (currentValue !== calculatedValue && !isNaN(calculatedValue)) {
      form.setValue(`magazineslineItems.${lineItemIndex}.bursts.${burstIndex}.calculatedValue`, calculatedValue, {
        shouldValidate: false, // Changed to false to prevent validation loops
        shouldDirty: false,    // Changed to false to prevent dirty state loops
      });

      handleLineItemValueChange(lineItemIndex);
    }
  }, [form, handleLineItemValueChange]);

  const handleAppendBurst = useCallback((lineItemIndex: number) => {
    const currentBursts = form.getValues(`magazineslineItems.${lineItemIndex}.bursts`) || [];
    
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
    
    form.setValue(`magazineslineItems.${lineItemIndex}.bursts`, [
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
    const currentBursts = form.getValues(`magazineslineItems.${lineItemIndex}.bursts`) || [];

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

    form.setValue(`magazineslineItems.${lineItemIndex}.bursts`, [
      ...currentBursts,
      duplicatedBurst,
    ]);

    handleLineItemValueChange(lineItemIndex);
  }, [form, handleLineItemValueChange, toast]);

  const handleRemoveBurst = useCallback((lineItemIndex: number, burstIndex: number) => {
    const currentBursts = form.getValues(`magazineslineItems.${lineItemIndex}.bursts`) || [];
    form.setValue(
      `magazineslineItems.${lineItemIndex}.bursts`,
      currentBursts.filter((_, index) => index !== burstIndex),
    );

    handleLineItemValueChange(lineItemIndex);
  }, [form, handleLineItemValueChange]);

  const getDeliverablesLabel = useCallback((buyType: string) => {
    if (!buyType) return "Deliverables";
    
    switch (buyType.toLowerCase()) {
      case "cpc":
        return "Clicks";
      case "insertions":
        return "Insertions";
      case "package":
        return "Package";
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

        const fetchedPublishers = await getPublishersForMagazines();
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

  // Load magazines on component mount
  useEffect(() => {
    const loadMagazines = async () => {
      try {
        const fetchedMagazines = await getMagazines();
        magazinesRef.current = fetchedMagazines;
        setMagazines(fetchedMagazines);
      } catch (error) {
        toast({
          title: "Error loading magazines",
          description: (error as Error).message,
          variant: "destructive",
        });
      }
    };

    loadMagazines();
  }, []);

  // Load magazines ad sizes on component mount
  useEffect(() => {
    const loadMagazinesAdSizes = async () => {
      try {
        const fetchedAdSizes = await getMagazinesAdSizes();
        magazinesAdSizesRef.current = fetchedAdSizes;
        setMagazinesAdSizes(fetchedAdSizes);
      } catch (error) {
        toast({
          title: "Error loading magazines ad sizes",
          description: (error as Error).message,
          variant: "destructive",
        });
      }
    };

    loadMagazinesAdSizes();
  }, []);
  
  // report raw totals (ignoring clientPaysForMedia) for MBA-Details
useEffect(() => {
  onTotalMediaChange(
    overallTotals.overallMedia,
    overallTotals.overallFee
  )
}, [overallTotals.overallMedia, overallTotals.overallFee]) // Removed onTotalMediaChange dependency to prevent infinite loops

useEffect(() => {
  // convert each form lineItem into the shape needed for Excel
  const items: LineItem[] = form.getValues('magazineslineItems').flatMap(lineItem =>
    lineItem.bursts.map(burst => ({
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
      grossMedia: (parseFloat(String(burst.budget).replace(/[^0-9.-]+/g,"")) || 0).toFixed(2),
    }))
  );
  
  // push it up to page.tsx
  onLineItemsChange(items);
}, [watchedLineItems, feemagazines]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      const investmentByMonth = calculateInvestmentPerMonth(form, feemagazines || 0);
      // @ts-ignore - Type mismatch between form and function signature
      const bursts = getMagazinesBursts(form, feemagazines || 0);
      
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
  }, [watchedLineItems, feemagazines]); // Removed callback dependencies to prevent infinite loops

  const getBursts = () => {
    const formLineItems = form.getValues("magazineslineItems") || [];
    return formLineItems.flatMap(item =>
      item.bursts.map(burst => {
        const budget = parseFloat(burst.budget?.replace(/[^0-9.]/g, "") || "0");
        let mediaAmount = 0;
        let feeAmount = 0;

        if (item.budgetIncludesFees && item.clientPaysForMedia) {
          // Both true: budget is gross, extract fee only, mediaAmount = 0
          // Media = 0
          // Fees = Budget * (Fee / 100)
          feeAmount = budget * ((feemagazines || 0) / 100);
          mediaAmount = 0;
        } else if (item.budgetIncludesFees) {
          // Only budgetIncludesFees: budget is gross, split into media and fee
          const base = budget / (1 + (feemagazines || 0)/100);
          feeAmount = budget - base;
          mediaAmount = base;
        } else if (item.clientPaysForMedia) {
          // Only clientPaysForMedia: budget is net media, only fee is billed
          feeAmount = (budget / (100 - (feemagazines || 0))) * (feemagazines || 0);
          mediaAmount = 0;
        } else {
          // Neither: budget is net media, fee calculated on top
          mediaAmount = budget;
          feeAmount = (budget * (feemagazines || 0)) / 100;
        }

        const billingBurst: BillingBurst = {
          startDate: burst.startDate,
          endDate: burst.endDate,
          mediaAmount: mediaAmount,
          feeAmount: feeAmount,
          totalAmount: mediaAmount + feeAmount,
          mediaType: 'magazines',
          feePercentage: feemagazines,
          clientPaysForMedia: item.clientPaysForMedia || false,
          budgetIncludesFees: item.budgetIncludesFees || false,
          noAdserving: item.noadserving || false,
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
            <CardTitle className="pt-4 border-t font-bold text-lg flex justify-between">Magazines Media</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {overallTotals.lineItemTotals.map((item) => (
              <div key={item.index} className="flex justify-between border-b pb-2">
                <span className="font-medium">Line Item {item.index}</span>
                <div className="flex space-x-4">
                  <span>
                    {getDeliverablesLabel(form.getValues(`magazineslineItems.${item.index - 1}.buyType`))}: {item.deliverables.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </span>
                  <span>Media: ${item.media.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                  <span>Fee: ${item.fee.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                  <span>Total Cost: ${item.totalCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
              </div>
            ))}
  
            {/* Overall Totals */}
            <div className="pt-4 border-t font-medium flex justify-between">
              <span>Magazines Media Totals:</span>
              <div className="flex space-x-4">
                <span>Media: ${overallTotals.overallMedia.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                <span>Fees ({feemagazines}%): ${overallTotals.overallFee.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
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
                    const lineItem = form.getValues(`magazineslineItems.${lineItemIndex}`);
                    let totalMedia = 0;
                    let totalCalculatedValue = 0;

                    lineItem.bursts.forEach((burst) => {
                      const budget = parseFloat(burst.budget.replace(/[^0-9.]/g, "")) || 0;
                      totalMedia += budget;
                      totalCalculatedValue += burst.calculatedValue || 0;
                    });

                    return { totalMedia, totalCalculatedValue };
                  };

                  const selectedNetwork = form.watch(`magazineslineItems.${lineItemIndex}.network`);

                  // const selectedNetwork = form.watch(`televisionlineItems.${lineItemIndex}.network`); // Already exists above

                  let filteredMagazines;
                  if (!selectedNetwork) {
                    filteredMagazines = magazines; // Show all newspapers if no network is selected
                  } else {
                    filteredMagazines = magazines.filter(magazines => magazines.network === selectedNetwork);
                  }


                  const { totalMedia, totalCalculatedValue } = getTotals(lineItemIndex);

                  return (
                    <Card key={field.id} className="space-y-6">
                      <CardHeader className="pb-2">
                        <div className="flex justify-between items-center">
                          <div className="flex items-center space-x-2">
                            <CardTitle className="text-lg font-medium">Magazines Line Item {lineItemIndex + 1}</CardTitle>
                            <div className="text-sm text-muted-foreground">ID: {`${mbaNumber}MG${lineItemIndex + 1}`}</div>
                          </div>
                          <div className="flex items-center space-x-2">
                            <div className="text-sm font-medium">
                              Total: {new Intl.NumberFormat('en-US', {
                                style: 'currency',
                                currency: 'USD',
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2
                              }).format(
                                form.getValues(`magazineslineItems.${lineItemIndex}.budgetIncludesFees`)
                                  ? totalMedia
                                  : totalMedia + (totalMedia / (100 - (feemagazines || 0))) * (feemagazines || 0)
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
                            <span className="font-medium">Network:</span> {form.watch(`magazineslineItems.${lineItemIndex}.network`) || 'Not selected'}
                          </div>
                          <div>
                            <span className="font-medium">Buy Type:</span> {formatBuyTypeForDisplay(form.watch(`magazineslineItems.${lineItemIndex}.buyType`))}
                          </div>
                          <div>
                            <span className="font-medium">Title:</span> {form.watch(`magazineslineItems.${lineItemIndex}.title`) || 'Not selected'}
                          </div>
                          <div>
                            <span className="font-medium">Bursts:</span> {form.watch(`magazineslineItems.${lineItemIndex}.bursts`, []).length}
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
                                // @ts-ignore - Type mismatch between form and schema
                                control={form.control}
                                name={`magazineslineItems.${lineItemIndex}.network`}
                                render={({ field }) => (
                                  <FormItem className="flex items-center space-x-2">
                                    <FormLabel className="w-24 text-sm">Network</FormLabel>
                                    <Select onValueChange={(value) => {
                                      field.onChange(value);
                                       }} defaultValue={field.value}>
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
                                // @ts-ignore - Type mismatch between form and schema
                                control={form.control}
                                name={`magazineslineItems.${lineItemIndex}.title`}
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
                                              {filteredMagazines.length > 0 ? (
                                                filteredMagazines.map((magazines) => ( //
                                                  <SelectItem 
                                                  key={magazines.id} 
                                                  value={magazines.title || `title-${magazines.id}`} // Guard against empty string
                                                >
                                                  {magazines.title}
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
                                                const currentNetworkInForm = form.getValues(`magazineslineItems.${lineItemIndex}.network`); //
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
                                // @ts-ignore - Type mismatch between form and schema
                                control={form.control}
                                name={`magazineslineItems.${lineItemIndex}.buyType`}
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
                                       <SelectItem value="insertions">Insertions</SelectItem>
                                        <SelectItem value="cpm">CPM</SelectItem>
                                        <SelectItem value="package">Package</SelectItem>
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
                                    {...form.register(`magazineslineItems.${lineItemIndex}.placement`)}
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
                                    {...form.register(`magazineslineItems.${lineItemIndex}.buyingDemo`)}
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
    // @ts-ignore - Type mismatch between form and schema
    control={form.control}
    name={`magazineslineItems.${lineItemIndex}.size`} // Ad Size field
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
              {magazinesAdSizes.length > 0 ? (
                magazinesAdSizes.map((adSize) => (
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
            type="button"
            variant="ghost"
            size="sm"
            className="p-1 h-auto"
            onClick={() => {
              setCurrentLineItemIndexForNewAdSize(lineItemIndex); // Set context for which line item
              setNewAdSizeName(""); // Clear previous input
              setIsAddMagazinesAdSizeDialogOpen(true); // Open the dialog
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
                                    {...form.register(`magazineslineItems.${lineItemIndex}.market`)}
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
                                  // @ts-ignore - Type mismatch between form and schema
                                  control={form.control}
                                  name={`magazineslineItems.${lineItemIndex}.fixedCostMedia`}
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
                                  // @ts-ignore - Type mismatch between form and schema
                                  control={form.control}
                                  name={`magazineslineItems.${lineItemIndex}.clientPaysForMedia`}
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
                                  // @ts-ignore - Type mismatch between form and schema
                                  control={form.control}
                                  name={`magazineslineItems.${lineItemIndex}.budgetIncludesFees`}
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
                      <div className="space-y-4">
                        {form.watch(`magazineslineItems.${lineItemIndex}.bursts`, []).map((burstField, burstIndex) => {
                          return (
                            <Card key={`${lineItemIndex}-${burstIndex}`} className="border border-gray-200">
                              <CardContent className="py-2 px-4">
                                <div className="flex items-center space-x-4">
                                  <div className="w-24 flex-shrink-0">
                                    <h4 className="text-sm font-medium">Burst {burstIndex + 1}</h4>
                                  </div>
                                  
                                  <div className="grid grid-cols-5 gap-4 items-center flex-grow">
                                    <FormField
                                      // @ts-ignore - Type mismatch between form and schema
                                      control={form.control}
                                      name={`magazineslineItems.${lineItemIndex}.bursts.${burstIndex}.budget`}
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
                                      // @ts-ignore - Type mismatch between form and schema
                                      control={form.control}
                                      name={`magazineslineItems.${lineItemIndex}.bursts.${burstIndex}.buyAmount`}
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
                                        // @ts-ignore - Type mismatch between form and schema
                                        control={form.control}
                                        name={`magazineslineItems.${lineItemIndex}.bursts.${burstIndex}.startDate`}
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
                                        // @ts-ignore - Type mismatch between form and schema
                                        control={form.control}
                                        name={`magazineslineItems.${lineItemIndex}.bursts.${burstIndex}.endDate`}
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
                                      // @ts-ignore - Type mismatch between form and schema
                                      control={form.control}
                                      name={`magazineslineItems.${lineItemIndex}.bursts.${burstIndex}.calculatedValue`}
                                      render={({ field }) => {
                                        const buyType = useWatch({
                                          control: form.control,
                                          name: `magazineslineItems.${lineItemIndex}.buyType`,
                                        });

                                        const calculatedValue = useMemo(() => {
                                          const budget = parseFloat(form.getValues(`magazineslineItems.${lineItemIndex}.bursts.${burstIndex}.budget`)?.replace(/[^0-9.]/g, "") || "0");
                                          const buyAmount = parseFloat(form.getValues(`magazineslineItems.${lineItemIndex}.bursts.${burstIndex}.buyAmount`)?.replace(/[^0-9.]/g, "") || "1");

                                          switch (buyType) {
                                            case "cpc":
                                            case "cpv":
                                            case "insertions":
                                              return buyAmount !== 0 ? (budget / buyAmount) : "0";
                                            case "cpm":
                                              return buyAmount !== 0 ? ((budget / buyAmount) * 1000) : "0";
                                            case "fixed_cost":
                                            case "package":
                                              return "1";
                                            default:
                                              return "0";
                                          }
                                        }, [
                                          form.getValues(`magazineslineItems.${lineItemIndex}.bursts.${burstIndex}.budget`),
                                          form.getValues(`magazineslineItems.${lineItemIndex}.bursts.${burstIndex}.buyAmount`),
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
                                              form.getValues(`magazineslineItems.${lineItemIndex}.budgetIncludesFees`)
                                                ? (parseFloat(form.getValues(`magazineslineItems.${lineItemIndex}.bursts.${burstIndex}.budget`)?.replace(/[^0-9.]/g, "") || "0") / 100) * (100 - (feemagazines || 0))
                                                : parseFloat(form.getValues(`magazineslineItems.${lineItemIndex}.bursts.${burstIndex}.budget`)?.replace(/[^0-9.]/g, "") || "0")
                                            )}
                                            readOnly
                                          />
                                        </div>
                                        <div className="flex flex-col">
                                          <FormLabel className="text-xs">Fee ({feemagazines}%)</FormLabel>
                                          <Input
                                            type="text"
                                            className="w-full"
                                            value={new Intl.NumberFormat("en-US", {
                                              style: "currency",
                                              currency: "USD",
                                              minimumFractionDigits: 2,
                                              maximumFractionDigits: 2,
                                            }).format(
                                              form.getValues(`magazineslineItems.${lineItemIndex}.budgetIncludesFees`)
                                                ? (parseFloat(form.getValues(`magazineslineItems.${lineItemIndex}.bursts.${burstIndex}.budget`)?.replace(/[^0-9.]/g, "") || "0") / 100) * (feemagazines || 0)
                                                : (parseFloat(form.getValues(`magazineslineItems.${lineItemIndex}.bursts.${burstIndex}.budget`)?.replace(/[^0-9.]/g, "") || "0") / (100 - (feemagazines || 0))) * (feemagazines || 0)
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
                                network: "",
                                title: "",
                                buyType: "",
                                size: "",
                                placement: "",
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

<Dialog open={isAddMagazinesAdSizeDialogOpen} onOpenChange={setIsAddMagazinesAdSizeDialogOpen}>
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
      <Button type="button" variant="outline" onClick={() => setIsAddMagazinesAdSizeDialogOpen(false)}>Cancel</Button>
      <Button type="button" onClick={handleAddNewMagazinesAdSize} disabled={isLoading}>
        {isLoading ? "Adding..." : "Add Ad Size"}
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
    </div>
  );
}
