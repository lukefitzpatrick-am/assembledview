"use client"

import { publishMediaLineItemsIfChanged } from "@/lib/mediaplan/publishMediaLineItems"
import { coerceBurstDateLocal } from '@/lib/mediaplan/burstDate'

import { subscribeMediaPlanPageSaved } from "@/lib/mediaplan/expertApplyDirtyBridge"
import { ContainerEmptyLinesPlaceholder } from "@/components/media-containers/ContainerEmptyLinesPlaceholder"
import { ExpertIncompleteRowsSummary } from "@/components/media-containers/ExpertIncompleteRowsSummary"
import { MediaContainerLoadState } from "@/components/media-containers/MediaContainerLoadState"
import {
  writeContainerEntryMode,
} from "@/lib/mediaplan/containerEntryMode"

import { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } from "react"
import { useStableHydration } from "@/hooks/useStableHydration"
import { useForm, useFieldArray, UseFormReturn, type Resolver } from "react-hook-form"
import { useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import {
  newspapersFormSchema,
  type NewspapersFormValues,
} from "@/lib/mediaplan/schemas"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Combobox, ComboboxModalProvider } from "@/components/ui/combobox"
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
import { computeBurstAmounts } from "@/lib/mediaplan/burstAmounts"
import { appendBurst, duplicateBurst, removeBurst, newBurstReactKey, stampBurstReactKeys } from "@/lib/mediaplan/burstOperations"
import { serializeBurstsJson } from "@/lib/mediaplan/serializeBurstsJson"
import { resolveLineItemBursts } from "@/lib/mediaplan/deriveBursts"
import { format } from "date-fns"
import { useMediaPlanContext } from "@/contexts/MediaPlanContext"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { ChevronDown, Plus, Trash2, Copy } from "lucide-react"
import { ExpertCard } from "@/components/media-containers/ExpertCard"
import { NEWSPAPER_EXPERT_CHANNEL_CONFIG } from "@/lib/mediaplan/expertGridChannelConfig"
import type { BillingBurst, BillingMonth } from "@/lib/billing/types"; // ad
import {
  aggregateInvestmentDisplayRows,
  type InvestmentBurstInput,
} from "@/lib/billing/prorateInvestmentDisplay"
import type { LineItem } from '@/lib/generateMediaPlan'
import { formatAUD, formatMoney, parseMoneyInput } from "@/lib/format/money"
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
import MediaContainerSummarySection from "@/components/media-containers/MediaContainerSummarySection"
import {
  getMediaTypeThemeHex,
  mediaTypeAccentTextStyle,
  mediaTypeLineItemBadgeStyle,
  mediaTypeSummaryStripeStyle,
  mediaTypeTotalsRowStyle,
  rgbaFromHex,
} from "@/lib/mediaplan/mediaTypeAccents"
import {
  NewspaperExpertGrid,
  createEmptyNewspaperExpertRow,
} from "@/components/media-containers/NewspaperExpertGrid"
import type { NewspaperExpertScheduleRow } from "@/lib/mediaplan/expertModeWeeklySchedule"
import {
  mapNewspaperExpertRowsToStandardLineItems,
  mapStandardNewspaperLineItemsToExpertRows,
  type StandardNewspaperFormLineItem,
} from "@/lib/mediaplan/expertChannelMappings"
import {
  mergeNewspaperStandardFromExpertWithPrevious,
  serializeNewspaperExpertRowsBaseline,
  serializeNewspaperStandardLineItemsBaseline,
} from "@/lib/mediaplan/expertModeSwitch"
import { buildWeeklyGanttColumnsFromCampaign } from "@/lib/utils/weeklyGanttColumns"
import { MEDIA_TYPE_ID_CODES, buildLineItemId } from "@/lib/mediaplan/lineItemIds"
import { assignStableLineItemNumbers, normalizeLineItemsForSave, reassignLineItemNumbers } from "@/lib/mediaplan/lineItemOrder"
import {
  coerceBuyTypeWithDevWarn,
  computeDeliverableFromMedia,
  computeLoadedDeliverables,
} from "@/lib/mediaplan/deliverableBudget"

