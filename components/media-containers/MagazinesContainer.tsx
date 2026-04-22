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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger,} from "@/components/ui/dialog"
import { PlusCircle } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import { Textarea } from "@/components/ui/textarea"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { useToast } from "@/components/ui/use-toast"
import { Label } from "@/components/ui/label"
import { getPublishersForMagazines, getClientInfo, getMagazinesAdSizes, createMagazineAdSize, getMagazines, createMagazine, getNewspapers, getNewspapersAdSizes, createNewspaper, createNewspaperAdSize } from "@/lib/api"
import { formatBurstLabel } from "@/lib/bursts"
import { MEDIA_TYPE_ID_CODES, buildLineItemId } from "@/lib/mediaplan/lineItemIds"
import { format } from "date-fns"
import { useMediaPlanContext } from "@/contexts/MediaPlanContext"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { ChevronDown, Copy, Plus, Trash2 } from "lucide-react"
import type { BillingBurst, BillingMonth } from "@/lib/billing/types"; // ad
import type { LineItem } from '@/lib/generateMediaPlan'
import { formatMoney, parseMoneyInput } from "@/lib/utils/money"
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
  MP_BURST_HEADER_ROW,
  MP_BURST_HEADER_SHELL,
  MP_BURST_LABEL_HEADING,
  MP_BURST_LABEL_COLUMN,
  MP_BURST_ROW_SHELL,
  MP_BURST_SECTION_OUTER,
} from "@/lib/mediaplan/burstSectionLayout"
import { SingleDatePicker } from "@/components/ui/single-date-picker"
import { defaultMediaBurstStartDate, defaultMediaBurstEndDate } from "@/lib/date-picker-anchor"
import MediaContainerTimelineCollapsible from "@/components/media-containers/MediaContainerTimelineCollapsible"
import {
  MagazinesExpertGrid,
  createEmptyMagazinesExpertRow,
} from "@/components/media-containers/MagazinesExpertGrid"
import type { MagazinesExpertScheduleRow } from "@/lib/mediaplan/expertModeWeeklySchedule"
import {
  mapMagazineExpertRowsToStandardLineItems,
  mapStandardMagazineLineItemsToExpertRows,
  type StandardMagazineFormLineItem,
} from "@/lib/mediaplan/expertOohRadioMappings"
import {
  mergeMagazineStandardFromExpertWithPrevious,
  serializeMagazinesExpertRowsBaseline,
  serializeMagazineStandardLineItemsBaseline,
} from "@/lib/mediaplan/expertModeSwitch"
import { buildWeeklyGanttColumnsFromCampaign } from "@/lib/utils/weeklyGanttColumns"
import {
  getMediaTypeThemeHex,
  mediaTypeAccentTextStyle,
  mediaTypeSummaryStripeStyle,
  mediaTypeTotalsRowStyle,
  rgbaFromHex,
} from "@/lib/mediaplan/mediaTypeAccents"

const MEDIA_ACCENT_HEX = getMediaTypeThemeHex("magazines")

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

/** Net media when budget is gross incl. fee — must match `getMagazinesBursts` / burst row readouts (linear split). */
function netMediaFeeMarkup(rawBudget: number, budgetIncludesFees: boolean, feePct: number): number {
  if (!budgetIncludesFees) return rawBudget;
  const pct = feePct || 0;
  return (rawBudget * (100 - pct)) / 100;
}

