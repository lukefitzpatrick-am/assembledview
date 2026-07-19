"use client"

import { publishMediaLineItemsIfChanged } from "@/lib/mediaplan/publishMediaLineItems"
import { coerceBurstDateLocal } from '@/lib/mediaplan/burstDate'

import { subscribeMediaPlanPageSaved } from "@/lib/mediaplan/expertApplyDirtyBridge"
import { ContainerEmptyLinesPlaceholder } from "@/components/media-containers/ContainerEmptyLinesPlaceholder"
import { ExpertIncompleteRowsSummary } from "@/components/media-containers/ExpertIncompleteRowsSummary"
import { MediaContainerLoadState } from "@/components/media-containers/MediaContainerLoadState"
import { useState, useEffect, useRef, useMemo, useCallback } from "react"
import { useStableHydration } from "@/hooks/useStableHydration"
import { useForm, useFieldArray, UseFormReturn } from "react-hook-form"
import { useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import {
  cinemaFormSchema,
  type CinemaFormValues,
} from "@/lib/mediaplan/schemas"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Combobox } from "@/components/ui/combobox"
import { ExpertCard } from "@/components/media-containers/ExpertCard"
import { CINEMA_EXPERT_CHANNEL_CONFIG } from "@/lib/mediaplan/expertGridChannelConfig"
import { Form } from "@/components/ui/form"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useToast } from "@/components/ui/use-toast"
import { getPublishersForCinema, getClientInfo } from "@/lib/api"
import { computeBurstAmounts } from "@/lib/mediaplan/burstAmounts"
import { appendBurst, duplicateBurst, removeBurst, newBurstReactKey, stampBurstReactKeys } from "@/lib/mediaplan/burstOperations"
import { resolveLineItemBursts } from "@/lib/mediaplan/deriveBursts"
import { format } from "date-fns"
import { useMediaPlanContext } from "@/contexts/MediaPlanContext"
import { cn } from "@/lib/utils"
import { Copy, Plus, Trash2, PlusCircle } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label";
import type { BillingBurst, BillingMonth } from "@/lib/billing/types"; // ad
import {
  aggregateInvestmentDisplayRows,
  type InvestmentBurstInput,
} from "@/lib/billing/prorateInvestmentDisplay"
import type { LineItem } from '@/lib/generateMediaPlan'
import { formatMoney } from "@/lib/format/money"
import {
  coerceBuyTypeWithDevWarn,
  computeDeliverableFromMedia,
  computeLoadedDeliverables,
  roundDeliverables,
} from "@/lib/mediaplan/deliverableBudget"
import { defaultMediaBurstStartDate, defaultMediaBurstEndDate } from "@/lib/date-picker-anchor"
import MediaContainerTimelineCollapsible from "@/components/media-containers/MediaContainerTimelineCollapsible"
import MediaContainerSummarySection from "@/components/media-containers/MediaContainerSummarySection"
import { getMediaTypeThemeHex } from "@/lib/mediaplan/mediaTypeAccents"
import { MEDIA_TYPE_ID_CODES, buildLineItemId } from "@/lib/mediaplan/lineItemIds"
import { assignStableLineItemNumbers, reassignLineItemNumbers } from "@/lib/mediaplan/lineItemOrder"
import { ComboboxModalProvider } from "@/components/ui/combobox"
import { buildWeeklyGanttColumnsFromCampaign } from "@/lib/utils/weeklyGanttColumns"
import { CinemaExpertGrid, createEmptyCinemaExpertRow } from "@/components/media-containers/CinemaExpertGrid"
import type { CinemaExpertScheduleRow } from "@/lib/mediaplan/expertModeWeeklySchedule"
import {
  mapStandardCinemaLineItemsToExpertRows,
  mapCinemaExpertRowsToStandardLineItems,
  type StandardCinemaFormLineItem,
} from "@/lib/mediaplan/expertChannelMappings"
import {
  mergeCinemaStandardFromExpertWithPrevious,
  serializeCinemaExpertRowsBaseline,
  serializeCinemaStandardLineItemsBaseline,
} from "@/lib/mediaplan/expertModeSwitch"