const MEDIA_ACCENT_HEX = getMediaTypeThemeHex("newspaper")

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
  const items = form.getValues("newspaperlineItems") || []
  const bursts: InvestmentBurstInput[] = []
  items.forEach((lineItem: any) => {
    (lineItem.bursts || []).forEach((burst: any) => {
      const lineMedia = parseFloat(String(burst.budget).replace(/[^0-9.]/g, "")) || 0
      const feePct = feenewspapers || 0
      const totalInvestment = lineMedia + ((lineMedia / (100 - feePct)) * feePct)
      bursts.push({ amount: totalInvestment, start: burst.startDate, end: burst.endDate })
    })
  })
  return aggregateInvestmentDisplayRows(bursts)
}
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
  
  const createLineItemId = useCallback(
    (lineNumber: number) =>
      buildLineItemId(mbaNumber, MEDIA_TYPE_ID_CODES.newspaper, lineNumber),
    [mbaNumber]
  );

  const [isAddNewspaperAdSizeDialogOpen, setIsAddNewspaperAdSizeDialogOpen] = useState(false);
  const [newTitleName, setNewTitleName] = useState("");
  const [newTitleNetwork, setNewTitleNetwork] = useState("");
  const [currentLineItemIndexForNewTitle, setCurrentLineItemIndexForNewTitle] = useState<number | null>(null);
  const [networksAvailable, setNetworksAvailable] = useState(true); // Assume true until fetched
  const [isAddTitleDialogOpen, setIsAddTitleDialogOpen] = useState(false);

  const [newAdSizeName, setNewAdSizeName] = useState(""); // <<< ADD THIS
  const [currentLineItemIndexForNewAdSize, setCurrentLineItemIndexForNewAdSize] = useState<number | null>(null);

  const fetchAndUpdateNewspapers = useCallback(async () => {
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
  }, [toast]);

  const fetchAndUpdateNewspaperAdSizes = useCallback(async () => {
    try {
      const fetchedAdSizes = await getNewspapersAdSizes(); //
      newspapersAdSizesRef.current = fetchedAdSizes; //
      setNewspapersAdSizes(fetchedAdSizes); //
    } catch (error) {
      toast({ //
        title: "Error refreshing Ad Sizes",
        description: (error as Error).message,
        variant: "destructive",
      });
    }
  }, [toast]);

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
  const form = useForm<NewspapersFormValues>({
    resolver: zodResolver(newspapersFormSchema) as Resolver<NewspapersFormValues>,
    defaultValues: {
      newspaperlineItems: [
        {
          network: "",
          publisher: "",
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
            } as NewspapersFormValues["newspaperlineItems"][number]["bursts"][number] & { _reactKey: string },
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
    name: "newspaperlineItems",
  })

  const [collapsedLineItems, setCollapsedLineItems] = useState<Set<number>>(
    new Set()
  )

  const toggleLineItemCollapsed = useCallback((i: number) => {
    setCollapsedLineItems((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
  }, [])

  const collapseAllLineItems = useCallback(() => {
    const items = form.getValues("newspaperlineItems") || []
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

  const newspaperStandardBaselineRef = useRef("")
  const [expertNewspaperRows, setExpertNewspaperRows] = useState<
    NewspaperExpertScheduleRow[]
  >([])
  const [newspaperExpertModalOpen, setNewspaperExpertModalOpen] =
    useState(false)
  const [expertApplyPendingPageSave, setExpertApplyPendingPageSave] = useState(false)
  useEffect(() => {
    return subscribeMediaPlanPageSaved(() => setExpertApplyPendingPageSave(false))
  }, [])
  const mediaLineItemsPublishFpRef = useRef("")

  const [newspaperExpertExitConfirmOpen, setNewspaperExpertExitConfirmOpen] =
    useState(false)
  const [expertSegmentAttention, setExpertSegmentAttention] = useState(true)
  const newspaperExpertRowsBaselineRef = useRef("")
  const reorderedRef = useRef(false)
  const newspaperExpertModalOpenRef = useRef(false)
  newspaperExpertModalOpenRef.current = newspaperExpertModalOpen

  const newspaperExpertWeekColumns = useMemo(
    () => buildWeeklyGanttColumnsFromCampaign(campaignStartDate, campaignEndDate),
    [campaignStartDate, campaignEndDate]
  )

  useLayoutEffect(() => {
    newspaperStandardBaselineRef.current =
      serializeNewspaperStandardLineItemsBaseline(
        form.getValues("newspaperlineItems") as StandardNewspaperFormLineItem[]
      )
  }, [form])

  useEffect(() => {
    const id = window.setTimeout(() => setExpertSegmentAttention(false), 2800)
    return () => window.clearTimeout(id)
  }, [])

  const handleExpertNewspaperRowsChange = useCallback(
    (next: NewspaperExpertScheduleRow[]) => {
      setExpertNewspaperRows(next)
    },
    []
  )

  const openNewspaperExpertModal = useCallback(() => {
    const mapped = mapStandardNewspaperLineItemsToExpertRows(
      (form.getValues("newspaperlineItems") || []) as StandardNewspaperFormLineItem[],
      newspaperExpertWeekColumns,
      campaignStartDate,
      campaignEndDate
    )
    const weekKeys = newspaperExpertWeekColumns.map((c) => c.weekKey)
    const rows: NewspaperExpertScheduleRow[] =
      mapped.length > 0
        ? mapped
        : [
            createEmptyNewspaperExpertRow(
              typeof crypto !== "undefined" && crypto.randomUUID
                ? crypto.randomUUID()
                : `newspaper-expert-${Date.now()}`,
              campaignStartDate,
              campaignEndDate,
              weekKeys
            ),
          ]
    newspaperExpertRowsBaselineRef.current =
      serializeNewspaperExpertRowsBaseline(rows)
    setExpertNewspaperRows(rows)
    setNewspaperExpertExitConfirmOpen(false)
    setNewspaperExpertModalOpen(true)
  }, [campaignStartDate, campaignEndDate, form, newspaperExpertWeekColumns])



  const dismissNewspaperExpertExitConfirm = useCallback(() => {
    setNewspaperExpertExitConfirmOpen(false)
  }, [])

  const confirmNewspaperExpertExitWithoutSaving = useCallback(() => {
    setNewspaperExpertExitConfirmOpen(false)
    collapseAllLineItems()
    setNewspaperExpertModalOpen(false)
  }, [collapseAllLineItems])

  const handleNewspaperExpertModalOpenChange = useCallback(
    (open: boolean) => {
      if (open) {
        setNewspaperExpertModalOpen(true)
        return
      }
      const dirty =
        serializeNewspaperExpertRowsBaseline(expertNewspaperRows) !==
        newspaperExpertRowsBaselineRef.current
      if (!dirty) {
        collapseAllLineItems()
        setNewspaperExpertModalOpen(false)
        return
      }
      setNewspaperExpertExitConfirmOpen(true)
    },
    [collapseAllLineItems, expertNewspaperRows]
  )

  const handleNewspaperExpertApply = useCallback(() => {
    const prevLineItems = form.getValues("newspaperlineItems") || []
    const standard = mapNewspaperExpertRowsToStandardLineItems(
      expertNewspaperRows,
      newspaperExpertWeekColumns,
      campaignStartDate,
      campaignEndDate,
      {
        feePctNewspaper: feenewspapers,
        budgetIncludesFees: Boolean(prevLineItems[0]?.budgetIncludesFees),
      }
    )
    const merged = mergeNewspaperStandardFromExpertWithPrevious(
      standard,
      prevLineItems as StandardNewspaperFormLineItem[]
    )
    const orderedForApply = reorderedRef.current
      ? reassignLineItemNumbers(merged, mbaNumber, MEDIA_TYPE_ID_CODES.newspaper)
      : merged
    reorderedRef.current = false
    const keyedMerged = stampBurstReactKeys(orderedForApply)
    form.setValue("newspaperlineItems", keyedMerged as NewspapersFormValues["newspaperlineItems"], {
      shouldDirty: true,
      shouldValidate: false,
    })
    newspaperStandardBaselineRef.current =
      serializeNewspaperStandardLineItemsBaseline(
        form.getValues("newspaperlineItems") as StandardNewspaperFormLineItem[]
      )
    setNewspaperExpertExitConfirmOpen(false)
    collapseAllLineItems()
    setExpertApplyPendingPageSave(true)
    setNewspaperExpertModalOpen(false)
  }, [
    campaignStartDate,
    campaignEndDate,
    collapseAllLineItems,
    expertNewspaperRows,
    feenewspapers,
    form,
    newspaperExpertWeekColumns,
  ])

  // Watch hook
  const watchedLineItems = useWatch({ 
    control: form.control, 
    name: "newspaperlineItems",
    defaultValue: form.getValues("newspaperlineItems")
  });

  // Data loading for edit mode
  useStableHydration(
    initialLineItems,
    (items) => {
      const transformedLineItems = items.map((item: any, index: number) => {
        const lineNum =
          Number(item.line_item ?? item.lineItem ?? index + 1) || index + 1;
        const lineItemId =
          item.line_item_id || item.lineItemId || createLineItemId(lineNum);

        const parsedBursts = resolveLineItemBursts(item);


        return {
          network: item.network || item.publisher || "",
          publisher: item.publisher || "",
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
          bursts: parsedBursts.length > 0 ? parsedBursts.map((burst: any) => ({
            budget: burst.budget || "",
            buyAmount: burst.buyAmount || "",
            startDate: coerceBurstDateLocal(burst.startDate) ?? new Date(),
            endDate: coerceBurstDateLocal(burst.endDate) ?? new Date(),
            calculatedValue: computeLoadedDeliverables(
              item.buy_type || item.buyType,
              burst,
              Boolean(item.budget_includes_fees || item.budgetIncludesFees),
              feenewspapers ?? 0,
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
              feenewspapers ?? 0,
            ),
            fee: 0,
          }],
        };
      });

      form.reset({
        newspaperlineItems: stampBurstReactKeys(transformedLineItems),
        overallDeliverables: 0,
      });
    },
    newspaperExpertModalOpenRef,
  )

  // Transform form data to API schema format
  useEffect(() => {
    const formLineItems = watchedLineItems || [];
    const stableNewspaperItems = assignStableLineItemNumbers<any>(
      formLineItems,
      mbaNumber,
      MEDIA_TYPE_ID_CODES.newspaper,
    )
    
    const transformedLineItems = stableNewspaperItems.map((lineItem, index) => {
      // Calculate totalMedia from raw budget amounts (for display in MBA section)
      let totalMedia = 0;
      lineItem.bursts.forEach((burst) => {
        const budget = parseFloat(burst.budget.replace(/[^0-9.]/g, "")) || 0;
        if (lineItem.budgetIncludesFees) {
          const pct = feenewspapers || 0;
          totalMedia += (budget * (100 - pct)) / 100;
        } else {
          // Budget is net media
          totalMedia += budget;
        }
      });
      const lineItemId =
        lineItem.lineItemId ||
        lineItem.line_item_id ||
        buildLineItemId(mbaNumber, MEDIA_TYPE_ID_CODES.newspaper, index + 1);
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
        bursts: lineItem.bursts,
        feePct: feenewspapers || 0,
        line_item: lineNumber,
        totalMedia: totalMedia,
      };
    });

    publishMediaLineItemsIfChanged(mediaLineItemsPublishFpRef, transformedLineItems, onMediaLineItemsChange);
  }, [watchedLineItems, mbaNumber, feenewspapers, form, onMediaLineItemsChange]);
  
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
      const summaryBursts: InvestmentBurstInput[] = [];

      lineItem.bursts.forEach((burst) => {
        const budget = parseFloat(burst.budget.replace(/[^0-9.]/g, "")) || 0;
        let burstMedia = 0;
        let burstFee = 0;
        // Always calculate media for display purposes (ignore clientPaysForMedia)
        if (lineItem.budgetIncludesFees) {
          const pct = feenewspapers || 0;
          burstMedia = (budget * (100 - pct)) / 100;
          burstFee = (budget * pct) / 100;
        } else {
          // Budget is net media, fee calculated on top
          burstMedia = budget;
          burstFee = feenewspapers ? (budget / (100 - feenewspapers)) * feenewspapers : 0;
        }
        lineMedia += burstMedia;
        lineFee += burstFee;
        lineDeliverables += burst.calculatedValue || 0;
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
          Title: lineItem.title || "",
          "Buy Type": lineItem.buyType || "",
        },
        bursts: summaryBursts,
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
    let overallDeliverableCount = 0;

    newspaperlineItems.forEach((lineItem) => {
      let lineMedia = 0;
      let lineFee = 0;
      let lineDeliverables = 0;

      lineItem.bursts.forEach((burst) => {
        const budget = parseFloat(burst?.budget?.replace(/[^0-9.]/g, "") || "0");
        if (lineItem.budgetIncludesFees) {
          const pct = feenewspapers || 0;
          lineMedia += (budget * (100 - pct)) / 100;
          lineFee += (budget * pct) / 100;
        } else {
          lineMedia += budget;
          const fee = feenewspapers ? (budget / (100 - feenewspapers)) * feenewspapers : 0;
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

    const baseLineItem = source.line_item ?? source.lineItem;
    const normalizedLineItemNumber: number =
      typeof baseLineItem === "string"
        ? Number.parseFloat(baseLineItem) || 0
        : baseLineItem ?? lineItemIndex + 1;
    const nextLineItemNumber = normalizedLineItemNumber + 1;
    const newId = createLineItemId(nextLineItemNumber);

    const clone = {
      ...source,
      lineItemId: newId,
      line_item_id: newId,
      line_item: nextLineItemNumber,
      lineItem: nextLineItemNumber,
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

  const handleBuyTypeChange = useCallback(
    (lineItemIndex: number, value: string) => {
      form.setValue(`newspaperlineItems.${lineItemIndex}.buyType`, value);

      if (value === "bonus" || value === "package_inclusions") {
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

  const handleValueChange = useCallback((lineItemIndex: number, burstIndex: number, budgetIncludesFeesOverride?: boolean) => {
    const burst = form.getValues(`newspaperlineItems.${lineItemIndex}.bursts.${burstIndex}`);
    const lineItem = form.getValues(`newspaperlineItems.${lineItemIndex}`);
    const rawBudget = parseFloat(burst?.budget?.replace(/[^0-9.]/g, "") || "0");
    const budgetIncludesFees = budgetIncludesFeesOverride ?? Boolean(lineItem?.budgetIncludesFees);
    const buyAmount = parseFloat(burst?.buyAmount?.replace(/[^0-9.]/g, "") || "1");
    const buyTypeRaw = form.getValues(`newspaperlineItems.${lineItemIndex}.buyType`);

    const buyTypeLower = String(buyTypeRaw || "").toLowerCase();
    if (
      buyTypeLower === "bonus" ||
      buyTypeLower === "package_inclusions" ||
      buyTypeLower === "package"
    ) {
      return;
    }

    const bt = coerceBuyTypeWithDevWarn(String(buyTypeRaw || ""), "NewspapersContainer.handleValueChange");
    const calculatedValue = computeDeliverableFromMedia({
      buyType: bt,
      rawBudget,
      buyAmount,
      budgetIncludesFees,
      feePct: feenewspapers || 0,
    });

    const currentValue = form.getValues(`newspaperlineItems.${lineItemIndex}.bursts.${burstIndex}.calculatedValue`);
    if (currentValue !== calculatedValue && !isNaN(calculatedValue)) {
      form.setValue(`newspaperlineItems.${lineItemIndex}.bursts.${burstIndex}.calculatedValue`, calculatedValue, {
        shouldValidate: false, // Changed to false to prevent validation loops
        shouldDirty: false,    // Changed to false to prevent dirty state loops
      });

      handleLineItemValueChange(lineItemIndex);
    }
  }, [feenewspapers, form, handleLineItemValueChange]);

  const handleAppendBurst = useCallback((lineItemIndex: number) => {
    appendBurst({
      form,
      fieldKey: "newspaperlineItems",
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
      fieldKey: "newspaperlineItems",
      lineItemIndex,
      onAfter: handleLineItemValueChange,
      toast: toast as Parameters<typeof duplicateBurst>[0]["toast"],
    })
  }, [form, handleLineItemValueChange, toast]);

  const handleRemoveBurst = useCallback((lineItemIndex: number, burstIndex: number) => {
    removeBurst({
      form,
      fieldKey: "newspaperlineItems",
      lineItemIndex,
      burstIndex,
      onAfter: handleLineItemValueChange,
      toast: toast as Parameters<typeof removeBurst>[0]["toast"],
    })
  }, [form, handleLineItemValueChange, toast]);

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
}, [clientId, toast, fetchAndUpdateNewspaperAdSizes, fetchAndUpdateNewspapers]);
  
  // report raw totals (ignoring clientPaysForMedia) for MBA-Details
useEffect(() => {
  onTotalMediaChange(
    overallTotals.overallMedia,
    overallTotals.overallFee
  )
}, [overallTotals.overallMedia, overallTotals.overallFee, onTotalMediaChange])

useEffect(() => {
  // convert each form lineItem into the shape needed for Excel
  const calculatedBursts = getNewspapersBursts(form, feenewspapers || 0);
  let burstIndex = 0;
  const normalizedLineItems = normalizeLineItemsForSave<any>(
    form.getValues('newspaperlineItems') || [],
    mbaNumber,
    MEDIA_TYPE_ID_CODES.newspaper,
  );

  const items: LineItem[] = normalizedLineItems.flatMap((lineItem, lineItemIndex) =>
    lineItem.bursts.map(burst => {
      const computedBurst = calculatedBursts[burstIndex++];
      const mediaAmount = computedBurst
        ? computedBurst.mediaAmount
        : parseFloat(String(burst.budget).replace(/[^0-9.-]+/g, "")) || 0;
      let lineItemId = lineItem.lineItemId || lineItem.line_item_id;
      if (!lineItemId) {
        lineItemId = createLineItemId(lineItemIndex + 1);
        form.setValue(`newspaperlineItems.${lineItemIndex}.lineItemId`, lineItemId);
        form.setValue(`newspaperlineItems.${lineItemIndex}.line_item_id`, lineItemId);
      }
      const lineNumber = lineItem.line_item ?? lineItem.lineItem ?? lineItemIndex + 1;
      const buyTypeLower = String(lineItem.buyType || "").toLowerCase();
      const isManualBuyType =
        buyTypeLower === "bonus" ||
        buyTypeLower === "package_inclusions" ||
        buyTypeLower === "package";
      const recomputedDeliverable = isManualBuyType
        ? NaN
        : computeDeliverableFromMedia({
            buyType: lineItem.buyType as Parameters<typeof computeDeliverableFromMedia>[0]["buyType"],
            rawBudget: parseFloat(String(burst.budget).replace(/[^0-9.-]+/g, "")) || 0,
            buyAmount: parseFloat(String(burst.buyAmount ?? burst.budget).replace(/[^0-9.-]+/g, "")) || 0,
            budgetIncludesFees: !!lineItem.budgetIncludesFees,
            feePct: feenewspapers || 0,
          });
      const deliverableForExcel = Number.isNaN(recomputedDeliverable)
        ? (burst.calculatedValue ?? 0)
        : recomputedDeliverable;

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
        deliverables: deliverableForExcel,
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
}, [watchedLineItems, feenewspapers, createLineItemId, form, mbaNumber, onLineItemsChange]);

// Add new useEffect to capture raw newspaper line items data
useEffect(() => {
  const rawLineItems = normalizeLineItemsForSave<any>(
    watchedLineItems || [],
    mbaNumber,
    MEDIA_TYPE_ID_CODES.newspaper,
  );
  onNewspaperLineItemsChange(rawLineItems);
}, [watchedLineItems, mbaNumber, onNewspaperLineItemsChange]);

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
  }, [watchedLineItems, feenewspapers, form, onBurstsChange, onInvestmentChange]);

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
          const pct = feenewspapers || 0;
          mediaAmount = (budget * (100 - pct)) / 100;
          feeAmount = (budget * pct) / 100;
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
        <Card className="overflow-hidden border-0 shadow-md">
          <div className="h-1" style={mediaTypeSummaryStripeStyle(MEDIA_ACCENT_HEX)} />
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <CardTitle className="text-base font-semibold tracking-tight">
                    Newspapers Media
                  </CardTitle>
                  {newspaperExpertModalOpen ? (
                    <Badge
                      variant="outline"
                      className="border-2 text-[10px] font-semibold uppercase tracking-wider shadow-sm"
                      style={{
                        borderColor: rgbaFromHex(MEDIA_ACCENT_HEX, 0.55),
                        backgroundColor: rgbaFromHex(MEDIA_ACCENT_HEX, 0.14),
                        color: MEDIA_ACCENT_HEX,
                      }}
                    >
                      Schedule grid open
                    </Badge>
                  ) : null}
                  {expertApplyPendingPageSave ? (
                    <Badge variant="outline" className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Not saved to plan yet
                    </Badge>
                  ) : null}
                </div>
                <div
                  role="group"
                  aria-label="Newspapers Media entry mode"
                  className="inline-flex shrink-0 rounded-lg border border-border bg-muted/50 p-0.5"
                >
                  <button
                    type="button"
                    aria-pressed={!newspaperExpertModalOpen}
                    className={cn(
                      "rounded-md px-3 py-1.5 text-xs font-medium transition-all",
                      !newspaperExpertModalOpen
                        ? "text-white shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                    style={
                      !newspaperExpertModalOpen
                        ? { backgroundColor: MEDIA_ACCENT_HEX }
                        : undefined
                    }
                    onClick={() => {
                      if (newspaperExpertModalOpen) {
                        writeContainerEntryMode("card")
                        handleNewspaperExpertModalOpenChange(false)
                      }
                    }}
                  >Card entry</button>
                  <button
                    type="button"
                    aria-pressed={newspaperExpertModalOpen}
                    className={cn(
                      "rounded-md px-3 py-1.5 text-xs font-medium transition-all",
                      newspaperExpertModalOpen
                        ? "text-white shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                      expertSegmentAttention &&
                        !newspaperExpertModalOpen &&
                        "animate-pulse"
                    )}
                    style={{
                      ...(newspaperExpertModalOpen
                        ? { backgroundColor: MEDIA_ACCENT_HEX }
                        : {}),
                      ...(expertSegmentAttention && !newspaperExpertModalOpen
                        ? {
                            boxShadow: `0 0 0 2px ${rgbaFromHex(MEDIA_ACCENT_HEX, 0.45)}`,
                          }
                        : {}),
                    }}
                    onClick={() => {
                      if (!newspaperExpertModalOpen) {
                        writeContainerEntryMode("schedule")
                          openNewspaperExpertModal()
                      }
                    }}
                  >Schedule grid</button>
                </div>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted-foreground">
                  One card per line - or switch to Schedule grid for week quantities.
                </p>
                <span className="text-xs text-muted-foreground tabular-nums sm:text-right">
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
              feeLabel={`Fee (${feenewspapers}%)`}
              accentHex={MEDIA_ACCENT_HEX}
              dimensions={["Network", "Title", "Buy Type"]}
              deliverablesLabelFor={getDeliverablesLabel}
            />
            <MediaContainerTimelineCollapsible
              mediaTypeKey="newspaper"
              lineItems={watchedLineItems}
              campaignStartDate={campaignStartDate}
              campaignEndDate={campaignEndDate}
            />
          </CardContent>
        </Card>
      </div>
  
      <div>
        {isLoading ? (
          <MediaContainerLoadState loading label="Newspaper" />
        ) : (
          <div className="space-y-6">
            {newspaperExpertModalOpen ? null : (
            <Form {...form}>
              <div className="space-y-6">
                {lineItemFields.length === 0 ? (
                  <ContainerEmptyLinesPlaceholder
                    onAdd={() => appendLineItem({
                                                          network: "",
                                                          publisher: "",
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
                                                            } as NewspapersFormValues["newspaperlineItems"][number]["bursts"][number] & { _reactKey: string },
                                                          ],
                                                        })}
                  />
                ) : null}
                {lineItemFields.map((field, lineItemIndex) => {
                  const lineItemId = buildLineItemId(
                    mbaNumber,
                    MEDIA_TYPE_ID_CODES.newspaper,
                    lineItemIndex + 1
                  );
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
                    <ExpertCard<NewspapersFormValues>
                      key={field.id}
                      config={NEWSPAPER_EXPERT_CHANNEL_CONFIG}
                      form={form}
                      itemsKey="newspaperlineItems"
                      lineItemIndex={lineItemIndex}
                      lineItemId={lineItemId}
                      collapsed={collapsedLineItems.has(lineItemIndex)}
                      onToggleCollapsed={() => toggleLineItemCollapsed(lineItemIndex)}
                      totalDisplay={formatMoney(
                        form.getValues(`newspaperlineItems.${lineItemIndex}.budgetIncludesFees`)
                          ? totalMedia
                          : totalMedia + (totalMedia / (100 - (feenewspapers || 0))) * (feenewspapers || 0),
                        { locale: "en-AU", currency: "AUD" }
                      )}
                      publishers={publishers}
                      dynamicOptionsByKey={{
                        title: filteredNewspapers.map((newspaper) => ({
                          value: newspaper.title || `title-${newspaper.id}`,
                          label: newspaper.title || "(Untitled)",
                        })),
                        size: newspapersAdSizes.map((adSize) => ({
                          value: adSize.adsize || `adsize-${adSize.id}`,
                          label: adSize.adsize || "(Unnamed ad size)",
                        })),
                      }}
                      feePct={feenewspapers || 0}
                      calculatedVariant="newspaper"
                      campaignStartDate={campaignStartDate}
                      campaignEndDate={campaignEndDate}
                      onBurstValueChange={handleValueChange}
                      onAppendBurst={handleAppendBurst}
                      onDuplicateBurst={(li, _bi) => handleDuplicateBurst(li)}
                      onRemoveBurst={handleRemoveBurst}
                      onBudgetIncludesFeesChange={(li, checked) => {
                        const bursts = form.getValues(`newspaperlineItems.${li}.bursts`) || [];
                        bursts.forEach((_, bi) => handleValueChange(li, bi, !!checked));
                      }}
                      onComboboxValueChange={(key, li, value) => {
                        if (key === "buyType") handleBuyTypeChange(li, value);
                      }}
                      fieldAdornments={{
                        title: (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-auto p-1"
                            onClick={() => {
                              const currentNetworkInForm = form.getValues(
                                `newspaperlineItems.${lineItemIndex}.network`
                              );
                              if (!currentNetworkInForm) {
                                toast({
                                  title: "Select a Network First",
                                  description: "Please select a network before adding a title.",
                                  variant: "default",
                                });
                                return;
                              }
                              setCurrentLineItemIndexForNewTitle(lineItemIndex);
                              setNewTitleName("");
                              setNewTitleNetwork(currentNetworkInForm);
                              setIsAddTitleDialogOpen(true);
                            }}
                          >
                            <PlusCircle className="h-5 w-5 text-primary" />
                          </Button>
                        ),
                        size: (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-auto p-1"
                            onClick={() => {
                              setCurrentLineItemIndexForNewAdSize(lineItemIndex);
                              setNewAdSizeName("");
                              setIsAddNewspaperAdSizeDialogOpen(true);
                            }}
                          >
                            <PlusCircle className="h-5 w-5 text-primary" />
                          </Button>
                        ),
                      }}
                      comboboxPropsByKey={{
                        title: {
                          disabled: !selectedNetwork,
                          placeholder: selectedNetwork
                            ? "Select Title"
                            : "Select Network first",
                          searchPlaceholder: "Search titles...",
                          emptyText: selectedNetwork
                            ? `No titles found for "${selectedNetwork}".`
                            : "Select Network first",
                          buttonClassName: "h-9 w-full rounded-md",
                        },
                        size: {
                          placeholder: "Select Ad Size",
                          searchPlaceholder: "Search ad sizes...",
                          emptyText: "No ad sizes found.",
                          buttonClassName: "h-9 w-full rounded-md",
                        },
                      }}
                      summaryRow={
                        <div className="border-b px-6 py-2">
                          <div className="grid grid-cols-4 gap-4 text-sm">
                            <div>
                              <span className="font-medium">Network:</span>{" "}
                              {form.watch(`newspaperlineItems.${lineItemIndex}.network`) ||
                                "Not selected"}
                            </div>
                            <div>
                              <span className="font-medium">Buy Type:</span>{" "}
                              {formatBuyTypeForDisplay(
                                form.watch(`newspaperlineItems.${lineItemIndex}.buyType`)
                              )}
                            </div>
                            <div>
                              <span className="font-medium">Title:</span>{" "}
                              {form.watch(`newspaperlineItems.${lineItemIndex}.title`) ||
                                "Not selected"}
                            </div>
                            <div>
                              <span className="font-medium">Bursts:</span>{" "}
                              {form.watch(`newspaperlineItems.${lineItemIndex}.bursts`, []).length}
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
                                    publisher: "",
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
                                      } as NewspapersFormValues["newspaperlineItems"][number]["bursts"][number] & {
                                        _reactKey: string
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
            )}
          </div>
        )}
      </div>

      <Dialog
        open={newspaperExpertModalOpen}
        onOpenChange={handleNewspaperExpertModalOpenChange}
      >
        <DialogContent className="max-w-[95vw] w-[95vw] max-h-[95vh] h-[95vh] flex flex-col p-4 gap-0 overflow-hidden">
          <DialogHeader className="flex-shrink-0 pb-2">
            <DialogTitle>Newspapers Media Expert Mode</DialogTitle>
          </DialogHeader>
          <ComboboxModalProvider>
            <div className="flex-1 min-h-0 overflow-auto">
              <NewspaperExpertGrid
                campaignStartDate={campaignStartDate}
                campaignEndDate={campaignEndDate}
                feenewspapers={feenewspapers}
                rows={expertNewspaperRows}
                onRowsChange={handleExpertNewspaperRowsChange}
                publishers={publishers}
                newspapers={newspapers}
                onReorder={() => {
                  reorderedRef.current = true;
                }}
              />
            </div>
          </ComboboxModalProvider>
          <DialogFooter className="flex-shrink-0 border-t pt-3 mt-2">
            <div className="mr-auto flex flex-col gap-1.5">
              <ExpertIncompleteRowsSummary rows={expertNewspaperRows} />
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
            <Button type="button" onClick={handleNewspaperExpertApply}>
              Apply to plan (not saved yet)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={newspaperExpertExitConfirmOpen}
        onOpenChange={(open) => {
          if (!open) dismissNewspaperExpertExitConfirm()
        }}
      >
        <DialogContent
          className="z-[100] sm:max-w-md"
          onClick={(e) => {
            if (
              (e.target as HTMLElement).closest(
                "[data-newspaperexpert-exit-yes]"
              )
            ) {
              return
            }
            dismissNewspaperExpertExitConfirm()
          }}
        >
          <DialogHeader>
            <DialogTitle>Leave Newspapers Media Expert Mode?</DialogTitle>
            <DialogDescription>
              You have unsaved changes in Expert Mode. Apply saves them to the
              Newspapers Media section; leaving now discards those edits.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={dismissNewspaperExpertExitConfirm}
            >
              No, keep editing
            </Button>
            <Button
              type="button"
              variant="destructive"
              data-newspaperexpert-exit-yes
              onClick={confirmNewspaperExpertExitWithoutSaving}
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
