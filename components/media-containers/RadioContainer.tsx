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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { PlusCircle } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import { Textarea } from "@/components/ui/textarea"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { useToast } from "@/components/ui/use-toast"
import { Label } from "@/components/ui/label";
import { getPublishersForRadio, getClientInfo, getRadioStations, createRadioStation } from "@/lib/api"
import { formatBurstLabel } from "@/lib/bursts"
import { format } from "date-fns"
import { useMediaPlanContext } from "@/contexts/MediaPlanContext"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { ChevronDown, Copy, Plus, Trash2 } from "lucide-react"
import type { BillingBurst, BillingMonth } from "@/lib/billing/types"; // ad
import type { LineItem } from '@/lib/generateMediaPlan'
import { MEDIA_TYPE_ID_CODES, buildLineItemId } from "@/lib/mediaplan/lineItemIds"
import { formatMoney, parseMoneyInput } from "@/lib/format/money"
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
import {
  getMediaTypeThemeHex,
  mediaTypeSummaryStripeStyle,
  rgbaFromHex,
} from "@/lib/mediaplan/mediaTypeAccents"
import {
  RadioExpertGrid,
  createEmptyRadioExpertRow,
} from "@/components/media-containers/RadioExpertGrid"
import type { RadioExpertScheduleRow } from "@/lib/mediaplan/expertModeWeeklySchedule"
import {
  mapRadioExpertRowsToStandardLineItems,
  mapStandardRadioLineItemsToExpertRows,
} from "@/lib/mediaplan/expertOohRadioMappings"
import {
  mergeRadioStandardFromExpertWithPrevious,
  serializeRadioExpertRowsBaseline,
  serializeRadioStandardLineItemsBaseline,
} from "@/lib/mediaplan/expertModeSwitch"
import {
  type BuyType,
  deliverablesFromBudget,
  netFromGross,
  roundDeliverables,
} from "@/lib/mediaplan/deliverableBudget"
import { buildWeeklyGanttColumnsFromCampaign } from "@/lib/utils/weeklyGanttColumns"
import { SingleDatePicker } from "@/components/ui/single-date-picker"
import { defaultMediaBurstStartDate, defaultMediaBurstEndDate } from "@/lib/date-picker-anchor"
import MediaContainerTimelineCollapsible from "@/components/media-containers/MediaContainerTimelineCollapsible"

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

const MEDIA_ACCENT_HEX = getMediaTypeThemeHex("radio")

function netMediaPctOfGross(rawBudget: number, budgetIncludesFees: boolean, feePct: number): number {
  if (!budgetIncludesFees) return rawBudget;
  return (rawBudget * (100 - (feePct || 0))) / 100;
}

// Exported utility function to get bursts
export function getAllBursts(form) {
  const radiolineItems = form.getValues("radiolineItems") || [];

  return radiolineItems.flatMap((lineItem) =>
    lineItem.bursts.map((burst) => ({
      startDate: burst.startDate,
      endDate: burst.endDate,
      budget: burst.budget,
    }))
  );
}

const radioBurstSchema = z.object({
  budget: z.string().min(1, "Budget is required"),
  buyAmount: z.string().min(1, "Buy Amount is required"),
  startDate: z.date(),
  endDate: z.date(),
  calculatedValue: z.number().optional(),
  fee: z.number().optional(),
})

const radioLineItemSchema = z.object({
  network: z.string().min(1, "Network is required"),
  station: z.string().min(1, "Station is required"),
  buyType: z.string().min(1, "Buy Type is required"),
  bidStrategy: z.string().default("").optional(), // e.g., "Reach", "Frequency" or N/A for some TV buys
  placement: z.string().default(""),
  format: z.string().default(""),
  duration: z.string().default(""),
  buyingDemo: z.string().default(""),
  market: z.string().default(""),
  platform: z.string().default(""),
  creativeTargeting: z.string().default(""),
  creative: z.string().default(""),
  fixedCostMedia: z.boolean().default(false),
  clientPaysForMedia: z.boolean().default(false),
  budgetIncludesFees: z.boolean().default(false),
  noadserving: z.boolean().default(false),
  lineItemId: z.string().optional(),
  line_item_id: z.string().optional(),
  line_item: z.union([z.string(), z.number()]).optional(),
  lineItem: z.union([z.string(), z.number()]).optional(),
  bursts: z.array(radioBurstSchema).min(1, "At least one burst is required"),
  totalMedia: z.number().optional(),
  totalDeliverables: z.number().optional(),
  totalFee: z.number().optional(),
})

const radioFormSchema = z.object({
  radiolineItems: z.array(radioLineItemSchema),
  overallDeliverables: z.number().optional(),
})

type RadioFormValues = z.infer<typeof radioFormSchema>

interface Publisher {
  id: number;
  publisher_name: string;
}

interface RadioStation {
  id: number;
  station: string;
  network: string;
}

interface RadioContainerProps {
  clientId: string;
  feeradio: number;
  onTotalMediaChange: (totalMedia: number, totalFee: number) => void;
  onBurstsChange: (bursts: BillingBurst[]) => void;
  onInvestmentChange: (investmentByMonth: any) => void;
  onLineItemsChange: (items: LineItem[]) => void;
  onMediaLineItemsChange: (lineItems: any[]) => void; // New callback for raw line item data
  campaignStartDate: Date;
  campaignEndDate: Date;
  campaignBudget: number;
  campaignId: string;
  mediaTypes: string[];
  initialLineItems?: any[]; // For edit mode data loading
}