// Exported utility function to get bursts
export function getAllBursts(form) {
  const lineItems = form.getValues("magazineslineItems") || [];

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
  publisher: z.string(),
  placement: z.string(),
  buyingDemo: z.string(),
  market: z.string(),
  fixedCostMedia: z.boolean(),
  clientPaysForMedia: z.boolean(),
  budgetIncludesFees: z.boolean(),
  noadserving: z.boolean(),
  lineItemId: z.string().optional(),
  line_item_id: z.string().optional(),
  line_item: z.union([z.string(), z.number()]).optional(),
  lineItem: z.union([z.string(), z.number()]).optional(),
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
  publisherId?: number;
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
      const rawBudget = parseFloat(burst.budget.replace(/[^0-9.]/g, "")) || 0

      const pct = feemagazines || 0
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

  // Deterministic ID generator aligned with UI label
  const createLineItemId = useCallback(
    (lineNumber: number) =>
      buildLineItemId(mbaNumber, MEDIA_TYPE_ID_CODES.magazines, lineNumber),
    [mbaNumber]
  );

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
const form = useForm<MagazinesFormValues>({
  resolver: zodResolver(magazinesFormSchema) as Resolver<MagazinesFormValues>,
    defaultValues: {
      magazineslineItems: [
        {
          network: "",
          title: "",
          buyType: "",
          size: "",
          publisher: "",
          placement: "",
          buyingDemo: "",
          market: "",
          fixedCostMedia: false,
          clientPaysForMedia: false,
          budgetIncludesFees: false,
          noadserving: false,
          ...(() => { const id = createLineItemId(1); return { lineItemId: id, line_item_id: id, line_item: 1, lineItem: 1 }; })(),
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
    name: "magazineslineItems",
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
    const items = form.getValues("magazineslineItems") || []
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

  const magazineStandardBaselineRef = useRef("")
  const [expertMagazinesRows, setExpertMagazinesRows] = useState<
    MagazinesExpertScheduleRow[]
  >([])
  const [magazinesExpertModalOpen, setMagazinesExpertModalOpen] =
    useState(false)
  const [magazinesExpertExitConfirmOpen, setMagazinesExpertExitConfirmOpen] =
    useState(false)
  const [expertSegmentAttention, setExpertSegmentAttention] = useState(true)
  const magazinesExpertRowsBaselineRef = useRef("")
  const magazinesExpertModalOpenRef = useRef(false)
  magazinesExpertModalOpenRef.current = magazinesExpertModalOpen

  const magazinesExpertWeekColumns = useMemo(
    () => buildWeeklyGanttColumnsFromCampaign(campaignStartDate, campaignEndDate),
    [campaignStartDate, campaignEndDate]
  )

  useLayoutEffect(() => {
    magazineStandardBaselineRef.current =
      serializeMagazineStandardLineItemsBaseline(
        form.getValues("magazineslineItems") as StandardMagazineFormLineItem[]
      )
  }, [form])

  useEffect(() => {
    const id = window.setTimeout(() => setExpertSegmentAttention(false), 2800)
    return () => window.clearTimeout(id)
  }, [])

  const handleExpertMagazinesRowsChange = useCallback(
    (next: MagazinesExpertScheduleRow[]) => {
      setExpertMagazinesRows(next)
    },
    []
  )

  const openMagazinesExpertModal = useCallback(() => {
    const mapped = mapStandardMagazineLineItemsToExpertRows(
      (form.getValues("magazineslineItems") || []) as StandardMagazineFormLineItem[],
      magazinesExpertWeekColumns,
      campaignStartDate,
      campaignEndDate
    )
    const weekKeys = magazinesExpertWeekColumns.map((c) => c.weekKey)
    const rows: MagazinesExpertScheduleRow[] =
      mapped.length > 0
        ? mapped
        : [
            createEmptyMagazinesExpertRow(
              typeof crypto !== "undefined" && crypto.randomUUID
                ? crypto.randomUUID()
                : `magazines-expert-${Date.now()}`,
              campaignStartDate,
              campaignEndDate,
              weekKeys
            ),
          ]
    magazinesExpertRowsBaselineRef.current =
      serializeMagazinesExpertRowsBaseline(rows)
    setExpertMagazinesRows(rows)
    setMagazinesExpertExitConfirmOpen(false)
    setMagazinesExpertModalOpen(true)
  }, [campaignStartDate, campaignEndDate, form, magazinesExpertWeekColumns])

  const dismissMagazinesExpertExitConfirm = useCallback(() => {
    setMagazinesExpertExitConfirmOpen(false)
  }, [])

  const confirmMagazinesExpertExitWithoutSaving = useCallback(() => {
    setMagazinesExpertExitConfirmOpen(false)
    collapseAllLineItems()
    setMagazinesExpertModalOpen(false)
  }, [collapseAllLineItems])

  const handleMagazinesExpertModalOpenChange = useCallback(
    (open: boolean) => {
      if (open) {
        setMagazinesExpertModalOpen(true)
        return
      }
      const dirty =
        serializeMagazinesExpertRowsBaseline(expertMagazinesRows) !==
        magazinesExpertRowsBaselineRef.current
      if (!dirty) {
        collapseAllLineItems()
        setMagazinesExpertModalOpen(false)
        return
      }
      setMagazinesExpertExitConfirmOpen(true)
    },
    [collapseAllLineItems, expertMagazinesRows]
  )

  const handleMagazinesExpertApply = useCallback(() => {
    const prevLineItems = form.getValues("magazineslineItems") || []
    const standard = mapMagazineExpertRowsToStandardLineItems(
      expertMagazinesRows,
      magazinesExpertWeekColumns,
      campaignStartDate,
      campaignEndDate,
      {
        feePctMagazines: feemagazines,
        budgetIncludesFees: Boolean(prevLineItems[0]?.budgetIncludesFees),
      }
    )
    const merged = mergeMagazineStandardFromExpertWithPrevious(
      standard,
      prevLineItems as StandardMagazineFormLineItem[]
    )
    form.setValue("magazineslineItems", merged as MagazinesFormValues["magazineslineItems"], {
      shouldDirty: true,
      shouldValidate: false,
    })
    magazineStandardBaselineRef.current =
      serializeMagazineStandardLineItemsBaseline(
        form.getValues("magazineslineItems") as StandardMagazineFormLineItem[]
      )
    setMagazinesExpertExitConfirmOpen(false)
    collapseAllLineItems()
    setMagazinesExpertModalOpen(false)
  }, [
    campaignStartDate,
    campaignEndDate,
    collapseAllLineItems,
    expertMagazinesRows,
    feemagazines,
    form,
    magazinesExpertWeekColumns,
  ])

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

    const lineNumber =
      (Number(source.line_item ?? source.lineItem ?? lineItemIndex + 1) || lineItemIndex + 1) + 1;
    const newId = createLineItemId(lineNumber);

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
    name: "magazineslineItems",
    defaultValue: form.getValues("magazineslineItems")
  });

  // Data loading for edit mode
  useEffect(() => {
    if (magazinesExpertModalOpenRef.current) return
    if (initialLineItems && initialLineItems.length > 0) {
      const transformedLineItems = initialLineItems.map((item: any, index: number) => {
        const lineNumber = item.line_item ?? item.lineItem ?? index + 1;
        const lineItemId = item.line_item_id || item.lineItemId || createLineItemId(lineNumber);

        return {
          network: item.network || item.publisher || "",
          title: item.title || item.publication || "",
          publisher: item.publisher || item.network || "",
          placement: item.placement || "",
          size: item.size || "",
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
            startDate: defaultMediaBurstStartDate(campaignStartDate, campaignEndDate),
            endDate: defaultMediaBurstEndDate(campaignStartDate, campaignEndDate),
            calculatedValue: computeLoadedDeliverables(item.buy_type || item.buyType, {}),
            fee: 0,
          }],
        };
      });

      form.reset({
        magazineslineItems: transformedLineItems,
        overallDeliverables: 0,
      });
    }
  }, [initialLineItems, form, campaignStartDate, campaignEndDate, createLineItemId]);

  // Transform form data to API schema format
  useEffect(() => {
    const formLineItems = form.getValues('magazineslineItems') || [];
    
    const transformedLineItems = formLineItems.map((lineItem, index) => {
      // Calculate totalMedia from raw budget amounts (for display in MBA section)
      let totalMedia = 0;
      lineItem.bursts.forEach((burst) => {
        const budget = parseFloat(burst.budget.replace(/[^0-9.]/g, "")) || 0;
        if (lineItem.budgetIncludesFees) {
          const pct = feemagazines || 0;
          totalMedia += (budget * (100 - pct)) / 100;
        } else {
          // Budget is net media
          totalMedia += budget;
        }
      });
      const lineNumber = Number(lineItem.line_item ?? lineItem.lineItem ?? index + 1) || index + 1;
      const lineItemId = lineItem.lineItemId || lineItem.line_item_id || createLineItemId(lineNumber);

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
  }, [watchedLineItems, mbaNumber, feemagazines, createLineItemId, form, onMediaLineItemsChange]);
  
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
          const pct = feemagazines || 0;
          lineMedia += (budget * (100 - pct)) / 100;
          lineFee += (budget * pct) / 100;
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
    let overallDeliverableCount = 0;

    magazineslineItems.forEach((lineItem) => {
      let lineMedia = 0;
      let lineFee = 0;
      let lineDeliverables = 0;

      lineItem.bursts.forEach((burst) => {
        const budget = parseFloat(burst?.budget?.replace(/[^0-9.]/g, "") || "0");
        if (lineItem.budgetIncludesFees) {
          const pct = feemagazines || 0;
          lineMedia += (budget * (100 - pct)) / 100;
          lineFee += (budget * pct) / 100;
        } else {
          lineMedia += budget;
          const fee = feemagazines ? (budget / (100 - feemagazines)) * feemagazines : 0;
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
  }, [form, feemagazines, onTotalMediaChange]);

  const handleBuyTypeChange = useCallback(
    (lineItemIndex: number, value: string) => {
      form.setValue(`magazineslineItems.${lineItemIndex}.buyType`, value);

      if (value === "bonus" || value === "package_inclusions") {
        const currentBursts =
          form.getValues(`magazineslineItems.${lineItemIndex}.bursts`) || [];
        const zeroedBursts = currentBursts.map((burst: any) => ({
          ...burst,
          budget: "0",
          buyAmount: "0",
          calculatedValue: burst.calculatedValue ?? 0,
        }));

        form.setValue(
          `magazineslineItems.${lineItemIndex}.bursts`,
          zeroedBursts,
          { shouldDirty: true }
        );
      }

      handleLineItemValueChange(lineItemIndex);
    },
    [form, handleLineItemValueChange]
  );

  const handleValueChange = useCallback((lineItemIndex: number, burstIndex: number, budgetIncludesFeesOverride?: boolean) => {
    const burst = form.getValues(`magazineslineItems.${lineItemIndex}.bursts.${burstIndex}`);
    const lineItem = form.getValues(`magazineslineItems.${lineItemIndex}`);
    const rawBudget = parseFloat(burst?.budget?.replace(/[^0-9.]/g, "") || "0");
    const budgetIncludesFees = budgetIncludesFeesOverride ?? Boolean(lineItem?.budgetIncludesFees);
    const budget = netMediaFeeMarkup(rawBudget, budgetIncludesFees, feemagazines || 0);
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
      case "bonus":
        calculatedValue = parseFloat(
          (burst?.calculatedValue ?? "0").toString().replace(/[^0-9.]/g, "")
        ) || 0;
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
  }, [feemagazines, form, handleLineItemValueChange]);

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
    const endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0);
    
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

    const endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0);

    const duplicatedBurst = {
      budget: lastBurst?.budget ?? "",
      buyAmount: lastBurst?.buyAmount ?? "",
      startDate,
      endDate,
      calculatedValue: lastBurst?.calculatedValue ?? 0,
      fee: lastBurst?.fee ?? 0,
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
  }, [toast]);

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
  }, [toast]);
  
  // report raw totals (ignoring clientPaysForMedia) for MBA-Details
useEffect(() => {
  onTotalMediaChange(
    overallTotals.overallMedia,
    overallTotals.overallFee
  )
}, [overallTotals.overallFee, overallTotals.overallMedia, onTotalMediaChange])

useEffect(() => {
  // convert each form lineItem into the shape needed for Excel
  const calculatedBursts = getMagazinesBursts(form, feemagazines || 0);
  let burstIndex = 0;

  const items: LineItem[] = form.getValues('magazineslineItems').flatMap((lineItem, lineItemIndex) =>
    lineItem.bursts.map(burst => {
      const computedBurst = calculatedBursts[burstIndex++];
      const mediaAmount = computedBurst
        ? computedBurst.mediaAmount
        : parseFloat(String(burst.budget).replace(/[^0-9.-]+/g, "")) || 0;
      const lineNumber = Number(lineItem.line_item ?? lineItem.lineItem ?? lineItemIndex + 1) || lineItemIndex + 1;
      let lineItemId = lineItem.lineItemId || lineItem.line_item_id;
      if (!lineItemId) {
        lineItemId = createLineItemId(lineNumber);
        form.setValue(`magazineslineItems.${lineItemIndex}.lineItemId`, lineItemId);
        form.setValue(`magazineslineItems.${lineItemIndex}.line_item_id`, lineItemId);
      }

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
        grossMedia: String(mediaAmount),
        line_item_id: lineItemId,
        lineItemId: lineItemId,
        line_item: lineNumber,
        lineItem: lineNumber,
      };
    })
  );
  
  // push it up to page.tsx
  onLineItemsChange(items);
}, [watchedLineItems, feemagazines, createLineItemId, form, onLineItemsChange]);

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
  }, [watchedLineItems, feemagazines, form, onBurstsChange, onInvestmentChange]);

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
          const pct = feemagazines || 0;
          mediaAmount = (budget * (100 - pct)) / 100;
          feeAmount = (budget * pct) / 100;
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
        <Card className="overflow-hidden border-0 shadow-md">
          <div className="h-1" style={mediaTypeSummaryStripeStyle(MEDIA_ACCENT_HEX)} />
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <CardTitle className="text-base font-semibold tracking-tight">
                  Magazines Media
                </CardTitle>
                {magazinesExpertModalOpen ? (
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
                aria-label="Magazines Media entry mode"
                className="inline-flex shrink-0 rounded-lg border border-border bg-muted/50 p-0.5"
              >
                <button
                  type="button"
                  aria-pressed={!magazinesExpertModalOpen}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-xs font-medium transition-all",
                    !magazinesExpertModalOpen
                      ? "text-white shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                  style={
                    !magazinesExpertModalOpen
                      ? { backgroundColor: MEDIA_ACCENT_HEX }
                      : undefined
                  }
                  onClick={() => {
                    if (magazinesExpertModalOpen) {
                      handleMagazinesExpertModalOpenChange(false)
                    }
                  }}
                >
                  Standard
                </button>
                <button
                  type="button"
                  aria-pressed={magazinesExpertModalOpen}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-xs font-medium transition-all",
                    magazinesExpertModalOpen
                      ? "text-white shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                    expertSegmentAttention &&
                      !magazinesExpertModalOpen &&
                      "animate-pulse"
                  )}
                  style={{
                    ...(magazinesExpertModalOpen
                      ? { backgroundColor: MEDIA_ACCENT_HEX }
                      : {}),
                    ...(expertSegmentAttention && !magazinesExpertModalOpen
                      ? {
                          boxShadow: `0 0 0 2px ${rgbaFromHex(MEDIA_ACCENT_HEX, 0.45)}`,
                        }
                      : {}),
                  }}
                  onClick={() => {
                    if (!magazinesExpertModalOpen) {
                      openMagazinesExpertModal()
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
                      {getDeliverablesLabel(form.getValues(`magazineslineItems.${item.index - 1}.buyType`))}
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

            <div
              className="flex items-center justify-between border-t-2 border-solid pt-3 mt-1"
              style={mediaTypeTotalsRowStyle(MEDIA_ACCENT_HEX)}
            >
              <span className="text-sm font-semibold">Total</span>
              <div className="flex items-center gap-6 text-sm font-semibold tabular-nums">
                <div className="text-right">
                  <span className="text-[11px] text-muted-foreground font-normal block">Media</span>
                  <span>{formatMoney(overallTotals.overallMedia, { locale: "en-US", currency: "USD" })}</span>
                </div>
                <div className="text-right">
                  <span className="text-[11px] text-muted-foreground font-normal block">Fee ({feemagazines}%)</span>
                  <span>{formatMoney(overallTotals.overallFee, { locale: "en-US", currency: "USD" })}</span>
                </div>
                <div className="text-right">
                  <span className="text-[11px] text-muted-foreground font-normal block">Total</span>
                  <span style={mediaTypeAccentTextStyle(MEDIA_ACCENT_HEX)}>
                    {formatMoney(overallTotals.overallCost, { locale: "en-US", currency: "USD" })}
                  </span>
                </div>
              </div>
            </div>
            <MediaContainerTimelineCollapsible
              mediaTypeKey="magazines"
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
            {magazinesExpertModalOpen ? null : (
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
                  const networkKey = (selectedNetwork || "").trim();
                  const selectedPublisherId = publishers.find(
                    (p) => (p.publisher_name || "").trim() === networkKey
                  )?.id;

                  let filteredMagazines: Magazines[];
                  if (!networkKey) {
                    filteredMagazines = magazines;
                  } else {
                    filteredMagazines = magazines.filter((m) => {
                      if ((m.network || "").trim() === networkKey) return true;
                      if (
                        selectedPublisherId != null &&
                        m.publisherId != null &&
                        m.publisherId === selectedPublisherId
                      ) {
                        return true;
                      }
                      return false;
                    });
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
                              <CardTitle className="text-sm font-semibold tracking-tight">Magazines Line Item</CardTitle>
                              <span className="font-mono text-[11px] text-muted-foreground">{`${mbaNumber}MG${lineItemIndex + 1}`}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              <span className="block text-[11px] text-muted-foreground">Total</span>
                              <span className="text-sm font-bold tabular-nums">
                                {formatMoney(
                                  form.getValues(`magazineslineItems.${lineItemIndex}.budgetIncludesFees`)
                                    ? totalMedia
                                    : totalMedia + (totalMedia / (100 - (feemagazines || 0))) * (feemagazines || 0),
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
                                  ? `Expand details for magazines line item ${lineItemIndex + 1}`
                                  : `Collapse details for magazines line item ${lineItemIndex + 1}`
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
                      
                      {!collapsedLineItems.has(lineItemIndex) && (
                      <>
                      <div className="px-6 py-5">
                        <CardContent className="space-y-5 p-0">
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-4">
                            
                            {/* Column 1 - Dropdowns */}
                            <div className="space-y-4">
                              <FormField
                                // @ts-ignore - Type mismatch between form and schema
                                control={form.control}
                                name={`magazineslineItems.${lineItemIndex}.network`}
                                render={({ field }) => (
                                  <FormItem className="flex flex-col space-y-1.5">
                                    <FormLabel className="text-sm text-muted-foreground font-medium">Network</FormLabel>
                                    <FormControl>
                                      <Combobox
                                        value={field.value}
                                        onValueChange={(value) => field.onChange(value)}
                                        placeholder="Select"
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
                                // @ts-ignore - Type mismatch between form and schema
                                control={form.control}
                                name={`magazineslineItems.${lineItemIndex}.title`}
                                render={({ field }) => (
                                  <FormItem className="flex flex-col space-y-1.5">
                                    <FormLabel className="text-sm text-muted-foreground font-medium">Title</FormLabel>
                                        <div className="flex-1 flex items-center space-x-1">
                                          <FormControl>
                                            <Combobox
                                              value={field.value}
                                              onValueChange={field.onChange}
                                              disabled={!selectedNetwork}
                                              placeholder={selectedNetwork ? "Select Title" : "Select Network first"}
                                              searchPlaceholder="Search titles..."
                                              emptyText={
                                                selectedNetwork
                                                  ? `No titles found for \"${selectedNetwork}\".`
                                                  : "Select Network first"
                                              }
                                              buttonClassName="h-9 w-full rounded-md"
                                              options={filteredMagazines.map((magazines) => ({
                                                value: magazines.title || `title-${magazines.id}`,
                                                label: magazines.title || "(Untitled)",
                                              }))}
                                            />
                                          </FormControl>
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
                                              <PlusCircle className="h-5 w-5 text-primary" />
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
                                          { value: "cpm", label: "CPM" },
                                          { value: "fixed_cost", label: "Fixed Cost" },
                                          { value: "insertions", label: "Insertions" },
                                          { value: "package", label: "Package" },
                                        ]}
                                      />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            </div>

                            {/* Column 2 - Placement and Buying Demo */}
                            <div className="space-y-4">
                              <FormItem className="flex flex-col space-y-1.5">
                                <FormLabel className="text-sm text-muted-foreground font-medium">Placement</FormLabel>
                                <FormControl>
                                  <Textarea
                                    {...form.register(`magazineslineItems.${lineItemIndex}.placement`)}
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
                                    {...form.register(`magazineslineItems.${lineItemIndex}.buyingDemo`)}
                                    placeholder="Enter buying demo details"
                                    className="w-full min-h-0 h-10 text-sm rounded-md border border-border/50 bg-muted/30 transition-colors focus:bg-background"
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
      <FormItem className="flex flex-col space-y-1.5">
        <FormLabel className="text-sm text-muted-foreground font-medium">Ad Size</FormLabel>
        <div className="flex-1 flex items-center space-x-1">
          <FormControl>
            <Combobox
              value={field.value}
              onValueChange={field.onChange}
              placeholder="Select Ad Size"
              searchPlaceholder="Search ad sizes..."
              emptyText={magazinesAdSizes.length === 0 ? "No ad sizes found." : "No ad sizes found."}
              buttonClassName="h-9 w-full rounded-md"
              options={magazinesAdSizes.map((adSize) => ({
                value: adSize.adsize || `adsize-${adSize.id}`,
                label: adSize.adsize || "(Unnamed ad size)",
              }))}
            />
          </FormControl>
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
            <PlusCircle className="h-5 w-5 text-primary" />
          </Button>
        </div>
        <FormMessage />
      </FormItem>
    )}
  />       

                              <FormItem className="flex flex-col space-y-1.5">
                                <FormLabel className="text-sm text-muted-foreground font-medium">Market</FormLabel>
                                <FormControl>
                                  <Textarea
                                    {...form.register(`magazineslineItems.${lineItemIndex}.market`)}
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
                                        <Checkbox
                                          checked={field.value}
                                          onCheckedChange={(checked) => {
                                            field.onChange(checked);
                                            const bursts =
                                              form.getValues(`magazineslineItems.${lineItemIndex}.bursts`) || [];
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
                                    "magazine",
                                    form.watch(`magazineslineItems.${lineItemIndex}.buyType`) || ""
                                  )}
                                </span>
                                <span>Media</span>
                                <span>{`Fee (${feemagazines}%)`}</span>
                              </div>
                              <div className={MP_BURST_ACTION_COLUMN}>
                                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Actions</span>
                              </div>
                            </div>
                          </div>
                        </div>
                        {form.watch(`magazineslineItems.${lineItemIndex}.bursts`, []).map((burstField, burstIndex) => {
                          const buyType = form.watch(`magazineslineItems.${lineItemIndex}.buyType`);
                          return (
                            <Card key={`${lineItemIndex}-${burstIndex}`} className={MP_BURST_CARD}>
                              <CardContent className={MP_BURST_CARD_CONTENT}>
                                <div className={MP_BURST_ROW_SHELL}>
                                  <div className={MP_BURST_LABEL_COLUMN}>
                                    <h4 className={MP_BURST_LABEL_HEADING}>
                                      {formatBurstLabel(
                                        burstIndex + 1,
                                        form.watch(`magazineslineItems.${lineItemIndex}.bursts.${burstIndex}.startDate`),
                                        form.watch(`magazineslineItems.${lineItemIndex}.bursts.${burstIndex}.endDate`)
                                      )}
                                    </h4>
                                  </div>
                                  
                                  <div className={MP_BURST_GRID_7}>
                                    <FormField
                                      // @ts-ignore - Type mismatch between form and schema
                                      control={form.control}
                                      name={`magazineslineItems.${lineItemIndex}.bursts.${burstIndex}.budget`}
                                      render={({ field }) => (
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
                                      )}
                                    />

                                    <FormField
                                      // @ts-ignore - Type mismatch between form and schema
                                      control={form.control}
                                      name={`magazineslineItems.${lineItemIndex}.bursts.${burstIndex}.buyAmount`}
                                      render={({ field }) => (
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
                                      )}
                                    />

                                    <div className="grid grid-cols-2 gap-2 col-span-2">
                                      <FormField
                                        // @ts-ignore - Type mismatch between form and schema
                                        control={form.control}
                                        name={`magazineslineItems.${lineItemIndex}.bursts.${burstIndex}.startDate`}
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
                                        // @ts-ignore - Type mismatch between form and schema
                                        control={form.control}
                                        name={`magazineslineItems.${lineItemIndex}.bursts.${burstIndex}.endDate`}
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
                                      // @ts-ignore - Type mismatch between form and schema
                                      control={form.control}
                                      name={`magazineslineItems.${lineItemIndex}.bursts.${burstIndex}.calculatedValue`}
                                      render={({ field }) => (
                                        <CpcFamilyBurstCalculatedField
                                          form={form}
                                          itemsKey="magazineslineItems"
                                          lineItemIndex={lineItemIndex}
                                          burstIndex={burstIndex}
                                          field={field}
                                          feePct={feemagazines || 0}
                                          netMedia={netMediaFeeMarkup}
                                          variant="magazine"
                                        />
                                      )}
                                    />

                                    <Input
                                        type="text"
                                        className="w-full h-10 text-sm bg-muted/30 border-border/40 text-muted-foreground"
                                        value={formatMoney(
                                          form.getValues(`magazineslineItems.${lineItemIndex}.budgetIncludesFees`)
                                            ? (parseFloat(form.getValues(`magazineslineItems.${lineItemIndex}.bursts.${burstIndex}.budget`)?.replace(/[^0-9.]/g, "") || "0") / 100) * (100 - (feemagazines || 0))
                                            : parseFloat(form.getValues(`magazineslineItems.${lineItemIndex}.bursts.${burstIndex}.budget`)?.replace(/[^0-9.]/g, "") || "0")
                                        , { locale: "en-US", currency: "USD" })}
                                        readOnly
                                      />
                                    <Input
                                        type="text"
                                        className="w-full h-10 text-sm bg-muted/30 border-border/40 text-muted-foreground"
                                        value={formatMoney(
                                          form.getValues(`magazineslineItems.${lineItemIndex}.budgetIncludesFees`)
                                            ? (parseFloat(form.getValues(`magazineslineItems.${lineItemIndex}.bursts.${burstIndex}.budget`)?.replace(/[^0-9.]/g, "") || "0") / 100) * (feemagazines || 0)
                                            : (parseFloat(form.getValues(`magazineslineItems.${lineItemIndex}.bursts.${burstIndex}.budget`)?.replace(/[^0-9.]/g, "") || "0") / (100 - (feemagazines || 0))) * (feemagazines || 0)
                                        , { locale: "en-US", currency: "USD" })}
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
                                                          title: "",
                                                          buyType: "",
                                                          size: "",
                                                          publisher: "",
                                                          placement: "",
                                                          buyingDemo: "",
                                                          market: "",
                                                          fixedCostMedia: false,
                                                          clientPaysForMedia: false,
                                                          budgetIncludesFees: false,
                                                          noadserving: false,
                                                        ...(() => { const nextNumber = lineItemFields.length + 1; const id = createLineItemId(nextNumber); return { lineItemId: id, line_item_id: id, line_item: nextNumber, lineItem: nextNumber }; })(),
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
        open={magazinesExpertModalOpen}
        onOpenChange={handleMagazinesExpertModalOpenChange}
      >
        <DialogContent className="max-w-[95vw] w-[95vw] max-h-[95vh] h-[95vh] flex flex-col p-4 gap-0 overflow-hidden">
          <DialogHeader className="flex-shrink-0 pb-2">
            <DialogTitle>Magazines Media Expert Mode</DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-auto">
            <MagazinesExpertGrid
              campaignStartDate={campaignStartDate}
              campaignEndDate={campaignEndDate}
              feemagazines={feemagazines}
              rows={expertMagazinesRows}
              onRowsChange={handleExpertMagazinesRowsChange}
              publishers={publishers}
            />
          </div>
          <DialogFooter className="flex-shrink-0 border-t pt-3 mt-2">
            <Button type="button" onClick={handleMagazinesExpertApply}>
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={magazinesExpertExitConfirmOpen}
        onOpenChange={(open) => {
          if (!open) dismissMagazinesExpertExitConfirm()
        }}
      >
        <DialogContent
          className="z-[100] sm:max-w-md"
          onClick={(e) => {
            if (
              (e.target as HTMLElement).closest(
                "[data-magazinesexpert-exit-yes]"
              )
            ) {
              return
            }
            dismissMagazinesExpertExitConfirm()
          }}
        >
          <DialogHeader>
            <DialogTitle>Leave Magazines Media Expert Mode?</DialogTitle>
            <DialogDescription>
              You have unsaved changes in Expert Mode. Apply saves them to the
              Magazines Media section; leaving now discards those edits.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={dismissMagazinesExpertExitConfirm}
            >
              No, keep editing
            </Button>
            <Button
              type="button"
              variant="destructive"
              data-magazinesexpert-exit-yes
              onClick={confirmMagazinesExpertExitWithoutSaving}
            >
              Yes, leave without saving
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
          className="col-span-3 bg-muted focus:ring-0 pointer-events-none" // Style to indicate read-only
        />
      </div>
      <div className="grid grid-cols-4 items-center gap-4">
        <Label htmlFor="newTitleNetwork" className="text-right">
          Network
        </Label>
        {/* Assuming 'publishers' contains the list of available networks */}
        <Combobox
          value={newTitleNetwork}
          onValueChange={setNewTitleNetwork}
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