const MEDIA_ACCENT_HEX = getMediaTypeThemeHex("cinema")

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

/** Net media when budget is gross incl. fee - must match `getCinemaBursts` / burst row readouts (linear split). */
function cinemaLineBurstNetMedia(
  rawBudget: number,
  budgetIncludesFees: boolean,
  feePct: number
): number {
  if (!budgetIncludesFees) return rawBudget;
  const pct = feePct || 0;
  return (rawBudget * (100 - pct)) / 100
}

export function calculateInvestmentPerMonth(form, feecinema) {
  const items = form.getValues("cinemalineItems") || []
  const bursts: InvestmentBurstInput[] = []
  items.forEach((lineItem: any) => {
    (lineItem.bursts || []).forEach((burst: any) => {
      const lineMedia = parseFloat(String(burst.budget).replace(/[^0-9.]/g, "")) || 0
      const feePct = feecinema || 0
      const totalInvestment = lineMedia + ((lineMedia / (100 - feePct)) * feePct)
      bursts.push({ amount: totalInvestment, start: burst.startDate, end: burst.endDate })
    })
  })
  return aggregateInvestmentDisplayRows(bursts)
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

  const createLineItemId = useCallback(
    (lineNumber: number) =>
      buildLineItemId(mbaNumber, MEDIA_TYPE_ID_CODES.cinema, lineNumber),
    [mbaNumber]
  );

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
          ...(() => { const id = createLineItemId(1); return { lineItemId: id, line_item_id: id, line_item: 1, lineItem: 1 }; })(),
          bursts: [
            {
              _reactKey: newBurstReactKey(),
              budget: "",
              buyAmount: "",
              startDate: defaultMediaBurstStartDate(campaignStartDate, campaignEndDate),
              endDate: defaultMediaBurstEndDate(campaignStartDate, campaignEndDate),
              calculatedValue: 0,
              fee: 0,
            } as CinemaFormValues["cinemalineItems"][number]["bursts"][number] & { _reactKey: string },
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

  // --- Expert mode ---
  const [expertCinemaRows, setExpertCinemaRows] = useState<CinemaExpertScheduleRow[]>([])
  const [cinemaExpertModalOpen, setCinemaExpertModalOpen] = useState(false)

  const [expertApplyPendingPageSave, setExpertApplyPendingPageSave] = useState(false)
  useEffect(() => {
    return subscribeMediaPlanPageSaved(() => setExpertApplyPendingPageSave(false))
  }, [])
  const mediaLineItemsPublishFpRef = useRef("")
  const [cinemaExpertExitConfirmOpen, setCinemaExpertExitConfirmOpen] = useState(false)
  const cinemaStandardBaselineRef = useRef("")
  const cinemaExpertRowsBaselineRef = useRef("")
  const reorderedRef = useRef(false)
  const cinemaExpertWeekColumns = useMemo(
    () => buildWeeklyGanttColumnsFromCampaign(campaignStartDate, campaignEndDate),
    [campaignStartDate, campaignEndDate]
  )

  const collapseAllLineItems = useCallback(() => {
    const items = form.getValues("cinemalineItems") || []
    setCollapsedLineItems(new Set(items.map((_, i) => i)))
  }, [form])

  const handleExpertCinemaRowsChange = useCallback((rows: CinemaExpertScheduleRow[]) => {
    setExpertCinemaRows(rows)
  }, [])

  const openCinemaExpertModal = useCallback(() => {
    const mapped = mapStandardCinemaLineItemsToExpertRows(
      (form.getValues("cinemalineItems") || []) as StandardCinemaFormLineItem[],
      cinemaExpertWeekColumns,
      campaignStartDate,
      campaignEndDate
    )
    const weekKeys = cinemaExpertWeekColumns.map((c) => c.weekKey)
    const rows: CinemaExpertScheduleRow[] =
      mapped.length > 0
        ? mapped
        : [
            createEmptyCinemaExpertRow(
              typeof crypto !== "undefined" && crypto.randomUUID
                ? crypto.randomUUID()
                : `cinema-expert-${Date.now()}`,
              campaignStartDate,
              campaignEndDate,
              weekKeys
            ),
          ]
    cinemaExpertRowsBaselineRef.current = serializeCinemaExpertRowsBaseline(rows)
    setExpertCinemaRows(rows)
    setCinemaExpertExitConfirmOpen(false)
    setCinemaExpertModalOpen(true)
  }, [campaignStartDate, campaignEndDate, form, cinemaExpertWeekColumns])


  const handleCinemaExpertModalOpenChange = useCallback(
    (open: boolean) => {
      if (open) {
        setCinemaExpertModalOpen(true)
        return
      }
      const dirty =
        serializeCinemaExpertRowsBaseline(expertCinemaRows) !== cinemaExpertRowsBaselineRef.current
      if (!dirty) {
        collapseAllLineItems()
        setCinemaExpertModalOpen(false)
        return
      }
      setCinemaExpertExitConfirmOpen(true)
    },
    [collapseAllLineItems, expertCinemaRows]
  )

  const handleCinemaExpertApply = useCallback(() => {
    const prevLineItems = form.getValues("cinemalineItems") || []
    const standard = mapCinemaExpertRowsToStandardLineItems(
      expertCinemaRows,
      cinemaExpertWeekColumns,
      campaignStartDate,
      campaignEndDate,
      {
        feePctCinema: feecinema,
        budgetIncludesFees: Boolean(prevLineItems[0]?.budgetIncludesFees),
      }
    )
    const merged = mergeCinemaStandardFromExpertWithPrevious(
      standard,
      prevLineItems as StandardCinemaFormLineItem[]
    )
    const orderedForApply = reorderedRef.current
      ? reassignLineItemNumbers(merged, mbaNumber, MEDIA_TYPE_ID_CODES.cinema)
      : merged
    reorderedRef.current = false
    const keyedMerged = stampBurstReactKeys(orderedForApply)
    form.setValue("cinemalineItems", keyedMerged as any, {
      shouldDirty: true,
      shouldValidate: false,
    })
    cinemaStandardBaselineRef.current = serializeCinemaStandardLineItemsBaseline(
      form.getValues("cinemalineItems") as StandardCinemaFormLineItem[]
    )
    setCinemaExpertExitConfirmOpen(false)
    collapseAllLineItems()
    setExpertApplyPendingPageSave(true)
    setCinemaExpertModalOpen(false)
  }, [
    campaignStartDate,
    campaignEndDate,
    expertCinemaRows,
    feecinema,
    form,
    mbaNumber,
    cinemaExpertWeekColumns,
    collapseAllLineItems,
  ])

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

    const baseLineNumber = Number(
      source.line_item ?? source.lineItem ?? lineItemIndex + 1
    );
    const lineNumber =
      (Number.isFinite(baseLineNumber) ? baseLineNumber : lineItemIndex + 1) + 1;
    const newId = createLineItemId(lineNumber);

    const clone = {
      ...source,
      lineItemId: newId,
      line_item_id: newId,
      line_item: lineNumber,
      lineItem: lineNumber,
      bursts: (source.bursts || []).map((burst: any) => ({
        ...burst,
        _reactKey: newBurstReactKey(),
        startDate: coerceBurstDateLocal(burst?.startDate) ?? new Date(),
        endDate: coerceBurstDateLocal(burst?.endDate) ?? new Date(),
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

  /** Burst deliverables on load and when budget fields change; uses {@link computeDeliverableFromMedia}. */
  const cinemaBurstDeliverables = useCallback(
    (burst: any, buyType: string, budgetIncludesFees: boolean) => {
      const buyTypeLower = (buyType || "").toLowerCase()

      if (
        buyTypeLower === "bonus" ||
        buyTypeLower === "package_inclusions" ||
        buyTypeLower === "package"
      ) {
        return parseFloat(
          String(burst?.calculatedValue ?? burst?.deliverables ?? 0)
            .replace(/[^0-9.]/g, "")
        ) || 0
      }

      const rawBudget =
        parseFloat(String(burst?.budget ?? "").replace(/[^0-9.]/g, "")) || 0
      const buyAmount =
        parseFloat(String(burst?.buyAmount ?? "").replace(/[^0-9.]/g, "")) || 0
      const bt = coerceBuyTypeWithDevWarn(buyType, "CinemaContainer.cinemaBurstDeliverables")

      const value = computeDeliverableFromMedia({
        buyType: bt,
        rawBudget,
        buyAmount,
        budgetIncludesFees,
        feePct: feecinema || 0,
      })

      if (Number.isNaN(value)) {
        return parseFloat(
          String(burst?.calculatedValue ?? "0").replace(/[^0-9.]/g, "")
        ) || 0
      }

      return roundDeliverables(bt, value)
    },
    [feecinema]
  )

  // Data loading for edit mode
  useStableHydration(
    initialLineItems,
    (items) => {
      const transformedLineItems = items.map((item: any, index: number) => {
        const lineNum =
          Number(item.line_item ?? item.lineItem ?? index + 1) || index + 1;
        const lineItemId =
          item.line_item_id || item.lineItemId || createLineItemId(lineNum);
        const buyType = item.buy_type || item.buyType || "";
        const parsedBursts = resolveLineItemBursts(item);

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
          bursts: parsedBursts.length > 0 ? parsedBursts.map((burst: any) => ({
            budget: burst.budget || "",
            buyAmount: burst.buyAmount || "",
            startDate: coerceBurstDateLocal(burst.startDate) ?? new Date(),
            endDate: coerceBurstDateLocal(burst.endDate) ?? new Date(),
            calculatedValue: computeLoadedDeliverables(
              item.buy_type || item.buyType || "",
              burst,
              Boolean(item.budget_includes_fees || item.budgetIncludesFees),
              feecinema ?? 0,
            ),
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
        cinemalineItems: stampBurstReactKeys(transformedLineItems),
        overallDeliverables: 0,
      });
    },
  )

  // Transform form data to API schema format
  useEffect(() => {
    const formLineItems = form.getValues('cinemalineItems') || [];
    const stableCinemaItems = assignStableLineItemNumbers<any>(formLineItems, mbaNumber, MEDIA_TYPE_ID_CODES.cinema);
    
    const transformedLineItems = stableCinemaItems.map((lineItem, index) => {
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
      const lineItemId =
        lineItem.lineItemId ||
        lineItem.line_item_id ||
        buildLineItemId(mbaNumber, MEDIA_TYPE_ID_CODES.cinema, index + 1);
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
        bursts: lineItem.bursts,
        feePct: feecinema || 0,
        line_item: lineNumber,
        bid_strategy: lineItem.bidStrategy || "",
        totalMedia: totalMedia,
      };
    });

    publishMediaLineItemsIfChanged(mediaLineItemsPublishFpRef, transformedLineItems, onMediaLineItemsChange);
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
      const summaryBursts: InvestmentBurstInput[] = [];

      lineItem.bursts.forEach((burst) => {
        const budget = parseFloat(burst.budget.replace(/[^0-9.]/g, "")) || 0;
        let burstMedia = 0;
        let burstFee = 0;
        // Always calculate media for display purposes (ignore clientPaysForMedia)
        if (lineItem.budgetIncludesFees) {
          const pct = feecinema || 0;
          burstMedia = (budget * (100 - pct)) / 100;
          burstFee = (budget * pct) / 100;
        } else {
          // Budget is net media, fee calculated on top
          burstMedia = budget;
          burstFee = feecinema ? (budget / (100 - feecinema)) * feecinema : 0;
        }
        lineMedia += burstMedia;
        lineFee += burstFee;
        lineDeliverables += cinemaBurstDeliverables(burst, lineItem.buyType, lineItem.budgetIncludesFees);
        summaryBursts.push({
          amount: burstMedia + burstFee,
          start: burst.startDate,
          end: burst.endDate,
        });
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
        buyType: lineItem.buyType || "",
        dimensions: {
          Network: lineItem.network || "",
          Station: lineItem.station || "",
          Placement: lineItem.placement || "",
          "Buy Type": lineItem.buyType || "",
        },
        bursts: summaryBursts,
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
    appendBurst({
      form,
      fieldKey: "cinemalineItems",
      lineItemIndex,
      campaignStartDate,
      campaignEndDate,
      onAfter: handleLineItemValueChange,
      toast: toast as Parameters<typeof appendBurst>[0]["toast"],
    })
  }, [form, handleLineItemValueChange, toast, campaignStartDate, campaignEndDate]);

  const handleDuplicateBurst = useCallback((lineItemIndex: number) => {
    duplicateBurst({
      form,
      fieldKey: "cinemalineItems",
      lineItemIndex,
      onAfter: handleLineItemValueChange,
      toast: toast as Parameters<typeof duplicateBurst>[0]["toast"],
    })
  }, [form, handleLineItemValueChange, toast]);

  const handleRemoveBurst = useCallback((lineItemIndex: number, burstIndex: number) => {
    removeBurst({
      form,
      fieldKey: "cinemalineItems",
      lineItemIndex,
      burstIndex,
      onAfter: handleLineItemValueChange,
      toast: toast as Parameters<typeof removeBurst>[0]["toast"],
    })
  }, [form, handleLineItemValueChange, toast]);

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
      const buyTypeLower = String(lineItem.buyType || "").toLowerCase();
      const isManualBuyType =
        buyTypeLower === "bonus" ||
        buyTypeLower === "package_inclusions" ||
        buyTypeLower === "package";
      let deliverableForExcel: number;
      if (isManualBuyType) {
        deliverableForExcel = burst.calculatedValue ?? 0;
      } else {
        const bt = coerceBuyTypeWithDevWarn(String(lineItem.buyType || ""), "CinemaContainer.excelBridge");
        const recomputed = computeDeliverableFromMedia({
          buyType: bt,
          rawBudget: parseFloat(String(burst.budget).replace(/[^0-9.-]+/g, "")) || 0,
          buyAmount: parseFloat(String(burst.buyAmount ?? burst.budget).replace(/[^0-9.-]+/g, "")) || 0,
          budgetIncludesFees: !!lineItem.budgetIncludesFees,
          feePct: feecinema || 0,
        });
        deliverableForExcel = Number.isNaN(recomputed)
          ? (burst.calculatedValue ?? 0)
          : roundDeliverables(bt, recomputed);
      }
      let lineItemId = lineItem.lineItemId || lineItem.line_item_id;
      if (!lineItemId) {
        lineItemId = createLineItemId(lineItemIndex + 1);
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
        deliverables: deliverableForExcel,
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
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="text-base font-semibold tracking-tight">Cinema</CardTitle>
                <div
                  role="group"
                  aria-label="Cinema entry mode"
                  className="inline-flex shrink-0 rounded-lg border border-border bg-muted/50 p-0.5"
                >
                  <button
                    type="button"
                    onClick={() => { if (cinemaExpertModalOpen) handleCinemaExpertModalOpenChange(false) }}
                    className={cn(
                      "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                      !cinemaExpertModalOpen ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
                    )}
                  >Card entry</button>
                  <button
                    type="button"
                    onClick={() => { if (!cinemaExpertModalOpen) openCinemaExpertModal() }}
                    className={cn(
                      "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                      cinemaExpertModalOpen ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
                    )}
                  >Schedule grid</button>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  One card per line - or switch to Schedule grid for week quantities.
                </p>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {overallTotals.lineItemTotals.length} line item
                  {overallTotals.lineItemTotals.length !== 1 ? "s" : ""}
                </span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-0">
            <MediaContainerSummarySection
              lines={overallTotals.lineItemTotals}
              overallMedia={overallTotals.overallMedia}
              overallFee={overallTotals.overallFee}
              overallCost={overallTotals.overallCost}
              feeLabel={`Fee (${feecinema}%)`}
              accentHex={MEDIA_ACCENT_HEX}
              dimensions={["Network", "Station", "Placement", "Buy Type"]}
              deliverablesLabelFor={getDeliverablesLabel}
            />
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
          <MediaContainerLoadState loading label="Cinema" />
        ) : (
          <div className="space-y-6">
            <Form {...form}>
              <div className="space-y-6">
                {lineItemFields.length === 0 ? (
                  <ContainerEmptyLinesPlaceholder
                    onAdd={() => appendLineItem({
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
                                                          ...(() => {
                                                            const nextNum = lineItemFields.length + 1;
                                                            const id = createLineItemId(nextNum);
                                                            return { lineItemId: id, line_item_id: id, line_item: nextNum, lineItem: nextNum };
                                                          })(),
                                                          bursts: [
                                                            {
                                                              _reactKey: newBurstReactKey(),
                                                              budget: "",
                                                              buyAmount: "",
                                                              startDate: defaultMediaBurstStartDate(campaignStartDate, campaignEndDate),
                                                              endDate: defaultMediaBurstEndDate(campaignStartDate, campaignEndDate),
                                                              calculatedValue: 0,
                                                              fee: 0,
                                                            } as CinemaFormValues["cinemalineItems"][number]["bursts"][number] & { _reactKey: string },
                                                          ],
                                                        })}
                  />
                ) : null}
                {lineItemFields.map((field, lineItemIndex) => {
                  const lineItemId = buildLineItemId(
                    mbaNumber,
                    MEDIA_TYPE_ID_CODES.cinema,
                    lineItemIndex + 1
                  );
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
                    <ExpertCard<CinemaFormValues>
                      key={field.id}
                      config={CINEMA_EXPERT_CHANNEL_CONFIG}
                      form={form}
                      itemsKey="cinemalineItems"
                      lineItemIndex={lineItemIndex}
                      lineItemId={lineItemId}
                      collapsed={collapsedLineItems.has(lineItemIndex)}
                      onToggleCollapsed={() => toggleLineItemCollapsed(lineItemIndex)}
                      totalDisplay={formatMoney(
                        form.getValues(`cinemalineItems.${lineItemIndex}.budgetIncludesFees`)
                          ? totalMedia
                          : totalMedia + (totalMedia / (100 - (feecinema || 0))) * (feecinema || 0),
                        { locale: "en-AU", currency: "AUD" }
                      )}
                      publishers={publishers}
                      stationOptions={cinemaStations.map((station) => ({
                        value: station.station || `station-${station.id}`,
                        label: station.station || "(Unnamed station)",
                      }))}
                      feePct={feecinema || 0}
                      calculatedVariant="cinema"
                      campaignStartDate={campaignStartDate}
                      campaignEndDate={campaignEndDate}
                      onBurstValueChange={handleValueChange}
                      onAppendBurst={handleAppendBurst}
                      onDuplicateBurst={(li, _bi) => handleDuplicateBurst(li)}
                      onRemoveBurst={handleRemoveBurst}
                      onBudgetIncludesFeesChange={(li, checked) => {
                        const bursts = form.getValues(`cinemalineItems.${li}.bursts`) || [];
                        bursts.forEach((_, bi) => handleValueChange(li, bi, !!checked));
                      }}
                      fieldAdornments={{
                        station: (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-auto p-1"
                            onClick={() => {
                              const currentNetworkInForm = form.getValues(
                                `cinemalineItems.${lineItemIndex}.network`
                              );
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
                        ),
                      }}
                      summaryRow={
                        <div className="border-b px-6 py-2">
                          <div className="grid grid-cols-4 gap-4 text-sm">
                            <div>
                              <span className="font-medium">Network:</span>{" "}
                              {form.watch(`cinemalineItems.${lineItemIndex}.network`) ||
                                "Not selected"}
                            </div>
                            <div>
                              <span className="font-medium">Buy Type:</span>{" "}
                              {formatBuyTypeForDisplay(
                                form.watch(`cinemalineItems.${lineItemIndex}.buyType`)
                              )}
                            </div>
                            <div>
                              <span className="font-medium">Bid Strategy:</span>{" "}
                              {form.watch(`cinemalineItems.${lineItemIndex}.bidStrategy`) ||
                                "Not selected"}
                            </div>
                            <div>
                              <span className="font-medium">Bursts:</span>{" "}
                              {form.watch(`cinemalineItems.${lineItemIndex}.bursts`, []).length}
                            </div>
                          </div>
                        </div>
                      }
                      footer={
                        <>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-destructive/70 hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => removeLineItem(lineItemIndex)}
                          >
                            <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                            Remove
                          </Button>
                          <div className="flex items-center gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => handleDuplicateLineItem(lineItemIndex)}
                            >
                              <Copy className="mr-1.5 h-3.5 w-3.5" />
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
                                    ...(() => {
                                      const nextNum = lineItemFields.length + 1;
                                      const id = createLineItemId(nextNum);
                                      return {
                                        lineItemId: id,
                                        line_item_id: id,
                                        line_item: nextNum,
                                        lineItem: nextNum,
                                      };
                                    })(),
                                    bursts: [
                                      {
                                        _reactKey: newBurstReactKey(),
                                        budget: "",
                                        buyAmount: "",
                                        startDate: defaultMediaBurstStartDate(
                                          campaignStartDate,
                                          campaignEndDate
                                        ),
                                        endDate: defaultMediaBurstEndDate(
                                          campaignStartDate,
                                          campaignEndDate
                                        ),
                                        calculatedValue: 0,
                                        fee: 0,
                                      } as CinemaFormValues["cinemalineItems"][number]["bursts"][number] & {
                                        _reactKey: string;
                                      },
                                    ],
                                  })
                                }
                              >
                                <Plus className="mr-1.5 h-3.5 w-3.5" />
                                Add Line Item
                              </Button>
                            )}
                          </div>
                        </>
                      }
                    />
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

      <Dialog open={cinemaExpertModalOpen} onOpenChange={handleCinemaExpertModalOpenChange}>
        <DialogContent className="max-w-[95vw] w-[95vw] max-h-[95vh] h-[95vh] flex flex-col p-4 gap-0 overflow-hidden">
          <DialogHeader className="flex-shrink-0 pb-2">
            <DialogTitle>Cinema Expert Mode</DialogTitle>
          </DialogHeader>
          <ComboboxModalProvider>
            <div className="flex-1 min-h-0 overflow-auto">
              <CinemaExpertGrid
                campaignStartDate={campaignStartDate}
                campaignEndDate={campaignEndDate}
                feecinema={feecinema}
                rows={expertCinemaRows}
                onRowsChange={handleExpertCinemaRowsChange}
                publishers={publishers}
                cinemaStations={cinemaStations}
                onReorder={() => { reorderedRef.current = true }}
              />
            </div>
          </ComboboxModalProvider>
          <DialogFooter className="flex-shrink-0 border-t pt-3 mt-2">
            <div className="mr-auto flex flex-col gap-1.5">
              <ExpertIncompleteRowsSummary rows={expertCinemaRows} />
              {expertApplyPendingPageSave ? (
                <span className="text-xs text-muted-foreground">
                  Applied earlier — awaiting page Save
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">
                  Apply updates the plan draft only
                </span>
              )}
            </div>
            <Button type="button" onClick={handleCinemaExpertApply}>Apply to plan (not saved yet)</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={cinemaExpertExitConfirmOpen} onOpenChange={setCinemaExpertExitConfirmOpen}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Discard expert changes?</DialogTitle>
            <DialogDescription>
              You have unsaved changes in the expert schedule. Apply to update your line items, or discard to keep your previous line items.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setCinemaExpertExitConfirmOpen(false)
                collapseAllLineItems()
                setCinemaExpertModalOpen(false)
              }}
            >
              Discard
            </Button>
            <Button type="button" onClick={handleCinemaExpertApply}>Apply to plan (not saved yet)</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