export function getRadioBursts(
  form: UseFormReturn<RadioFormValues>,
  feeradio: number
): BillingBurst[] {
  const radiolineItems = form.getValues("radiolineItems") || []

  return radiolineItems.flatMap(li =>
    li.bursts.map(burst => {
      const rawBudget = parseFloat(burst.budget.replace(/[^0-9.]/g, "")) || 0

      const pct = feeradio || 0
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

        mediaType:          "radio",
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

export function calculateInvestmentPerMonth(form, feeradio) {
  const radiolineItems = form.getValues("radiolineItems") || [];
  let monthlyInvestment: Record<string, number> = {};

  radiolineItems.forEach((lineItem) => {
    lineItem.bursts.forEach((burst) => {
      const startDate = new Date(burst.startDate);
      const endDate = new Date(burst.endDate);
      const lineMedia = parseFloat(burst.budget.replace(/[^0-9.]/g, "")) || 0;
      const feePercentage = feeradio || 0;

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

export function calculateBurstInvestmentPerMonth(form, feeradio) {
  const radiolineItems = form.getValues("radiolineItems") || [];
  let monthlyInvestment: Record<string, number> = {};

  radiolineItems.forEach((lineItem) => {
    lineItem.bursts.forEach((burst) => {
      const startDate = new Date(burst.startDate);
      const endDate = new Date(burst.endDate);
      const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      const burstBudget = parseFloat(burst.budget.replace(/[^0-9.]/g, "")) || 0;
      const feePercentage = feeradio || 0;
      
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

const LOAD_DELIVERABLES_EPS = 1e-5

function unitRateInferredFromNetAndDeliverables(
  buyType: BuyType,
  netBudget: number,
  deliverables: number
): number {
  if (!Number.isFinite(netBudget) || !Number.isFinite(deliverables) || deliverables === 0) {
    return 0
  }
  if (buyType === "cpm") return (netBudget * 1000) / deliverables
  if (buyType === "fixed_cost") return netBudget
  return netBudget / deliverables
}

/**
 * Initial-load deliverables: net budget from gross burst budget, then shared
 * `deliverablesFromBudget`. If stored `calculatedValue` disagrees with parsed
 * `buyAmount` as unit rate (legacy rows used `buyAmount` as qty), infer rate
 * from net ÷ deliverables and recompute.
 */
function computeLoadedDeliverables(
  buyType: string,
  burst: any,
  budgetIncludesFees: boolean,
  feePct: number
): number {
  const bt = String(buyType || "").toLowerCase() as BuyType
  if (bt === "bonus") {
    return (
      parseFloat(String(burst?.calculatedValue ?? 0).replace(/[^0-9.]/g, "")) || 0
    )
  }
  const gross =
    parseFloat(String(burst?.budget ?? "0").replace(/[^0-9.]/g, "")) || 0
  const storedCvRaw = burst?.calculatedValue
  const storedCv =
    typeof storedCvRaw === "number" && Number.isFinite(storedCvRaw)
      ? storedCvRaw
      : parseFloat(String(storedCvRaw ?? "0").replace(/[^0-9.]/g, "")) || 0
  const buyAmount =
    parseFloat(String(burst?.buyAmount ?? "1").replace(/[^0-9.]/g, "")) || 0
  const net = netFromGross(gross, budgetIncludesFees, feePct)
  const primary = deliverablesFromBudget(bt, net, buyAmount)
  if (Number.isNaN(primary)) {
    return roundDeliverables(bt, storedCv)
  }
  const rPrimary = roundDeliverables(bt, primary)
  const rStored = roundDeliverables(bt, storedCv)
  if (Math.abs(rPrimary - rStored) <= LOAD_DELIVERABLES_EPS) {
    return rPrimary
  }
  const inferred = unitRateInferredFromNetAndDeliverables(bt, net, storedCv)
  const fromInferred = deliverablesFromBudget(bt, net, inferred)
  if (!Number.isNaN(fromInferred)) {
    return roundDeliverables(bt, fromInferred)
  }
  return rStored
}

export default function RadioContainer({
  clientId,
  feeradio,
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
}: RadioContainerProps) {
  // Add refs to track previous values
  const prevInvestmentRef = useRef<{ monthYear: string; amount: string }[]>([]);
  const prevBurstsRef = useRef<BillingBurst[]>([]);
  const publishersRef = useRef<Publisher[]>([]);
  const radioStationsRef = useRef<RadioStation[]>([]);
  const hasProcessedInitialLineItemsRef = useRef(false);
  const lastProcessedLineItemsRef = useRef<string>('');
  const [publishers, setPublishers] = useState<Publisher[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [radioStations, setRadioStations] = useState<RadioStation[]>([]);
  const { toast } = useToast()
  const { mbaNumber } = useMediaPlanContext()
  const [overallDeliverables, setOverallDeliverables] = useState(0);
  const [expertRadioRows, setExpertRadioRows] = useState<RadioExpertScheduleRow[]>([]);
  const [radioExpertModalOpen, setRadioExpertModalOpen] = useState(false);
  const [radioExpertExitConfirmOpen, setRadioExpertExitConfirmOpen] = useState(false);
  /** Brief visual cue on Expert segment so users notice the toggle on first paint. */
  const [expertSegmentAttention, setExpertSegmentAttention] = useState(true);
  const radioExpertModalOpenRef = useRef(false);
  const radioStandardBaselineRef = useRef<string>("");
  const radioExpertRowsBaselineRef = useRef<string>("");
  radioExpertModalOpenRef.current = radioExpertModalOpen;

  const radioExpertWeekColumns = useMemo(
    () => buildWeeklyGanttColumnsFromCampaign(campaignStartDate, campaignEndDate),
    [campaignStartDate, campaignEndDate]
  );

  // Deterministic ID generator aligned with what is shown in the UI
  const createLineItemId = useCallback(
    (lineNumber: number) =>
      buildLineItemId(mbaNumber, MEDIA_TYPE_ID_CODES.radio, lineNumber),
    [mbaNumber]
  );

  // Form initialization
  const form = useForm({
    defaultValues: {
      radiolineItems: [
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
          platform: "",
          creativeTargeting: "",
          creative: "",
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
      overallDeliverables: 0,
    },
  }) as any;

  // Field array hook
  const {
    fields: lineItemFields,
    append: appendLineItem,
    remove: removeLineItemBase,
  } = useFieldArray({
    control: form.control,
    name: "radiolineItems",
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
    const items = form.getValues("radiolineItems") || []
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
    if (radioExpertModalOpenRef.current) return;
    radioStandardBaselineRef.current = serializeRadioStandardLineItemsBaseline(
      form.getValues("radiolineItems")
    );
  }, [form]);

  const [isAddStationDialogOpen, setIsAddStationDialogOpen] = useState(false);
  const [newStationName, setNewStationName] = useState("");
  const [newStationNetwork, setNewStationNetwork] = useState("");
  // Store the lineItemIndex for which the "Add Station" was clicked
  const [currentLineItemIndexForNewStation, setCurrentLineItemIndexForNewStation] = useState<number | null>(null);
  const [networksAvailable, setNetworksAvailable] = useState(true); // Assume true until fetched
  // Function to re-fetch TV stations
  const fetchAndUpdateRadioStations = async () => {
    try {
      setIsLoading(true);
      const fetchedRadioStations = await getRadioStations(); //
      radioStationsRef.current = fetchedRadioStations; //
      setRadioStations(fetchedRadioStations); //
    } catch (error) {
      toast({ //
        title: "Error refreshing Radio Stations",
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
    const newStationData: Omit<RadioStation, 'id'> = { //
      station: newStationName,
      network: newStationNetwork,
  };
  const createdStation = await createRadioStation(newStationData);

    toast({
      title: "Station Added",
      description: `${createdStation.station} has been successfully added.`,
    });
  
  await fetchAndUpdateRadioStations();

  // Optionally, select the newly added station and network in the form
  if (currentLineItemIndexForNewStation !== null) {
    form.setValue(`radiolineItems.${currentLineItemIndexForNewStation}.network`, createdStation.network); //
    form.setValue(`radiolineItems.${currentLineItemIndexForNewStation}.station`, createdStation.station); //
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

  useEffect(() => {
    const id = window.setTimeout(() => setExpertSegmentAttention(false), 2800);
    return () => window.clearTimeout(id);
  }, []);

  const handleExpertRadioRowsChange = useCallback((next: RadioExpertScheduleRow[]) => {
    setExpertRadioRows(next);
  }, []);

  const openRadioExpertModal = useCallback(() => {
    const mapped = mapStandardRadioLineItemsToExpertRows(
      form.getValues("radiolineItems") || [],
      radioExpertWeekColumns,
      campaignStartDate,
      campaignEndDate
    );
    const weekKeys = radioExpertWeekColumns.map((c) => c.weekKey);
    const rows: RadioExpertScheduleRow[] =
      mapped.length > 0
        ? mapped
        : [
            createEmptyRadioExpertRow(
              typeof crypto !== "undefined" && crypto.randomUUID
                ? crypto.randomUUID()
                : `radio-expert-${Date.now()}`,
              campaignStartDate,
              campaignEndDate,
              weekKeys
            ),
          ];
    radioExpertRowsBaselineRef.current = serializeRadioExpertRowsBaseline(rows);
    setExpertRadioRows(rows);
    setRadioExpertExitConfirmOpen(false);
    setRadioExpertModalOpen(true);
  }, [campaignStartDate, campaignEndDate, form, radioExpertWeekColumns]);

  const dismissRadioExpertExitConfirm = useCallback(() => {
    setRadioExpertExitConfirmOpen(false);
  }, []);

  const confirmRadioExpertExitWithoutSaving = useCallback(() => {
    setRadioExpertExitConfirmOpen(false);
    collapseAllLineItems();
    setRadioExpertModalOpen(false);
  }, [collapseAllLineItems]);

  const handleRadioExpertModalOpenChange = useCallback(
    (open: boolean) => {
      if (open) {
        setRadioExpertModalOpen(true);
        return;
      }
      const dirty =
        serializeRadioExpertRowsBaseline(expertRadioRows) !==
        radioExpertRowsBaselineRef.current;
      if (!dirty) {
        collapseAllLineItems();
        setRadioExpertModalOpen(false);
        return;
      }
      setRadioExpertExitConfirmOpen(true);
    },
    [collapseAllLineItems, expertRadioRows]
  );

  const handleRadioExpertApply = useCallback(() => {
    const prevLineItems = form.getValues("radiolineItems") || [];
    const standard = mapRadioExpertRowsToStandardLineItems(
      expertRadioRows,
      radioExpertWeekColumns,
      campaignStartDate,
      campaignEndDate,
      {
        feePctRadio: feeradio,
        budgetIncludesFees: Boolean(prevLineItems[0]?.budgetIncludesFees),
      }
    );
    const merged = mergeRadioStandardFromExpertWithPrevious(standard, prevLineItems);
    form.setValue("radiolineItems", merged as any, {
      shouldDirty: true,
      shouldValidate: false,
    });
    radioStandardBaselineRef.current = serializeRadioStandardLineItemsBaseline(
      form.getValues("radiolineItems")
    );
    setRadioExpertExitConfirmOpen(false);
    collapseAllLineItems();
    setRadioExpertModalOpen(false);
  }, [
    campaignStartDate,
    campaignEndDate,
    collapseAllLineItems,
    expertRadioRows,
    feeradio,
    form,
    radioExpertWeekColumns,
  ]);

  const handleDuplicateLineItem = useCallback((lineItemIndex: number) => {
    const items = form.getValues("radiolineItems") || [];
    const source = items[lineItemIndex];

    if (!source) {
      toast({
        title: "No line item to duplicate",
        description: "Cannot duplicate a missing line item.",
        variant: "destructive",
      });
      return;
    }

    const lineNumber = (source.line_item ?? source.lineItem ?? lineItemIndex + 1) + 1;
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
    name: "radiolineItems",
    defaultValue: form.getValues("radiolineItems")
  });

  // Data loading for edit mode (do not reset form while the expert modal owns draft state).
  useEffect(() => {
    if (radioExpertModalOpenRef.current) return;
    if (initialLineItems && initialLineItems.length > 0) {
      // Defensive dedupe: upstream API pagination bugs can cause repeated rows.
      // Keep first occurrence per stable identifier.
      const dedupedInitialLineItems = (() => {
        const seen = new Set<string>();
        const deduped: any[] = [];

        for (const item of initialLineItems) {
          const primaryKey =
            (item?.line_item_id || item?.lineItemId || item?.id) ??
            "";

          if (primaryKey && String(primaryKey).trim()) {
            const key = `id:${String(primaryKey).trim()}`;
            if (seen.has(key)) continue;
            seen.add(key);
            deduped.push(item);
            continue;
          }

          // Fallback key when id fields are missing (should be rare)
          const fallbackKey = JSON.stringify({
            market: item?.market ?? "",
            network: item?.network ?? item?.platform ?? item?.publisher ?? "",
            station: item?.station ?? item?.site ?? "",
            buy_type: item?.buy_type ?? item?.buyType ?? "",
            placement: item?.placement ?? "",
          });
          const key = `fallback:${fallbackKey}`;
          if (seen.has(key)) continue;
          seen.add(key);
          deduped.push(item);
        }

        if (deduped.length !== initialLineItems.length) {
          console.warn(
            `[RadioContainer] Deduped initialLineItems from ${initialLineItems.length} to ${deduped.length}`
          );
        }

        return deduped;
      })();

      // Create a unique key from the line items to detect if they've changed
      const lineItemsKey = JSON.stringify(dedupedInitialLineItems.map((item: any) => ({
        id: item.id,
        market: item.market,
        network: item.network,
        station: item.station,
        buy_type: item.buy_type,
      })));
      
      if (hasProcessedInitialLineItemsRef.current && lastProcessedLineItemsRef.current === lineItemsKey) {
        console.log("[RadioContainer] Skipping duplicate initialLineItems load");
      } else {
      console.log("[RadioContainer] Loading initialLineItems:", dedupedInitialLineItems);

      hasProcessedInitialLineItemsRef.current = true;
      lastProcessedLineItemsRef.current = lineItemsKey;

      const transformedLineItems = dedupedInitialLineItems.map((item: any, index: number) => {
        console.log(`[RadioContainer] Processing item ${index}:`, {
          market: item.market,
          network: item.network,
          station: item.station,
          buy_type: item.buy_type,
          bursts: item.bursts,
          bursts_type: typeof item.bursts,
          bursts_json: item.bursts_json,
          bursts_json_type: typeof item.bursts_json,
        });

        // Safely parse bursts - check 'bursts' first (matches database schema), then fallback to 'bursts_json' for backward compatibility
        let parsedBursts: any[] = [];
        
        // First, try to get bursts from item.bursts (matches database schema)
        if (item.bursts) {
          try {
            if (Array.isArray(item.bursts)) {
              parsedBursts = item.bursts;
            } else if (typeof item.bursts === 'string') {
              const trimmed = item.bursts.trim();
              if (trimmed) {
                parsedBursts = JSON.parse(trimmed);
              }
            } else if (typeof item.bursts === 'object') {
              parsedBursts = [item.bursts];
            }
          } catch (parseError) {
            console.error(`[RadioContainer] Error parsing bursts for item ${index}:`, parseError, item.bursts);
            parsedBursts = [];
          }
        }
        // Fallback to bursts_json for backward compatibility
        else if (item.bursts_json) {
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
            console.error(`[RadioContainer] Error parsing bursts_json for item ${index}:`, parseError, item.bursts_json);
            parsedBursts = [];
          }
        }

        if (!Array.isArray(parsedBursts)) {
          parsedBursts = [];
        }

        const bursts = parsedBursts.length > 0 ? parsedBursts.map((burst: any) => ({
          budget: burst.budget || "",
          buyAmount: burst.buyAmount || "",
          startDate: burst.startDate ? new Date(burst.startDate) : defaultMediaBurstStartDate(campaignStartDate, campaignEndDate),
          endDate: burst.endDate ? new Date(burst.endDate) : defaultMediaBurstEndDate(campaignStartDate, campaignEndDate),
          calculatedValue: computeLoadedDeliverables(
            item.buy_type || item.buyType,
            burst,
            Boolean(item.budget_includes_fees || item.budgetIncludesFees),
            feeradio ?? 0
          ),
          fee: burst.fee ?? 0,
        })) : [{
          budget: "",
          buyAmount: "",
          startDate: defaultMediaBurstStartDate(campaignStartDate, campaignEndDate),
          endDate: defaultMediaBurstEndDate(campaignStartDate, campaignEndDate),
          calculatedValue: computeLoadedDeliverables(
            item.buy_type || item.buyType,
            {},
            Boolean(item.budget_includes_fees || item.budgetIncludesFees),
            feeradio ?? 0
          ),
          fee: 0,
        }];

        const lineItemId = item.line_item_id || item.lineItemId || `${mbaNumber || "RAD"}-${index + 1}`;
        const normalizedNetwork = item.network || item.platform || item.publisher || "";
        const normalizedStation = item.station || item.site || "";

        return {
          market: item.market || "",
          network: normalizedNetwork,
          station: normalizedStation,
          placement: item.placement || "",
          platform: normalizedNetwork,
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
          bursts: bursts,
        };
      });

      console.log("[RadioContainer] Transformed line items:", transformedLineItems);

      form.reset({
        radiolineItems: transformedLineItems,
        overallDeliverables: 0,
      });
      }
    }
    radioStandardBaselineRef.current = serializeRadioStandardLineItemsBaseline(
      form.getValues("radiolineItems")
    );
  }, [initialLineItems, form, campaignStartDate, campaignEndDate, mbaNumber, feeradio]);

  // Transform form data to API schema format
  useEffect(() => {
    const formLineItems = form.getValues('radiolineItems') || [];
    
    const transformedLineItems = formLineItems.map((lineItem, index) => {
      // Calculate totalMedia from raw budget amounts (for display in MBA section)
      let totalMedia = 0;
      lineItem.bursts.forEach((burst) => {
        const budget = parseFloat(burst.budget.replace(/[^0-9.]/g, "")) || 0;
        if (lineItem.budgetIncludesFees) {
          // Budget is gross, extract media portion
          // Media = Budget * ((100 - Fee) / 100)
          totalMedia += (budget * (100 - (feeradio || 0))) / 100;
        } else {
          // Budget is net media
          totalMedia += budget;
        }
      });
      const lineItemId = lineItem.lineItemId || lineItem.line_item_id || `${mbaNumber || "RAD"}-${index + 1}`;
      const lineNumber = lineItem.line_item ?? lineItem.lineItem ?? index + 1;

      // Format bursts for API
      const formattedBursts = lineItem.bursts.map(burst => ({
        budget: burst.budget || "",
        buyAmount: burst.buyAmount || "",
        startDate: burst.startDate ? (burst.startDate instanceof Date ? burst.startDate.toISOString() : burst.startDate) : "",
        endDate: burst.endDate ? (burst.endDate instanceof Date ? burst.endDate.toISOString() : burst.endDate) : "",
        calculatedValue: burst.calculatedValue || 0,
        fee: burst.fee || 0,
      }));

      return {
        media_plan_version: 0, // Will be set by parent component
        mba_number: mbaNumber || "",
        mp_client_name: "", // Will be set by parent component
        mp_plannumber: "", // Will be set by parent component
        network: lineItem.network || "",
        station: lineItem.station || "",
        platform: lineItem.platform || "",
        bid_strategy: lineItem.bidStrategy || "",
        buy_type: lineItem.buyType || "",
        placement: lineItem.placement || "",
        format: lineItem.format || "",
        duration: lineItem.duration || "",
        creative_targeting: lineItem.creativeTargeting || "",
        creative: lineItem.creative || "",
        buying_demo: lineItem.buyingDemo || "",
        market: lineItem.market || "",
        fixed_cost_media: lineItem.fixedCostMedia || false,
        client_pays_for_media: lineItem.clientPaysForMedia || false,
        budget_includes_fees: lineItem.budgetIncludesFees || false,
        no_adserving: lineItem.noadserving || false,
        line_item_id: lineItemId,
        bursts: formattedBursts, // Include bursts array for extractAndFormatBursts()
        bursts_json: JSON.stringify(formattedBursts), // Also include as JSON string for compatibility
        line_item: lineNumber,
        totalMedia: totalMedia,
      };
    });

  onMediaLineItemsChange(transformedLineItems);
}, [watchedLineItems, mbaNumber, feeradio, form, onMediaLineItemsChange]);
  
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
          // Media = Budget * ((100 - Fee) / 100)
          // Fees = Budget * (Fee / 100)
          lineMedia += (budget * (100 - (feeradio || 0))) / 100;
          lineFee += (budget * (feeradio || 0)) / 100;
        } else {
          // Budget is net media, fee calculated on top
          // Media = Budget (unchanged)
          // Fees = Budget * (Fee / (100 - Fee))
          lineMedia += budget;
          const fee = feeradio ? (budget * feeradio) / (100 - feeradio) : 0;
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
  }, [watchedLineItems, feeradio]);
  
  // Callback handlers
  const handleLineItemValueChange = useCallback((lineItemIndex: number) => {
    const radiolineItems = form.getValues("radiolineItems") || [];
    let overallMedia = 0;
    let overallFee = 0;
    let overallCost = 0;
    let overallDeliverableCount = 0;

    radiolineItems.forEach((lineItem) => {
      let lineMedia = 0;
      let lineFee = 0;
      let lineDeliverables = 0;

      lineItem.bursts.forEach((burst) => {
        const budget = parseFloat(burst?.budget?.replace(/[^0-9.]/g, "") || "0");
        if (lineItem.budgetIncludesFees) {
          lineMedia += (budget * (100 - (feeradio || 0))) / 100;
          lineFee += (budget * (feeradio || 0)) / 100;
        } else {
          lineMedia += budget;
          const fee = feeradio ? (budget * feeradio) / (100 - feeradio) : 0;
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
  }, [form, feeradio, onTotalMediaChange]);

  const handleBuyTypeChange = useCallback(
    (lineItemIndex: number, value: string) => {
      form.setValue(`radiolineItems.${lineItemIndex}.buyType`, value);

      if (value === "bonus" || value === "package_inclusions") {
        const currentBursts =
          form.getValues(`radiolineItems.${lineItemIndex}.bursts`) || [];
        const zeroedBursts = currentBursts.map((burst: any) => ({
          ...burst,
          budget: "0",
          buyAmount: "0",
          calculatedValue: burst.calculatedValue ?? 0,
        }));

        form.setValue(`radiolineItems.${lineItemIndex}.bursts`, zeroedBursts, {
          shouldDirty: true,
        });
      }

      handleLineItemValueChange(lineItemIndex);
    },
    [form, handleLineItemValueChange]
  );

  const handleValueChange = useCallback((lineItemIndex: number, burstIndex: number, budgetIncludesFeesOverride?: boolean) => {
    const burst = form.getValues(`radiolineItems.${lineItemIndex}.bursts.${burstIndex}`);
    const lineItem = form.getValues(`radiolineItems.${lineItemIndex}`);
    const rawBudget = parseFloat(burst?.budget?.replace(/[^0-9.]/g, "") || "0");
    const budgetIncludesFees = budgetIncludesFeesOverride ?? Boolean(lineItem?.budgetIncludesFees);
    // Standard burst `budget` is gross; deliverables math uses net media (`netFromGross`).
    const netBudget = netFromGross(rawBudget, budgetIncludesFees, feeradio || 0);
    const buyAmount = parseFloat(burst?.buyAmount?.replace(/[^0-9.]/g, "") || "1");
    const buyTypeRaw = form.getValues(`radiolineItems.${lineItemIndex}.buyType`);
    const buyType = String(buyTypeRaw || "").toLowerCase() as BuyType;

    const rawDeliverables = deliverablesFromBudget(buyType, netBudget, buyAmount);
    if (Number.isNaN(rawDeliverables)) {
      // bonus / package_inclusions: keep user-entered `calculatedValue` (do not overwrite).
      return;
    }

    const nextCalculated = roundDeliverables(buyType, rawDeliverables);
    const currentValue = form.getValues(
      `radiolineItems.${lineItemIndex}.bursts.${burstIndex}.calculatedValue`
    );
    const cur =
      typeof currentValue === "number" && Number.isFinite(currentValue)
        ? currentValue
        : parseFloat(String(currentValue ?? "0").replace(/[^0-9.]/g, "")) || 0;
    if (Math.abs(cur - nextCalculated) <= 1e-6) {
      return;
    }

    form.setValue(
      `radiolineItems.${lineItemIndex}.bursts.${burstIndex}.calculatedValue`,
      nextCalculated,
      {
        shouldValidate: false,
        shouldDirty: false,
      }
    );

    handleLineItemValueChange(lineItemIndex);
  }, [feeradio, form, handleLineItemValueChange]);

  const handleAppendBurst = useCallback((lineItemIndex: number) => {
    const currentBursts = form.getValues(`radiolineItems.${lineItemIndex}.bursts`) || [];
    
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
    
    form.setValue(`radiolineItems.${lineItemIndex}.bursts`, [
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
    const currentBursts = form.getValues(`radiolineItems.${lineItemIndex}.bursts`) || [];

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

    form.setValue(`radiolineItems.${lineItemIndex}.bursts`, [
      ...currentBursts,
      duplicatedBurst,
    ]);

    handleLineItemValueChange(lineItemIndex);
  }, [form, handleLineItemValueChange, toast]);

  const handleRemoveBurst = useCallback((lineItemIndex: number, burstIndex: number) => {
    const currentBursts = form.getValues(`radiolineItems.${lineItemIndex}.bursts`) || [];
    form.setValue(
      `radiolineItems.${lineItemIndex}.bursts`,
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

        const fetchedPublishers = await getPublishersForRadio();
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
    const fetchRadioStations = async () => {
      try {
        // Check if we already have radio stations cached
        if (radioStationsRef.current.length > 0) {
          setRadioStations(radioStationsRef.current);
          setIsLoading(false);
          return;
        }

        const fetchedRadioStations = await getRadioStations();
        radioStationsRef.current = fetchedRadioStations;
        setRadioStations(fetchedRadioStations);
      } catch (error) {
        toast({
          title: "Error loading Radio Stations",
          description: error.message,
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };
  
    fetchRadioStations();
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
  const calculatedBursts = getRadioBursts(form, feeradio || 0);
  let burstIndex = 0;

  const items: LineItem[] = form.getValues('radiolineItems').flatMap((lineItem, lineItemIndex) =>
    lineItem.bursts.map(burst => {
      const computedBurst = calculatedBursts[burstIndex++];
      const mediaAmount = computedBurst
        ? computedBurst.mediaAmount
        : parseFloat(String(burst.budget).replace(/[^0-9.-]+/g, "")) || 0;
      const lineNumber = lineItem.line_item ?? lineItem.lineItem ?? lineItemIndex + 1;
      let lineItemId = lineItem.lineItemId || lineItem.line_item_id;
      if (!lineItemId) {
        lineItemId = createLineItemId(lineNumber);
        form.setValue(`radiolineItems.${lineItemIndex}.lineItemId`, lineItemId);
        form.setValue(`radiolineItems.${lineItemIndex}.line_item_id`, lineItemId);
      }

      return {
        market: lineItem.market,                                // or fixed value
        network: lineItem.network,
        station: lineItem.station,
        bidStrategy: lineItem.bidStrategy,
        placement: lineItem.placement,
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
}, [watchedLineItems, feeradio, createLineItemId, form, onLineItemsChange]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      const investmentByMonth = calculateInvestmentPerMonth(form, feeradio || 0);
      const bursts = getRadioBursts(form, feeradio || 0);
      
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
  }, [watchedLineItems, feeradio, form, onBurstsChange, onInvestmentChange]);

  const getBursts = () => {
    const formLineItems = form.getValues("radiolineItems") || [];
    return formLineItems.flatMap(item =>
      item.bursts.map(burst => {
        const budget = parseFloat(burst.budget?.replace(/[^0-9.]/g, "") || "0");
        let mediaAmount = 0;
        let feeAmount = 0;

        if (item.budgetIncludesFees && item.clientPaysForMedia) {
          // Both true: budget is gross, extract fee only, mediaAmount = 0
          // Media = 0
          // Fees = Budget * (Fee / 100)
          feeAmount = budget * ((feeradio || 0) / 100);
          mediaAmount = 0;
        } else if (item.budgetIncludesFees) {
          // Only budgetIncludesFees: budget is gross, split into media and fee
          // Media = Budget * ((100 - Fee) / 100)
          // Fees = Budget * (Fee / 100)
          mediaAmount = (budget * (100 - (feeradio || 0))) / 100;
          feeAmount = (budget * (feeradio || 0)) / 100;
        } else if (item.clientPaysForMedia) {
          // Only clientPaysForMedia: budget is net media, only fee is billed
          feeAmount = (budget / (100 - (feeradio || 0))) * (feeradio || 0);
          mediaAmount = 0;
        } else {
          // Neither: budget is net media, fee calculated on top
          // Media = Budget (unchanged)
          // Fees = Budget * (Fee / (100 - Fee))
          mediaAmount = budget;
          feeAmount = (budget * (feeradio || 0)) / (100 - (feeradio || 0));
        }

        const billingBurst: BillingBurst = {
          startDate: burst.startDate,
          endDate: burst.endDate,
          mediaAmount: mediaAmount,
          feeAmount: feeAmount,
          totalAmount: mediaAmount + feeAmount,
          mediaType: 'radio',
          feePercentage: feeradio,
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
          <div className="h-1" style={mediaTypeSummaryStripeStyle(MEDIA_ACCENT_HEX)} />
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <CardTitle className="text-base font-semibold tracking-tight">Radio Media</CardTitle>
                  {radioExpertModalOpen ? (
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
                  aria-label="Radio entry mode"
                  className="inline-flex shrink-0 rounded-lg border border-border bg-muted/50 p-0.5"
                >
                  <button
                    type="button"
                    aria-pressed={!radioExpertModalOpen}
                    className={cn(
                      "rounded-md px-3 py-1.5 text-xs font-medium transition-all",
                      !radioExpertModalOpen
                        ? "text-white shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                    style={
                      !radioExpertModalOpen
                        ? { backgroundColor: MEDIA_ACCENT_HEX }
                        : undefined
                    }
                    onClick={() => {
                      if (radioExpertModalOpen) {
                        handleRadioExpertModalOpenChange(false);
                      }
                    }}
                  >
                    Standard
                  </button>
                  <button
                    type="button"
                    aria-pressed={radioExpertModalOpen}
                    className={cn(
                      "rounded-md px-3 py-1.5 text-xs font-medium transition-all",
                      radioExpertModalOpen
                        ? "text-white shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                      expertSegmentAttention &&
                        !radioExpertModalOpen &&
                        "animate-pulse"
                    )}
                    style={{
                      ...(radioExpertModalOpen
                        ? { backgroundColor: MEDIA_ACCENT_HEX }
                        : {}),
                      ...(expertSegmentAttention && !radioExpertModalOpen
                        ? {
                            boxShadow: `0 0 0 2px ${rgbaFromHex(MEDIA_ACCENT_HEX, 0.45)}`,
                          }
                        : {}),
                    }}
                    onClick={() => {
                      if (!radioExpertModalOpen) {
                        openRadioExpertModal();
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
                      {getDeliverablesLabel(form.getValues(`radiolineItems.${item.index - 1}.buyType`))}
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
                  <span className="text-[11px] text-muted-foreground font-normal block">Fee ({feeradio}%)</span>
                  <span>{formatMoney(overallTotals.overallFee, { locale: "en-AU", currency: "AUD" })}</span>
                </div>
                <div className="text-right">
                  <span className="text-[11px] text-muted-foreground font-normal block">Total</span>
                  <span className="text-primary">{formatMoney(overallTotals.overallCost, { locale: "en-AU", currency: "AUD" })}</span>
                </div>
              </div>
            </div>
            <MediaContainerTimelineCollapsible
              mediaTypeKey="radio"
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
                    const lineItem = form.getValues(`radiolineItems.${lineItemIndex}`);
                    let totalMedia = 0;
                    let totalCalculatedValue = 0;

                    lineItem.bursts.forEach((burst) => {
                      const budget = parseFloat(burst.budget.replace(/[^0-9.]/g, "")) || 0;
                      totalMedia += budget;
                      totalCalculatedValue += burst.calculatedValue || 0;
                    });

                    return { totalMedia, totalCalculatedValue };
                  };

                  const selectedNetwork = form.watch(`radiolineItems.${lineItemIndex}.network`);

                  // const selectedNetwork = form.watch(`televisionlineItems.${lineItemIndex}.network`); // Already exists above

                  let filteredRadioStations;
                  if (!selectedNetwork) {
                    filteredRadioStations = radioStations; // Show all stations if no network is selected
                  } else {
                    filteredRadioStations = radioStations.filter(station => station.network === selectedNetwork);
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
                              <CardTitle className="text-sm font-semibold tracking-tight">Radio Line Item</CardTitle>
                              <span className="font-mono text-[11px] text-muted-foreground">{`${mbaNumber}RA${lineItemIndex + 1}`}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              <span className="block text-[11px] text-muted-foreground">Total</span>
                              <span className="text-sm font-bold tabular-nums">
                                {formatMoney(
                                  form.getValues(`radiolineItems.${lineItemIndex}.budgetIncludesFees`)
                                    ? totalMedia
                                    : totalMedia + (totalMedia / (100 - (feeradio || 0))) * (feeradio || 0),
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
                                  ? `Expand details for radio line item ${lineItemIndex + 1}`
                                  : `Collapse details for radio line item ${lineItemIndex + 1}`
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
                            <span className="font-medium">Netowrk:</span> {form.watch(`radiolineItems.${lineItemIndex}.network`) || 'Not selected'}
                          </div>
                          <div>
                            <span className="font-medium">Buy Type:</span> {formatBuyTypeForDisplay(form.watch(`radiolineItems.${lineItemIndex}.buyType`))}
                          </div>
                          <div>
                            <span className="font-medium">Bid Strategy:</span> {form.watch(`radiolineItems.${lineItemIndex}.bidStrategy`) || 'Not selected'}
                          </div>
                          <div>
                            <span className="font-medium">Bursts:</span> {form.watch(`radiolineItems.${lineItemIndex}.bursts`, []).length}
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
                                name={`radiolineItems.${lineItemIndex}.network`}
                                render={({ field }) => (
                                  <FormItem className="flex flex-col space-y-1.5">
                                    <FormLabel className="text-sm text-muted-foreground font-medium">Network</FormLabel>
                                    <FormControl>
                                      <Combobox
                                        value={field.value}
                                        onValueChange={(value) => {
                                          field.onChange(value)
                                        }}
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
                                    name={`radiolineItems.${lineItemIndex}.station`}
                                    render={({ field }) => (
                                      <FormItem className="flex flex-col space-y-1.5">
                                        <FormLabel className="text-sm text-muted-foreground font-medium">Station</FormLabel>
                                        <div className="flex-1 flex items-center space-x-1">
                                          <FormControl>
                                            <Combobox
                                              value={field.value}
                                              onValueChange={field.onChange}
                                              disabled={!selectedNetwork}
                                              placeholder={selectedNetwork ? "Select Station" : "Select Network first"}
                                              searchPlaceholder="Search stations..."
                                              emptyText={
                                                selectedNetwork
                                                  ? `No stations found for "${selectedNetwork}".`
                                                  : "Select Network first"
                                              }
                                              buttonClassName="h-9 w-full rounded-md"
                                              options={filteredRadioStations.map((radioStation) => ({
                                                value: radioStation.station || `station-${radioStation.id}`,
                                                label: radioStation.station || "(Unnamed station)",
                                              }))}
                                            />
                                          </FormControl>
                                            <Button
                                              type="button"
                                              variant="ghost"
                                              size="sm"
                                              className="p-1 h-auto"
                                              onClick={() => {
                                                const currentNetworkInForm = form.getValues(`radiolineItems.${lineItemIndex}.network`); //
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
                                              <PlusCircle className="h-5 w-5 text-primary" />
                                            </Button>
                                           </div>
                                        <FormMessage />
                                      </FormItem>
                                )}
                              />

                              <FormField
                                control={form.control}
                                name={`radiolineItems.${lineItemIndex}.buyType`}
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
                                    {...form.register(`radiolineItems.${lineItemIndex}.placement`)}
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
                                    {...form.register(`radiolineItems.${lineItemIndex}.buyingDemo`)}
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
                                    {...form.register(`radiolineItems.${lineItemIndex}.duration`)}
                                    placeholder="Enter duration details"
                                    className="w-full min-h-0 h-10 text-sm rounded-md borde"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>

                              <FormItem className="flex flex-col space-y-1.5">
                                <FormLabel className="text-sm text-muted-foreground font-medium">Format</FormLabel>
                                <FormControl>
                                  <Textarea
                                    {...form.register(`radiolineItems.${lineItemIndex}.format`)}
                                    placeholder="Enter format details"
                                    className="w-full min-h-0 h-10 text-sm rounded-md borde"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>

                              <FormItem className="flex flex-col space-y-1.5">
                                <FormLabel className="text-sm text-muted-foreground font-medium">Market</FormLabel>
                                <FormControl>
                                  <Textarea
                                    {...form.register(`radiolineItems.${lineItemIndex}.market`)}
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
                                  name={`radiolineItems.${lineItemIndex}.fixedCostMedia`}
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
                                  name={`radiolineItems.${lineItemIndex}.clientPaysForMedia`}
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
                                  name={`radiolineItems.${lineItemIndex}.budgetIncludesFees`}
                                  render={({ field }) => (
                                    <FormItem className="flex items-center space-x-2">
                                      <FormControl>
                                        <Checkbox
                                          checked={field.value}
                                          onCheckedChange={(checked) => {
                                            field.onChange(checked);
                                            const bursts =
                                              form.getValues(`radiolineItems.${lineItemIndex}.bursts`) || [];
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
                                    "radio",
                                    form.watch(`radiolineItems.${lineItemIndex}.buyType`) || ""
                                  )}
                                </span>
                                <span>Media</span>
                                <span>{`Fee (${feeradio}%)`}</span>
                              </div>
                              <div className={MP_BURST_ACTION_COLUMN}>
                                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Actions</span>
                              </div>
                            </div>
                          </div>
                        </div>
                        {form.watch(`radiolineItems.${lineItemIndex}.bursts`, []).map((burstField, burstIndex) => {
                          const buyType = form.watch(`radiolineItems.${lineItemIndex}.buyType`);
                          return (
                            <Card key={`${lineItemIndex}-${burstIndex}`} className={MP_BURST_CARD}>
                              <CardContent className={MP_BURST_CARD_CONTENT}>
                                <div className={MP_BURST_ROW_SHELL}>
                                  <div className={MP_BURST_LABEL_COLUMN}>
                                    <h4 className={MP_BURST_LABEL_HEADING}>
                                      {formatBurstLabel(
                                        burstIndex + 1,
                                        form.watch(`radiolineItems.${lineItemIndex}.bursts.${burstIndex}.startDate`),
                                        form.watch(`radiolineItems.${lineItemIndex}.bursts.${burstIndex}.endDate`)
                                      )}
                                    </h4>
                                  </div>
                                  
                                  <div className={MP_BURST_GRID_7}>
                                    {/* Burst `budget` = gross (fee-inclusive when the line-item flag is on). */}
                                    <FormField
                                      control={form.control}
                                      name={`radiolineItems.${lineItemIndex}.bursts.${burstIndex}.budget`}
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

                                    {/* Burst `buyAmount` = unit rate (expert `unitRate`); deliverables live in `calculatedValue`. */}
                                    <FormField
                                      control={form.control}
                                      name={`radiolineItems.${lineItemIndex}.bursts.${burstIndex}.buyAmount`}
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
                                        name={`radiolineItems.${lineItemIndex}.bursts.${burstIndex}.startDate`}
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
                                        name={`radiolineItems.${lineItemIndex}.bursts.${burstIndex}.endDate`}
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
                                      name={`radiolineItems.${lineItemIndex}.bursts.${burstIndex}.calculatedValue`}
                                      render={({ field }) => (
                                        <CpcFamilyBurstCalculatedField
                                          form={form}
                                          itemsKey="radiolineItems"
                                          lineItemIndex={lineItemIndex}
                                          burstIndex={burstIndex}
                                          field={field}
                                          feePct={feeradio || 0}
                                          netMedia={netMediaPctOfGross}
                                          variant="radio"
                                        />
                                      )}
                                    />

                                    <Input
                                        type="text"
                                        className="w-full h-10 text-sm bg-muted/30 border-border/40 text-muted-foreground"
                                        value={formatMoney(
                                          form.getValues(`radiolineItems.${lineItemIndex}.budgetIncludesFees`)
                                            ? (parseFloat(form.getValues(`radiolineItems.${lineItemIndex}.bursts.${burstIndex}.budget`)?.replace(/[^0-9.]/g, "") || "0") / 100) * (100 - (feeradio || 0))
                                            : parseFloat(form.getValues(`radiolineItems.${lineItemIndex}.bursts.${burstIndex}.budget`)?.replace(/[^0-9.]/g, "") || "0")
                                        , { locale: "en-AU", currency: "AUD" })}
                                        readOnly
                                      />
                                    <Input
                                        type="text"
                                        className="w-full h-10 text-sm bg-muted/30 border-border/40 text-muted-foreground"
                                        value={formatMoney(
                                          form.getValues(`radiolineItems.${lineItemIndex}.budgetIncludesFees`)
                                            ? (parseFloat(form.getValues(`radiolineItems.${lineItemIndex}.bursts.${burstIndex}.budget`)?.replace(/[^0-9.]/g, "") || "0") / 100) * (feeradio || 0)
                                            : (parseFloat(form.getValues(`radiolineItems.${lineItemIndex}.bursts.${burstIndex}.budget`)?.replace(/[^0-9.]/g, "") || "0") / (100 - (feeradio || 0))) * (feeradio || 0)
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
                                                          platform: "",
                                                          creativeTargeting: "",
                                                          creative: "",
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
          </div>
        )}
      </div>
      {/* Add Station Dialog */}
<Dialog open={isAddStationDialogOpen} onOpenChange={setIsAddStationDialogOpen}>
  <DialogContent className="sm:max-w-[425px] overflow-hidden p-0">
    <div className="h-1 bg-gradient-to-r from-primary via-primary/70 to-primary/40" />
    <div className="p-6">
      <DialogHeader>
        <DialogTitle>Add New Radio Station</DialogTitle>
        <DialogDescription>
          Enter the details for the new Radio station.
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-4 py-4">
        <div className="space-y-1.5">
          <Label htmlFor="newStationNetwork" className="text-sm font-medium text-muted-foreground">
            Network
          </Label>
          <Combobox
            value={newStationNetwork}
            onValueChange={setNewStationNetwork}
            placeholder="Select Network"
            searchPlaceholder="Search networks..."
            buttonClassName="w-full h-9"
            options={publishers.map((publisher) => ({
              value: publisher.publisher_name,
              label: publisher.publisher_name,
            }))}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="newStationName" className="text-sm font-medium text-muted-foreground">
            Station Name
          </Label>
          <Input
            id="newStationName"
            value={newStationName}
            onChange={(e) => setNewStationName(e.target.value)}
            className="w-full"
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
    </div>
  </DialogContent>
</Dialog>

      <Dialog open={radioExpertModalOpen} onOpenChange={handleRadioExpertModalOpenChange}>
        <DialogContent className="max-w-[95vw] w-[95vw] max-h-[95vh] h-[95vh] flex flex-col p-4 gap-0 overflow-hidden">
          <DialogHeader className="flex-shrink-0 pb-2">
            <DialogTitle>Radio Expert Mode</DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-auto">
            <RadioExpertGrid
              campaignStartDate={campaignStartDate}
              campaignEndDate={campaignEndDate}
              feeradio={feeradio}
              rows={expertRadioRows}
              onRowsChange={handleExpertRadioRowsChange}
              publishers={publishers}
              radioStations={radioStations}
            />
          </div>
          <DialogFooter className="flex-shrink-0 border-t pt-3 mt-2">
            <Button type="button" onClick={handleRadioExpertApply}>
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={radioExpertExitConfirmOpen}
        onOpenChange={(open) => {
          if (!open) dismissRadioExpertExitConfirm();
        }}
      >
        <DialogContent
          className="z-[100] sm:max-w-md"
          onClick={(e) => {
            if ((e.target as HTMLElement).closest("[data-radio-expert-exit-yes]")) {
              return;
            }
            dismissRadioExpertExitConfirm();
          }}
        >
          <DialogHeader>
            <DialogTitle>Leave Radio Expert Mode?</DialogTitle>
            <DialogDescription>
              You have unsaved changes in Expert Mode. Apply saves them to the Radio section; leaving now
              discards those edits.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={dismissRadioExpertExitConfirm}>
              No, keep editing
            </Button>
            <Button
              type="button"
              variant="destructive"
              data-radio-expert-exit-yes
              onClick={confirmRadioExpertExitWithoutSaving}
            >
              Yes, leave without saving
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}