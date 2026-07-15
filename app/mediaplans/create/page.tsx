"use client"

import {
  useState,
  useEffect,
  lazy,
  Suspense,
  useCallback,
  useMemo,
  useRef,
  type ComponentType,
  type LazyExoticComponent,
} from "react"
import { Controller, useForm, useWatch, type Control } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { format } from "date-fns"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Combobox } from "@/components/ui/combobox"
import { MultiSelectCombobox, type MultiSelectOption } from "@/components/ui/multi-select-combobox"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { SingleDatePicker } from "@/components/ui/single-date-picker"
import { CampaignDatePresetBar } from "@/components/mediaplans/CampaignDatePresetBar"
import { ExpertApplyDirtyClearOnSave } from "@/components/mediaplans/ExpertApplyDirtyClearOnSave"
import { BuilderIssuesBadge } from "@/components/mediaplans/BuilderIssuesBadge"
import type { BuilderIssue } from "@/lib/mediaplan/builderIssues"
import { MediaContainerLoadState } from "@/components/media-containers/MediaContainerLoadState"
import { defaultCampaignDateRange } from "@/lib/mediaplan/campaignDatePresets"
import { ChevronsUpDown, Check, Download, FileText, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatMoney } from "@/lib/format/money"
import { MoneyInput } from "@/components/ui/MoneyInput"
import { CampaignExportsSection } from "@/components/dashboard/CampaignExportsSection"
import { PlanWizardShell } from "@/components/mediaplans/PlanWizardShell"
import { AvaMediaplanCreateActions } from "@/components/ava/AvaSkillActionSets"
import { sortByLabel } from "@/lib/utils/sort"
import { useMediaPlanContext } from "@/contexts/MediaPlanContext"
import { UnsavedChangesDialog } from "@/components/mediaplans/UnsavedChangesDialog"
import { toast } from "@/components/ui/use-toast"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { parsePrefillYmd } from "@/lib/mediaplan/createPrefill"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { SavingModal, type SaveStatusItem } from "@/components/ui/saving-modal"
import { OutcomeModal } from "@/components/outcome-modal"
import type { BillingBurst, BillingMonth, BillingLineItem } from "@/lib/billing/types" // adjust path if needed
import { computeBillingAndDeliveryMonths } from "@/lib/billing/computeSchedule"
import {
  billingMonthsHaveDetailedLineItems,
  computeLineItemTotalsFromDeliveryMonths,
  recomputePartialMbaFromSelections,
  type PartialApprovalLineItem,
  type PartialApprovalMetadata,
  type PartialMbaValues,
} from "@/lib/mediaplan/partialMba"
import { MEDIA_TYPE_ID_CODES } from "@/lib/mediaplan/lineItemIds"
import { generateBillingLineItems } from "@/lib/billing/generateBillingLineItems"
import { mergeInvestmentMonths } from "@/lib/billing/mergeInvestmentMonths"
import { MbaBillingAutoCalcSummary } from "@/components/billing/MbaBillingAutoCalcSummary"
import {
  MbaBillingModal,
  type MbaBillingScopeLine,
} from "@/components/billing/MbaBillingModal"
import { ManualBillingSpreadsheetCostInput } from "@/components/billing/ManualBillingSpreadsheetCostInput"
import { ManualBillingSpreadsheetLineItemInput } from "@/components/billing/ManualBillingSpreadsheetLineItemInput"
import { ManualBillingSpreadsheetProvider } from "@/components/billing/manualBillingSpreadsheetContext"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { prepareBillingMonthsForLineItemExport } from "@/lib/billing/prepareBillingMonthsForLineItemExport"
import {
  buildBillingScheduleExcelBlob,
  sanitizeFilenamePart,
} from "@/lib/billing/exportBillingScheduleExcel"
import { syncLineItemMonthlyAmountAcrossAllMonthRows } from "@/lib/billing/syncLineItemAmountAcrossMonthRows"
import {
  applyBillingLineMode,
  type BillingLineMode,
} from "@/lib/billing/applyBillingLineMode"
import {
  buildManualBillingMediaSections,
  defaultManualBillingAccordionExpanded,
  useManualBillingSpreadsheetCallbacks,
} from "@/lib/billing/useManualBillingSpreadsheetCallbacks"
import { getMediaTypeHeadersForSchedule } from "@/lib/billing/mediaTypeHeaders"
import { persistManualBillingOverrides } from "@/lib/finance/persistManualBillingOverrides"
import {
  billingOverrideLineIdsMatch,
  extractOverrideMonthsFromSchedule,
  listManualOverrideLineIds,
  sumLineMediaAcrossMonths,
  toBillingOverrideLineItemId,
  validateManualMediaMonthsSum,
  type LineOverrideMeta,
} from "@/lib/finance/manualBillingOverridesUi"
import type { BurstDateLike } from "@/lib/finance/billingOverrideDateBasis"
import { resolveLineItemBursts } from "@/lib/mediaplan/deriveBursts"
import { generateMediaPlan, MediaPlanHeader, LineItem, MediaItems } from '@/lib/generateMediaPlan'
import { generateNamingWorkbook } from '@/lib/namingConventions'
import { MBAData } from '@/lib/generateMBA'
import { saveAs } from 'file-saver'
import { useUnsavedChangesPrompt } from "@/hooks/use-unsaved-changes-prompt"
import { 
  createMediaPlan, 
  createMediaPlanVersion, 
  uploadMediaPlanVersionDocuments,
  editMediaPlan, 
  saveTelevisionLineItems, 
  saveRadioLineItems,
  saveNewspaperLineItems, 
  saveMagazinesLineItems,
  saveOOHLineItems,
  saveCinemaLineItems,
  saveDigitalDisplayLineItems,
  saveDigitalAudioLineItems,
  saveDigitalVideoLineItems,
  saveBVODLineItems,
  saveIntegrationLineItems,
  saveSearchLineItems,
  saveSocialMediaLineItems,
  saveProgDisplayLineItems,
  saveProgVideoLineItems,
  saveProgBVODLineItems,
  saveProgAudioLineItems,
  saveProgOOHLineItems,
  saveInfluencersLineItems,
  saveProductionLineItems
} from "@/lib/api"
import { checkLineItemDatesOutsideCampaign } from "@/lib/utils/mediaPlanValidation"
import { toDateOnlyString } from "@/lib/timezone"
import { setAssistantContext, clearAssistantContext } from "@/lib/assistantBridge"
import { KPISection } from "@/components/kpis/KPISection"
import { createMediaPlanKpiHost } from "@/components/kpis/kpiHost"
import { resolveAllKPIs } from "@/lib/kpi/resolve"
import { mergeManualKpiOverrides } from "@/lib/kpi/recalc"
import { getPublisherKPIs, getClientKPIs } from "@/lib/api/kpi"
import { saveCampaignKpisFromRows } from "@/lib/kpi/saveCampaignKpis"
import { fanOutKpiPayload } from "@/lib/kpi/fanOut"
import { buildKpiLineItemsByMediaType } from "@/lib/kpi/lineItemsForFanOut"
import type {
  PublisherKPI,
  ClientKPI,
  ResolvedKPIRow,
  CampaignKPI,
  LineItemForKpiFanout,
} from "@/lib/kpi/types"
import type { MediaContainerBestPractice, Publisher } from "@/lib/types/publisher"
import {
  advertisingAssociatesFilteredPlanHasLineItems,
  buildAdvertisingAssociatesMbaDataFromMediaItems,
  filterMediaItemsForAdvertisingAssociates,
  planHasAdvertisingAssociatesLineItem,
  shouldIncludeMediaPlanLineItem,
} from "@/lib/mediaplan/advertisingAssociatesExcel"
import { MEDIA_TYPE_COLORS } from "@/lib/media/mediaTypes"
import {
  attachOverridesToLineInputs,
} from "@/lib/finance/billingOverrides"
import {
  buildEditorLineItemInputs,
  buildFeeLoadingFromEditorFees,
  editorBillingStableLineItemId,
} from "@/lib/finance/buildEditorLineItemInputs"
import { computeCampaignFinancials } from "@/lib/finance/computeCampaignFinancials"
import { panelIndicatorsFromCampaignFinancials } from "@/lib/finance/panelIndicatorsFromCampaignFinancials"
import { assertCoreScheduleParity } from "@/lib/finance/assertCoreScheduleParity"
import { parsePersistedBillingScheduleToMonths } from "@/lib/billing/parsePersistedBillingScheduleToMonths"
import type { SeedLineFeesMediaConfig } from "@/lib/billing/seedLineFees"


const mediaPlanSchema = z.object({
  mp_client_name: z.string().min(1, "Client name is required"),
  mp_campaignstatus: z.string().min(1, "Campaign status is required"),
  mp_campaignname: z.string().min(1, "Campaign name is required"),
  mp_campaigndates_start: z.date(),
  mp_campaigndates_end: z.date(),
  mp_brand: z.string(),
  mp_clientcontact: z.string().min(1, "Client contact is required"),
  mp_ponumber: z.string(),
  mp_campaignbudget: z.number(),
  mbaidentifier: z.string(),
  mba_number: z.string(),
  mp_plannumber: z.string(),
  mp_television: z.boolean(),
  mp_radio: z.boolean(),
  /**
   * mp_production — MBA contains production line item(s).
   * Controls production section visibility and presence-dependent calculations.
   * Independent of mp_fixedfee.
   */
  mp_production: z.boolean(),
  mp_newspaper: z.boolean(),
  mp_magazines: z.boolean(),
  mp_ooh: z.boolean(),
  mp_cinema: z.boolean(),
  mp_digidisplay: z.boolean(),
  mp_digiaudio: z.boolean(),
  mp_digivideo: z.boolean(),
  mp_bvod: z.boolean(),
  mp_integration: z.boolean(),
  mp_search: z.boolean(),
  mp_socialmedia: z.boolean(),
  mp_progdisplay: z.boolean(),
  mp_progvideo: z.boolean(),
  mp_progbvod: z.boolean(),
  mp_progaudio: z.boolean(),
  mp_progooh: z.boolean(),
  mp_influencers: z.boolean(),
  /**
   * mp_fixedfee — Client billed on fixed-fee structure (maps to `fixed_fee` on save).
   * Independent of mp_production.
   */
  mp_fixedfee: z.boolean(),
  billingSchedule: z.array(z.record(z.string(), z.string())).optional(),
  lineItems: z.array(
    z.object({
      bursts: z.array(
        z.object({
          startDate: z.string(),
          endDate: z.string(),
          budget: z.string(),
          clientPaysForMedia: z.boolean(),
          feePercentage: z.number(),
          budgetIncludesFees: z.boolean(),
        })
      ),
    })
  ),
})

type MediaPlanFormValues = z.infer<typeof mediaPlanSchema>

type PageField = {
  id: string;
  label: string;
  type: "string" | "number" | "date" | "enum" | "boolean";
  value: any;
  editable: boolean;
  options?: { label: string; value: string }[];
  validation?: { required?: boolean; min?: number; max?: number; pattern?: string };
  semanticType?: string;
  group?: string;
  source?: "xano" | "computed" | "ui";
};

type PageContext = {
  route: { pathname: string; clientSlug?: string; mbaSlug?: string };
  fields: PageField[];
  generatedAt: string;
  entities?: { clientSlug?: string; clientName?: string; mbaNumber?: string; campaignName?: string; mediaTypes?: string[] };
  pageText?: { title?: string; headings?: string[]; breadcrumbs?: string[] };
};

interface Client {
  id: number
  mp_client_name: string
  mbaidentifier: string
  feesearch: number
  feesocial: number
  feebvod: number
  feeintegration: number
  feeprogdisplay: number
  feeprogvideo: number
  feeprogbvod: number
  feeprogaudio: number
  feeprogooh: number
  feecinema: number
  feedigiaudio: number
  feedigidisplay: number
  feedigivideo: number
  feecontentcreator: number
  adservvideo: number
  adservimp: number
  adservdisplay: number
  adservaudio: number
  streetaddress: string
  suburb: string
  state_dropdown: string
  postcode: string
}

const isChunkLoadError = (error: unknown): boolean => {
  if (!(error instanceof Error)) return false
  return error.name === "ChunkLoadError" || /Loading chunk .* failed/i.test(error.message)
}

const lazyWithChunkRetry = <T extends ComponentType<any>>(
  importer: () => Promise<{ default: T }>
): LazyExoticComponent<T> =>
  lazy(async () => {
    try {
      return await importer()
    } catch (error) {
      if (typeof window !== "undefined" && isChunkLoadError(error)) {
        const retryKey = "mp-create-lazy-chunk-retried"
        // Prevent an infinite reload loop if the chunk truly cannot be loaded.
        if (!window.sessionStorage.getItem(retryKey)) {
          window.sessionStorage.setItem(retryKey, "1")
          window.location.reload()
          return new Promise<never>(() => {})
        }
        window.sessionStorage.removeItem(retryKey)
      }
      throw error
    }
  })

function MediaContainerSuspenseFallback({ label }: { label: string }) {
  return <MediaContainerLoadState loading label={label} />
}

// Lazy-loaded components for each media type
const TelevisionContainer = lazyWithChunkRetry(() => import("@/components/media-containers/TelevisionContainer"))
const RadioContainer = lazyWithChunkRetry(() => import("@/components/media-containers/RadioContainer"))
const NewspaperContainer = lazyWithChunkRetry(() => import("@/components/media-containers/NewspaperContainer"))
const MagazinesContainer = lazyWithChunkRetry(() => import("@/components/media-containers/MagazinesContainer"))
const OOHContainer = lazyWithChunkRetry(() => import("@/components/media-containers/OOHContainer"))
const CinemaContainer = lazyWithChunkRetry(() => import("@/components/media-containers/CinemaContainer"))
const DigitalDisplayContainer = lazyWithChunkRetry(() => import("@/components/media-containers/DigitalDisplayContainer"))
const DigitalAudioContainer = lazyWithChunkRetry(() => import("@/components/media-containers/DigitalAudioContainer"))
const DigitalVideoContainer = lazyWithChunkRetry(() => import("@/components/media-containers/DigitalVideoContainer"))
const BVODContainer = lazyWithChunkRetry(() => import("@/components/media-containers/BVODContainer"))
const IntegrationContainer = lazyWithChunkRetry(() => import("@/components/media-containers/IntegrationContainer"))
const SearchContainer = lazyWithChunkRetry(() => import("@/components/media-containers/SearchContainer"))
const SocialMediaContainer = lazyWithChunkRetry(() => import("@/components/media-containers/SocialMediaContainer"))
const ProgDisplayContainer = lazyWithChunkRetry(() => import("@/components/media-containers/ProgDisplayContainer"))
const ProgVideoContainer = lazyWithChunkRetry(() => import("@/components/media-containers/ProgVideoContainer"))
const ProgBVODContainer = lazyWithChunkRetry(() => import("@/components/media-containers/ProgBVODContainer"))
const ProgAudioContainer = lazyWithChunkRetry(() => import("@/components/media-containers/ProgAudioContainer"))
const ProgOOHContainer = lazyWithChunkRetry(() => import("@/components/media-containers/ProgOOHContainer"))
const InfluencersContainer = lazyWithChunkRetry(() => import("@/components/media-containers/InfluencersContainer"))
const ProductionContainer = lazyWithChunkRetry(() => import("@/components/media-containers/ProductionContainer"))

// Place this inside your CreateMediaPlan component, after the state declarations
const mediaKeyMap: { [key: string]: string } = {
  mp_search: 'search',
  mp_socialmedia: 'socialMedia',
  mp_digiaudio: 'digiAudio',
  mp_digidisplay: 'digiDisplay',
  mp_digivideo: 'digiVideo',
  mp_bvod: 'bvod',
  mp_progdisplay: 'progDisplay',
  mp_progvideo: 'progVideo',
  mp_progbvod: 'progBvod',
  mp_progaudio: 'progAudio',
  mp_progooh: 'progOoh',
  mp_cinema: 'cinema',
  mp_television: 'television',
  mp_radio: 'radio',
  mp_newspaper: 'newspaper',
  mp_magazines: 'magazines',
  mp_ooh: 'ooh',
  mp_integration: 'integration',
  mp_influencers: 'influencers',
  mp_production: 'production',
};
// Add these type declarations at the top of the file
type BillingMonths = {
  monthYear: string;
  searchAmount: string;
  socialAmount: string;
  progDisplayAmount: string;
  progVideoAmount: string;
  progBvodAmount: string;
  progOohAmount: string;
  progAudioAmount: string;
  cinemaAmount: string;
  digiAudioAmount: string;
  digiDisplayAmount: string;
  digiVideoAmount: string;
  bvodAmount: string;
  feeAmount: string;
  totalAmount: string;
  assembledFee: string;
  adservingTechFees: string;
  production: string;
  mediaCosts: {
    search: string;
    socialMedia: string;
    television: string;
    radio: string;
    newspaper: string;
    magazines: string;
    ooh: string;
    cinema: string;
    digidisplay: string;
    digiaudio: string;
    digivideo: string;
    bvod: string;
    integration: string;
    progdisplay: string;
    progvideo: string;
    progbvod: string;
    progaudio: string;
    progooh: string;
    influencers: string;
    production: string;
  };
};

type Burst = {
  startDate: string;
  endDate: string;
  budget: number;
  clientPaysForMedia: boolean;
  feePercentage: number;
  budgetIncludesFees: boolean;
};

type CreateCampaignStepId = "campaign-setup" | "channel-allocation" | "mba-billing" | "review-export"

const createCampaignSteps: { id: CreateCampaignStepId; label: string; eyebrow: string }[] = [
  { id: "campaign-setup", label: "Campaign setup", eyebrow: "01" },
  { id: "channel-allocation", label: "Channel allocation", eyebrow: "02" },
  { id: "mba-billing", label: "MBA & billing", eyebrow: "03" },
  { id: "review-export", label: "Review & files", eyebrow: "04" },
]

const argbToCssHex = (argb?: string) => {
  const value = argb?.trim()
  if (!value || value.length !== 8) return undefined
  return `#${value.slice(2)}`
}

const getMediaTypeAccentColor = (mediaName: string) =>
  argbToCssHex(MEDIA_TYPE_COLORS[mediaKeyMap[mediaName]])

function CreateMediaPlan() {

  //general and client info
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [clients, setClients] = useState<Client[]>([])
  const [clientsReady, setClientsReady] = useState(false)
  const [reportId, setReportId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [selectedClientId, setSelectedClientId] = useState<string>("")
  const [isClientPopoverOpen, setIsClientPopoverOpen] = useState(false)
  const { setMbaNumber } = useMediaPlanContext() 
  const [burstsData, setBurstsData] = useState([])
  const [isDownloading, setIsDownloading] = useState(false)
  const [isDownloadingAa, setIsDownloadingAa] = useState(false)
  const [isNamingDownloading, setIsNamingDownloading] = useState(false)
  const [clientAddress, setClientAddress] = useState("")
  const [clientSuburb, setClientSuburb] = useState("")
  const [clientState, setClientState] = useState("")
  const [clientPostcode, setClientPostcode] = useState("")
  const [saveStatus, setSaveStatus] = useState<SaveStatusItem[]>([]);
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState("");
  const [modalOutcome, setModalOutcome] = useState("");
  const [modalLoading, setModalLoading] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const navigationHydratedRef = useRef(false);
  const prefillDoneRef = useRef(false);
  const markUnsavedChanges = useCallback(() => {
    if (!navigationHydratedRef.current) return;
    setHasUnsavedChanges(true);
  }, []);
  // Media type display names mapping
  const mediaTypeDisplayNames: Record<string, string> = {
    mp_television: 'Television',
    mp_radio: 'Radio',
    mp_newspaper: 'Newspaper',
    mp_magazines: 'Magazines',
    mp_ooh: 'OOH',
    mp_cinema: 'Cinema',
    mp_digidisplay: 'Digital Display',
    mp_digiaudio: 'Digital Audio',
    mp_digivideo: 'Digital Video',
    mp_bvod: 'BVOD',
    mp_integration: 'Integration',
    mp_search: 'Search',
    mp_socialmedia: 'Social Media',
    mp_progdisplay: 'Programmatic Display',
    mp_progvideo: 'Programmatic Video',
    mp_progbvod: 'Programmatic BVOD',
    mp_progaudio: 'Programmatic Audio',
    mp_progooh: 'Programmatic OOH',
    mp_influencers: 'Influencers',
    mp_production: 'Production',
  };
  // Search
  const [feesearch, setFeeSearch] = useState<number | null>(null)
  const [searchTotal, setSearchTotal] = useState(0)
  const [searchBursts, setSearchBursts] = useState<BillingBurst[]>([])
  const [searchItems, setSearchItems] = useState<LineItem[]>([]);
  const [searchFeeTotal, setSearchFeeTotal,] = useState(0);
  const [searchMediaLineItems, setSearchMediaLineItems] = useState<any[]>([]);

  //Social Media
  const [feesocial, setFeeSocial] = useState<number | null>(null)
  const [socialmediaTotal, setSocialMediaTotal] = useState<number>(0)
  const [socialMediaBursts, setSocialMediaBursts] = useState<BillingBurst[]>([])
  const [socialMediaItems, setSocialMediaItems] = useState<LineItem[]>([]);
  const [socialMediaFeeTotal, setSocialMediaFeeTotal] = useState(0);
  const [socialMediaLineItems, setSocialMediaLineItems] = useState<any[]>([]);
  const [socialMediaMediaLineItems, setSocialMediaMediaLineItems] = useState<any[]>([]);

  //Influencers
  const [feeinfluencers, setFeeInfluencers] = useState<number | null>(null)
  const [influencersTotal, setInfluencersTotal] = useState(0)
  const [influencersBursts, setInfluencersBursts] = useState<BillingBurst[]>([])
  const [influencersItems, setInfluencersItems] = useState<LineItem[]>([])
  const [influencersFeeTotal, setInfluencersFeeTotal] = useState(0)
  const [influencersMediaLineItems, setInfluencersMediaLineItems] = useState<any[]>([])

  //BVOD
  const [feebvod, setFeeBVOD] = useState<number | null>(null)
  const [bvodItems, setBVODItems] = useState<LineItem[]>([]);
  const [bvodTotal, setBvodTotal] = useState(0);
  const [bvodBursts, setBvodBursts] = useState<BillingBurst[]>([]);
  const [bvodFeeTotal, setBvodFeeTotal] = useState(0);
  const [bvodMediaLineItems, setBvodMediaLineItems] = useState<any[]>([]);

  //Digi Audio
  const [feedigiaudio, setFeeDigiAudio] = useState<number | null>(null)
  const [digiAudioTotal, setDigiAudioTotal] = useState(0)
  const [digiAudioFeeTotal, setDigiAudioFeeTotal] = useState(0)
  const [digiAudioBursts, setDigiAudioBursts] = useState<BillingBurst[]>([])
  const [digiAudioItems, setDigiAudioItems] = useState<LineItem[]>([])
  const [digiAudioMediaLineItems, setDigiAudioMediaLineItems] = useState<any[]>([])

  //Digi Display
  const [feedigidisplay, setFeeDigiDisplay] = useState<number | null>(null)
  const [digiDisplayTotal, setDigiDisplayTotal] = useState(0)
  const [digiDisplayFeeTotal, setDigiDisplayFeeTotal] = useState(0)
  const [digiDisplayBursts, setDigiDisplayBursts] = useState<BillingBurst[]>([])
  const [digiDisplayItems, setDigiDisplayItems] = useState<LineItem[]>([])
  const [digiDisplayMediaLineItems, setDigiDisplayMediaLineItems] = useState<any[]>([])

  //Digi Video
  const [feedigivideo, setFeeDigiVideo] = useState<number | null>(null)
  const [digiVideoTotal, setDigiVideoTotal] = useState(0)
  const [digiVideoFeeTotal, setDigiVideoFeeTotal] = useState(0)
  const [digiVideoBursts, setDigiVideoBursts] = useState<BillingBurst[]>([])
  const [digiVideoItems, setDigiVideoItems] = useState<LineItem[]>([])
  const [digiVideoMediaLineItems, setDigiVideoMediaLineItems] = useState<any[]>([])

  //Prog Display
  const [feeprogdisplay, setFeeProgDisplay] = useState<number | null>(null)
  const [progDisplayTotal, setProgDisplayTotal] = useState(0)
  const [progDisplayFeeTotal, setProgDisplayFeeTotal] = useState(0)
  const [progDisplayBursts, setProgDisplayBursts] = useState<BillingBurst[]>([])
  const [progDisplayItems, setProgDisplayItems] = useState<LineItem[]>([]);
  const [progDisplayMediaLineItems, setProgDisplayMediaLineItems] = useState<any[]>([]);

  //Prog Video
  const [feeprogvideo, setFeeProgVideo] = useState<number | null>(null)
  const [progVideoTotal, setProgVideoTotal] = useState(0)
  const [progVideoFeeTotal, setProgVideoFeeTotal] = useState(0)
  const [progVideoBursts, setProgVideoBursts] = useState<BillingBurst[]>([])
  const [progVideoItems, setProgVideoItems] = useState<LineItem[]>([]);
  const [progVideoMediaLineItems, setProgVideoMediaLineItems] = useState<any[]>([]);

  //Prog Bvod
  const [feeprogbvod, setFeeProgBvod] = useState<number | null>(null)
  const [progBvodTotal, setProgBvodTotal] = useState(0)
  const [progBvodFeeTotal, setProgBvodFeeTotal] = useState(0)
  const [progBvodBursts, setProgBvodBursts] = useState<BillingBurst[]>([])
  const [progBvodItems, setProgBvodItems] = useState<LineItem[]>([]);
  const [progBvodMediaLineItems, setProgBvodMediaLineItems] = useState<any[]>([]);

  //Prog Audio
  const [feeprogaudio, setFeeProgAudio] = useState<number | null>(null)
  const [progAudioTotal, setProgAudioTotal] = useState(0)
  const [progAudioFeeTotal, setProgAudioFeeTotal] = useState(0)
  const [progAudioBursts, setProgAudioBursts] = useState<BillingBurst[]>([])
  const [progAudioItems, setProgAudioItems] = useState<LineItem[]>([])
  const [progAudioMediaLineItems, setProgAudioMediaLineItems] = useState<any[]>([])

  //Prog Ooh
  const [feeprogooh, setFeeProgOoh] = useState<number | null>(null)
  const [progOohTotal, setProgOohTotal] = useState(0)
  const [progOohBursts, setProgOohBursts] = useState<BillingBurst[]>([])
  const [progOohItems, setProgOohItems] = useState<LineItem[]>([]);
  const [progOohFeeTotal, setProgOohFeeTotal] = useState(0);
  const [progOohMediaLineItems, setProgOohMediaLineItems] = useState<any[]>([]);

  //Integration
  const [feeintegration, setFeeIntegration] = useState<number | null>(null)
  const [integrationTotal, setIntegrationTotal] = useState(0)
  const [integrationFeeTotal, setIntegrationFeeTotal] = useState(0)
  const [integrationBursts, setIntegrationBursts] = useState<BillingBurst[]>([])
  const [integrationItems, setIntegrationItems] = useState<LineItem[]>([]);
  const [integrationMediaLineItems, setIntegrationMediaLineItems] = useState<any[]>([]);

  //Content Creator
  const [feecontentcreator, setFeeContentCreator] = useState<number | null>(null)

  // Traditional Media

  //Cinema
  const [feecinema, setFeeCinema] = useState<number | null>(null)
  const [cinemaTotal, setCinemaTotal] = useState(0)
  const [cinemaFeeTotal, setCinemaFeeTotal] = useState(0)
  const [cinemaBursts, setCinemaBursts] = useState<BillingBurst[]>([])
  const [cinemaItems, setCinemaItems] = useState<LineItem[]>([])
  const [cinemaMediaLineItems, setCinemaMediaLineItems] = useState<any[]>([])

 // ─ Television
  const [feeTelevision, setFeeTelevision] = useState<number | null>(null)
  const [televisionItems, setTelevisionItems] = useState<LineItem[]>([])
  const [televisionBursts, setTelevisionBursts] = useState<BillingBurst[]>([])
  const [televisionTotal, setTelevisionTotal] = useState(0)
  const [televisionFeeTotal, setTelevisionFeeTotal] = useState(0)
  const [televisionLineItems, setTelevisionLineItems] = useState<any[]>([])
  const [televisionMediaLineItems, setTelevisionMediaLineItems] = useState<any[]>([])

  // ─ Radio
  const [feeRadio, setFeeRadio] = useState<number | null>(null)
  const [radioItems, setRadioItems] = useState<LineItem[]>([])
  const [radioBursts, setRadioBursts] = useState<BillingBurst[]>([])
  const [radioTotal, setRadioTotal] = useState(0)
  const [radioFeeTotal, setRadioFeeTotal] = useState(0)
  const [radioMediaLineItems, setRadioMediaLineItems] = useState<any[]>([])

  // ─ Newspapers
  const [feeNewspapers, setFeeNewspapers] = useState<number | null>(null)
  const [newspaperItems, setNewspaperItems] = useState<LineItem[]>([])
  const [newspaperBursts, setNewspaperBursts] = useState<BillingBurst[]>([])
  const [newspaperTotal, setNewspaperTotal] = useState(0)
  const [newspaperFeeTotal, setNewspaperFeeTotal] = useState(0)
  const [newspaperLineItems, setNewspaperLineItems] = useState<any[]>([])
  const [newspaperMediaLineItems, setNewspaperMediaLineItems] = useState<any[]>([])

  // ─ Magazines
  const [feeMagazines, setFeeMagazines] = useState<number | null>(null)
  const [magazineItems, setMagazineItems] = useState<LineItem[]>([])
  const [magazineBursts, setMagazineBursts] = useState<BillingBurst[]>([])
  const [magazineTotal, setMagazineTotal] = useState(0)
  const [magazineFeeTotal, setMagazineFeeTotal] = useState(0)
  const [magazineMediaLineItems, setMagazineMediaLineItems] = useState<any[]>([])

  // ─ OOH
  const [feeOoh, setFeeOoh] = useState<number | null>(null)
  const [oohItems, setOohItems] = useState<LineItem[]>([])
  const [oohBursts, setOohBursts] = useState<BillingBurst[]>([])
  const [oohTotal, setOohTotal] = useState(0)
  const [oohFeeTotal, setOohFeeTotal] = useState(0)
  const [oohMediaLineItems, setOohMediaLineItems] = useState<any[]>([])

  // Production
  const [feeProduction, setFeeProduction] = useState<number | null>(null)
  const [productionTotal, setProductionTotal] = useState(0)
  const [productionBursts, setProductionBursts] = useState<BillingBurst[]>([])
  const [productionFeeTotal, setProductionFeeTotal] = useState(0)
  const [productionItems, setProductionItems] = useState<LineItem[]>([])
  const [productionMediaLineItems, setProductionMediaLineItems] = useState<any[]>([])

  //Ad Serving
  const [adservvideo, setAdServVideo] = useState<number | null>(null)
  const [adservimp, setAdServImp] = useState<number | null>(null)
  const [adservdisplay, setAdServDisplay] = useState<number | null>(null)
  const [adservaudio, setAdServAudio] = useState<number | null>(null)

  //Finance 

  const [investmentPerMonthByChannel, setInvestmentPerMonthByChannel] = useState<Record<string, any[]>>({})
  const investmentPerMonth = useMemo(
    () => mergeInvestmentMonths(investmentPerMonthByChannel),
    [investmentPerMonthByChannel],
  )
  const [autoBillingMonths, setAutoBillingMonths] = useState<BillingMonth[]>([]);
  const [autoDeliveryMonths, setAutoDeliveryMonths] = useState<BillingMonth[]>([]);
  const deliveryScheduleSnapshotRef = useRef<BillingMonth[] | null>(null);
  const [billingMonths, setBillingMonths] = useState<BillingMonth[]>([])
  const [billingTotal, setBillingTotal] = useState("$0.00")
  const [isManualBilling, setIsManualBilling] = useState(false)
  /** Editor visibility inside MbaBillingModal (not a separate Dialog). */
  const [isManualBillingModalOpen, setIsManualBillingModalOpen] = useState(false)
  const [hasPendingManualBilling, setHasPendingManualBilling] = useState(false)
  const [manualBillingAccordionExpanded, setManualBillingAccordionExpanded] = useState<string[]>([])
  const [manualBillingMonths, setManualBillingMonths] = useState<BillingMonth[]>([])
  const [manualBillingTotal, setManualBillingTotal] = useState("$0.00")
  const [manualBillingAutoReferenceMonths, setManualBillingAutoReferenceMonths] = useState<
    BillingMonth[]
  >([])
  const [manualBillingCostPreBill, setManualBillingCostPreBill] = useState<{
    fee: boolean
    adServing: boolean
    production: boolean
  }>({ fee: false, adServing: false, production: false })
  const manualBillingCostPreBillSnapshotRef = useRef<{
    fee?: string[]
    adServing?: string[]
    production?: string[]
  }>({})
  const manualBillingAutoLineItemSnapshotRef = useRef<
    Record<
      string,
      {
        mediaKey: string
        lineItemId: string
        header1: string
        header2: string
        monthlyAmounts: Record<string, number>
        mediaTotal: number
        feeTotal: number
      }
    >
  >({})
  /** Empty on create — no fetchBillingOverridesClient until after save. */
  const manualBillingOverrideMetaRef = useRef<Map<string, LineOverrideMeta[]>>(new Map())
  /** Auto schedule (+ line items) the user edited against — snapshotted at open/apply. */
  const manualBillingAutoReferenceMonthsRef = useRef<BillingMonth[]>([])
  const [billingError, setBillingError] = useState<{ show: boolean; messages: string[] }>({
    show: false,
    messages: [],
  })
  const [isPartialMBA, setIsPartialMBA] = useState(false);
  const [isMbaBillingModalOpen, setIsMbaBillingModalOpen] = useState(false);
  const [dateWarning, setDateWarning] = useState<{
    hasViolation: boolean
    offendingCount: number
  }>({ hasViolation: false, offendingCount: 0 })

  const [kpiRows, setKpiRows] = useState<ResolvedKPIRow[]>([])
  const [publisherKPIs, setPublisherKPIs] = useState<PublisherKPI[]>([])
  const [clientKPIs, setClientKPIs] = useState<ClientKPI[]>([])
  const [savedCampaignKPIs, setSavedCampaignKPIs] = useState<CampaignKPI[]>([])
  const [kpiPublishers, setKpiPublishers] = useState<Publisher[]>([])
  const [containerBestPractice, setContainerBestPractice] = useState<MediaContainerBestPractice[]>([])
  const [isKPILoading, setIsKPILoading] = useState(false)
  const [kpiTrigger, setKpiTrigger] = useState(0)
  const kpiRebuildTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const kpiRowsRef = useRef<ResolvedKPIRow[]>([])

  const form = useForm<MediaPlanFormValues>({
    resolver: zodResolver(mediaPlanSchema),
    defaultValues: {
      mp_client_name: "",
      mp_campaignstatus: "",
      mp_campaignname: "",
      mp_campaigndates_start: defaultCampaignDateRange().start,
      mp_campaigndates_end: defaultCampaignDateRange().end,
      mp_brand: "",
      mp_clientcontact: "",
      mp_ponumber: "",
      mp_campaignbudget: 0,
      mbaidentifier: "",
      mba_number: "",
      mp_plannumber: "1",
      mp_television: false,
      mp_radio: false,
      mp_production: false,
      mp_newspaper: false,
      mp_magazines: false,
      mp_ooh: false,
      mp_cinema: false,
      mp_digidisplay: false,
      mp_digiaudio: false,
      mp_digivideo: false,
      mp_bvod: false,
      mp_integration: false,
      mp_search: false,
      mp_socialmedia: false,
      mp_progdisplay: false,
      mp_progvideo: false,
      mp_progbvod: false,
      mp_progaudio: false,
      mp_progooh: false,
      mp_influencers: false,
      mp_fixedfee: false,
      billingSchedule: [],
    },
  })

  useEffect(() => {
    navigationHydratedRef.current = true;
  }, []);

  useEffect(() => {
    kpiRowsRef.current = kpiRows
  }, [kpiRows])

  useEffect(() => {
    let cancelled = false
    fetch("/api/publishers")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => {
        if (!cancelled) setKpiPublishers(Array.isArray(d) ? d : [])
      })
      .catch(() => {
        if (!cancelled) setKpiPublishers([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    fetch("/api/media-container-best-practice")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => {
        if (!cancelled) setContainerBestPractice(Array.isArray(d) ? d : [])
      })
      .catch(() => {
        if (!cancelled) setContainerBestPractice([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const subscription = form.watch(() => {
      markUnsavedChanges();
    });

    return () => subscription.unsubscribe();
  }, [form, markUnsavedChanges]);

  // Use useWatch to properly watch form values without causing infinite loops
  const campaignStart = useWatch({ control: form.control, name: "mp_campaigndates_start" })
  const campaignEnd = useWatch({ control: form.control, name: "mp_campaigndates_end" })
  const mbaNumber = useWatch({ control: form.control, name: "mba_number" })
  const planNumber = useWatch({ control: form.control, name: "mp_plannumber" })

  const mpTelevision = useWatch({ control: form.control, name: "mp_television" })
  const mpRadio = useWatch({ control: form.control, name: "mp_radio" })
  const mpProduction = useWatch({ control: form.control, name: "mp_production" })
  const mpNewspaper = useWatch({ control: form.control, name: "mp_newspaper" })
  const mpMagazines = useWatch({ control: form.control, name: "mp_magazines" })
  const mpOoh = useWatch({ control: form.control, name: "mp_ooh" })
  const mpCinema = useWatch({ control: form.control, name: "mp_cinema" })
  const mpDigidisplay = useWatch({ control: form.control, name: "mp_digidisplay" })
  const mpDigiaudio = useWatch({ control: form.control, name: "mp_digiaudio" })
  const mpDigivideo = useWatch({ control: form.control, name: "mp_digivideo" })
  const mpBvod = useWatch({ control: form.control, name: "mp_bvod" })
  const mpIntegration = useWatch({ control: form.control, name: "mp_integration" })
  const mpSearch = useWatch({ control: form.control, name: "mp_search" })
  const mpSocialmedia = useWatch({ control: form.control, name: "mp_socialmedia" })
  const mpProgdisplay = useWatch({ control: form.control, name: "mp_progdisplay" })
  const mpProgvideo = useWatch({ control: form.control, name: "mp_progvideo" })
  const mpProgbvod = useWatch({ control: form.control, name: "mp_progbvod" })
  const mpProgaudio = useWatch({ control: form.control, name: "mp_progaudio" })
  const mpProgooh = useWatch({ control: form.control, name: "mp_progooh" })
  const mpInfluencers = useWatch({ control: form.control, name: "mp_influencers" })

  const builderLineItemCount = useMemo(() => {
    return (
      televisionLineItems.length +
      radioMediaLineItems.length +
      newspaperLineItems.length +
      magazineMediaLineItems.length +
      oohMediaLineItems.length +
      cinemaMediaLineItems.length +
      productionMediaLineItems.length +
      digiAudioMediaLineItems.length +
      digiDisplayMediaLineItems.length +
      digiVideoMediaLineItems.length +
      bvodMediaLineItems.length +
      searchMediaLineItems.length +
      socialMediaLineItems.length +
      integrationMediaLineItems.length +
      progDisplayMediaLineItems.length +
      progVideoMediaLineItems.length +
      progBvodMediaLineItems.length +
      progAudioMediaLineItems.length +
      progOohMediaLineItems.length +
      influencersMediaLineItems.length
    )
  }, [
    televisionLineItems,
    radioMediaLineItems,
    newspaperLineItems,
    magazineMediaLineItems,
    oohMediaLineItems,
    cinemaMediaLineItems,
    productionMediaLineItems,
    digiAudioMediaLineItems,
    digiDisplayMediaLineItems,
    digiVideoMediaLineItems,
    bvodMediaLineItems,
    searchMediaLineItems,
    socialMediaLineItems,
    integrationMediaLineItems,
    progDisplayMediaLineItems,
    progVideoMediaLineItems,
    progBvodMediaLineItems,
    progAudioMediaLineItems,
    progOohMediaLineItems,
    influencersMediaLineItems,
  ])

  /** True when any included line item maps to a publisher with billing agency Advertising Associates (same inputs as save-time AA upload check). */
  const hasAdvertisingAssociatesBilling = useMemo(() => {
    const mediaItems: MediaItems = {
      search: searchItems,
      socialMedia: socialMediaItems,
      digiAudio: digiAudioItems,
      digiDisplay: digiDisplayItems,
      digiVideo: digiVideoItems,
      bvod: bvodItems,
      progDisplay: progDisplayItems,
      progVideo: progVideoItems,
      progBvod: progBvodItems,
      progOoh: progOohItems,
      progAudio: progAudioItems,
      newspaper: newspaperItems,
      magazines: magazineItems,
      television: televisionItems,
      radio: radioItems,
      ooh: oohItems,
      cinema: cinemaItems,
      integration: integrationItems,
      influencers: influencersItems,
      production: productionItems,
    }
    return planHasAdvertisingAssociatesLineItem(mediaItems, kpiPublishers, shouldIncludeMediaPlanLineItem)
  }, [
    searchItems,
    socialMediaItems,
    digiAudioItems,
    digiDisplayItems,
    digiVideoItems,
    bvodItems,
    progDisplayItems,
    progVideoItems,
    progBvodItems,
    progOohItems,
    progAudioItems,
    newspaperItems,
    magazineItems,
    televisionItems,
    radioItems,
    oohItems,
    cinemaItems,
    integrationItems,
    productionItems,
    influencersItems,
    kpiPublishers,
  ])

  useEffect(() => {
    if (kpiRebuildTimerRef.current) clearTimeout(kpiRebuildTimerRef.current)
    kpiRebuildTimerRef.current = setTimeout(() => {
      const fv = form.getValues()
      if (!fv.mp_client_name) return

      if (builderLineItemCount === 0) {
        setKpiRows([])
        return
      }

      if (process.env.NODE_ENV !== "production") {
        console.log("[KPI] rebuild fired", {
          searchItemCount: searchItems.length,
          publisherKPICount: publisherKPIs.length,
          clientKPICount: clientKPIs.length,
          savedKPICount: savedCampaignKPIs.length,
          clientName: fv.mp_client_name,
        })
      }

      const resolved = resolveAllKPIs({
        mediaItemsByType: buildKpiLineItemsByMediaType({
          search: { media: searchMediaLineItems, export: searchItems },
          socialMedia: { media: socialMediaMediaLineItems, export: socialMediaItems },
          progDisplay: { media: progDisplayMediaLineItems, export: progDisplayItems },
          progVideo: { media: progVideoMediaLineItems, export: progVideoItems },
          progBvod: { media: progBvodMediaLineItems, export: progBvodItems },
          progAudio: { media: progAudioMediaLineItems, export: progAudioItems },
          progOoh: { media: progOohMediaLineItems, export: progOohItems },
          digiDisplay: { media: digiDisplayMediaLineItems, export: digiDisplayItems },
          digiAudio: { media: digiAudioMediaLineItems, export: digiAudioItems },
          digiVideo: { media: digiVideoMediaLineItems, export: digiVideoItems },
          bvod: { media: bvodMediaLineItems, export: bvodItems },
          integration: { media: integrationMediaLineItems, export: integrationItems },
          television: { media: televisionMediaLineItems, export: televisionItems },
          radio: { media: radioMediaLineItems, export: radioItems },
          newspaper: { media: newspaperMediaLineItems, export: newspaperItems },
          magazines: { media: magazineMediaLineItems, export: magazineItems },
          ooh: { media: oohMediaLineItems, export: oohItems },
          cinema: { media: cinemaMediaLineItems, export: cinemaItems },
          influencers: { media: influencersMediaLineItems, export: influencersItems },
          production: { media: productionMediaLineItems, export: productionItems },
        }),
        clientName: fv.mp_client_name,
        mbaNumber: fv.mba_number ?? "",
        versionNumber: parseInt(fv.mp_plannumber ?? "1", 10),
        campaignName: fv.mp_campaignname ?? "",
        publisherKPIs,
        clientKPIs,
        savedCampaignKPIs,
        publishers: kpiPublishers,
      })
      setKpiRows(mergeManualKpiOverrides(resolved, kpiRowsRef.current))

      if (process.env.NODE_ENV !== "production") {
        console.log("[KPI] resolved rows", resolved.length, resolved.slice(0, 3))
      }
    }, 600)
    return () => {
      if (kpiRebuildTimerRef.current) clearTimeout(kpiRebuildTimerRef.current)
    }
  }, [
    searchMediaLineItems,
    searchItems,
    socialMediaMediaLineItems,
    socialMediaItems,
    progDisplayMediaLineItems,
    progDisplayItems,
    progVideoMediaLineItems,
    progVideoItems,
    progBvodMediaLineItems,
    progBvodItems,
    progAudioMediaLineItems,
    progAudioItems,
    progOohMediaLineItems,
    progOohItems,
    digiDisplayMediaLineItems,
    digiDisplayItems,
    digiAudioMediaLineItems,
    digiAudioItems,
    digiVideoMediaLineItems,
    digiVideoItems,
    bvodMediaLineItems,
    bvodItems,
    integrationMediaLineItems,
    integrationItems,
    televisionMediaLineItems,
    televisionItems,
    radioMediaLineItems,
    radioItems,
    newspaperMediaLineItems,
    newspaperItems,
    magazineMediaLineItems,
    magazineItems,
    oohMediaLineItems,
    oohItems,
    cinemaMediaLineItems,
    cinemaItems,
    influencersMediaLineItems,
    influencersItems,
    productionMediaLineItems,
    productionItems,
    publisherKPIs,
    clientKPIs,
    savedCampaignKPIs,
    kpiPublishers,
    kpiTrigger,
    builderLineItemCount,
    form,
  ])

  const deepCloneBillingMonths = useCallback((months: BillingMonth[]): BillingMonth[] => {
    if (typeof globalThis.structuredClone === "function") {
      return globalThis.structuredClone(months) as BillingMonth[]
    }
    return JSON.parse(JSON.stringify(months)) as BillingMonth[]
  }, [])

  const getRateForMediaType = useCallback((mediaType: string): number => {
    switch (mediaType) {
      case "progVideo":
      case "progBvod":
      case "digiVideo":
      case "digi video":
      case "bvod":
      case "BVOD":
      case "Prog BVOD":
      case "Digi Video":
      case "Prog Video":
        return adservvideo ?? 0
      case "progAudio":
      case "digiAudio":
      case "digi audio":
        return adservaudio ?? 0
      case "progDisplay":
      case "digiDisplay":
      case "digi display":
        return adservdisplay ?? 0
      default:
        return adservimp ?? 0
    }
  }, [adservvideo, adservaudio, adservdisplay, adservimp])

  // Reset the delivery schedule snapshot only when the campaign date range changes,
  // or when a new MBA/version is started.
  const deliverySnapshotKeyRef = useRef<string | null>(null)
  useEffect(() => {
    const startKey = campaignStart ? toDateOnlyString(campaignStart) : ""
    const endKey = campaignEnd ? toDateOnlyString(campaignEnd) : ""
    const key = `${startKey}|${endKey}|${mbaNumber ?? ""}|${planNumber ?? ""}`
    if (deliverySnapshotKeyRef.current && deliverySnapshotKeyRef.current !== key) {
      deliveryScheduleSnapshotRef.current = null
    }
    deliverySnapshotKeyRef.current = key
  }, [campaignStart, campaignEnd, mbaNumber, planNumber])
  
  const watchedMediaTypesMap = useMemo(
    (): Record<string, boolean> => ({
      mp_television: !!mpTelevision,
      mp_radio: !!mpRadio,
      mp_production: !!mpProduction,
      mp_newspaper: !!mpNewspaper,
      mp_magazines: !!mpMagazines,
      mp_ooh: !!mpOoh,
      mp_cinema: !!mpCinema,
      mp_digidisplay: !!mpDigidisplay,
      mp_digiaudio: !!mpDigiaudio,
      mp_digivideo: !!mpDigivideo,
      mp_bvod: !!mpBvod,
      mp_integration: !!mpIntegration,
      mp_search: !!mpSearch,
      mp_socialmedia: !!mpSocialmedia,
      mp_progdisplay: !!mpProgdisplay,
      mp_progvideo: !!mpProgvideo,
      mp_progbvod: !!mpProgbvod,
      mp_progaudio: !!mpProgaudio,
      mp_progooh: !!mpProgooh,
      mp_influencers: !!mpInfluencers,
    }),
    [
      mpTelevision,
      mpRadio,
      mpProduction,
      mpNewspaper,
      mpMagazines,
      mpOoh,
      mpCinema,
      mpDigidisplay,
      mpDigiaudio,
      mpDigivideo,
      mpBvod,
      mpIntegration,
      mpSearch,
      mpSocialmedia,
      mpProgdisplay,
      mpProgvideo,
      mpProgbvod,
      mpProgaudio,
      mpProgooh,
      mpInfluencers,
    ]
  )

  const mediaTypes = useMemo(
    () => [
      { name: "mp_fixedfee", label: "Fixed Fee", component: null },
      { name: "mp_television", label: "Television", component: TelevisionContainer },
      { name: "mp_radio", label: "Radio", component: RadioContainer },
      { name: "mp_newspaper", label: "Newspaper", component: NewspaperContainer },
      { name: "mp_magazines", label: "Magazines", component: MagazinesContainer },
      { name: "mp_ooh", label: "OOH", component: OOHContainer },
      { name: "mp_cinema", label: "Cinema", component: CinemaContainer },
      { name: "mp_digidisplay", label: "Digital Display", component: DigitalDisplayContainer },
      { name: "mp_digiaudio", label: "Digital Audio", component: DigitalAudioContainer },
      { name: "mp_digivideo", label: "Digital Video", component: DigitalVideoContainer },
      { name: "mp_bvod", label: "BVOD", component: BVODContainer },
      { name: "mp_integration", label: "Integration", component: IntegrationContainer },
      { name: "mp_search", label: "Search", component: SearchContainer },
      { name: "mp_socialmedia", label: "Social Media", component: SocialMediaContainer },
      { name: "mp_progdisplay", label: "Prog Display", component: ProgDisplayContainer },
      { name: "mp_progvideo", label: "Prog Video", component: ProgVideoContainer },
      { name: "mp_progbvod", label: "Prog BVOD", component: ProgBVODContainer },
      { name: "mp_progaudio", label: "Prog Audio", component: ProgAudioContainer },
      { name: "mp_progooh", label: "Prog OOH", component: ProgOOHContainer },
      { name: "mp_influencers", label: "Influencers", component: InfluencersContainer },
      { name: "mp_production", label: "Production", component: ProductionContainer },
    ],
    []
  )

  // Fields to expose to the assistant
  const watchedClientName = useWatch({ control: form.control, name: "mp_client_name" })
  const watchedCampaignName = useWatch({ control: form.control, name: "mp_campaignname" })
  const watchedCampaignBudget = useWatch({ control: form.control, name: "mp_campaignbudget" })
  const currencyFormatter = new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const mbaCurrencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat("en-AU", {
        style: "currency",
        currency: "AUD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
    []
  )

  const selectedMediaCount = useMemo(
    () =>
      mediaTypes
        .filter((medium) => medium.name !== "mp_fixedfee")
        .filter((medium) => watchedMediaTypesMap[medium.name])
        .length,
    [mediaTypes, watchedMediaTypesMap]
  )

  const selectedChannels = useMemo(
    () =>
      mediaTypes
        .filter((medium) => medium.name !== "mp_fixedfee")
        .filter((medium) => watchedMediaTypesMap[medium.name]),
    [mediaTypes, watchedMediaTypesMap]
  )

  const summarizeBurstsForAssistant = useCallback(
    (bursts: BillingBurst[]) =>
      bursts.map((burst, index) => ({
        index,
        startDate: burst.startDate,
        endDate: burst.endDate,
        mediaAmount: burst.mediaAmount,
        feeAmount: burst.feeAmount,
        totalAmount: burst.totalAmount,
        buyType: (burst as any).buyType,
      })),
    []
  )

  const calculateBillingSchedule = useCallback(() => {
    const start = form.getValues("mp_campaigndates_start");
    const end   = form.getValues("mp_campaigndates_end");
    if (!start || !end) return;

    const { billingMonths: billingMonthsCalculated, deliveryMonths: deliveryMonthsCalculated } =
      computeBillingAndDeliveryMonths({
        campaignStart: start,
        campaignEnd: end,
        burstsByMediaType: {
          search: searchBursts,
          socialMedia: socialMediaBursts,
          progAudio: progAudioBursts,
          cinema: cinemaBursts,
          digiAudio: digiAudioBursts,
          digiDisplay: digiDisplayBursts,
          digiVideo: digiVideoBursts,
          progDisplay: progDisplayBursts,
          progVideo: progVideoBursts,
          progBvod: progBvodBursts,
          progOoh: progOohBursts,
          television: televisionBursts,
          radio: radioBursts,
          newspaper: newspaperBursts,
          magazines: magazineBursts,
          ooh: oohBursts,
          bvod: bvodBursts,
          integration: integrationBursts,
          influencers: influencersBursts,
          production: productionBursts,
        },
        getRateForMediaType,
        adservaudio: adservaudio ?? 0,
        isManualBilling: false,
      });

    const formatter = new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency: "AUD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  // Keep delivery snapshot in sync with latest auto-calculation (e.g. after fee % loads)
  if (deliveryMonthsCalculated.length > 0) {
    deliveryScheduleSnapshotRef.current = deepCloneBillingMonths(deliveryMonthsCalculated);
  }

  setAutoBillingMonths(billingMonthsCalculated);
  setAutoDeliveryMonths(deliveryMonthsCalculated);

  setBillingMonths(billingMonthsCalculated);
  const grandTotal = billingMonthsCalculated.reduce((sum, m) => sum + parseFloat(m.totalAmount.replace(/[^0-9.-]/g, "")), 0);
  setBillingTotal(formatter.format(grandTotal));
}, [
    searchBursts,
    socialMediaBursts,
    progAudioBursts,
    cinemaBursts,
    digiAudioBursts,
    digiDisplayBursts,
    digiVideoBursts,
    progDisplayBursts,
    progVideoBursts,
    progBvodBursts,
    progOohBursts,
    televisionBursts,
    radioBursts,
    newspaperBursts,
    magazineBursts,
    oohBursts,
    bvodBursts,
    integrationBursts,
    influencersBursts,
    productionBursts,
    getRateForMediaType,
    adservaudio,
    deepCloneBillingMonths,
    form,
  ])



  // Check if any line item flight dates are outside the campaign window
  useEffect(() => {
    const result = checkLineItemDatesOutsideCampaign({
      campaignStart,
      campaignEnd,
      mediaLineItems: {
        televisionMediaLineItems,
        radioMediaLineItems,
        newspaperMediaLineItems,
        magazineMediaLineItems,
        oohMediaLineItems,
        cinemaMediaLineItems,
        digiDisplayMediaLineItems,
        digiAudioMediaLineItems,
        digiVideoMediaLineItems,
        bvodMediaLineItems,
        integrationMediaLineItems,
        searchMediaLineItems,
        socialMediaMediaLineItems,
        progDisplayMediaLineItems,
        progVideoMediaLineItems,
        progBvodMediaLineItems,
        progAudioMediaLineItems,
        progOohMediaLineItems,
        influencersMediaLineItems,
      },
      productionLineItems: productionMediaLineItems,
    })
    setDateWarning(result)
  }, [
    campaignStart,
    campaignEnd,
    televisionMediaLineItems,
    radioMediaLineItems,
    newspaperMediaLineItems,
    magazineMediaLineItems,
    oohMediaLineItems,
    cinemaMediaLineItems,
    digiDisplayMediaLineItems,
    digiAudioMediaLineItems,
    digiVideoMediaLineItems,
    bvodMediaLineItems,
    integrationMediaLineItems,
    searchMediaLineItems,
    socialMediaMediaLineItems,
    progDisplayMediaLineItems,
    progVideoMediaLineItems,
    progBvodMediaLineItems,
    progAudioMediaLineItems,
    progOohMediaLineItems,
    influencersMediaLineItems,
    productionMediaLineItems,
  ])

  const updateBurstBudget = useCallback(
    async ({ mediaType, burstIndex = 0, budget }: { mediaType: string; burstIndex?: number; budget: number }) => {
      const numericBudget = typeof budget === "string" ? parseFloat((budget as any).toString().replace(/[^0-9.-]/g, "")) : budget
      if (!Number.isFinite(numericBudget) || numericBudget < 0) {
        throw new Error("Invalid budget amount")
      }

      const targetMap: Record<
        string,
        { bursts: BillingBurst[]; setter: (value: BillingBurst[]) => void }
      > = {
        search: { bursts: searchBursts, setter: setSearchBursts },
        socialMedia: { bursts: socialMediaBursts, setter: setSocialMediaBursts },
        progAudio: { bursts: progAudioBursts, setter: setProgAudioBursts },
        cinema: { bursts: cinemaBursts, setter: setCinemaBursts },
        digiAudio: { bursts: digiAudioBursts, setter: setDigiAudioBursts },
        digiDisplay: { bursts: digiDisplayBursts, setter: setDigiDisplayBursts },
        digiVideo: { bursts: digiVideoBursts, setter: setDigiVideoBursts },
        progDisplay: { bursts: progDisplayBursts, setter: setProgDisplayBursts },
        progVideo: { bursts: progVideoBursts, setter: setProgVideoBursts },
        progBvod: { bursts: progBvodBursts, setter: setProgBvodBursts },
        progOoh: { bursts: progOohBursts, setter: setProgOohBursts },
        television: { bursts: televisionBursts, setter: setTelevisionBursts },
        radio: { bursts: radioBursts, setter: setRadioBursts },
        newspaper: { bursts: newspaperBursts, setter: setNewspaperBursts },
        magazines: { bursts: magazineBursts, setter: setMagazineBursts },
        ooh: { bursts: oohBursts, setter: setOohBursts },
        bvod: { bursts: bvodBursts, setter: setBvodBursts },
        integration: { bursts: integrationBursts, setter: setIntegrationBursts },
        influencers: { bursts: influencersBursts, setter: setInfluencersBursts },
        production: { bursts: productionBursts, setter: setProductionBursts },
      }

      const target = targetMap[mediaType]
      if (!target) {
        throw new Error(`Unsupported media type: ${mediaType}`)
      }

      if (!target.bursts?.length || burstIndex < 0 || burstIndex >= target.bursts.length) {
        throw new Error(`Burst index ${burstIndex} is out of range for ${mediaType}`)
      }

      const updated = target.bursts.map((burst, idx) =>
        idx === burstIndex
          ? {
              ...burst,
              mediaAmount: numericBudget,
              totalAmount: numericBudget + (burst.feeAmount || 0),
            }
          : burst
      )

      target.setter(updated)
      calculateBillingSchedule()

      return `Updated ${mediaType} burst #${burstIndex + 1} budget to ${numericBudget}.`
    },
    [
      bvodBursts,
      cinemaBursts,
      productionBursts,
      digiAudioBursts,
      digiDisplayBursts,
      digiVideoBursts,
      influencersBursts,
      integrationBursts,
      magazineBursts,
      newspaperBursts,
      oohBursts,
      progAudioBursts,
      progBvodBursts,
      progDisplayBursts,
      progOohBursts,
      progVideoBursts,
      radioBursts,
      searchBursts,
      socialMediaBursts,
      televisionBursts,
      calculateBillingSchedule,
    ]
  )

  const handleSetField = useCallback(
    async ({ fieldId, selector, value }: { fieldId?: string; selector?: string; value: any }) => {
      if (typeof window === "undefined" || typeof document === "undefined") return
      const target =
        (selector ? document.querySelector(selector) : null) ||
        (fieldId ? document.getElementById(fieldId) : null) ||
        (fieldId ? document.querySelector(`[name="${fieldId}"]`) : null)

      if (!target) {
        throw new Error("Field not found")
      }

      const asInput = target as HTMLInputElement | HTMLTextAreaElement
      if (asInput) {
        asInput.value = value as any
        asInput.dispatchEvent(new Event("input", { bubbles: true }))
        asInput.dispatchEvent(new Event("change", { bubbles: true }))
        return `Set field ${selector || fieldId} to ${value}`
      }
      throw new Error("Unsupported field type")
    },
    []
  )

  const handleClick = useCallback(async ({ selector }: { selector: string }) => {
    if (typeof document === "undefined") return
    const el = document.querySelector(selector) as HTMLElement | null
    if (!el) throw new Error("Element not found")
    el.click()
    return `Clicked ${selector}`
  }, [])

  const handleSelect = useCallback(async ({ selector, value }: { selector: string; value: string }) => {
    if (typeof document === "undefined") return
    const el = document.querySelector(selector) as HTMLSelectElement | null
    if (!el) throw new Error("Select not found")
    el.value = value
    el.dispatchEvent(new Event("change", { bubbles: true }))
    return `Selected ${value} on ${selector}`
  }, [])

  const handleToggle = useCallback(async ({ selector, value }: { selector: string; value: boolean }) => {
    if (typeof document === "undefined") return
    const el = document.querySelector(selector) as HTMLInputElement | null
    if (!el) throw new Error("Toggle target not found")
    if (el.type !== "checkbox") throw new Error("Toggle target is not a checkbox")
    el.checked = Boolean(value)
    el.dispatchEvent(new Event("input", { bubbles: true }))
    el.dispatchEvent(new Event("change", { bubbles: true }))
    return `Toggled ${selector} to ${value}`
  }, [])

  const handleSetLineItems = useCallback(
    async ({
      channel,
      items,
      replace = true,
    }: {
      channel: "radio" | "ooh"
      items: Record<string, unknown>[]
      replace?: boolean
    }) => {
      if (channel === "radio") {
        setRadioMediaLineItems((prev) => (replace ? items : [...prev, ...items]))
        markUnsavedChanges()
        return `Loaded ${items.length} radio line item(s) into the form for review.`
      }
      if (channel === "ooh") {
        setOohMediaLineItems((prev) => (replace ? items : [...prev, ...items]))
        markUnsavedChanges()
        return `Loaded ${items.length} OOH line item(s) into the form for review.`
      }
      throw new Error(`Unsupported channel: ${channel}`)
    },
    [markUnsavedChanges],
  )

  const handleGetLineItems = useCallback(
    async ({ channel }: { channel: "radio" | "ooh" }) => {
      if (channel === "radio") {
        return { items: radioMediaLineItems as Record<string, unknown>[] }
      }
      if (channel === "ooh") {
        return { items: oohMediaLineItems as Record<string, unknown>[] }
      }
      throw new Error(`Unsupported channel: ${channel}`)
    },
    [radioMediaLineItems, oohMediaLineItems],
  )

  useEffect(() => {
    const selectedMedia = mediaTypes
      .filter((media) => watchedMediaTypesMap[media.name])
      .map((media) => media.label)

    const summary = {
      page: "mediaplans/create",
      clientName: watchedClientName,
      campaignName: watchedCampaignName,
      campaignBudget: watchedCampaignBudget,
      campaignDates: {
        start: campaignStart,
        end: campaignEnd,
      },
      selectedMedia,
      bursts: {
        search: summarizeBurstsForAssistant(searchBursts),
        socialMedia: summarizeBurstsForAssistant(socialMediaBursts),
        progAudio: summarizeBurstsForAssistant(progAudioBursts),
        cinema: summarizeBurstsForAssistant(cinemaBursts),
        digiAudio: summarizeBurstsForAssistant(digiAudioBursts),
        digiDisplay: summarizeBurstsForAssistant(digiDisplayBursts),
        digiVideo: summarizeBurstsForAssistant(digiVideoBursts),
        progDisplay: summarizeBurstsForAssistant(progDisplayBursts),
        progVideo: summarizeBurstsForAssistant(progVideoBursts),
        progBvod: summarizeBurstsForAssistant(progBvodBursts),
        progOoh: summarizeBurstsForAssistant(progOohBursts),
        television: summarizeBurstsForAssistant(televisionBursts),
        radio: summarizeBurstsForAssistant(radioBursts),
        newspaper: summarizeBurstsForAssistant(newspaperBursts),
        magazines: summarizeBurstsForAssistant(magazineBursts),
        ooh: summarizeBurstsForAssistant(oohBursts),
        bvod: summarizeBurstsForAssistant(bvodBursts),
        integration: summarizeBurstsForAssistant(integrationBursts),
        influencers: summarizeBurstsForAssistant(influencersBursts),
        production: summarizeBurstsForAssistant(productionBursts),
      },
    }

    setAssistantContext({
      summary,
      actions: {
        updateBurstBudget,
        setField: handleSetField,
        click: handleClick,
        select: handleSelect,
        toggle: handleToggle,
        setLineItems: handleSetLineItems,
        getLineItems: handleGetLineItems,
      },
    })
  }, [
    bvodBursts,
    campaignEnd,
    campaignStart,
    cinemaBursts,
    productionBursts,
    digiAudioBursts,
    digiDisplayBursts,
    digiVideoBursts,
    influencersBursts,
    integrationBursts,
    magazineBursts,
    newspaperBursts,
    oohBursts,
    progAudioBursts,
    progBvodBursts,
    progDisplayBursts,
    progOohBursts,
    handleSetLineItems,
    handleGetLineItems,
    progVideoBursts,
    radioBursts,
    searchBursts,
    socialMediaBursts,
    summarizeBurstsForAssistant,
    televisionBursts,
    updateBurstBudget,
    handleSetField,
    handleClick,
    handleSelect,
    handleToggle,
    watchedCampaignBudget,
    watchedCampaignName,
    watchedClientName,
    watchedMediaTypesMap,
    mediaTypes,
  ])

  function bufferToBase64(buffer: ArrayBuffer) {
    let binary = ''
    const bytes = new Uint8Array(buffer)
    bytes.forEach(b => binary += String.fromCharCode(b))
    return window.btoa(binary)
  }

  // Give pending container effects a frame to push latest line items before export
  const waitForStateFlush = () =>
    new Promise<void>((resolve) => {
      if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(() => resolve())
      } else {
        setTimeout(resolve, 0)
      }
    })

  const [partialMBAValues, setPartialMBAValues] = useState({
    mediaTotals: {} as Record<string, number>,
    grossMedia: 0,
    assembledFee: 0,
    adServing: 0,
    production: 0,
  });

  // This will store a snapshot of the original values for the reset button
  const [originalPartialMBAValues, setOriginalPartialMBAValues] = useState({
    mediaTotals: {} as Record<string, number>,
    grossMedia: 0,
    assembledFee: 0,
    adServing: 0,
    production: 0,
  });

  const [partialMBAMonthYears, setPartialMBAMonthYears] = useState<string[]>([])
  const [partialMBAMediaEnabled, setPartialMBAMediaEnabled] = useState<Record<string, boolean>>({})
  const [partialMBALineItemsByMedia, setPartialMBALineItemsByMedia] = useState<Record<string, PartialApprovalLineItem[]>>({})
  const [partialMBASelectedLineItemIds, setPartialMBASelectedLineItemIds] = useState<Record<string, string[]>>({})

  const billingFeeSeedEnabledConfigs = useMemo((): SeedLineFeesMediaConfig[] => {
    const formFlagByKey: Record<string, string> = {
      television: "mp_television",
      radio: "mp_radio",
      newspaper: "mp_newspaper",
      magazines: "mp_magazines",
      ooh: "mp_ooh",
      cinema: "mp_cinema",
      digiDisplay: "mp_digidisplay",
      digiAudio: "mp_digiaudio",
      digiVideo: "mp_digivideo",
      bvod: "mp_bvod",
      integration: "mp_integration",
      production: "mp_production",
      search: "mp_search",
      socialMedia: "mp_socialmedia",
      progDisplay: "mp_progdisplay",
      progVideo: "mp_progvideo",
      progBvod: "mp_progbvod",
      progAudio: "mp_progaudio",
      progOoh: "mp_progooh",
      influencers: "mp_influencers",
    }
    const seedConfigs: SeedLineFeesMediaConfig[] = [
      { billingKey: "television", lineItems: televisionMediaLineItems, containerBursts: televisionBursts },
      { billingKey: "radio", lineItems: radioMediaLineItems, containerBursts: radioBursts },
      { billingKey: "newspaper", lineItems: newspaperMediaLineItems, containerBursts: newspaperBursts },
      { billingKey: "magazines", lineItems: magazineMediaLineItems, containerBursts: magazineBursts },
      { billingKey: "ooh", lineItems: oohMediaLineItems, containerBursts: oohBursts },
      { billingKey: "cinema", lineItems: cinemaMediaLineItems, containerBursts: cinemaBursts },
      { billingKey: "digiDisplay", lineItems: digiDisplayMediaLineItems, containerBursts: digiDisplayBursts },
      { billingKey: "digiAudio", lineItems: digiAudioMediaLineItems, containerBursts: digiAudioBursts },
      { billingKey: "digiVideo", lineItems: digiVideoMediaLineItems, containerBursts: digiVideoBursts },
      { billingKey: "bvod", lineItems: bvodMediaLineItems, containerBursts: bvodBursts },
      { billingKey: "integration", lineItems: integrationMediaLineItems, containerBursts: integrationBursts },
      { billingKey: "production", lineItems: productionMediaLineItems, containerBursts: productionBursts },
      { billingKey: "search", lineItems: searchMediaLineItems, containerBursts: searchBursts },
      { billingKey: "socialMedia", lineItems: socialMediaMediaLineItems, containerBursts: socialMediaBursts },
      { billingKey: "progDisplay", lineItems: progDisplayMediaLineItems, containerBursts: progDisplayBursts },
      { billingKey: "progVideo", lineItems: progVideoMediaLineItems, containerBursts: progVideoBursts },
      { billingKey: "progBvod", lineItems: progBvodMediaLineItems, containerBursts: progBvodBursts },
      { billingKey: "progAudio", lineItems: progAudioMediaLineItems, containerBursts: progAudioBursts },
      { billingKey: "progOoh", lineItems: progOohMediaLineItems, containerBursts: progOohBursts },
      { billingKey: "influencers", lineItems: influencersMediaLineItems, containerBursts: influencersBursts },
    ]
    return seedConfigs.filter((c) => {
      const flag = formFlagByKey[c.billingKey]
      return Boolean(flag && watchedMediaTypesMap[flag] && c.lineItems.length > 0)
    })
  }, [
    watchedMediaTypesMap,
    televisionMediaLineItems,
    radioMediaLineItems,
    newspaperMediaLineItems,
    magazineMediaLineItems,
    oohMediaLineItems,
    cinemaMediaLineItems,
    digiDisplayMediaLineItems,
    digiAudioMediaLineItems,
    digiVideoMediaLineItems,
    bvodMediaLineItems,
    integrationMediaLineItems,
    productionMediaLineItems,
    searchMediaLineItems,
    socialMediaMediaLineItems,
    progDisplayMediaLineItems,
    progVideoMediaLineItems,
    progBvodMediaLineItems,
    progAudioMediaLineItems,
    progOohMediaLineItems,
    influencersMediaLineItems,
    televisionBursts,
    radioBursts,
    newspaperBursts,
    magazineBursts,
    oohBursts,
    cinemaBursts,
    digiDisplayBursts,
    digiAudioBursts,
    digiVideoBursts,
    bvodBursts,
    integrationBursts,
    productionBursts,
    searchBursts,
    socialMediaBursts,
    progDisplayBursts,
    progVideoBursts,
    progBvodBursts,
    progAudioBursts,
    progOohBursts,
    influencersBursts,
  ])

  /**
   * Shared line/fee inputs for panel financials and version-save bodies (C1 omit mode).
   * Create saves via MBA PUT — server recomputes schedules from these inputs.
   */
  const billingSaveInputs = useMemo(() => {
    const lineItems = attachOverridesToLineInputs(
      buildEditorLineItemInputs(billingFeeSeedEnabledConfigs, {
        isPartialMBA,
        partialMBASelectedLineItemIds,
      }),
      []
    )
    const feeLoading = buildFeeLoadingFromEditorFees({
      feetelevision: feeTelevision,
      feeradio: feeRadio,
      feenewspapers: feeNewspapers,
      feemagazines: feeMagazines,
      feeooh: feeOoh,
      feecinema: feecinema,
      feedigidisplay,
      feedigiaudio,
      feedigivideo,
      feebvod,
      feeintegration,
      feesearch,
      feesocial,
      feeprogdisplay,
      feeprogvideo,
      feeprogbvod,
      feeprogaudio,
      feeprogooh,
      feeinfluencers,
      feecontentcreator,
    })
    return { lineItems, feeLoading }
  }, [
    billingFeeSeedEnabledConfigs,
    isPartialMBA,
    partialMBASelectedLineItemIds,
    feeTelevision,
    feeRadio,
    feeNewspapers,
    feeMagazines,
    feeOoh,
    feecinema,
    feedigidisplay,
    feedigiaudio,
    feedigivideo,
    feebvod,
    feeintegration,
    feesearch,
    feesocial,
    feeprogdisplay,
    feeprogvideo,
    feeprogbvod,
    feeprogaudio,
    feeprogooh,
    feeinfluencers,
    feecontentcreator,
  ])

  /**
   * Single source of truth for MBA totals, panel indicators, PDF/xlsx exports —
   * includes partial selection via billingSaveInputs.
   */
  const campaignFinancials = useMemo(() => {
    const { lineItems, feeLoading } = billingSaveInputs
    const start =
      campaignStart instanceof Date && !Number.isNaN(campaignStart.getTime())
        ? campaignStart
        : undefined
    const end =
      campaignEnd instanceof Date && !Number.isNaN(campaignEnd.getTime())
        ? campaignEnd
        : undefined
    return computeCampaignFinancials(lineItems, { feeLoading }, {
      campaignStart: start,
      campaignEnd: end,
    })
  }, [billingSaveInputs, campaignStart, campaignEnd])

  const campaignFinancialsMediaByKey = useMemo(() => {
    const out: Record<string, number> = {}
    for (const line of campaignFinancials.perLine) {
      if (line.flags.excluded) continue
      out[line.mediaType] = (out[line.mediaType] ?? 0) + line.media
    }
    return out
  }, [campaignFinancials])

  const panelIndicators = useMemo(
    () => panelIndicatorsFromCampaignFinancials(campaignFinancials, { isPartialMBA }),
    [campaignFinancials, isPartialMBA]
  )


  const mediaLabelByBillingKey = useMemo(() => {
    return Object.fromEntries(
      mediaTypes
        .filter((m) => m.name !== "mp_production")
        .map((m) => [mediaKeyMap[m.name], m.label])
    ) as Record<string, string>
  }, [])

  /** Per-line rows for MbaBillingModal left column — titles from seed configs when available. */
  const mbaBillingScopeLines = useMemo((): MbaBillingScopeLine[] => {
    const titleById = new Map<string, { title: string; subtitle?: string }>()
    for (const config of billingFeeSeedEnabledConfigs) {
      const items = config.lineItems ?? []
      items.forEach((raw, index) => {
        const id = editorBillingStableLineItemId(config.billingKey, raw, index)
        const row = (raw ?? {}) as Record<string, unknown>
        const h1 = String(row.header1 ?? row.platform ?? row.publisher ?? row.name ?? "").trim()
        const h2 = String(row.header2 ?? row.campaignName ?? row.placement ?? "").trim()
        titleById.set(id, {
          title: h1 || id,
          subtitle: h2 || undefined,
        })
      })
    }
    return campaignFinancials.perLine.map((line) => {
      const meta = titleById.get(line.lineItemId)
      return {
        lineItemId: line.lineItemId,
        mediaType: line.mediaType,
        mediaLabel: mediaLabelByBillingKey[line.mediaType] ?? line.mediaType,
        title: meta?.title ?? line.lineItemId,
        subtitle: meta?.subtitle,
        approved: !line.flags.excluded,
        media: line.media,
        fee: line.fee,
        flags: line.flags,
      }
    })
  }, [campaignFinancials.perLine, billingFeeSeedEnabledConfigs, mediaLabelByBillingKey])

  const grossMediaAllocated = useMemo(
    () => campaignFinancials.mbaScopeTotals.grossMedia,
    [campaignFinancials]
  )

  const budgetRemaining = useMemo(
    () => (Number(watchedCampaignBudget) || 0) - grossMediaAllocated,
    [watchedCampaignBudget, grossMediaAllocated]
  )
  const budgetRemainingOverspend = budgetRemaining < 0

  const missingPublisherKpiCount = useMemo(
    () => kpiRows.filter((r) => r.hasPublisherKpi === false).length,
    [kpiRows]
  )

  const builderIssues = useMemo(() => {
    const issues: BuilderIssue[] = []
    const client = String(watchedClientName ?? "").trim()
    const name = String(watchedCampaignName ?? "").trim()
    if (!client) {
      issues.push({
        id: "required-client",
        severity: "error",
        title: "Client name is required",
        scrollTargetId: "builder-section-campaign",
      })
    }
    if (!name) {
      issues.push({
        id: "required-campaign-name",
        severity: "error",
        title: "Campaign name is required",
        scrollTargetId: "builder-section-campaign",
      })
    }
    if (dateWarning.hasViolation) {
      issues.push({
        id: "dates-outside-window",
        severity: "warning",
        title:
          dateWarning.offendingCount === 1
            ? "1 line item has flight dates outside the campaign window"
            : `${dateWarning.offendingCount} line items have flight dates outside the campaign window`,
        detail: "Open the channel cards and adjust burst dates, or widen campaign dates.",
        scrollTargetId: "builder-field-campaign-dates",
      })
    }
    if (budgetRemainingOverspend) {
      issues.push({
        id: "budget-overspend",
        severity: "warning",
        title: "Budget remaining is negative",
        detail: `${formatMoney(budgetRemaining)} over the campaign budget.`,
        scrollTargetId: "builder-field-campaign-budget",
      })
    }
    if (missingPublisherKpiCount > 0) {
      issues.push({
        id: "missing-publisher-kpi",
        severity: "warning",
        title: `${missingPublisherKpiCount} missing publisher KPI`,
        detail: "Does not block save — open KPIs to add publisher coverage.",
        scrollTargetId: "builder-section-kpis",
      })
    }
    return issues
  }, [
    watchedClientName,
    watchedCampaignName,
    dateWarning.hasViolation,
    dateWarning.offendingCount,
    budgetRemainingOverspend,
    budgetRemaining,
    missingPublisherKpiCount,
  ])


  const [partialApprovalMetadata, setPartialApprovalMetadata] = useState<PartialApprovalMetadata | null>(null)



  // Digital Media
  const handleSearchTotalChange = (totalMedia: number, totalFee: number) => {
    let changed = false
    setSearchTotal((prev) => {
      if (prev === totalMedia) return prev
      changed = true
      return totalMedia
    })
    setSearchFeeTotal((prev) => {
      if (prev === totalFee) return prev
      changed = true
      return totalFee
    })
  };

  const handleSocialMediaTotalChange = (totalMedia: number, totalFee: number) => {
    let changed = false
    setSocialMediaTotal((prev) => {
      if (prev === totalMedia) return prev
      changed = true
      return totalMedia
    })
    setSocialMediaFeeTotal((prev) => {
      if (prev === totalFee) return prev
      changed = true
      return totalFee
    })
  };
  
  const handleDigiAudioTotalChange = (totalMedia: number, totalFee: number) => {
    let changed = false
    setDigiAudioTotal((prev) => {
      if (prev === totalMedia) return prev
      changed = true
      return totalMedia
    })
    setDigiAudioFeeTotal((prev) => {
      if (prev === totalFee) return prev
      changed = true
      return totalFee
    })
  };

  const handleDigiDisplayTotalChange = (totalMedia: number, totalFee: number) => {
    let changed = false
    setDigiDisplayTotal((prev) => {
      if (prev === totalMedia) return prev
      changed = true
      return totalMedia
    })
    setDigiDisplayFeeTotal((prev) => {
      if (prev === totalFee) return prev
      changed = true
      return totalFee
    })
  };

  const handleDigiVideoTotalChange = (totalMedia: number, totalFee: number) => {
    let changed = false
    setDigiVideoTotal((prev) => {
      if (prev === totalMedia) return prev
      changed = true
      return totalMedia
    })
    setDigiVideoFeeTotal((prev) => {
      if (prev === totalFee) return prev
      changed = true
      return totalFee
    })
  };

  const handleBVODTotalChange = (totalMedia: number, totalFee: number) => {
    let changed = false
    setBvodTotal((prev) => {
      if (prev === totalMedia) return prev
      changed = true
      return totalMedia
    })
    setBvodFeeTotal((prev) => {
      if (prev === totalFee) return prev
      changed = true
      return totalFee
    })
  };

  const handleIntegrationTotalChange = (totalMedia: number, totalFee: number) => {
    let changed = false
    setIntegrationTotal((prev) => {
      if (prev === totalMedia) return prev
      changed = true
      return totalMedia
    })
    setIntegrationFeeTotal((prev) => {
      if (prev === totalFee) return prev
      changed = true
      return totalFee
    })
  };

  const handleProgDisplayTotalChange = (totalMedia: number, totalFee: number) => {
    let changed = false
    setProgDisplayTotal((prev) => {
      if (prev === totalMedia) return prev
      changed = true
      return totalMedia
    })
    setProgDisplayFeeTotal((prev) => {
      if (prev === totalFee) return prev
      changed = true
      return totalFee
    })
  };

  const handleProgVideoTotalChange = (totalMedia: number, totalFee: number) => {
    let changed = false
    setProgVideoTotal((prev) => {
      if (prev === totalMedia) return prev
      changed = true
      return totalMedia
    })
    setProgVideoFeeTotal((prev) => {
      if (prev === totalFee) return prev
      changed = true
      return totalFee
    })
  };

  const handleProgBvodTotalChange = (totalMedia: number, totalFee: number) => {
    let changed = false
    setProgBvodTotal((prev) => {
      if (prev === totalMedia) return prev
      changed = true
      return totalMedia
    })
    setProgBvodFeeTotal((prev) => {
      if (prev === totalFee) return prev
      changed = true
      return totalFee
    })
  };

  const handleProgOohTotalChange = (totalMedia: number, totalFee: number) => {
    let changed = false
    setProgOohTotal((prev) => {
      if (prev === totalMedia) return prev
      changed = true
      return totalMedia
    })
    setProgOohFeeTotal((prev) => {
      if (prev === totalFee) return prev
      changed = true
      return totalFee
    })
    if (changed) markUnsavedChanges()
  };

  const handleProgAudioTotalChange = (totalMedia: number, totalFee: number) => {
    let changed = false
    setProgAudioTotal((prev) => {
      if (prev === totalMedia) return prev
      changed = true
      return totalMedia
    })
    setProgAudioFeeTotal((prev) => {
      if (prev === totalFee) return prev
      changed = true
      return totalFee
    })
    if (changed) markUnsavedChanges()
  };

  // Offline Media
  
  const handleCinemaTotalChange = (totalMedia: number, totalFee: number) => {
    let changed = false
    setCinemaTotal((prev) => {
      if (prev === totalMedia) return prev
      changed = true
      return totalMedia
    })
    setCinemaFeeTotal((prev) => {
      if (prev === totalFee) return prev
      changed = true
      return totalFee
    })
    if (changed) markUnsavedChanges()
  };

  const handleTelevisionTotalChange = (totalMedia: number, totalFee: number) => {
    let changed = false
    setTelevisionTotal((prev) => {
      if (prev === totalMedia) return prev
      changed = true
      return totalMedia
    })
    setTelevisionFeeTotal((prev) => {
      if (prev === totalFee) return prev
      changed = true
      return totalFee
    })
    if (changed) markUnsavedChanges()
  };

  const handleRadioTotalChange = (totalMedia: number, totalFee: number) => {
    let changed = false
    setRadioTotal((prev) => {
      if (prev === totalMedia) return prev
      changed = true
      return totalMedia
    })
    setRadioFeeTotal((prev) => {
      if (prev === totalFee) return prev
      changed = true
      return totalFee
    })
    if (changed) markUnsavedChanges()
  };

  const handleNewspaperTotalChange = (totalMedia: number, totalFee: number) => {
    let changed = false
    setNewspaperTotal((prev) => {
      if (prev === totalMedia) return prev
      changed = true
      return totalMedia
    })
    setNewspaperFeeTotal((prev) => {
      if (prev === totalFee) return prev
      changed = true
      return totalFee
    })
    if (changed) markUnsavedChanges()
  };

  const handleMagazinesTotalChange = (totalMedia: number, totalFee: number) => {
    let changed = false
    setMagazineTotal((prev) => {
      if (prev === totalMedia) return prev
      changed = true
      return totalMedia
    })
    setMagazineFeeTotal((prev) => {
      if (prev === totalFee) return prev
      changed = true
      return totalFee
    })
    if (changed) markUnsavedChanges()
  };

  const handleOohTotalChange = (totalMedia: number, totalFee: number) => {
    let changed = false
    setOohTotal((prev) => {
      if (prev === totalMedia) return prev
      changed = true
      return totalMedia
    })
    setOohFeeTotal((prev) => {
      if (prev === totalFee) return prev
      changed = true
      return totalFee
    })
    if (changed) markUnsavedChanges()
  };

  const handleProductionTotalChange = (totalMedia: number, totalFee: number) => {
    let changed = false
    setProductionTotal((prev) => {
      if (prev === totalMedia) return prev
      changed = true
      return totalMedia
    })
    setProductionFeeTotal((prev) => {
      if (prev === totalFee) return prev
      changed = true
      return totalFee
    })
    if (changed) markUnsavedChanges()
  };

  const handleInfluencersTotalChange = (totalMedia: number, totalFee: number) => {
    let changed = false
    setInfluencersTotal((prev) => {
      if (prev === totalMedia) return prev
      changed = true
      return totalMedia
    })
    setInfluencersFeeTotal((prev) => {
      if (prev === totalFee) return prev
      changed = true
      return totalFee
    })
    if (changed) markUnsavedChanges()
  };

  const handleInvestmentChange = useCallback((channel: string, rows: any[]) => {
    setInvestmentPerMonthByChannel((prev) => {
      if (JSON.stringify(prev[channel] ?? []) === JSON.stringify(rows)) return prev
      markUnsavedChanges()
      return { ...prev, [channel]: rows }
    })
  }, [markUnsavedChanges])

  // New callback handlers for media line items
  const handleTelevisionMediaLineItemsChange = useCallback((lineItems: any[]) => {
    markUnsavedChanges();
    setTelevisionMediaLineItems(lineItems);
  }, [markUnsavedChanges]);

  const handleRadioMediaLineItemsChange = useCallback((lineItems: any[]) => {
    markUnsavedChanges();
    setRadioMediaLineItems(lineItems);
  }, [markUnsavedChanges]);

  const handleNewspaperMediaLineItemsChange = useCallback((lineItems: any[]) => {
    markUnsavedChanges();
    setNewspaperMediaLineItems(lineItems);
  }, [markUnsavedChanges]);

  const handleMagazineMediaLineItemsChange = useCallback((lineItems: any[]) => {
    markUnsavedChanges();
    setMagazineMediaLineItems(lineItems);
  }, [markUnsavedChanges]);

  const handleOohMediaLineItemsChange = useCallback((lineItems: any[]) => {
    markUnsavedChanges();
    setOohMediaLineItems(lineItems);
  }, [markUnsavedChanges]);

  const handleProductionMediaLineItemsChange = useCallback((lineItems: any[]) => {
    markUnsavedChanges();
    setProductionMediaLineItems(lineItems);
  }, [markUnsavedChanges]);

  const handleProductionItemsChange = useCallback((items: LineItem[]) => {
    markUnsavedChanges();
    setProductionItems(items);
  }, [markUnsavedChanges]);

  const handleCinemaMediaLineItemsChange = useCallback((lineItems: any[]) => {
    markUnsavedChanges();
    setCinemaMediaLineItems(lineItems);
  }, [markUnsavedChanges]);

  const handleDigiAudioMediaLineItemsChange = useCallback((lineItems: any[]) => {
    markUnsavedChanges();
    setDigiAudioMediaLineItems(lineItems);
  }, [markUnsavedChanges]);

  const handleDigiDisplayMediaLineItemsChange = useCallback((lineItems: any[]) => {
    markUnsavedChanges();
    setDigiDisplayMediaLineItems(lineItems);
  }, [markUnsavedChanges]);

  const handleDigiVideoMediaLineItemsChange = useCallback((lineItems: any[]) => {
    markUnsavedChanges();
    setDigiVideoMediaLineItems(lineItems);
  }, [markUnsavedChanges]);

  const handleBvodMediaLineItemsChange = useCallback((lineItems: any[]) => {
    markUnsavedChanges();
    setBvodMediaLineItems(lineItems);
  }, [markUnsavedChanges]);

  const handleProgDisplayMediaLineItemsChange = useCallback((lineItems: any[]) => {
    markUnsavedChanges();
    setProgDisplayMediaLineItems(lineItems);
  }, [markUnsavedChanges]);

  const handleProgVideoMediaLineItemsChange = useCallback((lineItems: any[]) => {
    markUnsavedChanges();
    setProgVideoMediaLineItems(lineItems);
  }, [markUnsavedChanges]);

  const handleProgBvodMediaLineItemsChange = useCallback((lineItems: any[]) => {
    markUnsavedChanges();
    setProgBvodMediaLineItems(lineItems);
  }, [markUnsavedChanges]);

  const handleProgAudioMediaLineItemsChange = useCallback((lineItems: any[]) => {
    markUnsavedChanges();
    setProgAudioMediaLineItems(lineItems);
  }, [markUnsavedChanges]);

  const handleProgOohMediaLineItemsChange = useCallback((lineItems: any[]) => {
    markUnsavedChanges();
    setProgOohMediaLineItems(lineItems);
  }, [markUnsavedChanges]);

  const handleSearchMediaLineItemsChange = useCallback((lineItems: any[]) => {
    markUnsavedChanges();
    setSearchMediaLineItems(lineItems);
  }, [markUnsavedChanges]);

  const handleSocialMediaMediaLineItemsChange = useCallback((lineItems: any[]) => {
    markUnsavedChanges();
    setSocialMediaMediaLineItems(lineItems);
  }, [markUnsavedChanges]);

  const handleIntegrationMediaLineItemsChange = useCallback((lineItems: any[]) => {
    markUnsavedChanges();
    setIntegrationMediaLineItems(lineItems);
  }, [markUnsavedChanges]);

  const handleInfluencersMediaLineItemsChange = useCallback((lineItems: any[]) => {
    markUnsavedChanges();
    setInfluencersMediaLineItems(lineItems);
  }, [markUnsavedChanges]);

  const handleSearchItemsChange = useCallback((items: LineItem[]) => {
    markUnsavedChanges();
    setSearchItems(items);
  }, [markUnsavedChanges]);

  const handleSocialMediaItemsChange = useCallback((items: LineItem[]) => {
    markUnsavedChanges();
    setSocialMediaItems(items);
  }, [markUnsavedChanges]);

  const handleBVODItemsChange = useCallback((items: LineItem[]) => {
    markUnsavedChanges();
    setBVODItems(items);
  }, [markUnsavedChanges]);

  const handleIntegrationItemsChange = useCallback((items: LineItem[]) => {
    markUnsavedChanges();
    setIntegrationItems(items);
  }, [markUnsavedChanges]);

  const handleCinemaItemsChange = useCallback((items: LineItem[]) => {
    markUnsavedChanges();
    setCinemaItems(items);
  }, [markUnsavedChanges]);

  const handleProgAudioItemsChange = useCallback((items: LineItem[]) => {
    markUnsavedChanges();
    setProgAudioItems(items);
  }, [markUnsavedChanges]);

  const handleProgBvodItemsChange = useCallback((items: LineItem[]) => {
    markUnsavedChanges();
    setProgBvodItems(items);
  }, [markUnsavedChanges]);

  const handleProgOohItemsChange = useCallback((items: LineItem[]) => {
    markUnsavedChanges();
    setProgOohItems(items);
  }, [markUnsavedChanges]);

  const handleDigiAudioItemsChange = useCallback((items: LineItem[]) => {
    markUnsavedChanges();
    setDigiAudioItems(items);
  }, [markUnsavedChanges]);

  const handleDigiDisplayItemsChange = useCallback((items: LineItem[]) => {
    markUnsavedChanges();
    setDigiDisplayItems(items);
  }, [markUnsavedChanges]);

  const handleDigiVideoItemsChange = useCallback((items: LineItem[]) => {
    markUnsavedChanges();
    setDigiVideoItems(items);
  }, [markUnsavedChanges]);

  const handleProgDisplayItemsChange = useCallback((items: LineItem[]) => {
    markUnsavedChanges();
    setProgDisplayItems(items);
  }, [markUnsavedChanges]);

  const handleProgVideoItemsChange = useCallback((items: LineItem[]) => {
    markUnsavedChanges();
    setProgVideoItems(items);
  }, [markUnsavedChanges]);

  const handleTelevisionItemsChange = useCallback((items: LineItem[]) => {
    markUnsavedChanges();
    setTelevisionItems(items);
  }, [markUnsavedChanges]);

  const handleTelevisionLineItemsChange = useCallback((items: LineItem[]) => {
    markUnsavedChanges();
    setTelevisionLineItems(items);
  }, [markUnsavedChanges]);

  const handleRadioItemsChange = useCallback((items: LineItem[]) => {
    markUnsavedChanges();
    setRadioItems(items);
  }, [markUnsavedChanges]);

  const handleNewspaperItemsChange = useCallback((items: LineItem[]) => {
    markUnsavedChanges();
    setNewspaperItems(items);
  }, [markUnsavedChanges]);

  const handleMagazinesItemsChange = useCallback((items: LineItem[]) => {
    markUnsavedChanges();
    setMagazineItems(items);
  }, [markUnsavedChanges]);

  const handleOohItemsChange = useCallback((items: LineItem[]) => {
    markUnsavedChanges();
    setOohItems(items);
  }, [markUnsavedChanges]);

  const handleInfluencersItemsChange = useCallback((items: LineItem[]) => {
    markUnsavedChanges();
    setInfluencersItems(items);
  }, [markUnsavedChanges]);

  const handleSocialMediaLineItemsStateChange = useCallback((items: LineItem[]) => {
    markUnsavedChanges();
    setSocialMediaLineItems(items);
  }, [markUnsavedChanges]);

  const handleNewspaperLineItemsStateChange = useCallback((items: LineItem[]) => {
    markUnsavedChanges();
    setNewspaperLineItems(items);
  }, [markUnsavedChanges]);

  const handleMagazineLineItemsStateChange = useCallback((items: LineItem[]) => {
    markUnsavedChanges();
    setMagazineItems(items);
  }, [markUnsavedChanges]);

  useEffect(() => {
    if (campaignStart && campaignEnd) {
    calculateBillingSchedule();
  }
}, [
  campaignStart,
  campaignEnd,
  calculateBillingSchedule,
  //Digital Media
  searchTotal,
  searchFeeTotal,
  searchBursts,
 
  socialmediaTotal,
  socialMediaFeeTotal,
  socialMediaBursts,


  digiAudioTotal,
  digiAudioBursts,
  digiAudioFeeTotal,

  digiDisplayTotal,
  digiDisplayBursts,
  digiDisplayFeeTotal,

  digiVideoTotal,
  digiVideoBursts,
  digiVideoFeeTotal,
   
  bvodTotal,
  bvodFeeTotal,
  bvodBursts,

  progAudioTotal,
  progAudioFeeTotal,
  progAudioBursts,

  progDisplayTotal,
  progDisplayBursts,
  progDisplayFeeTotal,

  progVideoTotal,
  progVideoFeeTotal,
  progVideoBursts,

  progBvodTotal,
  progBvodBursts,
  progBvodFeeTotal,

  progOohTotal,
  progOohBursts,
  progOohFeeTotal,

  //Offline Media
  cinemaTotal,
  cinemaFeeTotal,
  cinemaBursts,

  televisionTotal,
  televisionFeeTotal,
  televisionBursts,

  radioTotal,
  radioFeeTotal,
  radioBursts,

  newspaperTotal,
  newspaperFeeTotal,
  newspaperBursts,

  magazineTotal,
  magazineFeeTotal,
  magazineBursts,

  oohTotal,
  oohFeeTotal,
  oohBursts,

  //Ad Serving
  adservimp,
  adservaudio,
  adservdisplay,
  adservvideo,
  // Production
  productionBursts,
]);

  // in page.tsx

  const generateMbaPdfBlob = async (opts?: { planVersion?: string }) => {
    const fv = form.getValues();

    if (!fv.mba_number) {
      throw new Error("MBA number is required to generate MBA");
    }

    // Ensure any recent duplicate/add operations finish propagating to state
    await waitForStateFlush();

    let finalVisibleMedia: { media_type: string; gross_amount: number }[];
    let finalTotals: MBAData['totals'];

    // Single source: core financials (partial selection already applied via billingSaveInputs).
    const t = campaignFinancials.mbaScopeTotals
    finalVisibleMedia = mediaTypes
      .filter((medium) => medium.name !== "mp_production")
      .filter((medium) => Boolean(fv[medium.name as keyof MediaPlanFormValues]))
      .map((medium) => {
        const billingKey = mediaKeyMap[medium.name]
        const gross_amount =
          billingKey !== undefined ? (campaignFinancialsMediaByKey[billingKey] ?? 0) : 0
        return {
          media_type: medium.label,
          gross_amount,
        }
      })

    finalTotals = {
      gross_media: t.grossMedia,
      service_fee: t.fee,
      production: t.production,
      adserving: t.adServing,
      totals_ex_gst: t.nettExGst,
      total_inc_gst: t.nettIncGst,
    }

    const billingMonthsExGST = campaignFinancials.billingSchedule.map((month) => ({
      monthYear: month.monthYear,
      totalAmount: month.totalAmount,
    }));

    const resolvedPlanVersion = String(opts?.planVersion || fv.mp_plannumber || "1");
    const apiData = {
      mba_number: fv.mba_number,
      mp_client_name: fv.mp_client_name,
      mp_campaignname: fv.mp_campaignname,
      mp_brand: fv.mp_brand,
      mp_ponumber: fv.mp_ponumber,
      mp_plannumber: resolvedPlanVersion,
      mp_campaigndates_start: toDateOnlyString(fv.mp_campaigndates_start),
      mp_campaigndates_end: toDateOnlyString(fv.mp_campaigndates_end),
      clientAddress: clientAddress,
      clientSuburb: clientSuburb,
      clientState: clientState,
      clientPostcode: clientPostcode,
      gross_media: finalVisibleMedia,
      grossMediaTotal: finalTotals.gross_media,
      calculateAssembledFee: finalTotals.service_fee,
      calculateProductionCosts: finalTotals.production,
      calculateAdServingFees: finalTotals.adserving,
      totalInvestment: finalTotals.totals_ex_gst,
      billingMonths: billingMonthsExGST,
    };

    const response = await fetch("/api/mba/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(apiData),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({} as any));
      throw new Error(errorData.error || errorData.details || "Failed to generate MBA");
    }

    const blob = await response.blob();
    const mbaBase = `MBA_${fv.mp_campaignname || "campaign"}`;
    const fileName = `${fv.mp_client_name || "client"}-${mbaBase}-v${resolvedPlanVersion}.pdf`;
    return { blob, fileName, planVersion: resolvedPlanVersion };
  };

  const generateMediaPlanXlsxBlob = async (opts?: { planVersion?: string; variant?: "standard" | "aa" }) => {
    const planVersion = String(opts?.planVersion || form.getValues('mp_plannumber') || '1');
    const variant = opts?.variant ?? "standard"
    // Allow container effects to emit latest duplicated line items before export
    await waitForStateFlush();

    // fetch and encode logo
    const logoBuf = await fetch('/assembled-logo.png').then(r => r.arrayBuffer())
    const logoBase64 = bufferToBase64(logoBuf)

    const header: MediaPlanHeader = {
      logoBase64,
      logoWidth: 457,
      logoHeight: 71,
      client:         form.getValues('mp_client_name'),
      brand:          form.getValues('mp_brand'),
      campaignName:   form.getValues('mp_campaignname'),
      mbaNumber:      form.getValues('mba_number'),
      clientContact:  form.getValues('mp_clientcontact'),
      planVersion,
      poNumber:       form.getValues('mp_ponumber'),
      campaignBudget: new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD'}).format(form.getValues('mp_campaignbudget')),
      campaignStatus: form.getValues('mp_campaignstatus'),
      campaignStart:  format(form.getValues('mp_campaigndates_start'), "dd/MM/yyyy"),
      campaignEnd:    format(form.getValues('mp_campaigndates_end'), "dd/MM/yyyy"),
    }

    // Helper to ensure each line item has a stable identifier for Excel grouping
    const assignLineItemIds = (items: LineItem[], prefix: string) =>
      items.map((item, idx) => {
        const existingId = item.line_item_id || item.lineItemId;
        const generatedId =
          existingId ||
          `${prefix}-${typeof crypto !== "undefined" && "randomUUID" in crypto
            ? (crypto as any).randomUUID()
            : `${Date.now()}-${idx}-${Math.random().toString(16).slice(2, 8)}`}`;
        const lineNumber = item.line_item ?? item.lineItem ?? idx + 1;

        return {
          ...item,
          line_item_id: generatedId,
          lineItemId: generatedId,
          line_item: lineNumber,
          lineItem: lineNumber,
        };
      });

    const validSearchItems = searchItems.filter(shouldIncludeMediaPlanLineItem);
    const validSocialMediaItems = socialMediaItems.filter(shouldIncludeMediaPlanLineItem);
    const validDigiAudioItems = digiAudioItems.filter(shouldIncludeMediaPlanLineItem);
    const validDigiDisplayItems = digiDisplayItems.filter(shouldIncludeMediaPlanLineItem);
    const validDigiVideoItems = digiVideoItems.filter(shouldIncludeMediaPlanLineItem);
    const validBvodItems = bvodItems.filter(shouldIncludeMediaPlanLineItem);
    const validProgDisplayItems = progDisplayItems.filter(shouldIncludeMediaPlanLineItem);
    const validProgVideoItems = progVideoItems.filter(shouldIncludeMediaPlanLineItem);
    const validProgBvodItems = progBvodItems.filter(shouldIncludeMediaPlanLineItem);
    const validProgOohItems = progOohItems.filter(shouldIncludeMediaPlanLineItem);
    const validProgAudioItems = progAudioItems.filter(shouldIncludeMediaPlanLineItem);
    const validNewspaperItems = newspaperItems.filter(shouldIncludeMediaPlanLineItem);
    const validMagazinesItems = magazineItems.filter(shouldIncludeMediaPlanLineItem);
    const validTelevisionItems = televisionItems.filter(shouldIncludeMediaPlanLineItem);
    const validRadioItems = radioItems.filter(shouldIncludeMediaPlanLineItem);
    const validOohItems = oohItems.filter(shouldIncludeMediaPlanLineItem);
    const validCinemaItems = cinemaItems.filter(shouldIncludeMediaPlanLineItem);
    const validIntegrationItems = integrationItems.filter(shouldIncludeMediaPlanLineItem);
    const validInfluencersItems = influencersItems.filter(shouldIncludeMediaPlanLineItem);
    const validProductionLineItems = productionItems.filter(shouldIncludeMediaPlanLineItem);

    const mediaItems: MediaItems = {
      search:       assignLineItemIds(validSearchItems,       "SRC"),
      socialMedia:  assignLineItemIds(validSocialMediaItems,  "SOC"),
      digiAudio:    assignLineItemIds(validDigiAudioItems,    "DA"),
      digiDisplay:  assignLineItemIds(validDigiDisplayItems,  "DD"),
      digiVideo:    assignLineItemIds(validDigiVideoItems,    "DV"),
      bvod:         assignLineItemIds(validBvodItems,         "BVOD"),
      progDisplay:  assignLineItemIds(validProgDisplayItems,  "PD"),
      progVideo:    assignLineItemIds(validProgVideoItems,    "PV"),
      progBvod:     assignLineItemIds(validProgBvodItems,     "PBVOD"),
      progOoh:      assignLineItemIds(validProgOohItems,      "POOH"),
      progAudio:    assignLineItemIds(validProgAudioItems,    "PA"),
      newspaper:    assignLineItemIds(validNewspaperItems,    "NEWS"),
      magazines:    assignLineItemIds(validMagazinesItems,    "MAG"),
      television:   assignLineItemIds(validTelevisionItems,   "TV"),
      radio:        assignLineItemIds(validRadioItems,        "RAD"),
      ooh:          assignLineItemIds(validOohItems,          "OOH"),
      cinema:       assignLineItemIds(validCinemaItems,       "CIN"),
      integration:  assignLineItemIds(validIntegrationItems,  "INT"),
      influencers:  assignLineItemIds(validInfluencersItems,  "INF"),
      production:   assignLineItemIds(validProductionLineItems,   MEDIA_TYPE_ID_CODES.production),
    };

    // MBA totals for Excel — same core as MBA Details / PDF (partial via selected line ids).
    const coreTotals = campaignFinancials.mbaScopeTotals
    const mbaDataGrossMedia = mediaTypes
      .filter((medium) => medium.name !== "mp_production")
      .filter((medium) => Boolean(form.getValues()[medium.name as keyof MediaPlanFormValues]))
      .map((medium) => {
        const billingKey = mediaKeyMap[medium.name]
        return {
          media_type: medium.label,
          gross_amount:
            billingKey !== undefined ? (campaignFinancialsMediaByKey[billingKey] ?? 0) : 0,
        }
      })

    let mediaItemsForWorkbook: MediaItems = mediaItems
    let mbaData: Parameters<typeof generateMediaPlan>[2]

    if (variant === "aa") {
      const pubRes = await fetch("/api/publishers")
      if (!pubRes.ok) {
        throw new Error("Failed to load publishers for Advertising Associates export")
      }
      const publishersList = (await pubRes.json()) as Publisher[]
      const aaFiltered = filterMediaItemsForAdvertisingAssociates(mediaItems, publishersList)
      if (!advertisingAssociatesFilteredPlanHasLineItems(aaFiltered)) {
        throw new Error(
          "No Advertising Associates–billed line items to include in this export after applying publisher filter",
        )
      }
      mediaItemsForWorkbook = aaFiltered
      mbaData = buildAdvertisingAssociatesMbaDataFromMediaItems(aaFiltered)
    } else {
      mbaData = {
        gross_media: mbaDataGrossMedia,
        totals: {
          gross_media: coreTotals.grossMedia,
          service_fee: coreTotals.fee,
          production: coreTotals.production,
          adserving: coreTotals.adServing,
          totals_ex_gst: coreTotals.nettExGst,
          total_inc_gst: coreTotals.nettIncGst,
        },
      }
    }

    const workbook = await generateMediaPlan(header, mediaItemsForWorkbook, mbaData, {
      mbaTotalsLayout: variant === "aa" ? "aa" : "standard",
    })
    if (variant === "standard" && kpiRows.length > 0) {
      const { addKPISheet } = await import("@/lib/generateMediaPlan")
      addKPISheet(
        workbook,
        kpiRows.map((r) => ({
          mediaType: r.media_type,
          publisher: r.publisher,
          label: r.lineItemLabel,
          buyType: r.buyType,
          spend: r.spend,
          deliverables: r.deliverables,
          ctr: r.ctr,
          vtr: r.vtr,
          cpv: r.cpv,
          conversion_rate: r.conversion_rate,
          frequency: r.frequency,
          calculatedClicks: r.calculatedClicks,
          calculatedViews: r.calculatedViews,
          calculatedReach: r.calculatedReach,
        })),
      )
    }
    const arrayBuffer = await workbook.xlsx.writeBuffer() as ArrayBuffer
    const blob = new Blob([ arrayBuffer ], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    })
    const mediaPlanBase = `MediaPlan_${header.campaignName}`;
    const baseFileName = `${header.client}-${mediaPlanBase}-v${planVersion}.xlsx`;
    const fileName = variant === "aa" ? `AA - ${baseFileName}` : baseFileName;
    return { blob, fileName, planVersion };
  }

  const handleGenerateMBA = async () => {
    setIsLoading(true);
  
    try {
      const { blob: pdfBlob, fileName } = await generateMbaPdfBlob();

      // Create a URL for the blob
      const url = window.URL.createObjectURL(pdfBlob);

      // Create a temporary link element
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;

      // Append the link to the body, click it, and remove it
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Revoke the URL to free up memory
      window.URL.revokeObjectURL(url);

      toast({
        title: "Success",
        description: "MBA generated successfully",
      });
    } catch (e: any) {
      toast({ 
        title: "Error", 
        description: e.message || "Failed to generate MBA", 
        variant: "destructive" 
      });
    } finally {
      setIsLoading(false);
    }
  };

    useEffect(() => {
      fetchClients()
    }, [])

  useEffect(() => {
    getPublisherKPIs()
      .then((data) => {
        if (process.env.NODE_ENV !== "production") {
          console.log("[KPI] publisher KPIs loaded:", data.length, data[0])
        }
        setPublisherKPIs(data)
        setKpiTrigger((t) => t + 1)
      })
      .catch(console.error)
  }, [])

  async function fetchClients() {
    try {
      setIsLoading(true)
      const response = await fetch("/api/clients")
      if (!response.ok) {
        throw new Error("Failed to fetch clients")
      }
      const data = await response.json()
      setClients(data)
    } catch (error) {
    } finally {
      setIsLoading(false)
      setClientsReady(true)
    }
  }

  const generateMBANumber = async (mbaidentifier: string) => {
    // Validate mbaidentifier before making API call
    if (!mbaidentifier || mbaidentifier.trim() === "") {
      console.error("MBA Identifier is required to generate MBA number")
      form.setValue("mba_number", "")
      setMbaNumber("")
      return
    }

    try {
      const response = await fetch(`/api/mediaplans/mbanumber?mbaidentifier=${encodeURIComponent(mbaidentifier)}`)
      
      if (!response.ok) {
        let errorMessage = "Failed to generate MBA number"
        try {
          const errorData = await response.json()
          errorMessage = errorData.error || errorMessage
        } catch (jsonError) {
          // If response is not JSON, use status text
          errorMessage = response.statusText || errorMessage
        }
        console.error("API error generating MBA number:", errorMessage, "Status:", response.status)
        throw new Error(errorMessage)
      }
      
      const data = await response.json()
      if (data.mba_number) {
        if (form.getValues("mba_number") !== data.mba_number) {
          form.setValue("mba_number", data.mba_number)
        }
        setMbaNumber(data.mba_number)
      } else {
        console.error("MBA number not found in response:", data)
        throw new Error("MBA number not found in response")
      }
    } catch (error) {
      console.error("Error generating MBA number:", error)
      const errorMessage = error instanceof Error ? error.message : "Error generating MBA number"
      if (form.getValues("mba_number") !== "") {
        form.setValue("mba_number", "")
      }
      setMbaNumber("")
      // Optionally show a toast notification here if you have toast available
    }
  }

  const handleClientChange = (clientId: string) => {
    const selectedClient = clients.find((client) => client.id.toString() === clientId)
    if (selectedClient) {
      const nextClientName = selectedClient.mp_client_name
      if (form.getValues("mp_client_name") !== nextClientName) {
        form.setValue("mp_client_name", nextClientName)
      }
      const nextMbaId = selectedClient.mbaidentifier || ""
      if (form.getValues("mbaidentifier") !== nextMbaId) {
        form.setValue("mbaidentifier", nextMbaId)
      }
      // Only generate MBA number if mbaidentifier exists
      if (selectedClient.mbaidentifier) {
        generateMBANumber(selectedClient.mbaidentifier)
      } else {
        console.warn("Selected client does not have an MBA identifier")
        if (form.getValues("mba_number") !== "") {
          form.setValue("mba_number", "")
        }
        setMbaNumber("")
      }
      setSelectedClientId(clientId)
      setFeeSearch(selectedClient.feesearch);
      setFeeSocial(selectedClient.feesocial);
      setFeeCinema(selectedClient.feecinema);
      setFeeDigiAudio(selectedClient.feedigiaudio);
      setFeeDigiDisplay(selectedClient.feedigidisplay);
      setFeeDigiVideo(selectedClient.feedigivideo);
      setFeeBVOD(selectedClient.feebvod);
      setFeeIntegration(selectedClient.feeintegration);
      setFeeProgDisplay(selectedClient.feeprogdisplay);
      setFeeProgVideo(selectedClient.feeprogvideo);
      setFeeProgBvod(selectedClient.feeprogbvod);
      setFeeProgAudio(selectedClient.feeprogaudio);
      setFeeProgOoh(selectedClient.feeprogooh);
      setFeeContentCreator(selectedClient.feecontentcreator);
      setAdServVideo(selectedClient.adservvideo);
      setAdServImp(selectedClient.adservimp);
      setAdServDisplay(selectedClient.adservdisplay);
      setAdServAudio(selectedClient.adservaudio);
      if (selectedClient.mp_client_name) {
        getClientKPIs(selectedClient.mp_client_name)
          .then((data) => {
            setClientKPIs(data)
            setKpiTrigger((t) => t + 1)
          })
          .catch(console.error)
      }
      setClientAddress(selectedClient.streetaddress);
      setClientSuburb(selectedClient.suburb);
      setClientState(selectedClient.state_dropdown);
      setClientPostcode(selectedClient.postcode);
    } else {
      if (form.getValues("mp_client_name") !== "") {
        form.setValue("mp_client_name", "")
      }
      if (form.getValues("mbaidentifier") !== "") {
        form.setValue("mbaidentifier", "")
      }
      if (form.getValues("mba_number") !== "") {
        form.setValue("mba_number", "")
      }
      setSelectedClientId("")
      setFeeSearch(null);
      setFeeSocial(null);
      setFeeCinema(null);
      setFeeDigiAudio(null);
      setFeeDigiDisplay(null);
      setFeeDigiVideo(null);
      setFeeBVOD(null);
      setFeeIntegration(null);
      setFeeProgDisplay(null);
      setFeeProgVideo(null);
      setFeeProgBvod(null);
      setFeeProgAudio(null);
      setFeeProgOoh(null);
      setFeeContentCreator(null);
      setAdServVideo(null);
      setAdServImp(null);
      setAdServDisplay(null);
      setAdServAudio(null);
      setClientAddress("");
      setClientSuburb("");
      setClientState("");
      setClientPostcode("");
    }
  }

  // Planning handoff: ?clientId=&campaignName=&start=&end= — once, while pristine only.
  useEffect(() => {
    if (prefillDoneRef.current) return
    if (!clientsReady) return

    const { isDirty } = form.formState
    if (isDirty || selectedClientId) {
      prefillDoneRef.current = true
      return
    }

    const clientIdParam = searchParams.get("clientId")
    const campaignName = (searchParams.get("campaignName") ?? "").trim()
    const startParam = searchParams.get("start")
    const endParam = searchParams.get("end")

    if (!clientIdParam && !campaignName && !startParam && !endParam) {
      prefillDoneRef.current = true
      return
    }

    const prevHydrated = navigationHydratedRef.current
    navigationHydratedRef.current = false
    try {
      if (campaignName) {
        form.setValue("mp_campaignname", campaignName, { shouldDirty: false })
      }
      const startDate = parsePrefillYmd(startParam)
      const endDate = parsePrefillYmd(endParam)
      if (startDate) {
        form.setValue("mp_campaigndates_start", startDate, { shouldDirty: false })
      }
      if (endDate) {
        form.setValue("mp_campaigndates_end", endDate, { shouldDirty: false })
      }
      if (clientIdParam) {
        const known = clients.some((c) => c.id.toString() === clientIdParam)
        if (known) {
          handleClientChange(clientIdParam)
        }
      }
    } finally {
      navigationHydratedRef.current = prevHydrated
      prefillDoneRef.current = true
    }
    // handleClientChange is stable enough for one-shot mount; omit to avoid re-runs.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pristine one-shot prefill
  }, [clientsReady, clients, selectedClientId, searchParams, form])

  const normalizeBursts = (bursts: BillingBurst[]): BillingBurst[] =>
    bursts.map((burst) => {
      const mediaAmount =
        typeof burst.mediaAmount === "number"
          ? burst.mediaAmount
          : parseFloat(String(burst.mediaAmount ?? "").replace(/[^0-9.-]/g, "")) || 0;
      const feeAmount =
        typeof burst.feeAmount === "number"
          ? burst.feeAmount
          : parseFloat(String(burst.feeAmount ?? "").replace(/[^0-9.-]/g, "")) || 0;
      const deliveryMediaAmount =
        burst.deliveryMediaAmount != null
          ? typeof burst.deliveryMediaAmount === "number"
            ? burst.deliveryMediaAmount
            : parseFloat(String(burst.deliveryMediaAmount).replace(/[^0-9.-]/g, "")) || 0
          : undefined;
      return {
        ...burst,
        mediaAmount,
        feeAmount,
        deliveryMediaAmount,
        totalAmount: mediaAmount + feeAmount,
      };
    });

  const handleSearchBurstsChange = (bursts: BillingBurst[]) => {
    setSearchBursts((prev) => {
      const next = normalizeBursts(bursts)
      if (prev === next) return prev
      if (prev.length === next.length && JSON.stringify(prev) === JSON.stringify(next)) {
        return prev
      }
      return next
    })
  }

  const handleProgAudioBurstsChange = (bursts: BillingBurst[]) => {
    setProgAudioBursts((prev) => {
      const next = normalizeBursts(bursts)
      if (prev === next) return prev
      if (prev.length === next.length && JSON.stringify(prev) === JSON.stringify(next)) {
        return prev
      }
      return next
    })
  }

  const handleSocialMediaBurstsChange = (bursts: BillingBurst[]) => {
    setSocialMediaBursts((prev) => {
      const next = normalizeBursts(bursts)
      if (prev === next) return prev
      if (prev.length === next.length && JSON.stringify(prev) === JSON.stringify(next)) {
        return prev
      }
      return next
    })
  }

  const handleCinemaBurstsChange = (bursts: BillingBurst[]) => {
    setCinemaBursts((prev) => {
      const next = normalizeBursts(bursts)
      if (prev === next) return prev
      if (prev.length === next.length && JSON.stringify(prev) === JSON.stringify(next)) {
        return prev
      }
      return next
    })
  }

  const handleTelevisionBurstsChange = (bursts: BillingBurst[]) => {
    setTelevisionBursts((prev) => {
      const next = normalizeBursts(bursts)
      if (prev === next) return prev
      if (prev.length === next.length && JSON.stringify(prev) === JSON.stringify(next)) {
        return prev
      }
      return next
    })
  }

  const handleRadioBurstsChange = (bursts: BillingBurst[]) => {
    setRadioBursts((prev) => {
      const next = normalizeBursts(bursts)
      if (prev === next) return prev
      if (prev.length === next.length && JSON.stringify(prev) === JSON.stringify(next)) {
        return prev
      }
      return next
    })
  }

  const handleIntegrationBurstsChange = (bursts: BillingBurst[]) => {
    setIntegrationBursts((prev) => {
      const next = normalizeBursts(bursts)
      if (prev === next) return prev
      if (prev.length === next.length && JSON.stringify(prev) === JSON.stringify(next)) {
        return prev
      }
      return next
    })
  }

  const handleNewspaperBurstsChange = (bursts: BillingBurst[]) => {
    setNewspaperBursts((prev) => {
      const next = normalizeBursts(bursts)
      if (prev === next) return prev
      if (prev.length === next.length && JSON.stringify(prev) === JSON.stringify(next)) {
        return prev
      }
      return next
    })
  }

  const handleMagazineBurstsChange = (bursts: BillingBurst[]) => {
    setMagazineBursts((prev) => {
      const next = normalizeBursts(bursts)
      if (prev === next) return prev
      if (prev.length === next.length && JSON.stringify(prev) === JSON.stringify(next)) {
        return prev
      }
      return next
    })
  }

  const handleOohBurstsChange = (bursts: BillingBurst[]) => {
    setOohBursts((prev) => {
      const next = normalizeBursts(bursts)
      if (prev === next) return prev
      if (prev.length === next.length && JSON.stringify(prev) === JSON.stringify(next)) {
        return prev
      }
      return next
    })
  }

  const handleProductionBurstsChange = (bursts: BillingBurst[]) => {
    setProductionBursts((prev) => {
      const next = normalizeBursts(bursts)
      if (prev === next) return prev
      if (prev.length === next.length && JSON.stringify(prev) === JSON.stringify(next)) {
        return prev
      }
      return next
    })
  }

  const handleInfluencersBurstsChange = (bursts: BillingBurst[]) => {
    setInfluencersBursts((prev) => {
      const next = normalizeBursts(bursts)
      if (prev === next) return prev
      if (prev.length === next.length && JSON.stringify(prev) === JSON.stringify(next)) {
        return prev
      }
      return next
    })
  }

  const handleDigiAudioBurstsChange = (bursts: BillingBurst[]) => {
    setDigiAudioBursts((prev) => {
      const next = normalizeBursts(bursts)
      if (prev === next) return prev
      if (prev.length === next.length && JSON.stringify(prev) === JSON.stringify(next)) {
        return prev
      }
      return next
    })
  }

  const handleDigiDisplayBurstsChange = (bursts: BillingBurst[]) => {
    setDigiDisplayBursts((prev) => {
      const next = normalizeBursts(bursts)
      if (prev === next) return prev
      if (prev.length === next.length && JSON.stringify(prev) === JSON.stringify(next)) {
        return prev
      }
      return next
    })
  }

  const handleDigiVideoBurstsChange = (bursts: BillingBurst[]) => {
    setDigiVideoBursts((prev) => {
      const next = normalizeBursts(bursts)
      if (prev === next) return prev
      if (prev.length === next.length && JSON.stringify(prev) === JSON.stringify(next)) {
        return prev
      }
      return next
    })
  }

  const handleProgDisplayBurstsChange = (bursts: BillingBurst[]) => {
    setProgDisplayBursts((prev) => {
      const next = normalizeBursts(bursts)
      if (prev === next) return prev
      if (prev.length === next.length && JSON.stringify(prev) === JSON.stringify(next)) {
        return prev
      }
      return next
    })
  }

  const handleProgVideoBurstsChange = (bursts: BillingBurst[]) => {
    setProgVideoBursts((prev) => {
      const next = normalizeBursts(bursts)
      if (prev === next) return prev
      if (prev.length === next.length && JSON.stringify(prev) === JSON.stringify(next)) {
        return prev
      }
      return next
    })
  }

  const handleProgBvodBurstsChange = (bursts: BillingBurst[]) => {
    setProgBvodBursts((prev) => {
      const next = normalizeBursts(bursts)
      if (prev === next) return prev
      if (prev.length === next.length && JSON.stringify(prev) === JSON.stringify(next)) {
        return prev
      }
      return next
    })
  }

  const handleProgOohBurstsChange = (bursts: BillingBurst[]) => {
    setProgOohBursts((prev) => {
      const next = normalizeBursts(bursts)
      if (prev === next) return prev
      if (prev.length === next.length && JSON.stringify(prev) === JSON.stringify(next)) {
        return prev
      }
      return next
    })
  }

  // --- Partial MBA Handlers ---

  function recomputePartialMBAFromLineItems(
    nextMonthYears: string[],
    nextSelectedIds: Record<string, string[]>,
    nextEnabledMedia?: Record<string, boolean>
  ): PartialMbaValues | null {
    const deliveryMonthsRaw = autoDeliveryMonths.length > 0 ? autoDeliveryMonths : billingMonths
    if (!deliveryMonthsRaw.length) return null

    const deliveryMonthsWithLineItems = attachLineItemsToMonthsForPartial(
      deepCloneBillingMonths(deliveryMonthsRaw).map(synthesizeLineItemsFromTotals),
      "delivery"
    )

    const mediaLabelByKey = Object.fromEntries(
      mediaTypes
        .filter((m) => m.name !== "mp_production")
        .map((m) => [mediaKeyMap[m.name], m.label])
    ) as Record<string, string>

    const provisionalLineItems = attachOverridesToLineInputs(
      buildEditorLineItemInputs(billingFeeSeedEnabledConfigs, {
        isPartialMBA: true,
        partialMBASelectedLineItemIds: nextSelectedIds,
      }),
      []
    )
    const start =
      campaignStart instanceof Date && !Number.isNaN(campaignStart.getTime())
        ? campaignStart
        : undefined
    const end =
      campaignEnd instanceof Date && !Number.isNaN(campaignEnd.getTime())
        ? campaignEnd
        : undefined
    const provisionalFinancials = computeCampaignFinancials(
      provisionalLineItems,
      { feeLoading: billingSaveInputs.feeLoading },
      { campaignStart: start, campaignEnd: end }
    )

    void nextEnabledMedia

    const { values, lineItemsByMedia, metadata } = recomputePartialMbaFromSelections({
      financials: provisionalFinancials,
      deliveryMonthsForLineItems: deliveryMonthsWithLineItems,
      selectedMonthYears: nextMonthYears,
      selectedLineItemIdsByMedia: nextSelectedIds,
      mediaLabelByKey,
      formatCurrency: (n) => mbaCurrencyFormatter.format(n),
    })

    setPartialMBAValues(values)
    setPartialMBALineItemsByMedia(lineItemsByMedia)
    setPartialApprovalMetadata(metadata)
    return values
  }

  function handlePartialMBAOpen() {
    if (isPartialMBA) {
      recomputePartialMBAFromLineItems(partialMBAMonthYears, partialMBASelectedLineItemIds, partialMBAMediaEnabled)
      setIsMbaBillingModalOpen(true)
      return
    }

    const deliveryMonthsRaw = autoDeliveryMonths.length > 0 ? autoDeliveryMonths : billingMonths

    const enabledMediaRows = mediaTypes
      .filter((m) => m.name !== "mp_production")
      .filter((m) => watchedMediaTypesMap[m.name] && m.component)
      .map((m) => ({ ...m, mediaKey: mediaKeyMap[m.name] }))
      .filter((m) => Boolean((m as any).mediaKey))

    const mediaKeys = enabledMediaRows.map((m) => (m as any).mediaKey as string)
    const enabledMap = Object.fromEntries(mediaKeys.map((k) => [k, true])) as Record<string, boolean>
    const monthYears = deliveryMonthsRaw.map((m) => m.monthYear)

    setPartialMBAMediaEnabled(enabledMap)
    setPartialMBAMonthYears(monthYears)

    if (!deliveryMonthsRaw.length) {
      const currentMediaTotals: Record<string, number> = {}
      enabledMediaRows.forEach((m) => {
        const mediaKey = (m as any).mediaKey as string
        currentMediaTotals[mediaKey] = campaignFinancialsMediaByKey[mediaKey] ?? 0
      })
      const t = campaignFinancials.mbaScopeTotals
      const fallback = {
        mediaTotals: currentMediaTotals,
        grossMedia: t.grossMedia,
        assembledFee: t.fee,
        adServing: t.adServing,
        production: t.production,
      }
      setPartialMBAValues(fallback)
      setPartialMBALineItemsByMedia({})
      setPartialMBASelectedLineItemIds({})
      setPartialApprovalMetadata(null)
      setOriginalPartialMBAValues(JSON.parse(JSON.stringify(fallback)))
      setIsMbaBillingModalOpen(true)
      return
    }

    const deliveryMonthsWithLineItems = attachLineItemsToMonthsForPartial(
      deepCloneBillingMonths(deliveryMonthsRaw).map(synthesizeLineItemsFromTotals),
      "delivery"
    )
    const lineItemsMap = computeLineItemTotalsFromDeliveryMonths({
      deliveryMonths: deliveryMonthsWithLineItems as BillingMonth[],
      selectedMonthYears: monthYears,
    })
    const selectedIds = Object.fromEntries(
      Object.entries(lineItemsMap).map(([mediaKey, items]) => [mediaKey, Object.keys(items)])
    ) as Record<string, string[]>
    setPartialMBASelectedLineItemIds(selectedIds)
    const initialValues = recomputePartialMBAFromLineItems(monthYears, selectedIds, enabledMap)
    if (initialValues) {
      setOriginalPartialMBAValues(JSON.parse(JSON.stringify(initialValues)))
    }
    setIsMbaBillingModalOpen(true)
  }

  function handleMbaBillingModalOpen() {
    handlePartialMBAOpen()
    setIsMbaBillingModalOpen(true)
  }

  function buildCreateManualBillingMediaTypeMap(): Record<
    string,
    { lineItems: any[]; key: string }
  > {
    return {
      mp_television: { lineItems: televisionMediaLineItems, key: "television" },
      mp_radio: { lineItems: radioMediaLineItems, key: "radio" },
      mp_newspaper: { lineItems: newspaperMediaLineItems, key: "newspaper" },
      mp_magazines: { lineItems: magazineMediaLineItems, key: "magazines" },
      mp_ooh: { lineItems: oohMediaLineItems, key: "ooh" },
      mp_cinema: { lineItems: cinemaMediaLineItems, key: "cinema" },
      mp_digidisplay: { lineItems: digiDisplayMediaLineItems, key: "digiDisplay" },
      mp_digiaudio: { lineItems: digiAudioMediaLineItems, key: "digiAudio" },
      mp_digivideo: { lineItems: digiVideoMediaLineItems, key: "digiVideo" },
      mp_bvod: { lineItems: bvodMediaLineItems, key: "bvod" },
      mp_search: { lineItems: searchMediaLineItems, key: "search" },
      mp_socialmedia: { lineItems: socialMediaMediaLineItems, key: "socialMedia" },
      mp_progdisplay: { lineItems: progDisplayMediaLineItems, key: "progDisplay" },
      mp_progvideo: { lineItems: progVideoMediaLineItems, key: "progVideo" },
      mp_progbvod: { lineItems: progBvodMediaLineItems, key: "progBvod" },
      mp_progaudio: { lineItems: progAudioMediaLineItems, key: "progAudio" },
      mp_progooh: { lineItems: progOohMediaLineItems, key: "progOoh" },
      mp_influencers: { lineItems: influencersMediaLineItems, key: "influencers" },
      mp_integration: { lineItems: integrationMediaLineItems, key: "integration" },
    }
  }

  function attachLineItemsForManualBillingEditor(months: BillingMonth[]): {
    months: BillingMonth[]
    allLineItems: Record<string, BillingLineItem[]>
  } {
    const deepCopiedMonths = deepCloneBillingMonths(months)
    const mediaTypeMap = buildCreateManualBillingMediaTypeMap()
    const allLineItems: Record<string, BillingLineItem[]> = {}
    const parseMoney = (v: any) => parseFloat(String(v ?? "").replace(/[^0-9.-]/g, "")) || 0
    const calculateExpectedLineItemFeeTotal = (sourceLineItem: any): number => {
      const bursts = resolveLineItemBursts(sourceLineItem)
      return bursts.reduce((sum: number, burst: any) => {
        const budget = parseMoney(burst?.budget) || parseMoney(burst?.buyAmount)
        const feePctRaw =
          burst?.feePercentage ??
          burst?.fee_percentage ??
          sourceLineItem?.feePercentage ??
          sourceLineItem?.fee_percentage
        const feePct = Number.isFinite(Number(feePctRaw))
          ? Math.max(0, Math.min(100, Number(feePctRaw)))
          : 0
        const budgetIncludesFees = Boolean(
          burst?.budgetIncludesFees ??
            burst?.budget_includes_fees ??
            sourceLineItem?.budgetIncludesFees ??
            sourceLineItem?.budget_includes_fees
        )
        const clientPaysForMedia = Boolean(
          burst?.clientPaysForMedia ??
            burst?.client_pays_for_media ??
            sourceLineItem?.clientPaysForMedia ??
            sourceLineItem?.client_pays_for_media
        )
        if (budget <= 0 || feePct <= 0) return sum
        if (budgetIncludesFees) return sum + (budget * feePct) / 100
        if (feePct >= 100) return sum
        return (
          sum +
          (clientPaysForMedia
            ? (budget / (100 - feePct)) * feePct
            : (budget * feePct) / (100 - feePct))
        )
      }, 0)
    }

    manualBillingAutoLineItemSnapshotRef.current = {}
    Object.entries(mediaTypeMap).forEach(([mediaTypeKey, { lineItems, key }]) => {
      if (watchedMediaTypesMap[mediaTypeKey] && lineItems?.length) {
        const billingLineItems = generateBillingLineItems(
          lineItems,
          key,
          deepCopiedMonths,
          "billing"
        ).map((bli, index) => {
          const source = lineItems[index]
          const stableId = editorBillingStableLineItemId(key, source, index)
          return { ...bli, id: stableId }
        })
        if (billingLineItems.length > 0) {
          allLineItems[key] = billingLineItems
          billingLineItems.forEach((billingLineItem, index) => {
            const sourceLineItem = lineItems[index]
            const feeTotal = sourceLineItem
              ? calculateExpectedLineItemFeeTotal(sourceLineItem)
              : 0
            const snapshotKey = `${key}::${billingLineItem.id}`
            manualBillingAutoLineItemSnapshotRef.current[snapshotKey] = {
              mediaKey: key,
              lineItemId: billingLineItem.id,
              header1: billingLineItem.header1,
              header2: billingLineItem.header2,
              monthlyAmounts: { ...billingLineItem.monthlyAmounts },
              mediaTotal: billingLineItem.totalAmount || 0,
              feeTotal,
            }
          })
        }
      }
    })

    const currencyFormatter = new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency: "AUD",
    })
    deepCopiedMonths.forEach((month) => {
      if (!month.lineItems) month.lineItems = {}
      if (!month.mediaCosts) {
        month.mediaCosts = {
          search: currencyFormatter.format(0),
          socialMedia: currencyFormatter.format(0),
          television: currencyFormatter.format(0),
          radio: currencyFormatter.format(0),
          newspaper: currencyFormatter.format(0),
          magazines: currencyFormatter.format(0),
          ooh: currencyFormatter.format(0),
          cinema: currencyFormatter.format(0),
          digiDisplay: currencyFormatter.format(0),
          digiAudio: currencyFormatter.format(0),
          digiVideo: currencyFormatter.format(0),
          bvod: currencyFormatter.format(0),
          integration: currencyFormatter.format(0),
          progDisplay: currencyFormatter.format(0),
          progVideo: currencyFormatter.format(0),
          progBvod: currencyFormatter.format(0),
          progAudio: currencyFormatter.format(0),
          progOoh: currencyFormatter.format(0),
          influencers: currencyFormatter.format(0),
          production: currencyFormatter.format(0),
        }
      }
      if (month.production === undefined) {
        month.production = currencyFormatter.format(0)
      }
      Object.entries(allLineItems).forEach(([key, lineItems]) => {
        month.lineItems![key as keyof typeof month.lineItems] = lineItems
      })
    })

    return { months: deepCopiedMonths, allLineItems }
  }

  function handleManualBillingOpen() {
    // Re-open pending draft without wiping applied local months
    if (hasPendingManualBilling && manualBillingMonths.length > 0) {
      const sections = buildManualBillingMediaSections(
        mediaTypes,
        watchedMediaTypesMap,
        mediaKeyMap,
        manualBillingMonths
      )
      setManualBillingAccordionExpanded(defaultManualBillingAccordionExpanded(sections))
      setIsManualBillingModalOpen(true)
      return
    }

    const sourceMonths =
      campaignFinancials.billingSchedule.length > 0
        ? campaignFinancials.billingSchedule
        : billingMonths.length > 0
          ? billingMonths
          : autoBillingMonths

    if (!sourceMonths.length) {
      toast({
        variant: "destructive",
        title: "No billing schedule",
        description: "Set campaign dates and media bursts before editing billing timing.",
      })
      return
    }

    const { months: deepCopiedMonths } = attachLineItemsForManualBillingEditor(sourceMonths)
    // Auto reference for media-sum gate / persist — same attach, separate clone
    const autoRef = deepCloneBillingMonths(deepCopiedMonths)
    manualBillingAutoReferenceMonthsRef.current = autoRef
    setManualBillingAutoReferenceMonths(autoRef)
    manualBillingOverrideMetaRef.current = new Map()

    const formatter = mbaCurrencyFormatter
    const grandTotal = deepCopiedMonths.reduce(
      (acc, m) =>
        acc + (parseFloat(String(m.totalAmount || "$0").replace(/[^0-9.-]/g, "")) || 0),
      0
    )

    setManualBillingMonths(deepCopiedMonths)
    setManualBillingTotal(formatter.format(grandTotal))
    setManualBillingCostPreBill({ fee: false, adServing: false, production: false })
    manualBillingCostPreBillSnapshotRef.current = {}
    const sections = buildManualBillingMediaSections(
      mediaTypes,
      watchedMediaTypesMap,
      mediaKeyMap,
      deepCopiedMonths
    )
    setManualBillingAccordionExpanded(defaultManualBillingAccordionExpanded(sections))
    setBillingError({ show: false, messages: [] })
    setIsManualBillingModalOpen(true)
  }

  function handleManualBillingChange(
    index: number,
    type: "media" | "fee" | "adServing" | "production" | "lineItem",
    rawValue: string,
    mediaKey?: string,
    lineItemId?: string,
    monthYear?: string
  ) {
    const copy = [...manualBillingMonths]
    const numericValue = parseFloat(rawValue.replace(/[^0-9.-]/g, "")) || 0
    const formatter = mbaCurrencyFormatter
    const formattedValue = formatter.format(numericValue)
    let lineItemValueChanged = false

    if (type === "lineItem" && mediaKey && lineItemId && monthYear) {
      const monthIndex = copy.findIndex((m) => m.monthYear === monthYear)
      if (monthIndex >= 0) {
        const liKeyForPrev = mediaKey as keyof NonNullable<BillingMonth["lineItems"]>
        const prevAmount =
          copy
            .map((m) =>
              (m.lineItems?.[liKeyForPrev] as BillingLineItem[] | undefined)?.find(
                (li) => li.id === lineItemId
              )?.monthlyAmounts?.[monthYear]
            )
            .find((v) => typeof v === "number") ?? 0
        if (prevAmount !== numericValue) lineItemValueChanged = true
        syncLineItemMonthlyAmountAcrossAllMonthRows(
          copy,
          mediaKey,
          lineItemId,
          monthYear,
          numericValue
        )
        const liKey = mediaKey as keyof NonNullable<BillingMonth["lineItems"]>
        const lineItemsForTotals =
          (copy[0]?.lineItems?.[liKey] as BillingLineItem[] | undefined) ??
          copy
            .map((m) => m.lineItems?.[liKey] as BillingLineItem[] | undefined)
            .find((a) => a && a.length > 0)
        if (lineItemsForTotals?.length) {
          const mediaTypeTotal = lineItemsForTotals.reduce(
            (sum, li) => sum + (li.monthlyAmounts[monthYear] || 0),
            0
          )
          const mediaCosts = copy[monthIndex].mediaCosts
          if (mediaCosts) {
            ;(mediaCosts as Record<string, string>)[mediaKey] = formatter.format(mediaTypeTotal)
          }
        }
      }
    }

    if (type === "media" && mediaKey && copy[index].mediaCosts?.hasOwnProperty(mediaKey)) {
      ;(copy[index].mediaCosts as Record<string, string>)[mediaKey] = formattedValue
      if (mediaKey === "production") {
        copy[index].production = formattedValue
      }
    } else if (type === "fee") {
      copy[index].feeTotal = formattedValue
    } else if (type === "adServing") {
      copy[index].adservingTechFees = formattedValue
    } else if (type === "production") {
      copy[index].production = formattedValue
      if (copy[index].mediaCosts?.hasOwnProperty("production")) {
        copy[index].mediaCosts.production = formattedValue
      }
    }

    const mediaTotal = Object.entries(copy[index].mediaCosts || {}).reduce(
      (sum, [key, current]) => {
        if (key === "production") return sum
        return sum + (parseFloat(String(current).replace(/[^0-9.-]/g, "")) || 0)
      },
      0
    )
    const feeTotal = parseFloat(String(copy[index].feeTotal || "$0").replace(/[^0-9.-]/g, "")) || 0
    const adServingTotal =
      parseFloat(String(copy[index].adservingTechFees || "$0").replace(/[^0-9.-]/g, "")) || 0
    const productionTotal =
      parseFloat(String(copy[index].production || "$0").replace(/[^0-9.-]/g, "")) || 0

    copy[index].mediaTotal = formatter.format(mediaTotal)
    copy[index].totalAmount = formatter.format(
      mediaTotal + feeTotal + adServingTotal + productionTotal
    )

    const grandTotal = copy.reduce(
      (acc, m) =>
        acc + (parseFloat(String(m.totalAmount || "$0").replace(/[^0-9.-]/g, "")) || 0),
      0
    )

    const nextMonths =
      type === "lineItem" && lineItemId && lineItemValueChanged
        ? applyBillingLineMode(copy, lineItemId, "manual")
        : copy
    setManualBillingTotal(formatter.format(grandTotal))
    setManualBillingMonths(nextMonths)
  }

  const manualBillingMediaSections = useMemo(
    () =>
      buildManualBillingMediaSections(
        mediaTypes,
        watchedMediaTypesMap,
        mediaKeyMap,
        manualBillingMonths
      ),
    [mediaTypes, watchedMediaTypesMap, manualBillingMonths]
  )

  const setManualBillingLineMode = useCallback((lineItemId: string, mode: BillingLineMode) => {
    setManualBillingMonths((current) => applyBillingLineMode(current, lineItemId, mode))
  }, [])

  const manualBillingSpreadsheetCallbacks = useManualBillingSpreadsheetCallbacks({
    manualBillingMonths,
    setManualBillingMonths,
    handleManualBillingChange,
    setLineBillingMode: setManualBillingLineMode,
  })

  const recalculateManualBillingTotals = (months: BillingMonth[], formatter: Intl.NumberFormat) => {
    months.forEach((m) => {
      const mediaTotalNumber = Object.entries(m.mediaCosts || {}).reduce((sum, [key, current]) => {
        if (key === "production") return sum
        return sum + (parseFloat(String(current).replace(/[^0-9.-]/g, "")) || 0)
      }, 0)
      const feeTotal = parseFloat(String(m.feeTotal || "$0").replace(/[^0-9.-]/g, "")) || 0
      const adServingTotal =
        parseFloat(String(m.adservingTechFees || "$0").replace(/[^0-9.-]/g, "")) || 0
      const productionTotal =
        parseFloat(String(m.production || "$0").replace(/[^0-9.-]/g, "")) || 0
      m.mediaTotal = formatter.format(mediaTotalNumber)
      m.totalAmount = formatter.format(
        mediaTotalNumber + feeTotal + adServingTotal + productionTotal
      )
    })
    return months.reduce(
      (acc, m) =>
        acc + (parseFloat(String(m.totalAmount || "$0").replace(/[^0-9.-]/g, "")) || 0),
      0
    )
  }

  function handleManualBillingLineItemPreBillToggle(
    mediaKey: string,
    lineItemId: string,
    nextChecked: boolean
  ) {
    const copy = [...manualBillingMonths]
    if (copy.length === 0) return
    const formatter = mbaCurrencyFormatter
    const monthYears = copy.map((m) => m.monthYear)
    const firstMonthLineItems = copy[0]?.lineItems?.[mediaKey as keyof NonNullable<BillingMonth["lineItems"]>] as
      | BillingLineItem[]
      | undefined
    if (!firstMonthLineItems) return
    const firstLineItem = firstMonthLineItems.find((li) => li.id === lineItemId)
    if (!firstLineItem) return

    const desired: Record<string, number> = {}
    if (nextChecked) {
      const total = monthYears.reduce(
        (sum, my) => sum + (firstLineItem.monthlyAmounts?.[my] || 0),
        0
      )
      monthYears.forEach((my, idx) => {
        desired[my] = idx === 0 ? total : 0
      })
    } else if (firstLineItem.preBillSnapshot) {
      monthYears.forEach((my) => {
        desired[my] = firstLineItem.preBillSnapshot?.[my] || 0
      })
    } else {
      return
    }

    copy.forEach((month) => {
      const monthLineItems = month?.lineItems?.[mediaKey as keyof typeof month.lineItems] as
        | BillingLineItem[]
        | undefined
      if (!monthLineItems) return
      const li = monthLineItems.find((x) => x.id === lineItemId)
      if (!li) return
      if (nextChecked) {
        li.preBillSnapshot = li.preBillSnapshot ?? { ...li.monthlyAmounts }
      }
      monthYears.forEach((my) => {
        li.monthlyAmounts[my] = desired[my] || 0
      })
      li.totalAmount = monthYears.reduce((sum, my) => sum + (li.monthlyAmounts?.[my] || 0), 0)
      li.preBill = nextChecked
    })

    copy.forEach((month) => {
      const monthLineItems = month?.lineItems?.[mediaKey as keyof typeof month.lineItems] as
        | BillingLineItem[]
        | undefined
      if (!monthLineItems) return
      const mediaTypeTotal = monthLineItems.reduce(
        (sum, li) => sum + (li.monthlyAmounts?.[month.monthYear] || 0),
        0
      )
      ;(month.mediaCosts as Record<string, string>)[mediaKey] = formatter.format(mediaTypeTotal)
    })

    const next = applyBillingLineMode(copy, lineItemId, "manual")
    const grandTotalNumber = recalculateManualBillingTotals(next, formatter)
    setManualBillingTotal(formatter.format(grandTotalNumber))
    setManualBillingMonths(next)
  }

  function handleManualBillingLineItemResetToAuto(mediaKey: string, lineItemId: string) {
    const copy = [...manualBillingMonths]
    if (copy.length === 0) return
    const snapshot = manualBillingAutoLineItemSnapshotRef.current[`${mediaKey}::${lineItemId}`]
    if (!snapshot) return

    copy.forEach((month) => {
      const monthLineItems = month?.lineItems?.[mediaKey as keyof typeof month.lineItems] as
        | BillingLineItem[]
        | undefined
      if (!monthLineItems) return
      const li = monthLineItems.find((x) => x.id === lineItemId)
      if (!li) return
      li.monthlyAmounts = { ...snapshot.monthlyAmounts }
      li.totalAmount = Object.values(li.monthlyAmounts).reduce((sum, v) => sum + (v || 0), 0)
      li.preBill = false
      li.preBillSnapshot = undefined
    })

    const formatter = mbaCurrencyFormatter
    copy.forEach((month) => {
      const monthLineItems = month?.lineItems?.[mediaKey as keyof typeof month.lineItems] as
        | BillingLineItem[]
        | undefined
      if (!monthLineItems) return
      const mediaTypeTotal = monthLineItems.reduce(
        (sum, li) => sum + (li.monthlyAmounts?.[month.monthYear] || 0),
        0
      )
      ;(month.mediaCosts as Record<string, string>)[mediaKey] = formatter.format(mediaTypeTotal)
    })

    const next = applyBillingLineMode(copy, lineItemId, "auto")
    const grandTotalNumber = recalculateManualBillingTotals(next, formatter)
    setManualBillingTotal(formatter.format(grandTotalNumber))
    setManualBillingMonths(next)
  }

  function handleManualBillingCostPreBillToggle(
    costKey: "fee" | "adServing" | "production",
    nextChecked: boolean
  ) {
    const copy = [...manualBillingMonths]
    if (copy.length === 0) return
    const formatter = mbaCurrencyFormatter
    const getValue = (m: BillingMonth) => {
      if (costKey === "fee") return m.feeTotal || "$0.00"
      if (costKey === "adServing") return m.adservingTechFees || "$0.00"
      return m.production || "$0.00"
    }
    const setValue = (m: BillingMonth, v: string) => {
      if (costKey === "fee") m.feeTotal = v
      else if (costKey === "adServing") m.adservingTechFees = v
      else {
        m.production = v
        if (m.mediaCosts?.production !== undefined) {
          m.mediaCosts.production = v
        }
      }
    }
    if (nextChecked) {
      manualBillingCostPreBillSnapshotRef.current[costKey] = copy.map((m) => getValue(m))
      const total = copy.reduce(
        (acc, m) => acc + (parseFloat(getValue(m).replace(/[^0-9.-]/g, "")) || 0),
        0
      )
      copy.forEach((m, idx) => setValue(m, formatter.format(idx === 0 ? total : 0)))
    } else {
      const snapshot = manualBillingCostPreBillSnapshotRef.current[costKey]
      if (snapshot && snapshot.length === copy.length) {
        copy.forEach((m, idx) => setValue(m, snapshot[idx] ?? formatter.format(0)))
      }
      manualBillingCostPreBillSnapshotRef.current[costKey] = undefined
    }
    const grandTotalNumber = recalculateManualBillingTotals(copy, formatter)
    setManualBillingTotal(formatter.format(grandTotalNumber))
    setManualBillingMonths(copy)
    setManualBillingCostPreBill((prev) => ({ ...prev, [costKey]: nextChecked }))
  }

  /** Apply locally only — persist waits until first save has version.id. */
  function handleManualBillingApply() {
    const autoMonths =
      manualBillingAutoReferenceMonthsRef.current.length > 0
        ? manualBillingAutoReferenceMonthsRef.current
        : attachLineItemsForManualBillingEditor(
            campaignFinancials.billingSchedule.length > 0
              ? campaignFinancials.billingSchedule
              : billingMonths
          ).months

    const mismatchMessages: string[] = []
    const manualIds = listManualOverrideLineIds(manualBillingMonths)
    for (const billingRowId of manualIds.media) {
      const monthsIso = extractOverrideMonthsFromSchedule(
        manualBillingMonths,
        billingRowId,
        "media"
      )
      const expected = sumLineMediaAcrossMonths(autoMonths, billingRowId)
      const gate = validateManualMediaMonthsSum(monthsIso, expected)
      if (!gate.ok) {
        mismatchMessages.push(
          `${toBillingOverrideLineItemId(billingRowId)}: ${gate.message}`
        )
      }
    }

    if (mismatchMessages.length > 0) {
      setBillingError({ show: true, messages: mismatchMessages })
      return
    }

    // Snapshot auto reference at apply so save persist uses the same basis
    const autoSnap = deepCloneBillingMonths(autoMonths)
    manualBillingAutoReferenceMonthsRef.current = autoSnap
    setManualBillingAutoReferenceMonths(autoSnap)
    setHasPendingManualBilling(true)
    setIsManualBilling(true)
    setIsManualBillingModalOpen(false)
    setBillingError({ show: false, messages: [] })
    toast({
      title: "Manual billing applied",
      description:
        "Timing kept locally. Overrides will be saved when you save the campaign (after version id).",
    })
  }

  function handleMbaBillingToggleLine(lineItemId: string, mediaType: string, approved: boolean) {
    const existing = new Set(partialMBASelectedLineItemIds[mediaType] || [])
    if (approved) existing.add(lineItemId)
    else existing.delete(lineItemId)
    const nextSelected = { ...partialMBASelectedLineItemIds, [mediaType]: Array.from(existing) }
    // If we had an empty map (all-in / not partial yet), seed all other media from current approved lines.
    if (!isPartialMBA && Object.keys(partialMBASelectedLineItemIds).length === 0) {
      for (const line of campaignFinancials.perLine) {
        if (line.mediaType === mediaType) continue
        if (!nextSelected[line.mediaType]) nextSelected[line.mediaType] = []
        if (!nextSelected[line.mediaType].includes(line.lineItemId)) {
          nextSelected[line.mediaType].push(line.lineItemId)
        }
      }
      if (!approved) {
        nextSelected[mediaType] = Array.from(existing)
      }
    }
    setPartialMBASelectedLineItemIds(nextSelected)
    const nextEnabled = { ...partialMBAMediaEnabled, [mediaType]: (nextSelected[mediaType]?.length ?? 0) > 0 }
    setPartialMBAMediaEnabled(nextEnabled)
    setIsPartialMBA(true)
    const months =
      partialMBAMonthYears.length > 0
        ? partialMBAMonthYears
        : (autoDeliveryMonths.length > 0 ? autoDeliveryMonths : billingMonths).map((m) => m.monthYear)
    if (months.length && partialMBAMonthYears.length === 0) setPartialMBAMonthYears(months)
    recomputePartialMBAFromLineItems(months, nextSelected, nextEnabled)
  }

  function handleMbaBillingResetApprovalsToAllIn() {
    handlePartialMBAReset()
    setIsPartialMBA(false)
  }

  function handlePartialMBASave() {
    const campaignBudget = form.getValues("mp_campaignbudget") || 0;
    const { grossMedia, assembledFee, adServing, production } = partialMBAValues;
    const newTotalInvestment = grossMedia + assembledFee + adServing + production;

    // Warn-only if outside $2.00 tolerance (still allow saving)
    const diff = newTotalInvestment - campaignBudget
    if (campaignBudget > 0 && Math.abs(diff) > 2) {
      toast({
        title: "Saved with budget mismatch",
        description: `Total differs from Campaign Budget by ${mbaCurrencyFormatter.format(Math.abs(diff))} (${diff > 0 ? "over" : "under"}).`,
      })
    }

    setIsPartialMBA(true);
    if (partialApprovalMetadata) {
      setPartialApprovalMetadata({
        ...partialApprovalMetadata,
        totals: {
          grossMedia: mbaCurrencyFormatter.format(grossMedia),
          assembledFee: mbaCurrencyFormatter.format(assembledFee),
          adServing: mbaCurrencyFormatter.format(adServing),
          production: mbaCurrencyFormatter.format(production),
          totalInvestment: mbaCurrencyFormatter.format(newTotalInvestment),
        },
        updatedAt: new Date().toISOString(),
      })
    }
    toast({ title: "Success", description: "Partial MBA details have been saved." });
  }

  function handlePartialMBAReset() {
    const deliveryMonthsRaw = autoDeliveryMonths.length > 0 ? autoDeliveryMonths : billingMonths

    const enabledMediaRows = mediaTypes
      .filter((m) => m.name !== "mp_production")
      .filter((m) => watchedMediaTypesMap[m.name] && m.component)
      .map((m) => ({ ...m, mediaKey: mediaKeyMap[m.name] }))
      .filter((m) => Boolean((m as any).mediaKey))

    const mediaKeys = enabledMediaRows.map((m) => (m as any).mediaKey as string)
    const enabledMap = Object.fromEntries(mediaKeys.map((k) => [k, true])) as Record<string, boolean>
    const monthYears = deliveryMonthsRaw.map((m) => m.monthYear)

    setPartialMBAMediaEnabled(enabledMap)
    setPartialMBAMonthYears(monthYears)

    if (!deliveryMonthsRaw.length) {
      const computed = JSON.parse(JSON.stringify(originalPartialMBAValues))
      setPartialMBAValues(computed)
      setPartialMBALineItemsByMedia({})
      setPartialMBASelectedLineItemIds({})
      setPartialApprovalMetadata(null)
      toast({ title: "Reset", description: "Values restored from snapshot." })
      return
    }

    const deliveryMonthsWithLineItems = attachLineItemsToMonthsForPartial(
      deepCloneBillingMonths(deliveryMonthsRaw).map(synthesizeLineItemsFromTotals),
      "delivery"
    )
    const lineItemsMap = computeLineItemTotalsFromDeliveryMonths({
      deliveryMonths: deliveryMonthsWithLineItems as BillingMonth[],
      selectedMonthYears: monthYears,
    })
    const selectedIds = Object.fromEntries(
      Object.entries(lineItemsMap).map(([mediaKey, items]) => [mediaKey, Object.keys(items)])
    ) as Record<string, string[]>
    setPartialMBASelectedLineItemIds(selectedIds)
    const v = recomputePartialMBAFromLineItems(monthYears, selectedIds, enabledMap)
    if (v) setOriginalPartialMBAValues(JSON.parse(JSON.stringify(v)))
    toast({ title: "Reset", description: "Values have been recalculated from delivery months." })
  }

  // Build synthetic line items from month totals to capture auto allocation detail
  function synthesizeLineItemsFromTotals(month: BillingMonth): BillingMonth {
    const parseAmount = (value: string | number | undefined) =>
      typeof value === 'number'
        ? value
        : parseFloat(String(value || '').replace(/[^0-9.-]/g, '')) || 0;

    const mediaCosts = month.mediaCosts || {};
    const entries = Object.entries(mediaCosts) as [string, string | number][];
    const lineItems: Record<string, BillingLineItem[]> = {};

    entries.forEach(([mediaKey, rawVal]) => {
      const amount = parseAmount(rawVal);
      if (amount > 0) {
        lineItems[mediaKey] = [
          {
            id: `auto-${mediaKey}-${month.monthYear}`,
            header1: 'Auto',
            header2: 'Auto allocation',
            monthlyAmounts: { [month.monthYear]: amount },
            totalAmount: amount,
          },
        ];
      }
    });

    // If no media-specific costs, but totals exist, create a generic line item
    if (Object.keys(lineItems).length === 0) {
      const total = parseAmount(month.totalAmount);
      if (total > 0) {
        lineItems['search'] = [
          {
            id: `auto-total-${month.monthYear}`,
            header1: 'Auto',
            header2: 'Total',
            monthlyAmounts: { [month.monthYear]: total },
            totalAmount: total,
          },
        ];
      }
    }

    // Merge as a TRUE fallback: never overwrite existing non-empty line items.
    const merged: Record<string, BillingLineItem[]> = { ...(month.lineItems || {}) };
    Object.entries(lineItems).forEach(([key, items]) => {
      const existing = (merged as any)[key] as BillingLineItem[] | undefined;
      if (!existing || existing.length === 0) {
        (merged as any)[key] = items;
      }
    });

    return { ...month, lineItems: merged };
  }
  /** Same line-item attachment as save payload — used so Partial MBA modal has real line items, not empty months. */
  function attachLineItemsToMonthsForPartial(
    months: BillingMonth[],
    mode: "billing" | "delivery"
  ): BillingMonth[] {
    const fv = form.getValues()
    let monthsWithLineItems = (months || []).map((month) => ({
      ...month,
      lineItems: month.lineItems || {},
    }))

    if (monthsWithLineItems.length === 0) {
      return []
    }

    const isAutoLineItems = (items: any): boolean => {
      if (!Array.isArray(items) || items.length === 0) return false
      return items.every((li) => String(li?.header1 || "").trim() === "Auto")
    }

    const shouldReplace = (existing: any): boolean => {
      if (!existing) return true
      if (Array.isArray(existing) && existing.length === 0) return true
      if (isAutoLineItems(existing)) return true
      return false
    }

    const mediaTypeMap: Record<string, { lineItems: any[]; key: string }> = {
      mp_television: { lineItems: televisionMediaLineItems, key: "television" },
      mp_radio: { lineItems: radioMediaLineItems, key: "radio" },
      mp_newspaper: { lineItems: newspaperMediaLineItems, key: "newspaper" },
      mp_magazines: { lineItems: magazineMediaLineItems, key: "magazines" },
      mp_ooh: { lineItems: oohMediaLineItems, key: "ooh" },
      mp_cinema: { lineItems: cinemaMediaLineItems, key: "cinema" },
      mp_digidisplay: { lineItems: digiDisplayMediaLineItems, key: "digiDisplay" },
      mp_digiaudio: { lineItems: digiAudioMediaLineItems, key: "digiAudio" },
      mp_digivideo: { lineItems: digiVideoMediaLineItems, key: "digiVideo" },
      mp_bvod: { lineItems: bvodMediaLineItems, key: "bvod" },
      mp_integration: { lineItems: integrationMediaLineItems, key: "integration" },
      mp_search: { lineItems: searchMediaLineItems, key: "search" },
      mp_socialmedia: { lineItems: socialMediaMediaLineItems, key: "socialMedia" },
      mp_progdisplay: { lineItems: progDisplayMediaLineItems, key: "progDisplay" },
      mp_progvideo: { lineItems: progVideoMediaLineItems, key: "progVideo" },
      mp_progbvod: { lineItems: progBvodMediaLineItems, key: "progBvod" },
      mp_progaudio: { lineItems: progAudioMediaLineItems, key: "progAudio" },
      mp_progooh: { lineItems: progOohMediaLineItems, key: "progOoh" },
      mp_influencers: { lineItems: influencersMediaLineItems, key: "influencers" },
      mp_production: { lineItems: productionMediaLineItems, key: "production" },
    }

    const allLineItems: Record<string, BillingLineItem[]> = {}
    Object.entries(mediaTypeMap).forEach(([mediaTypeKey, { lineItems, key }]) => {
      if (fv[mediaTypeKey as keyof typeof fv] && lineItems && lineItems.length > 0) {
        const billingLineItems = generateBillingLineItems(lineItems, key, monthsWithLineItems, mode)
        if (billingLineItems.length > 0) {
          allLineItems[key] = billingLineItems
        }
      }
    })

    monthsWithLineItems = monthsWithLineItems.map((month) => {
      const monthCopy = { ...month, lineItems: month.lineItems || {} }
      Object.entries(allLineItems).forEach(([key, lineItems]) => {
        const existing = (monthCopy.lineItems as any)[key]
        if (shouldReplace(existing)) {
          ;(monthCopy.lineItems as any)[key] = lineItems
        }
      })
      return monthCopy
    })

    return monthsWithLineItems.map(synthesizeLineItemsFromTotals)
  }

  async function handleDownloadBillingScheduleExcel() {
    if (!billingMonths.length) {
      toast({
        title: "Nothing to export",
        description: "Select campaign dates to generate a billing schedule.",
        variant: "destructive",
      })
      return
    }
    try {
      let monthsForExport = billingMonths
      if (!billingMonthsHaveDetailedLineItems(billingMonths)) {
        const fv = form.getValues()
        const mediaTypeMap = {
          mp_television: { lineItems: televisionMediaLineItems, key: "television" },
          mp_radio: { lineItems: radioMediaLineItems, key: "radio" },
          mp_newspaper: { lineItems: newspaperMediaLineItems, key: "newspaper" },
          mp_magazines: { lineItems: magazineMediaLineItems, key: "magazines" },
          mp_ooh: { lineItems: oohMediaLineItems, key: "ooh" },
          mp_cinema: { lineItems: cinemaMediaLineItems, key: "cinema" },
          mp_digidisplay: { lineItems: digiDisplayMediaLineItems, key: "digiDisplay" },
          mp_digiaudio: { lineItems: digiAudioMediaLineItems, key: "digiAudio" },
          mp_digivideo: { lineItems: digiVideoMediaLineItems, key: "digiVideo" },
          mp_bvod: { lineItems: bvodMediaLineItems, key: "bvod" },
          mp_search: { lineItems: searchMediaLineItems, key: "search" },
          mp_socialmedia: { lineItems: socialMediaMediaLineItems, key: "socialMedia" },
          mp_progdisplay: { lineItems: progDisplayMediaLineItems, key: "progDisplay" },
          mp_progvideo: { lineItems: progVideoMediaLineItems, key: "progVideo" },
          mp_progbvod: { lineItems: progBvodMediaLineItems, key: "progBvod" },
          mp_progaudio: { lineItems: progAudioMediaLineItems, key: "progAudio" },
          mp_progooh: { lineItems: progOohMediaLineItems, key: "progOoh" },
          mp_influencers: { lineItems: influencersMediaLineItems, key: "influencers" },
          mp_integration: { lineItems: integrationMediaLineItems, key: "integration" },
        }
        monthsForExport = prepareBillingMonthsForLineItemExport(
          billingMonths,
          mediaTypeMap,
          (mpKey) => Boolean(fv[mpKey as keyof typeof fv])
        )
      }
      const fv = form.getValues()
      const start = fv.mp_campaigndates_start
      const end = fv.mp_campaigndates_end
      const blob = await buildBillingScheduleExcelBlob(monthsForExport, {
        client: fv.mp_client_name || "",
        brand: fv.mp_brand || "",
        campaignName: fv.mp_campaignname || "",
        mbaNumber: fv.mba_number || "",
        planVersion: fv.mp_plannumber || "",
        campaignStartLabel: start ? format(start, "dd/MM/yyyy") : "",
        campaignEndLabel: end ? format(end, "dd/MM/yyyy") : "",
      })
      const stem = `BillingSchedule_${sanitizeFilenamePart(fv.mp_client_name)}_${sanitizeFilenamePart(fv.mba_number || "Draft")}_${format(new Date(), "yyyyMMdd")}`
      saveAs(blob, `${stem}.xlsx`)
      toast({ title: "Downloaded", description: "Billing schedule Excel export is ready." })
    } catch (e: any) {
      toast({
        title: "Export failed",
        description: e?.message || "Could not generate Excel file.",
        variant: "destructive",
      })
    }
  }

  const [mediaPlanId, setMediaPlanId] = useState<number | null>(null)
  /** Keeps latest master id for synchronous guards (double-submit) */
  const mediaPlanIdRef = useRef<number | null>(null)
  const saveAllInFlightRef = useRef(false)
  const [isPlanSaving, setIsPlanSaving] = useState<boolean>(false)
  const [isVersionSaving, setIsVersionSaving] = useState<boolean>(false)
  const [mediaPlanVersionId, setMediaPlanVersionId] = useState<number | null>(null)
  const shouldBlockNavigation = hasUnsavedChanges && !isPlanSaving && !isVersionSaving && !isLoading
  const { isOpen: isUnsavedPromptOpen, confirmNavigation, stayOnPage, requestNavigation } = useUnsavedChangesPrompt(shouldBlockNavigation)
  const isSavingInProgress = isPlanSaving || isVersionSaving;
  const hasSaveErrors = saveStatus.some(item => item.status === 'error');
  const shouldShowSaveModal = isSaveModalOpen && (isSavingInProgress || hasSaveErrors || saveStatus.length > 0);

  useEffect(() => {
    if (!isSavingInProgress && isSaveModalOpen && saveStatus.length > 0 && !hasSaveErrors) {
      setIsSaveModalOpen(false);
      setSaveStatus([]);
    }
  }, [hasSaveErrors, isSaveModalOpen, isSavingInProgress, saveStatus]);

  const handleCloseSaveModal = useCallback(() => {
    if (isSavingInProgress) return;
    setIsSaveModalOpen(false);
    setSaveStatus([]);
  }, [isSavingInProgress]);

  const handleSaveMediaPlan = async () => {
    const existingId = mediaPlanIdRef.current
    if (existingId != null) {
      setIsSaveModalOpen(true)
      setSaveStatus((prev) => {
        const has = prev.some((item) => item.name === "Media Plan Master")
        if (!has) {
          return [...prev, { name: "Media Plan Master", status: "success" as const }]
        }
        return prev.map((item) =>
          item.name === "Media Plan Master" ? { ...item, status: "success" as const } : item
        )
      })
      return existingId
    }

    setIsSaveModalOpen(true);
    setIsPlanSaving(true)
    // Update status for Media Plan Master
    setSaveStatus(prev => {
      const existing = prev.find(item => item.name === 'Media Plan Master')
      if (!existing) {
        return [...prev, { name: 'Media Plan Master', status: 'pending' }]
      }
      return prev.map(item => 
        item.name === 'Media Plan Master' 
          ? { ...item, status: 'pending' as const }
          : item
      )
    })
    
    try {
      const { 
        mp_client_name, 
        mba_number, 
        mp_campaignname,
        mp_campaigndates_start,
        mp_campaigndates_end,
        mp_campaignstatus,
        mp_campaignbudget,
        mp_plannumber
      } = form.getValues()
  
      const payload = { 
        mp_client_name, 
        mba_number: typeof mba_number === "string" ? mba_number.trim() : mba_number, 
        mp_campaignname,
        mp_campaigndates_start,
        mp_campaigndates_end,
        mp_campaignstatus,
        mp_campaignbudget,
        mp_plannumber
      }
      const mediaPlan = await createMediaPlan(payload)
  
      setMediaPlanId(mediaPlan.id)
      mediaPlanIdRef.current = mediaPlan.id
      // Update status to success
      setSaveStatus(prev => prev.map(item => 
        item.name === 'Media Plan Master' 
          ? { ...item, status: 'success' as const }
          : item
      ))
      toast({ title: 'Plan created', description: `ID ${mediaPlan.id}` })
      return mediaPlan.id
    } catch (err: any) {
      // Update status to error
      setSaveStatus(prev => prev.map(item => 
        item.name === 'Media Plan Master' 
          ? { ...item, status: 'error' as const, error: err.message }
          : item
      ))
      toast({ title: 'Save error', description: err.message, variant: 'destructive' })
      throw err;
    } finally {
      setIsPlanSaving(false)
    }
  }

  // Helper function to update save status
  const updateSaveStatus = (name: string, status: 'pending' | 'success' | 'error', error?: string) => {
    setSaveStatus(prev => {
      const existing = prev.find(item => item.name === name)
      if (!existing) {
        return [...prev, { name, status, error }]
      }
      return prev.map(item => 
        item.name === name 
          ? { ...item, status, error }
          : item
      )
    })
  }

  const handleKPIReset = useCallback(() => {
    setSavedCampaignKPIs([])
    // clearing savedCampaignKPIs triggers the rebuild effect which re-resolves
    // from publisher/client tables only
  }, [])

  const handleSaveMediaPlanVersion = async (masterId: number) => {
    setIsSaveModalOpen(true);
    setIsVersionSaving(true);
    
    // Initialize status for Media Plan Version
    updateSaveStatus('Media Plan Version', 'pending')
    
    try {
      const fv = form.getValues()

      const clientName =
        typeof fv.mp_client_name === "string"
          ? fv.mp_client_name.trim()
          : String(fv.mp_client_name || "").trim()

      if (!clientName) {
        throw new Error("Client name is required. Please select a client.")
      }
      if (!fv.mba_number) {
        throw new Error("MBA number is required before saving a version.")
      }

      const shouldEnableProduction = Boolean(
        fv.mp_production || (productionMediaLineItems?.length ?? 0) > 0
      )
      const planVersionNumber = parseInt(fv.mp_plannumber ?? "1", 10) || 1

      console.log("Form values for media plan version:", {
        mp_client_name: clientName,
        mba_number: fv.mba_number,
        mp_plannumber: fv.mp_plannumber,
      })

      /**
       * C1 preferred: MBA PUT omit-mode (server recomputes billing/delivery + inputs_hash).
       * Manual billing months apply locally; overrides persist after version.id (below).
       */
      let version: {
        id: number
        version_number?: number
        billingSchedule?: unknown
      }
      let usedPutPath = false

      const omitModeBody = () => {
        const values = form.getValues()
        return {
          ...values,
          mp_client_name: clientName,
          mp_production: shouldEnableProduction,
          lineItems: billingSaveInputs.lineItems,
          feeLoading: billingSaveInputs.feeLoading,
          billingSchedule: undefined,
          deliverySchedule: undefined,
          delivery_schedule: undefined,
        }
      }

      try {
        const versionResponse = await fetch(
          `/api/mediaplans/mba/${encodeURIComponent(String(fv.mba_number))}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(omitModeBody()),
          }
        )

        if (!versionResponse.ok) {
          const errorBody = await versionResponse.json().catch(() => ({} as { error?: string }))
          throw new Error(
            errorBody.error || `MBA PUT failed (${versionResponse.status})`
          )
        }

        const versionData = await versionResponse.json()
        const versionIdRaw =
          versionData.versionId ?? versionData.version?.id ?? versionData.id
        const versionId = Number(versionIdRaw)
        if (!Number.isFinite(versionId)) {
          throw new Error("MBA PUT succeeded but returned no version id")
        }

        const savedVersionNumberRaw =
          versionData.versionNumber ??
          versionData.nextVersionNumber ??
          versionData.version?.version_number ??
          planVersionNumber
        const savedVersionNumber =
          typeof savedVersionNumberRaw === "string"
            ? parseInt(savedVersionNumberRaw, 10)
            : savedVersionNumberRaw

        version = {
          id: versionId,
          version_number: Number.isFinite(savedVersionNumber)
            ? savedVersionNumber
            : planVersionNumber,
          billingSchedule:
            versionData.version?.billingSchedule ?? versionData.billingSchedule,
        }
        usedPutPath = true
      } catch (putErr: unknown) {
        // Fallback only when PUT cannot create first version for a fresh master
        console.warn(
          "[create C1] MBA PUT unavailable; falling back to createMediaPlanVersion with core schedules",
          putErr
        )
        const fallbackVersion = await createMediaPlanVersion({
          media_plan_master_id: masterId,
          version_number: planVersionNumber,
          mba_number: fv.mba_number || "",
          campaign_name: fv.mp_campaignname || "",
          campaign_status: fv.mp_campaignstatus || "Draft",
          campaign_start_date: toDateOnlyString(fv.mp_campaigndates_start),
          campaign_end_date: toDateOnlyString(fv.mp_campaigndates_end),
          brand: fv.mp_brand || "",
          mp_client_name: clientName,
          client_contact: fv.mp_clientcontact || "",
          po_number: fv.mp_ponumber || "",
          mp_campaignbudget: fv.mp_campaignbudget || 0,
          fixed_fee: fv.mp_fixedfee || false,
          mp_production: shouldEnableProduction,
          mp_television: fv.mp_television || false,
          mp_radio: fv.mp_radio || false,
          mp_newspaper: fv.mp_newspaper || false,
          mp_magazines: fv.mp_magazines || false,
          mp_ooh: fv.mp_ooh || false,
          mp_cinema: fv.mp_cinema || false,
          mp_digidisplay: fv.mp_digidisplay || false,
          mp_digiaudio: fv.mp_digiaudio || false,
          mp_digivideo: fv.mp_digivideo || false,
          mp_bvod: fv.mp_bvod || false,
          mp_integration: fv.mp_integration || false,
          mp_search: fv.mp_search || false,
          mp_socialmedia: fv.mp_socialmedia || false,
          mp_progdisplay: fv.mp_progdisplay || false,
          mp_progvideo: fv.mp_progvideo || false,
          mp_progbvod: fv.mp_progbvod || false,
          mp_progaudio: fv.mp_progaudio || false,
          mp_progooh: fv.mp_progooh || false,
          mp_influencers: fv.mp_influencers || false,
          // Core schedules — never client-built buildBillingScheduleJSON
          billingSchedule: campaignFinancials.billingSchedule,
          deliverySchedule: campaignFinancials.deliverySchedule,
          delivery_schedule: campaignFinancials.deliverySchedule,
          lineItems: billingSaveInputs.lineItems,
          feeLoading: billingSaveInputs.feeLoading,
        } as Parameters<typeof createMediaPlanVersion>[0] & {
          delivery_schedule?: unknown
          lineItems?: unknown
          feeLoading?: unknown
        })
        version = {
          id: Number(fallbackVersion.id),
          version_number: planVersionNumber,
          billingSchedule: (fallbackVersion as { billingSchedule?: unknown }).billingSchedule,
        }
      }

      // Cent-level verify: persisted schedule vs campaignFinancials.billingSchedule
      let persistedRaw: unknown = version.billingSchedule
      if (persistedRaw == null) {
        try {
          const reloadRes = await fetch(
            `/api/mediaplans/mba/${encodeURIComponent(String(fv.mba_number))}?skipLineItems=true&billingScheduleFull=1&version=${encodeURIComponent(String(version.version_number ?? planVersionNumber))}`
          )
          if (reloadRes.ok) {
            const reloaded = await reloadRes.json()
            persistedRaw =
              reloaded.billingSchedule ??
              reloaded.version?.billingSchedule ??
              reloaded.data?.billingSchedule
          }
        } catch (reloadErr) {
          console.warn("[create C1] schedule reload failed", reloadErr)
        }
      }

      const persistedMonths =
        parsePersistedBillingScheduleToMonths(persistedRaw) ??
        (Array.isArray(persistedRaw) ? (persistedRaw as BillingMonth[]) : null)

      if (persistedMonths && campaignFinancials.billingSchedule.length > 0) {
        const parity = assertCoreScheduleParity(
          campaignFinancials.billingSchedule,
          persistedMonths
        )
        if (!parity.ok) {
          console.error("[create C1] schedule parity failed", {
            path: usedPutPath ? "put" : "fallback",
            deltas: parity.deltas,
          })
          throw new Error(`${parity.message}: ${parity.deltas.slice(0, 5).join("; ")}`)
        }
      } else if (campaignFinancials.billingSchedule.length > 0) {
        console.warn(
          "[create C1] could not parse persisted billingSchedule for parity check",
          { usedPutPath }
        )
      }

      // Deferred manual billing: persist overrides once we have version.id, then follow-up omit PUT
      const pendingManualIds = listManualOverrideLineIds(manualBillingMonths)
      const shouldPersistManualBilling =
        hasPendingManualBilling &&
        manualBillingMonths.length > 0 &&
        (pendingManualIds.media.length > 0 || pendingManualIds.fee.length > 0)

      if (shouldPersistManualBilling) {
        const autoMonthsForMediaTotals =
          manualBillingAutoReferenceMonthsRef.current.length > 0
            ? manualBillingAutoReferenceMonthsRef.current
            : attachLineItemsForManualBillingEditor(
                campaignFinancials.billingSchedule.length > 0
                  ? campaignFinancials.billingSchedule
                  : billingMonths
              ).months

        const getBurstsForLine = (billingRowId: string): BurstDateLike[] => {
          const canon = toBillingOverrideLineItemId(billingRowId)
          for (const config of billingFeeSeedEnabledConfigs) {
            const items = config.lineItems ?? []
            for (let i = 0; i < items.length; i++) {
              const stableId = editorBillingStableLineItemId(config.billingKey, items[i], i)
              if (
                billingOverrideLineIdsMatch(stableId, billingRowId) ||
                toBillingOverrideLineItemId(stableId) === canon
              ) {
                return resolveLineItemBursts(items[i]).map((b: any) => ({
                  startDate: String(b?.startDate ?? b?.start_date ?? ""),
                  endDate: String(b?.endDate ?? b?.end_date ?? ""),
                }))
              }
            }
          }
          return []
        }

        let persistResult: Awaited<ReturnType<typeof persistManualBillingOverrides>>
        try {
          persistResult = await persistManualBillingOverrides({
            versionId: version.id,
            months: manualBillingMonths,
            autoMonthsForMediaTotals,
            metaByLine: manualBillingOverrideMetaRef.current,
            getBurstsForLine,
          })
        } catch (err: any) {
          toast({
            variant: "destructive",
            title: "Billing override save failed",
            description: err?.message || "Could not write billing_overrides.",
          })
          throw err instanceof Error
            ? err
            : new Error(err?.message || "Billing override save failed")
        }

        if (!persistResult.ok) {
          toast({
            variant: "destructive",
            title: "Billing override blocked",
            description: persistResult.message,
          })
          throw new Error(persistResult.message)
        }

        // Follow-up omit-mode PUT so server regenerates schedule with overrides attached
        const followUpRes = await fetch(
          `/api/mediaplans/mba/${encodeURIComponent(String(fv.mba_number))}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(omitModeBody()),
          }
        )
        if (!followUpRes.ok) {
          const errorBody = await followUpRes.json().catch(() => ({} as { error?: string }))
          const msg =
            errorBody.error ||
            `Follow-up MBA PUT after billing overrides failed (${followUpRes.status})`
          toast({
            variant: "destructive",
            title: "Billing schedule refresh failed",
            description: msg,
          })
          throw new Error(msg)
        }

        setHasPendingManualBilling(false)
      }

      // Save campaign KPIs (non-blocking — don't fail the campaign save if KPIs fail)
      if (kpiRows.length > 0) {
        updateSaveStatus("Campaign KPIs", "pending")
        const lineItemsByMediaType: Record<string, LineItemForKpiFanout[]> =
          buildKpiLineItemsByMediaType({
          search: { media: searchMediaLineItems, export: searchItems },
          socialMedia: { media: socialMediaMediaLineItems, export: socialMediaItems },
          progDisplay: { media: progDisplayMediaLineItems, export: progDisplayItems },
          progVideo: { media: progVideoMediaLineItems, export: progVideoItems },
          progBvod: { media: progBvodMediaLineItems, export: progBvodItems },
          progAudio: { media: progAudioMediaLineItems, export: progAudioItems },
          progOoh: { media: progOohMediaLineItems, export: progOohItems },
          digiDisplay: { media: digiDisplayMediaLineItems, export: digiDisplayItems },
          digiAudio: { media: digiAudioMediaLineItems, export: digiAudioItems },
          digiVideo: { media: digiVideoMediaLineItems, export: digiVideoItems },
          bvod: { media: bvodMediaLineItems, export: bvodItems },
          integration: { media: integrationMediaLineItems, export: integrationItems },
          television: { media: televisionMediaLineItems, export: televisionItems },
          radio: { media: radioMediaLineItems, export: radioItems },
          newspaper: { media: newspaperMediaLineItems, export: newspaperItems },
          magazines: { media: magazineMediaLineItems, export: magazineItems },
          ooh: { media: oohMediaLineItems, export: oohItems },
          cinema: { media: cinemaMediaLineItems, export: cinemaItems },
          influencers: { media: influencersMediaLineItems, export: influencersItems },
          production: { media: productionMediaLineItems, export: productionItems },
        })
        const kpiPayload: CampaignKPI[] = fanOutKpiPayload(
          kpiRows,
          {
            mp_client_name: clientName,
            mba_number: fv.mba_number ?? "",
            version_number: version.version_number ?? planVersionNumber,
            campaign_name: fv.mp_campaignname ?? "",
          },
          lineItemsByMediaType,
        )
        saveCampaignKpisFromRows(kpiRows, kpiPayload).then((result) => {
          if (result.status === "skipped") {
            updateSaveStatus("Campaign KPIs", "success");
          } else if (result.status === "success") {
            updateSaveStatus("Campaign KPIs", "success");
          } else {
            updateSaveStatus("Campaign KPIs", "error", result.message);
          }
        });
      }
      setMediaPlanVersionId(version.id);
      // Update Media Plan Version status to success
      updateSaveStatus('Media Plan Version', 'success')

      // 3b. Generate + upload documents (MBA PDF + Media Plan XLSX) to Xano
      // Do not block core save on upload failures: show in modal as partial success.
      updateSaveStatus("MBA PDF Upload", "pending")
      updateSaveStatus("Media Plan Upload", "pending")
      const documentUploadPromise = (async () => {
        const planVersionForDocs = String(
          version.version_number ?? fv.mp_plannumber ?? "1"
        )

        const [{ blob: mbaBlob, fileName: mbaFileName }, { blob: mpBlob, fileName: mpFileName }] = await Promise.all([
          generateMbaPdfBlob({ planVersion: planVersionForDocs }),
          generateMediaPlanXlsxBlob({ planVersion: planVersionForDocs }),
        ])

        const mbaPdfFile = new File([mbaBlob], mbaFileName, { type: "application/pdf" })
        const mediaPlanFile = new File([mpBlob], mpFileName, {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        })

        const mediaItemsForAaCheck: MediaItems = {
          search: searchItems,
          socialMedia: socialMediaItems,
          digiAudio: digiAudioItems,
          digiDisplay: digiDisplayItems,
          digiVideo: digiVideoItems,
          bvod: bvodItems,
          progDisplay: progDisplayItems,
          progVideo: progVideoItems,
          progBvod: progBvodItems,
          progOoh: progOohItems,
          progAudio: progAudioItems,
          newspaper: newspaperItems,
          magazines: magazineItems,
          television: televisionItems,
          radio: radioItems,
          ooh: oohItems,
          cinema: cinemaItems,
          integration: integrationItems,
          influencers: influencersItems,
          production: productionItems,
        }

        let aaMediaPlanFile: File | undefined
        try {
          const pubRes = await fetch("/api/publishers")
          if (pubRes.ok) {
            const publishersForAa = (await pubRes.json()) as Publisher[]
            if (
              planHasAdvertisingAssociatesLineItem(
                mediaItemsForAaCheck,
                publishersForAa,
                shouldIncludeMediaPlanLineItem,
              )
            ) {
              updateSaveStatus("AA Media Plan Upload", "pending")
              try {
                const { blob: aaBlob, fileName: aaFileName } = await generateMediaPlanXlsxBlob({
                  planVersion: planVersionForDocs,
                  variant: "aa",
                })
                aaMediaPlanFile = new File([aaBlob], aaFileName, {
                  type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                })
              } catch (genErr: any) {
                console.warn("AA media plan generation failed:", genErr)
                updateSaveStatus(
                  "AA Media Plan Upload",
                  "error",
                  genErr?.message || "Failed to generate AA media plan",
                )
              }
            }
          }
        } catch (aaErr) {
          console.warn("AA media plan generation skipped or failed:", aaErr)
        }

        try {
          await uploadMediaPlanVersionDocuments(version.id, {
            mbaPdf: mbaPdfFile,
            mediaPlan: mediaPlanFile,
            aaMediaPlan: aaMediaPlanFile,
            mpClientName: clientName,
          })

          updateSaveStatus("MBA PDF Upload", "success")
          updateSaveStatus("Media Plan Upload", "success")
          if (aaMediaPlanFile) {
            updateSaveStatus("AA Media Plan Upload", "success")
          }
        } catch (err: any) {
          const message = err?.message || String(err)
          console.error("Document upload failed:", err)
          updateSaveStatus("MBA PDF Upload", "error", message)
          updateSaveStatus("Media Plan Upload", "error", message)
          if (aaMediaPlanFile) {
            updateSaveStatus("AA Media Plan Upload", "error", message)
          }
        }
      })().catch((err: any) => {
        const message = err?.message || String(err)
        console.error("Document upload failed:", err)
        updateSaveStatus("MBA PDF Upload", "error", message)
        updateSaveStatus("Media Plan Upload", "error", message)
      })
  
      // 4. Save all media line items for enabled media types
      const mediaTypeSavePromises: Array<Promise<any[] | { type: string; error: any; }>> = [];
      
      // Map media type keys to display names for status tracking
      const mediaTypeKeyToDisplayName: Record<string, string> = {
        'television': mediaTypeDisplayNames.mp_television,
        'radio': mediaTypeDisplayNames.mp_radio,
        'newspaper': mediaTypeDisplayNames.mp_newspaper,
        'magazines': mediaTypeDisplayNames.mp_magazines,
        'ooh': mediaTypeDisplayNames.mp_ooh,
        'cinema': mediaTypeDisplayNames.mp_cinema,
        'digidisplay': mediaTypeDisplayNames.mp_digidisplay,
        'digiaudio': mediaTypeDisplayNames.mp_digiaudio,
        'digivideo': mediaTypeDisplayNames.mp_digivideo,
        'bvod': mediaTypeDisplayNames.mp_bvod,
        'integration': mediaTypeDisplayNames.mp_integration,
        'search': mediaTypeDisplayNames.mp_search,
        'socialmedia': mediaTypeDisplayNames.mp_socialmedia,
        'progdisplay': mediaTypeDisplayNames.mp_progdisplay,
        'progvideo': mediaTypeDisplayNames.mp_progvideo,
        'progbvod': mediaTypeDisplayNames.mp_progbvod,
        'progaudio': mediaTypeDisplayNames.mp_progaudio,
        'progooh': mediaTypeDisplayNames.mp_progooh,
        'influencers': mediaTypeDisplayNames.mp_influencers,
      };

      // Television
      if (fv.mp_television && televisionMediaLineItems && televisionMediaLineItems.length > 0) {
        const displayName = mediaTypeDisplayNames.mp_television;
        updateSaveStatus(displayName, 'pending');
        mediaTypeSavePromises.push(
          saveTelevisionLineItems(
            version.id,
            fv.mba_number,
            fv.mp_client_name,
            fv.mp_plannumber,
            televisionMediaLineItems
          ).then(result => {
            updateSaveStatus(displayName, 'success');
            return result;
          }).catch(error => {
            updateSaveStatus(displayName, 'error', error.message || 'Failed to save');
            return { type: 'television', error };
          })
        );
      }

      // Radio
      if (fv.mp_radio && radioMediaLineItems && radioMediaLineItems.length > 0) {
        const displayName = mediaTypeDisplayNames.mp_radio;
        updateSaveStatus(displayName, 'pending');
        mediaTypeSavePromises.push(
          saveRadioLineItems(
            version.id,
            fv.mba_number,
            fv.mp_client_name,
            fv.mp_plannumber,
            radioMediaLineItems
          ).then(result => {
            updateSaveStatus(displayName, 'success');
            return result;
          }).catch(error => {
            updateSaveStatus(displayName, 'error', error.message || 'Failed to save');
            return { type: 'radio', error };
          })
        );
      }

      // Newspaper
      if (fv.mp_newspaper && newspaperMediaLineItems && newspaperMediaLineItems.length > 0) {
        const displayName = mediaTypeDisplayNames.mp_newspaper;
        updateSaveStatus(displayName, 'pending');
        mediaTypeSavePromises.push(
          saveNewspaperLineItems(
            version.id,
            fv.mba_number,
            fv.mp_client_name,
            fv.mp_plannumber,
            newspaperMediaLineItems
          ).then(result => {
            updateSaveStatus(displayName, 'success');
            return result;
          }).catch(error => {
            updateSaveStatus(displayName, 'error', error.message || 'Failed to save');
            return { type: 'newspaper', error };
          })
        );
      }

      // Magazines
      if (fv.mp_magazines && magazineMediaLineItems && magazineMediaLineItems.length > 0) {
        const displayName = mediaTypeDisplayNames.mp_magazines;
        updateSaveStatus(displayName, 'pending');
        mediaTypeSavePromises.push(
          saveMagazinesLineItems(
            version.id,
            fv.mba_number,
            fv.mp_client_name,
            fv.mp_plannumber,
            magazineMediaLineItems
          ).then(result => {
            updateSaveStatus(displayName, 'success');
            return result;
          }).catch(error => {
            updateSaveStatus(displayName, 'error', error.message || 'Failed to save');
            return { type: 'magazines', error };
          })
        );
      }

      // OOH
      if (fv.mp_ooh && oohMediaLineItems && oohMediaLineItems.length > 0) {
        const displayName = mediaTypeDisplayNames.mp_ooh;
        updateSaveStatus(displayName, 'pending');
        mediaTypeSavePromises.push(
          saveOOHLineItems(
            version.id,
            fv.mba_number,
            fv.mp_client_name,
            fv.mp_plannumber,
            oohMediaLineItems
          ).then(result => {
            updateSaveStatus(displayName, 'success');
            return result;
          }).catch(error => {
            updateSaveStatus(displayName, 'error', error.message || 'Failed to save');
            return { type: 'ooh', error };
          })
        );
      }

      // Cinema
      if (fv.mp_cinema && cinemaMediaLineItems && cinemaMediaLineItems.length > 0) {
        const displayName = mediaTypeDisplayNames.mp_cinema;
        updateSaveStatus(displayName, 'pending');
        mediaTypeSavePromises.push(
          saveCinemaLineItems(
            version.id,
            fv.mba_number,
            fv.mp_client_name,
            fv.mp_plannumber,
            cinemaMediaLineItems
          ).then(result => {
            updateSaveStatus(displayName, 'success');
            return result;
          }).catch(error => {
            updateSaveStatus(displayName, 'error', error.message || 'Failed to save');
            return { type: 'cinema', error };
          })
        );
      }

      // Digital Display
      if (fv.mp_digidisplay && digiDisplayMediaLineItems && digiDisplayMediaLineItems.length > 0) {
        const displayName = mediaTypeDisplayNames.mp_digidisplay;
        updateSaveStatus(displayName, 'pending');
        mediaTypeSavePromises.push(
          saveDigitalDisplayLineItems(
            version.id,
            fv.mba_number,
            fv.mp_client_name,
            fv.mp_plannumber,
            digiDisplayMediaLineItems
          ).then(result => {
            updateSaveStatus(displayName, 'success');
            return result;
          }).catch(error => {
            updateSaveStatus(displayName, 'error', error.message || 'Failed to save');
            return { type: 'digidisplay', error };
          })
        );
      }

      // Digital Audio
      if (fv.mp_digiaudio && digiAudioMediaLineItems && digiAudioMediaLineItems.length > 0) {
        const displayName = mediaTypeDisplayNames.mp_digiaudio;
        updateSaveStatus(displayName, 'pending');
        mediaTypeSavePromises.push(
          saveDigitalAudioLineItems(
            version.id,
            fv.mba_number,
            fv.mp_client_name,
            fv.mp_plannumber,
            digiAudioMediaLineItems
          ).then(result => {
            updateSaveStatus(displayName, 'success');
            return result;
          }).catch(error => {
            updateSaveStatus(displayName, 'error', error.message || 'Failed to save');
            return { type: 'digiaudio', error };
          })
        );
      }

      // Digital Video
      if (fv.mp_digivideo && digiVideoMediaLineItems && digiVideoMediaLineItems.length > 0) {
        const displayName = mediaTypeDisplayNames.mp_digivideo;
        updateSaveStatus(displayName, 'pending');
        mediaTypeSavePromises.push(
          saveDigitalVideoLineItems(
            version.id,
            fv.mba_number,
            fv.mp_client_name,
            fv.mp_plannumber,
            digiVideoMediaLineItems
          ).then(result => {
            updateSaveStatus(displayName, 'success');
            return result;
          }).catch(error => {
            updateSaveStatus(displayName, 'error', error.message || 'Failed to save');
            return { type: 'digivideo', error };
          })
        );
      }

      // BVOD
      if (fv.mp_bvod && bvodMediaLineItems && bvodMediaLineItems.length > 0) {
        const displayName = mediaTypeDisplayNames.mp_bvod;
        updateSaveStatus(displayName, 'pending');
        mediaTypeSavePromises.push(
          saveBVODLineItems(
            version.id,
            fv.mba_number,
            fv.mp_client_name,
            fv.mp_plannumber,
            bvodMediaLineItems
          ).then(result => {
            updateSaveStatus(displayName, 'success');
            return result;
          }).catch(error => {
            updateSaveStatus(displayName, 'error', error.message || 'Failed to save');
            return { type: 'bvod', error };
          })
        );
      }

      // Integration
      if (fv.mp_integration && integrationMediaLineItems && integrationMediaLineItems.length > 0) {
        const displayName = mediaTypeDisplayNames.mp_integration;
        updateSaveStatus(displayName, 'pending');
        mediaTypeSavePromises.push(
          saveIntegrationLineItems(
            version.id,
            fv.mba_number,
            fv.mp_client_name,
            fv.mp_plannumber,
            integrationMediaLineItems
          ).then(result => {
            updateSaveStatus(displayName, 'success');
            return result;
          }).catch(error => {
            updateSaveStatus(displayName, 'error', error.message || 'Failed to save');
            return { type: 'integration', error };
          })
        );
      }

      // Production / Consulting
      if (shouldEnableProduction && productionMediaLineItems && productionMediaLineItems.length > 0) {
        const displayName = mediaTypeDisplayNames.mp_production;
        updateSaveStatus(displayName, 'pending');
        mediaTypeSavePromises.push(
          saveProductionLineItems(
            version.id,
            fv.mba_number,
            fv.mp_client_name,
            fv.mp_plannumber,
            productionMediaLineItems
          ).then(result => {
            updateSaveStatus(displayName, 'success');
            return result;
          }).catch(error => {
            updateSaveStatus(displayName, 'error', error.message || 'Failed to save');
            return { type: 'production', error };
          })
        );
      }

      // Search
      if (fv.mp_search && searchMediaLineItems && searchMediaLineItems.length > 0) {
        const displayName = mediaTypeDisplayNames.mp_search;
        updateSaveStatus(displayName, 'pending');
        mediaTypeSavePromises.push(
          saveSearchLineItems(
            version.id,
            fv.mba_number,
            fv.mp_client_name,
            fv.mp_plannumber,
            searchMediaLineItems
          ).then(result => {
            updateSaveStatus(displayName, 'success');
            return result;
          }).catch(error => {
            updateSaveStatus(displayName, 'error', error.message || 'Failed to save');
            return { type: 'search', error };
          })
        );
      }

      // Social Media
      if (fv.mp_socialmedia && socialMediaMediaLineItems && socialMediaMediaLineItems.length > 0) {
        const displayName = mediaTypeDisplayNames.mp_socialmedia;
        updateSaveStatus(displayName, 'pending');
        mediaTypeSavePromises.push(
          saveSocialMediaLineItems(
            version.id,
            fv.mba_number,
            fv.mp_client_name,
            fv.mp_plannumber,
            socialMediaMediaLineItems
          ).then(result => {
            updateSaveStatus(displayName, 'success');
            return result;
          }).catch(error => {
            updateSaveStatus(displayName, 'error', error.message || 'Failed to save');
            return { type: 'socialmedia', error };
          })
        );
      }

      // Programmatic Display
      if (fv.mp_progdisplay && progDisplayMediaLineItems && progDisplayMediaLineItems.length > 0) {
        const displayName = mediaTypeDisplayNames.mp_progdisplay;
        updateSaveStatus(displayName, 'pending');
        mediaTypeSavePromises.push(
          saveProgDisplayLineItems(
            version.id,
            fv.mba_number,
            fv.mp_client_name,
            fv.mp_plannumber,
            progDisplayMediaLineItems
          ).then(result => {
            updateSaveStatus(displayName, 'success');
            return result;
          }).catch(error => {
            updateSaveStatus(displayName, 'error', error.message || 'Failed to save');
            return { type: 'progdisplay', error };
          })
        );
      }

      // Programmatic Video
      if (fv.mp_progvideo && progVideoMediaLineItems && progVideoMediaLineItems.length > 0) {
        const displayName = mediaTypeDisplayNames.mp_progvideo;
        updateSaveStatus(displayName, 'pending');
        mediaTypeSavePromises.push(
          saveProgVideoLineItems(
            version.id,
            fv.mba_number,
            fv.mp_client_name,
            fv.mp_plannumber,
            progVideoMediaLineItems
          ).then(result => {
            updateSaveStatus(displayName, 'success');
            return result;
          }).catch(error => {
            updateSaveStatus(displayName, 'error', error.message || 'Failed to save');
            return { type: 'progvideo', error };
          })
        );
      }

      // Programmatic BVOD
      if (fv.mp_progbvod && progBvodMediaLineItems && progBvodMediaLineItems.length > 0) {
        const displayName = mediaTypeDisplayNames.mp_progbvod;
        updateSaveStatus(displayName, 'pending');
        mediaTypeSavePromises.push(
          saveProgBVODLineItems(
            version.id,
            fv.mba_number,
            fv.mp_client_name,
            fv.mp_plannumber,
            progBvodMediaLineItems
          ).then(result => {
            updateSaveStatus(displayName, 'success');
            return result;
          }).catch(error => {
            updateSaveStatus(displayName, 'error', error.message || 'Failed to save');
            return { type: 'progbvod', error };
          })
        );
      }

      // Programmatic Audio
      if (fv.mp_progaudio && progAudioMediaLineItems && progAudioMediaLineItems.length > 0) {
        const displayName = mediaTypeDisplayNames.mp_progaudio;
        updateSaveStatus(displayName, 'pending');
        mediaTypeSavePromises.push(
          saveProgAudioLineItems(
            version.id,
            fv.mba_number,
            fv.mp_client_name,
            fv.mp_plannumber,
            progAudioMediaLineItems
          ).then(result => {
            updateSaveStatus(displayName, 'success');
            return result;
          }).catch(error => {
            updateSaveStatus(displayName, 'error', error.message || 'Failed to save');
            return { type: 'progaudio', error };
          })
        );
      }

      // Programmatic OOH
      if (fv.mp_progooh && progOohMediaLineItems && progOohMediaLineItems.length > 0) {
        const displayName = mediaTypeDisplayNames.mp_progooh;
        updateSaveStatus(displayName, 'pending');
        mediaTypeSavePromises.push(
          saveProgOOHLineItems(
            version.id,
            fv.mba_number,
            fv.mp_client_name,
            fv.mp_plannumber,
            progOohMediaLineItems
          ).then(result => {
            updateSaveStatus(displayName, 'success');
            return result;
          }).catch(error => {
            updateSaveStatus(displayName, 'error', error.message || 'Failed to save');
            return { type: 'progooh', error };
          })
        );
      }

      // Influencers
      if (fv.mp_influencers && influencersMediaLineItems && influencersMediaLineItems.length > 0) {
        const displayName = mediaTypeDisplayNames.mp_influencers;
        updateSaveStatus(displayName, 'pending');
        mediaTypeSavePromises.push(
          saveInfluencersLineItems(
            version.id,
            fv.mba_number,
            fv.mp_client_name,
            fv.mp_plannumber,
            influencersMediaLineItems
          ).then(result => {
            updateSaveStatus(displayName, 'success');
            return result;
          }).catch(error => {
            updateSaveStatus(displayName, 'error', error.message || 'Failed to save');
            return { type: 'influencers', error };
          })
        );
      }

      // Execute all media type saves in parallel
      if (mediaTypeSavePromises.length > 0) {
        try {
          const results = await Promise.all(mediaTypeSavePromises);
          const errors = results.filter((result): result is { type: string; error: any; } => 
            result && typeof result === 'object' && 'error' in result
          );
          
          if (errors.length > 0) {
            toast({
              title: 'Partial Success',
              description: `Media plan saved but some media types failed to save.`,
              variant: 'destructive'
            });
          }
        } catch (error) {
          toast({
            title: 'Warning',
            description: 'Media plan saved but some media data could not be saved. Please try again.',
            variant: 'destructive'
          });
        }
      }

      // Wait for document generation+upload (do not throw; errors already handled above)
      await documentUploadPromise
  
      // 7. Notify user
      toast({ title: 'Version saved', description: `Version ID ${version.id}` });
    } catch (err: any) {
      // Update Media Plan Version status to error
      updateSaveStatus('Media Plan Version', 'error', err.message || 'Failed to save version');
      toast({ title: 'Error saving version', description: err.message, variant: 'destructive' });
      throw err; // rethrow for Phase 3 logic
    } finally {
      setIsVersionSaving(false);
    }
  };

  // in page.tsx

const handleSaveAll = async () => {
  if (saveAllInFlightRef.current) return
  if (budgetRemaining < 0) {
    const proceed = window.confirm(
      `Budget remaining is ${formatMoney(budgetRemaining)} (overspend). Save this plan anyway?`
    )
    if (!proceed) return
  }
  saveAllInFlightRef.current = true
  try {
    setIsSaveModalOpen(true);
    // Initialize save status array
    setSaveStatus([{ name: 'Media Plan Master', status: 'pending' }]);
    
    let newMediaPlanId: number; // ✅ Declare a local variable for the ID

    // 1️⃣ Save master plan
    try {
      newMediaPlanId = await handleSaveMediaPlan(); // ✅ Capture the returned ID
    } catch {
      return;
    }

    // 2️⃣ Save version (Media Plan Version status will be initialized in handleSaveMediaPlanVersion)
    try {
      await handleSaveMediaPlanVersion(newMediaPlanId); // ✅ Pass the ID as an argument
      setHasUnsavedChanges(false);
      form.reset(form.getValues());
      router.push('/mediaplans');
    } catch {
      return;
    }
  } finally {
    saveAllInFlightRef.current = false
  }
};

  const handleExit = useCallback(() => {
    requestNavigation("/mediaplans")
  }, [requestNavigation])

  const clientNameToSlug = useCallback((clientName: string): string => {
    return clientName
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .trim()
  }, []);

  const generateNamingConventionsXlsxBlob = async (opts?: { planVersion?: string }) => {
    if (typeof waitForStateFlush === "function") {
      await waitForStateFlush();
    }

    const fv = form.getValues();
    const version = opts?.planVersion ?? (fv.mp_plannumber || "1");
    const clientName = fv.mp_client_name || "client";
    const campaignName = fv.mp_campaignname || "mediaPlan";
    const namingBase = `NamingConventions_${campaignName}`;
    const fileName = `${clientName}-${namingBase}-v${version}.xlsx`;
    const workbook = await generateNamingWorkbook({
      advertiser: fv.mp_client_name || "",
      brand: fv.mp_brand || "",
      campaignName: fv.mp_campaignname || "",
      mbaNumber: fv.mba_number || fv.mbaidentifier || "",
      startDate: fv.mp_campaigndates_start,
      endDate: fv.mp_campaigndates_end,
      version,
      publishers: kpiPublishers,
      containerBestPractice,
      mediaFlags: fv as unknown as Record<string, boolean>,
      items: {
        search: searchItems,
        socialMedia: socialMediaItems,
        digiAudio: digiAudioItems,
        digiDisplay: digiDisplayItems,
        digiVideo: digiVideoItems,
        bvod: bvodItems,
        integration: integrationItems,
        progDisplay: progDisplayItems,
        progVideo: progVideoItems,
        progBvod: progBvodItems,
        progAudio: progAudioItems,
        progOoh: progOohItems,
      },
    });

    const arrayBuffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([arrayBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    return { blob, fileName };
  };

  // Handle Save and Download All - creates a ZIP then runs the normal save modal flow
  const handleSaveAndDownloadAll = async () => {
    const fv = form.getValues();

    if (!fv.mba_number) {
      toast({
        title: "Error",
        description: "MBA number is required",
        variant: "destructive",
      });
      return;
    }

    if (!fv.mp_client_name) {
      toast({
        title: "Error",
        description: "Client name is required",
        variant: "destructive",
      });
      return;
    }

    setIsDownloading(true);
    setModalOpen(true);
    setModalLoading(true);
    setModalTitle("Downloading Media Plan");
    setModalOutcome("Preparing your media plan for download...");

    try {
      const [{ blob: mbaBlob, fileName: mbaFileName }, { blob: mediaPlanBlob, fileName: mediaPlanFileName }, { blob: namingBlob, fileName: namingFileName }] = await Promise.all([
        generateMbaPdfBlob(),
        generateMediaPlanXlsxBlob(),
        generateNamingConventionsXlsxBlob(),
      ]);

      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      zip.file(mbaFileName, mbaBlob);
      zip.file(mediaPlanFileName, mediaPlanBlob);
      zip.file(namingFileName, namingBlob);
      // Standalone KPI workbook (only when KPI rows exist)
      if (kpiRows.length > 0) {
        const ExcelJS = (await import("exceljs")).default;
        const { addKPISheet } = await import("@/lib/generateMediaPlan");
        const kpiWorkbook = new ExcelJS.Workbook();
        addKPISheet(
          kpiWorkbook,
          kpiRows.map((r) => ({
            mediaType: r.media_type,
            publisher: r.publisher,
            label: r.lineItemLabel,
            buyType: r.buyType,
            spend: r.spend,
            deliverables: r.deliverables,
            ctr: r.ctr,
            vtr: r.vtr,
            cpv: r.cpv,
            conversion_rate: r.conversion_rate,
            frequency: r.frequency,
            calculatedClicks: r.calculatedClicks,
            calculatedViews: r.calculatedViews,
            calculatedReach: r.calculatedReach,
          })),
        );
        const kpiArrayBuffer = await kpiWorkbook.xlsx.writeBuffer();
        const kpiBlob = new Blob([kpiArrayBuffer], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        });
        const kpiFileName = `KPIs_${fv.mp_campaignname || "campaign"}.xlsx`;
        zip.file(kpiFileName, kpiBlob);
      }
      const zipBlob = await zip.generateAsync({ type: "blob" });

      const campaignNameSafe = (fv.mp_campaignname || "campaign")
        .replace(/[^a-z0-9-_ ]/gi, "")
        .trim()
        .replace(/\s+/g, "-");
      const zipFileName = `${fv.mp_client_name || "client"}-${campaignNameSafe || "campaign"}-all-files.zip`;
      saveAs(zipBlob, zipFileName);

      setModalLoading(false);
      setModalOpen(false);

      await handleSaveAll();
    } catch (error: any) {
      console.error("Save and download all:", error);
      setModalLoading(false);
      setModalTitle("Error");
      setModalOutcome(error?.message || "Failed to complete save and download all");
      toast({
        title: "Error",
        description: error?.message || "Failed to complete save and download all",
        variant: "destructive",
      });
    } finally {
      setIsDownloading(false);
    }
  };

  const handleDownloadNamingConventions = async () => {
    setIsNamingDownloading(true);
    try {
      const { blob, fileName } = await generateNamingConventionsXlsxBlob();
      saveAs(blob, fileName);
      toast({ title: "Success", description: "Naming conventions Excel downloaded" });
    } catch (error: any) {
      console.error("Naming download error:", error);
      toast({
        title: "Error",
        description: error?.message || "Failed to download naming conventions",
        variant: "destructive",
      });
    } finally {
      setIsNamingDownloading(false);
    }
  };
  
  const handleDownloadMediaPlan = async () => {
    setIsDownloading(true)
    try {
      const { blob, fileName } = await generateMediaPlanXlsxBlob()
      saveAs(blob, fileName)

    toast({ title: 'Success', description: 'Media plan generated successfully' })
  } catch (error: any) {
    toast({
      title: 'Error',
      description: error.message || 'Failed to generate media plan',
      variant: 'destructive',
    })
  } finally {
    setIsDownloading(false)
    }
  }

  const handleDownloadAdvertisingAssociatesMediaPlan = async () => {
    if (!hasAdvertisingAssociatesBilling) return
    setIsDownloadingAa(true)
    try {
      const { blob, fileName } = await generateMediaPlanXlsxBlob({ variant: "aa" })
      saveAs(blob, fileName)
      toast({
        title: "Success",
        description: "Advertising Associates media plan downloaded",
      })
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to generate media plan",
        variant: "destructive",
      })
    } finally {
      setIsDownloadingAa(false)
    }
  }
  
  // Transform mediaTypes to match expected format
  const transformedMediaTypes = mediaTypes.map(media => ({
    name: media.name,
    feePercentage: media.name === "mp_search" ? feesearch || 0 : 0,
    lineItems: []
  }));

  const handleBVODBurstsChange = (bursts: BillingBurst[]) => {
    setBvodBursts((prev) => {
      const next = normalizeBursts(bursts)
      if (prev === next) return prev
      if (prev.length === next.length && JSON.stringify(prev) === JSON.stringify(next)) {
        return prev
      }
      return next
    })
  }

  const getPageContext = useCallback((): PageContext => {
    const values = form.getValues();
    const clientSlug = values.mp_client_name ? clientNameToSlug(values.mp_client_name) : undefined;
    const enabledMediaTypes = mediaTypes
      .filter((medium) => medium.name !== "mp_fixedfee")
      .filter((medium) => Boolean(values[medium.name as keyof MediaPlanFormValues]))
      .map((medium) => medium.label);

    const baseFields: PageField[] = [
      {
        id: "mp_client_name",
        label: "Client Name",
        type: "enum",
        value: values.mp_client_name,
        editable: true,
        semanticType: "client_name",
        group: "client",
        source: "ui",
        options: clients.map((client) => ({
          label: client.mp_client_name,
          value: client.mp_client_name,
        })),
        validation: { required: true },
      },
      {
        id: "mp_campaignstatus",
        label: "Campaign Status",
        type: "enum",
        value: values.mp_campaignstatus,
        editable: true,
        semanticType: "status",
        group: "campaign",
        source: "ui",
        options: [
          { label: "Draft", value: "draft" },
          { label: "Planned", value: "planned" },
          { label: "Approved", value: "approved" },
          { label: "Booked", value: "booked" },
          { label: "Completed", value: "completed" },
          { label: "Cancelled", value: "cancelled" },
        ],
        validation: { required: true },
      },
      {
        id: "mp_campaignname",
        label: "Campaign Name",
        type: "string",
        value: values.mp_campaignname,
        editable: true,
        semanticType: "campaign_name",
        group: "campaign",
        source: "ui",
        validation: { required: true },
      },
      {
        id: "mp_brand",
        label: "Brand",
        type: "string",
        value: values.mp_brand,
        editable: true,
        semanticType: "brand",
        group: "campaign",
        source: "ui",
      },
      {
        id: "mp_campaigndates_start",
        label: "Campaign Start Date",
        type: "date",
        value: values.mp_campaigndates_start,
        editable: true,
        semanticType: "date",
        group: "campaign",
        source: "ui",
        validation: { required: true },
      },
      {
        id: "mp_campaigndates_end",
        label: "Campaign End Date",
        type: "date",
        value: values.mp_campaigndates_end,
        editable: true,
        semanticType: "date",
        group: "campaign",
        source: "ui",
        validation: { required: true },
      },
      {
        id: "mp_clientcontact",
        label: "Client Contact",
        type: "string",
        value: values.mp_clientcontact,
        editable: true,
        semanticType: "client_contact",
        group: "client",
        source: "ui",
        validation: { required: true },
      },
      {
        id: "mp_ponumber",
        label: "PO Number",
        type: "string",
        value: values.mp_ponumber,
        editable: true,
        semanticType: "po_number",
        group: "campaign",
        source: "ui",
      },
      {
        id: "mp_campaignbudget",
        label: "Campaign Budget",
        type: "number",
        value: values.mp_campaignbudget,
        editable: true,
        semanticType: "budget",
        group: "campaign",
        source: "ui",
      },
    ];

    const toggleFields: PageField[] = mediaTypes
      .filter((medium) => medium.name !== "mp_fixedfee")
      .map((medium) => ({
        id: medium.name,
        label: medium.label,
        type: "boolean",
        value: values[medium.name as keyof MediaPlanFormValues],
        editable: true,
        semanticType: "boolean_toggle",
        group: "media_types",
        source: "ui",
      }));

    return {
      route: { pathname: pathname || "", clientSlug },
      fields: [...baseFields, ...toggleFields],
      generatedAt: new Date().toISOString(),
      entities: {
        clientSlug,
        clientName: values.mp_client_name,
        campaignName: values.mp_campaignname,
        mediaTypes: enabledMediaTypes,
      },
      pageText: {
        title: "Create a Campaign",
        headings: ["Create a Campaign"],
        breadcrumbs: ["Media Plans", "Create"],
      },
    };
  }, [clients, clientNameToSlug, form, mediaTypes, pathname]);

  useEffect(() => {
    setAssistantContext({ pageContext: getPageContext() })
  }, [getPageContext])

  useEffect(() => {
    return () => {
      clearAssistantContext()
    }
  }, [])

  const handleCopyPageContext = useCallback(async () => {
    try {
      const context = getPageContext();
      await navigator.clipboard.writeText(JSON.stringify(context, null, 2));
      toast({ title: "Copied", description: "Page context copied to clipboard" });
    } catch (error) {
      console.error("Failed to copy page context", error);
      toast({
        title: "Copy failed",
        description: "Could not copy page context to clipboard",
        variant: "destructive",
      });
    }
  }, [getPageContext]);

  const wizardRailSubItems = useMemo(
    () =>
      selectedChannels.length > 0
        ? {
            parentStepId: "channel-allocation" as const,
            items: selectedChannels.map((channel) => ({
              id: channel.name,
              label: channel.label,
              scrollTargetId: `media-section-${channel.name}`,
            })),
          }
        : undefined,
    [selectedChannels]
  )

  const wizardSummary = useMemo(
    () => ({
      title: watchedCampaignName || "Untitled campaign",
      client: watchedClientName || "No client selected",
      budget: currencyFormatter.format(Number(watchedCampaignBudget) || 0),
      channels: selectedMediaCount,
      status: "Draft",
      budgetRemaining: formatMoney(budgetRemaining),
      budgetRemainingOverspend,
    }),
    [
      watchedCampaignName,
      watchedClientName,
      watchedCampaignBudget,
      selectedMediaCount,
      budgetRemaining,
      budgetRemainingOverspend,
      currencyFormatter,
    ]
  )

  const isWizardSaving = isLoading || isPlanSaving || isVersionSaving

  const wizardBottomBar = (
    <>
      <BuilderIssuesBadge issues={builderIssues} />
      {dateWarning.hasViolation ? (
        <div className="rounded-card border border-pacing-critical bg-pacing-critical-bg px-3 py-2 text-xs font-medium text-status-critical-fg">
          {dateWarning.offendingCount === 1
            ? "1 line item has flight dates outside the campaign window"
            : `${dateWarning.offendingCount} line items have flight dates outside the campaign window`}
        </div>
      ) : null}
      <CampaignExportsSection
        variant="embedded"
        mbaNumber={mbaNumber?.trim() ? String(mbaNumber) : "—"}
        lineItemCount={builderLineItemCount}
        isBusy={
          isDownloading ||
          isDownloadingAa ||
          isNamingDownloading ||
          isLoading ||
          isPlanSaving ||
          isVersionSaving
        }
        ariaStatus=""
        className="max-w-full flex-wrap justify-center"
      >
        <Button
          type="button"
          onClick={handleGenerateMBA}
          disabled={isLoading}
          className="h-9 shrink-0 rounded-pill bg-primary px-4 py-2 text-primary-foreground hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring"
        >
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
          <span className="ml-2">{isLoading ? "Generating..." : "Generate MBA"}</span>
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={handleSaveAll}
          disabled={isWizardSaving}
          className="h-9 shrink-0 rounded-pill border-border px-4 py-2 focus-visible:ring-2 focus-visible:ring-ring"
        >
          {isWizardSaving ? "Saving..." : "Save draft"}
        </Button>
        <Button
          type="button"
          onClick={handleDownloadMediaPlan}
          disabled={
            isDownloading ||
            isDownloadingAa ||
            isNamingDownloading ||
            isWizardSaving
          }
          className="h-9 shrink-0 rounded-pill bg-accent px-4 py-2 text-foreground hover:bg-accent/90 focus-visible:ring-2 focus-visible:ring-ring"
        >
          {isDownloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          <span className="ml-2">{isDownloading ? "Creating Media Plan..." : "Media Plan"}</span>
        </Button>
        <Button
          type="button"
          onClick={handleDownloadAdvertisingAssociatesMediaPlan}
          disabled={
            !hasAdvertisingAssociatesBilling ||
            isDownloading ||
            isDownloadingAa ||
            isNamingDownloading ||
            isWizardSaving
          }
          className={cn(
            "h-9 shrink-0 rounded-pill bg-brand-dark px-4 py-2 text-primary-foreground hover:bg-brand-dark/90 focus-visible:ring-2 focus-visible:ring-ring",
            !hasAdvertisingAssociatesBilling && "opacity-50"
          )}
        >
          {isDownloadingAa ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          <span className="ml-2">{isDownloadingAa ? "Creating AA Plan..." : "Media Plan (AA)"}</span>
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={handleDownloadNamingConventions}
          disabled={
            isDownloading ||
            isDownloadingAa ||
            isNamingDownloading ||
            isWizardSaving
          }
          className="h-9 shrink-0 rounded-pill border-border px-4 py-2 focus-visible:ring-2 focus-visible:ring-ring"
        >
          {isNamingDownloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          <span className="ml-2">{isNamingDownloading ? "Generating Names..." : "Naming Conventions"}</span>
        </Button>
        <Button
          type="button"
          onClick={handleSaveAndDownloadAll}
          disabled={isLoading || isDownloading || isDownloadingAa || isWizardSaving}
          className="h-9 shrink-0 rounded-pill bg-primary px-4 py-2 text-primary-foreground hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring"
        >
          {isLoading || isDownloading || isDownloadingAa || isWizardSaving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <FileText className="h-4 w-4" />
          )}
          <span className="ml-2">
            {isLoading || isDownloading || isDownloadingAa || isWizardSaving
              ? "Processing..."
              : "Save & Download"}
          </span>
        </Button>
      </CampaignExportsSection>
    </>
  )
  
  return (
    <>
      <ExpertApplyDirtyClearOnSave hasUnsavedChanges={hasUnsavedChanges} />
      <PlanWizardShell
        title="Create a Campaign"
        subtitle={<p>Set up campaign details, select media types, and configure line items.</p>}
        heroActions={
          <>
            <AvaMediaplanCreateActions />
            <Button
              variant="ghost"
              size="sm"
              type="button"
              className="text-xs"
              onClick={handleCopyPageContext}
            >
              Copy Context
            </Button>
          </>
        }
        steps={createCampaignSteps.map((step) => ({
          id: step.id,
          label: step.label,
          sub: step.eyebrow,
        }))}
        railSubItems={wizardRailSubItems}
        summary={wizardSummary}
        onSave={handleSaveAll}
        onExit={handleExit}
        isSaving={isWizardSaving}
        bottomBar={wizardBottomBar}
      >
          <Form {...form}>
          <form className="space-y-6">
            <section id="campaign-setup" data-create-step className="scroll-mt-[18px] rounded-frame border border-border bg-card p-4 shadow-e1 sm:p-5">
            <div className="mb-5 flex flex-col gap-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Step 01</p>
              <h2 className="text-xl font-semibold text-foreground">Campaign setup</h2>
              <p className="text-sm text-muted-foreground">Set the core campaign details and planning model before allocating channels.</p>
            </div>
            <div className="grid grid-cols-1 gap-6">
            <div
              id="builder-section-campaign"
              className="flex h-full min-w-0 flex-col gap-4 overflow-visible rounded-card border border-border bg-surface-panel shadow-e0 scroll-mt-24"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 bg-muted/20 px-6 pb-3 pt-5">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Campaign Details</h3>
                <CampaignDatePresetBar
                  onApply={({ start, end }) => {
                    form.setValue("mp_campaigndates_start", start, { shouldDirty: true, shouldValidate: true })
                    form.setValue("mp_campaigndates_end", end, { shouldDirty: true, shouldValidate: true })
                  }}
                />
              </div>
              <div className="grid w-full flex-1 grid-cols-1 gap-4 px-6 pb-6 md:grid-cols-2 xl:grid-cols-4">
              <FormField
                control={form.control}
                name={"mp_client_name" as keyof MediaPlanFormValues}
                render={({ field }) => {
                  const selectedClient = clients.find((client) => client.mp_client_name === field.value)

                  return (
                    <FormItem>
                      <FormLabel className="text-sm font-medium text-text-secondary">
                        Client Name <span className="text-status-critical-fg" aria-hidden>*</span>
                      </FormLabel>
                      <FormControl>
                        <Popover open={isClientPopoverOpen} onOpenChange={setIsClientPopoverOpen}>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              role="combobox"
                              aria-expanded={isClientPopoverOpen}
                              className="w-full justify-between"
                            >
                              <span className="truncate">
                                {selectedClient
                                  ? selectedClient.mp_client_name
                                  : isLoading
                                    ? "Loading clients..."
                                    : "Select a client"}
                              </span>
                              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-[320px] p-0" align="start">
                            <Command>
                              <CommandInput placeholder="Search clients..." />
                              <CommandList>
                                <CommandEmpty>{isLoading ? "Loading clients..." : "No clients found."}</CommandEmpty>
                                {clients.length > 0 && (
                                  <CommandGroup>
                                    {sortByLabel(clients, (client) => client.mp_client_name ?? "").map((client) => {
                                      const isSelected =
                                        selectedClientId === client.id.toString() ||
                                        field.value === client.mp_client_name

                                      return (
                                        <CommandItem
                                          key={client.id}
                                          value={`${client.mp_client_name} ${client.mbaidentifier || ""}`.trim()}
                                          onSelect={() => {
                                            field.onChange(client.mp_client_name)
                                            handleClientChange(client.id.toString())
                                            setIsClientPopoverOpen(false)
                                          }}
                                        >
                                          <Check
                                            className={cn(
                                              "mr-2 h-4 w-4",
                                              isSelected ? "opacity-100" : "opacity-0"
                                            )}
                                          />
                                          <span className="truncate">{client.mp_client_name}</span>
                                        </CommandItem>
                                      )
                                    })}
                                  </CommandGroup>
                                )}
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )
                }}
              />

              <FormField
                control={form.control}
                name={"mp_campaignname" as keyof MediaPlanFormValues}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium text-text-secondary">
                      Campaign Name <span className="text-status-critical-fg" aria-hidden>*</span>
                    </FormLabel>
                    <FormControl>
                      <Input {...field} value={String(field.value)} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name={"mp_brand" as keyof MediaPlanFormValues}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium text-text-secondary">Brand</FormLabel>
                    <FormControl>
                      <Input {...field} value={String(field.value)} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name={"mp_campaignstatus" as keyof MediaPlanFormValues}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium text-text-secondary">Campaign Status</FormLabel>
                    <FormControl>
                      <Combobox
                        value={String(field.value ?? "")}
                        onValueChange={field.onChange}
                        placeholder="Select campaign status"
                        searchPlaceholder="Search statuses..."
                        options={[
                          { value: "draft", label: "Draft" },
                          { value: "planned", label: "Planned" },
                          { value: "approved", label: "Approved" },
                          { value: "booked", label: "Booked" },
                          { value: "completed", label: "Completed" },
                          { value: "cancelled", label: "Cancelled" },
                        ]}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="mp_clientcontact"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium text-text-secondary">Client Contact</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="mp_ponumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium text-text-secondary">PO Number</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div id="builder-field-campaign-dates" className="sm:col-span-2 scroll-mt-24">
                <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="mp_campaigndates_start"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium text-text-secondary">
                      Campaign Start Date <span className="text-status-critical-fg" aria-hidden>*</span>
                    </FormLabel>
                    <FormControl>
                      <SingleDatePicker
                        ref={field.ref}
                        name={field.name}
                        onBlur={field.onBlur}
                        value={field.value}
                        onChange={field.onChange}
                        className={cn("w-full pl-3 text-left font-normal", !field.value && "text-muted-foreground")}
                        calendarContext="general"
                        dateFormat="PPP"
                        placeholder={<span>Pick a date</span>}
                        iconClassName="ml-auto h-4 w-4 opacity-50"
                        isDateDisabled={(date) => date > new Date("2100-01-01")}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="mp_campaigndates_end"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium text-text-secondary">
                      Campaign End Date <span className="text-status-critical-fg" aria-hidden>*</span>
                    </FormLabel>
                    <FormControl>
                      <SingleDatePicker
                        ref={field.ref}
                        name={field.name}
                        onBlur={field.onBlur}
                        value={field.value}
                        onChange={field.onChange}
                        className={cn("w-full pl-3 text-left font-normal", !field.value && "text-muted-foreground")}
                        calendarContext="general"
                        dateFormat="PPP"
                        placeholder={<span>Pick a date</span>}
                        iconClassName="ml-auto h-4 w-4 opacity-50"
                        isDateDisabled={(date) => date > new Date("2100-01-01")}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
                </div>
              </div>

              <FormField
                control={form.control}
                name="mp_campaignbudget"
                render={({ field }) => (
                  <FormItem id="builder-field-campaign-budget" className="scroll-mt-24">
                    <FormLabel className="text-sm font-medium text-text-secondary">
                      Campaign Budget <span className="text-status-critical-fg" aria-hidden>*</span>
                    </FormLabel>
                    <FormControl>
                      <MoneyInput
                        ref={field.ref}
                        name={field.name}
                        onBlur={field.onBlur}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 max-[375px]:min-h-11 md:text-sm"
                        value={field.value}
                        onChange={(v) => field.onChange(v ?? 0)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="mbaidentifier"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium text-text-secondary">MBA Identifier</FormLabel>
                    <div
                      className={cn(
                        "flex h-10 w-full items-center rounded-md border border-border/40 bg-muted/30 px-3 py-2 text-sm text-foreground",
                        !field.value && "text-muted-foreground"
                      )}
                    >
                      <span className="truncate">{field.value || "No client selected"}</span>
                    </div>
                    <FormDescription className="text-[11px]">
                      This field is automatically populated based on the selected client.
                    </FormDescription>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="mba_number"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium text-text-secondary">MBA Number</FormLabel>
                    <div
                      className={cn(
                        "flex h-10 w-full items-center rounded-md border border-border/40 bg-muted/30 px-3 py-2 text-sm text-foreground",
                        !field.value && "text-muted-foreground"
                      )}
                    >
                      <span className="truncate">{field.value || "No MBA Number generated"}</span>
                    </div>
                    <FormDescription className="text-[11px]">
                      This field is automatically generated based on the MBA Identifier.
                    </FormDescription>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="mp_plannumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium text-text-secondary">Media Plan Version</FormLabel>
                    <div className="flex h-10 w-full items-center rounded-md border border-border/40 bg-muted/30 px-3 py-2 text-sm text-foreground">
                      <span className="truncate">1</span>
                    </div>
                    <FormDescription className="text-[11px]">This is the media plan version.</FormDescription>
                  </FormItem>
                )}
              />
              </div>
            </div>
            </div>
            </section>

            <section id="channel-allocation" data-create-step className="scroll-mt-[18px] rounded-frame border border-border bg-card p-4 shadow-e1 sm:p-5">
              <div className="mb-5 flex flex-col gap-1">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Step 02</p>
                <h2 className="text-xl font-semibold text-foreground">Channel allocation</h2>
                <p className="text-sm text-muted-foreground">Select channel families and build the active media line items in one continuous flow.</p>
              </div>

              <div className="rounded-card border border-border bg-surface-panel shadow-e0">
                <div className="border-b border-border bg-[var(--fill-track)] px-6 pb-3 pt-5">
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Media channels</h3>
                </div>
                <div className="grid min-h-0 w-full grid-cols-2 content-start gap-2 px-6 py-4 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                {mediaTypes.filter(medium => medium.name !== "mp_fixedfee").map((medium) => {
                  const switchId = `media-type-${medium.name}`
                  const accentColor = getMediaTypeAccentColor(medium.name)
                  return (
                    <div key={medium.name} className="flex items-center gap-3 rounded-card border border-border bg-card px-3 py-2 shadow-e0">
                      <span
                        className="h-8 w-1.5 shrink-0 rounded-pill"
                        style={accentColor ? { backgroundColor: accentColor } : undefined}
                        aria-hidden="true"
                      />
                      <Controller
                        control={form.control}
                        name={medium.name as keyof MediaPlanFormValues}
                        render={({ field }) => (
                          <Switch
                            id={switchId}
                            className="shrink-0"
                            checked={!!field.value}
                            onCheckedChange={(checked) => {
                              const next = Boolean(checked)
                              if (next === Boolean(field.value)) return
                              field.onChange(next)
                            }}
                            onBlur={field.onBlur}
                            disabled={field.disabled}
                            ref={field.ref}
                          />
                        )}
                      />
                      <Label
                        htmlFor={switchId}
                        className="font-normal leading-snug min-w-0 flex-1 cursor-pointer"
                      >
                        {medium.label}
                      </Label>
                    </div>
                  )
                })}
                </div>
              </div>

            </section>

            <section id="mba-billing" data-create-step className="scroll-mt-[18px] rounded-frame border border-border bg-card p-4 shadow-e1 sm:p-5">
              <div className="mb-5 flex flex-col gap-1">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Step 03</p>
                <h2 className="text-xl font-semibold text-foreground">MBA &amp; billing</h2>
                <p className="text-sm text-muted-foreground">Review draft investment totals, billing months, and KPI assumptions.</p>
              </div>
              <div className="grid grid-cols-1 gap-6 xl:grid-cols-3 xl:gap-7 2xl:gap-8 xl:items-stretch">
                <div className="flex min-w-0 flex-col gap-4 xl:col-span-2">
                  <MbaBillingAutoCalcSummary
                    financials={campaignFinancials}
                    panelIndicators={panelIndicators}
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <Button type="button" onClick={handleMbaBillingModalOpen}>
                      Open MBA &amp; billing
                    </Button>
                    {isPartialMBA ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setIsPartialMBA(false)
                          handlePartialMBAReset()
                        }}
                      >
                        Reset approvals to all-in
                      </Button>
                    ) : null}
                    <p className="text-xs text-muted-foreground">
                      Approve lines and edit scope in the modal. Use Edit timing for manual billing before save.
                    </p>
                  </div>
                </div>

                <div
                  id="builder-section-kpis"
                  className="flex h-full min-w-0 flex-col overflow-visible rounded-card border border-border bg-surface-panel shadow-e0 scroll-mt-24"
                >
                  <div className="border-b border-border bg-[var(--fill-track)] px-6 pb-3 pt-5">
                    <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">KPIs</h3>
                  </div>
                  <div className="px-4 py-3 overflow-x-auto">
                    <KPISection
                      host={createMediaPlanKpiHost({
                        rows: kpiRows,
                        setRows: setKpiRows,
                        onResetSavedLayer: handleKPIReset,
                      })}
                      isLoading={isKPILoading}
                      publishers={kpiPublishers}
                      onPublisherKpiAdded={async () => {
                        const data = await getPublisherKPIs()
                        setPublisherKPIs(data)
                        setKpiTrigger((t) => t + 1)
                      }}
                    />
                  </div>
                </div>
              </div>
            </section>

<SavingModal
  isOpen={shouldShowSaveModal}
  items={saveStatus}
  isSaving={isSavingInProgress}
  onClose={handleCloseSaveModal}
/>

<OutcomeModal
  isOpen={modalOpen}
  onClose={() => setModalOpen(false)}
  title={modalTitle}
  outcome={modalOutcome}
  isLoading={modalLoading}
/>

      <MbaBillingModal
        open={isMbaBillingModalOpen}
        onOpenChange={(open) => {
          setIsMbaBillingModalOpen(open)
          if (!open) {
            setIsManualBillingModalOpen(false)
            setBillingError({ show: false, messages: [] })
          }
        }}
        versionLabel="v1"
        financials={campaignFinancials}
        panelIndicators={panelIndicators}
        scopeLines={mbaBillingScopeLines}
        onToggleLineApproved={handleMbaBillingToggleLine}
        onResetApprovalsToAllIn={handleMbaBillingResetApprovalsToAllIn}
        onDownloadExcel={handleDownloadBillingScheduleExcel}
        downloadDisabled={campaignFinancials.billingSchedule.length === 0}
        showManualEditor={isManualBillingModalOpen}
        onToggleManualEditor={() => {
          if (isManualBillingModalOpen) {
            setIsManualBillingModalOpen(false)
            setBillingError({ show: false, messages: [] })
          } else {
            handleManualBillingOpen()
          }
        }}
        manualBillingEditor={
          <ManualBillingSpreadsheetProvider
            months={manualBillingMonths}
            autoReferenceMonths={
              manualBillingAutoReferenceMonths.length > 0
                ? manualBillingAutoReferenceMonths
                : undefined
            }
            expandedAccordionValues={manualBillingAccordionExpanded}
            mediaSections={manualBillingMediaSections}
            formatter={mbaCurrencyFormatter}
            callbacks={manualBillingSpreadsheetCallbacks}
            onPasteLayout={(layout) => {
              if (layout === "tile") {
                toast({
                  title: "Pattern repeated across selection",
                  description:
                    "Clipboard values were tiled or repeated to fill the selected cells.",
                })
              } else if (layout === "clip") {
                toast({
                  title: "Paste clipped to selection",
                  description: "Only the top-left part of the clipboard fit the selected area.",
                })
              }
            }}
          >
            <div className="min-h-0 flex-1 space-y-6">
              <Accordion
                type="multiple"
                className="w-full"
                value={manualBillingAccordionExpanded}
                onValueChange={setManualBillingAccordionExpanded}
              >
                {mediaTypes
                  .filter((medium) => medium.name !== "mp_production")
                  .filter((medium) => watchedMediaTypesMap[medium.name] && medium.component)
                  .map((medium) => {
                    const mediaKey = mediaKeyMap[medium.name]
                    const headers = getMediaTypeHeadersForSchedule(mediaKey)
                    const firstMonth = manualBillingMonths[0]
                    const lineItems = firstMonth?.lineItems?.[
                      mediaKey as keyof typeof firstMonth.lineItems
                    ] as BillingLineItem[] | undefined

                    if (!lineItems || lineItems.length === 0) return null

                    return (
                      <AccordionItem key={medium.name} value={`manual-billing-${medium.name}`}>
                        <AccordionTrigger className="text-left">{medium.label}</AccordionTrigger>
                        <AccordionContent>
                          <div className="mt-4 overflow-x-auto">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead className="w-[90px]">Auto</TableHead>
                                  <TableHead className="w-[90px]">Pre-bill</TableHead>
                                  <TableHead className="w-[150px]">Billing mode</TableHead>
                                  <TableHead>{headers.header1}</TableHead>
                                  <TableHead>{headers.header2}</TableHead>
                                  {manualBillingMonths.map((m) => (
                                    <TableHead
                                      key={m.monthYear}
                                      className="whitespace-nowrap text-right"
                                    >
                                      {m.monthYear}
                                    </TableHead>
                                  ))}
                                  <TableHead className="text-right font-bold">Total</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {lineItems.map((lineItem) => (
                                  <TableRow key={lineItem.id}>
                                    <TableCell>
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() =>
                                          handleManualBillingLineItemResetToAuto(
                                            mediaKey,
                                            lineItem.id
                                          )
                                        }
                                      >
                                        Reset
                                      </Button>
                                    </TableCell>
                                    <TableCell>
                                      <Checkbox
                                        checked={Boolean(lineItem.preBill)}
                                        onCheckedChange={(next) =>
                                          handleManualBillingLineItemPreBillToggle(
                                            mediaKey,
                                            lineItem.id,
                                            Boolean(next)
                                          )
                                        }
                                      />
                                    </TableCell>
                                    <TableCell>
                                      <div className="flex items-center gap-2 whitespace-nowrap">
                                        <Switch
                                          checked={lineItem.billingMode === "manual"}
                                          aria-label={`Set ${lineItem.header1} ${lineItem.header2} billing mode`}
                                          onCheckedChange={(checked) =>
                                            manualBillingSpreadsheetCallbacks.setLineBillingMode(
                                              lineItem.id,
                                              checked ? "manual" : "auto"
                                            )
                                          }
                                        />
                                        <span className="text-sm text-muted-foreground">
                                          {lineItem.billingMode === "manual"
                                            ? "Manual"
                                            : "Follow auto"}
                                        </span>
                                      </div>
                                    </TableCell>
                                    <TableCell>{lineItem.header1}</TableCell>
                                    <TableCell>{lineItem.header2}</TableCell>
                                    {manualBillingMonths.map((month, monthIndex) => {
                                      const monthAmount =
                                        lineItem.monthlyAmounts?.[month.monthYear] || 0
                                      return (
                                        <TableCell key={month.monthYear} align="right">
                                          <ManualBillingSpreadsheetLineItemInput
                                            key={`${lineItem.id}__${month.monthYear}`}
                                            cellKey={{
                                              tableKey: mediaKey,
                                              rowKind: "lineItem",
                                              rowId: lineItem.id,
                                              monthYear: month.monthYear,
                                            }}
                                            className="w-28 text-right"
                                            amount={monthAmount}
                                            formatter={mbaCurrencyFormatter}
                                            onAmountChange={(numericValue) => {
                                              const tempCopy = [...manualBillingMonths]
                                              syncLineItemMonthlyAmountAcrossAllMonthRows(
                                                tempCopy,
                                                mediaKey,
                                                lineItem.id,
                                                month.monthYear,
                                                numericValue
                                              )
                                              setManualBillingMonths(tempCopy)
                                            }}
                                            onCommit={(raw) =>
                                              handleManualBillingChange(
                                                monthIndex,
                                                "lineItem",
                                                raw,
                                                mediaKey,
                                                lineItem.id,
                                                month.monthYear
                                              )
                                            }
                                          />
                                        </TableCell>
                                      )
                                    })}
                                    <TableCell className="text-right font-semibold">
                                      {mbaCurrencyFormatter.format(lineItem.totalAmount)}
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                              <TableFooter>
                                <TableRow className="border-t-2 bg-muted/30 font-bold">
                                  <TableCell colSpan={5}>Subtotal</TableCell>
                                  {manualBillingMonths.map((m) => {
                                    const subtotal = lineItems.reduce(
                                      (sum, li) =>
                                        sum + (li.monthlyAmounts?.[m.monthYear] || 0),
                                      0
                                    )
                                    return (
                                      <TableCell key={m.monthYear} className="text-right">
                                        {mbaCurrencyFormatter.format(subtotal)}
                                      </TableCell>
                                    )
                                  })}
                                  <TableCell className="text-right">
                                    {mbaCurrencyFormatter.format(
                                      lineItems.reduce(
                                        (sum, li) => sum + (li.totalAmount || 0),
                                        0
                                      )
                                    )}
                                  </TableCell>
                                </TableRow>
                              </TableFooter>
                            </Table>
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    )
                  })}

                <AccordionItem value="manual-billing-costs">
                  <AccordionTrigger className="text-left">
                    Fees, Ad Serving &amp; Production
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="mt-4 overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[90px]">Pre-bill</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Details</TableHead>
                            {manualBillingMonths.map((m) => (
                              <TableHead
                                key={m.monthYear}
                                className="whitespace-nowrap text-right"
                              >
                                {m.monthYear}
                              </TableHead>
                            ))}
                            <TableHead className="text-right font-bold">Total</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          <TableRow>
                            <TableCell>
                              <Checkbox
                                checked={manualBillingCostPreBill.fee}
                                onCheckedChange={(next) =>
                                  handleManualBillingCostPreBillToggle("fee", Boolean(next))
                                }
                              />
                            </TableCell>
                            <TableCell className="font-medium">Fees</TableCell>
                            <TableCell className="text-muted-foreground">Total</TableCell>
                            {manualBillingMonths.map((month, monthIndex) => (
                              <TableCell key={month.monthYear} align="right">
                                <ManualBillingSpreadsheetCostInput
                                  cellKey={{
                                    tableKey: "cost",
                                    rowKind: "cost",
                                    rowId: "fee",
                                    monthYear: month.monthYear,
                                  }}
                                  value={month.feeTotal}
                                  onBlur={(raw) =>
                                    handleManualBillingChange(monthIndex, "fee", raw)
                                  }
                                  onChange={(next) => {
                                    const tempCopy = [...manualBillingMonths]
                                    tempCopy[monthIndex].feeTotal = next
                                    setManualBillingMonths(tempCopy)
                                  }}
                                />
                              </TableCell>
                            ))}
                            <TableCell className="text-right font-semibold">
                              {mbaCurrencyFormatter.format(
                                manualBillingMonths.reduce(
                                  (acc, m) =>
                                    acc +
                                    (parseFloat(
                                      String(m.feeTotal || "$0").replace(/[^0-9.-]/g, "")
                                    ) || 0),
                                  0
                                )
                              )}
                            </TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell>
                              <Checkbox
                                checked={manualBillingCostPreBill.adServing}
                                onCheckedChange={(next) =>
                                  handleManualBillingCostPreBillToggle(
                                    "adServing",
                                    Boolean(next)
                                  )
                                }
                              />
                            </TableCell>
                            <TableCell className="font-medium">Ad Serving</TableCell>
                            <TableCell className="text-muted-foreground">Tech fees</TableCell>
                            {manualBillingMonths.map((month, monthIndex) => (
                              <TableCell key={month.monthYear} align="right">
                                <ManualBillingSpreadsheetCostInput
                                  cellKey={{
                                    tableKey: "cost",
                                    rowKind: "cost",
                                    rowId: "adServing",
                                    monthYear: month.monthYear,
                                  }}
                                  value={month.adservingTechFees}
                                  onBlur={(raw) =>
                                    handleManualBillingChange(monthIndex, "adServing", raw)
                                  }
                                  onChange={(next) => {
                                    const tempCopy = [...manualBillingMonths]
                                    tempCopy[monthIndex].adservingTechFees = next
                                    setManualBillingMonths(tempCopy)
                                  }}
                                />
                              </TableCell>
                            ))}
                            <TableCell className="text-right font-semibold">
                              {mbaCurrencyFormatter.format(
                                manualBillingMonths.reduce(
                                  (acc, m) =>
                                    acc +
                                    (parseFloat(
                                      String(m.adservingTechFees || "$0").replace(
                                        /[^0-9.-]/g,
                                        ""
                                      )
                                    ) || 0),
                                  0
                                )
                              )}
                            </TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell>
                              <Checkbox
                                checked={manualBillingCostPreBill.production}
                                onCheckedChange={(next) =>
                                  handleManualBillingCostPreBillToggle(
                                    "production",
                                    Boolean(next)
                                  )
                                }
                              />
                            </TableCell>
                            <TableCell className="font-medium">Production</TableCell>
                            <TableCell className="text-muted-foreground">Total</TableCell>
                            {manualBillingMonths.map((month, monthIndex) => (
                              <TableCell key={month.monthYear} align="right">
                                <ManualBillingSpreadsheetCostInput
                                  cellKey={{
                                    tableKey: "cost",
                                    rowKind: "cost",
                                    rowId: "production",
                                    monthYear: month.monthYear,
                                  }}
                                  value={month.production || "$0.00"}
                                  onBlur={(raw) =>
                                    handleManualBillingChange(
                                      monthIndex,
                                      "production",
                                      raw,
                                      "production"
                                    )
                                  }
                                  onChange={(next) => {
                                    const tempCopy = [...manualBillingMonths]
                                    tempCopy[monthIndex].production = next
                                    if (
                                      tempCopy[monthIndex].mediaCosts?.production !== undefined
                                    ) {
                                      tempCopy[monthIndex].mediaCosts.production = next
                                    }
                                    setManualBillingMonths(tempCopy)
                                  }}
                                />
                              </TableCell>
                            ))}
                            <TableCell className="text-right font-semibold">
                              {mbaCurrencyFormatter.format(
                                manualBillingMonths.reduce(
                                  (acc, m) =>
                                    acc +
                                    (parseFloat(
                                      String(m.production || "$0").replace(/[^0-9.-]/g, "")
                                    ) || 0),
                                  0
                                )
                              )}
                            </TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>

              <div className="text-right">
                <span className="font-bold">Grand Total: {manualBillingTotal}</span>
                {billingError.show ? (
                  <div className="mt-2 rounded-card border border-destructive/40 bg-pacing-critical-bg p-3 text-left text-status-critical-fg">
                    <p className="font-bold">Line Item Billing Mismatch</p>
                    <p className="mt-1 text-sm">
                      Manual media months must sum to the auto line media total (timing only).
                    </p>
                    <div className="mt-2 max-h-56 space-y-1 overflow-auto text-sm">
                      {billingError.messages.map((message, idx) => (
                        <p key={`${idx}-${message}`}>- {message}</p>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="flex justify-end gap-2 border-t border-border pt-4">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setIsManualBillingModalOpen(false)
                    setBillingError({ show: false, messages: [] })
                  }}
                >
                  Cancel
                </Button>
                <Button type="button" onClick={handleManualBillingApply}>
                  Apply billing changes
                </Button>
              </div>
            </div>
          </ManualBillingSpreadsheetProvider>
        }
        footer={
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-2">
              {isPartialMBA ? (
                <Button type="button" variant="outline" size="sm" onClick={handlePartialMBASave}>
                  Apply scope
                </Button>
              ) : null}
            </div>
            <Button type="button" variant="outline" onClick={() => setIsMbaBillingModalOpen(false)}>
              Close
            </Button>
          </div>
        }
      />

            <div className="space-y-6">
              <div className="relative pb-2 pt-8">
                <div className="absolute inset-x-0 top-4 h-px bg-border/50" />
                <h3 className="relative inline-block bg-background pr-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Media Containers
                </h3>
              </div>
            {mediaTypes.map((medium) => {
              if (watchedMediaTypesMap[medium.name] && medium.component) {
                const Component = medium.component;
                const componentProps = {
                  clientId: selectedClientId,
                  ...(medium.name === "mp_search" && { 
                    feesearch, 
                    onTotalMediaChange: handleSearchTotalChange, 
                    onBurstsChange: handleSearchBurstsChange,
                    onInvestmentChange: (rows) => handleInvestmentChange("search", rows)
                  }),
                  ...(medium.name === "mp_socialmedia" && { 
                    feesocial, 
                    onTotalMediaChange: handleSocialMediaTotalChange,
                    onBurstsChange: handleSocialMediaBurstsChange,
                    onInvestmentChange: (rows) => handleInvestmentChange("socialmedia", rows)
                  }),
                  ...(medium.name === "mp_bvod" && { 
                    feebvod, 
                    onTotalMediaChange: handleBVODTotalChange,
                    onBurstsChange: handleBVODBurstsChange,
                    onInvestmentChange: (rows) => handleInvestmentChange("bvod", rows)
                  }),
                  ...(medium.name === "mp_integration" && {
                    feeintegration,
                    onTotalMediaChange: handleIntegrationTotalChange,
                    onBurstsChange: handleIntegrationBurstsChange,
                    onInvestmentChange: (rows) => handleInvestmentChange("integration", rows)
                  }),
                  ...(medium.name === "mp_progdisplay" && { 
                    feeprogdisplay, 
                    onTotalMediaChange: handleProgDisplayTotalChange,
                    onBurstsChange: handleProgDisplayBurstsChange,
                    onInvestmentChange: (rows) => handleInvestmentChange("progdisplay", rows)
                  }),
                  ...(medium.name === "mp_progvideo" && { 
                    feeprogvideo, 
                    onTotalMediaChange: handleProgVideoTotalChange,
                    onBurstsChange: handleProgVideoBurstsChange,
                    onInvestmentChange: (rows) => handleInvestmentChange("progvideo", rows)
                  }),
                  ...(medium.name === "mp_digiaudio" && { 
                    feedigiaudio, 
                    onTotalMediaChange: handleDigiAudioTotalChange,
                    onBurstsChange: handleDigiAudioBurstsChange,
                    onInvestmentChange: (rows) => handleInvestmentChange("digiaudio", rows)
                  }),
                  ...(medium.name === "mp_digidisplay" && { 
                    feedigidisplay, 
                    onTotalMediaChange: handleDigiDisplayTotalChange,
                    onBurstsChange: handleDigiDisplayBurstsChange,
                    onInvestmentChange: (rows) => handleInvestmentChange("digidisplay", rows)
                  }),
                  ...(medium.name === "mp_digivideo" && { 
                    feedigivideo, 
                    onTotalMediaChange: handleDigiVideoTotalChange,
                    onBurstsChange: handleDigiVideoBurstsChange,
                    onInvestmentChange: (rows) => handleInvestmentChange("digivideo", rows)
                  }),
                  ...(medium.name === "mp_progaudio" && { 
                    feeprogaudio, 
                    onTotalMediaChange: handleProgAudioTotalChange,
                    onBurstsChange: handleProgAudioBurstsChange,
                    onInvestmentChange: (rows) => handleInvestmentChange("progaudio", rows)
                  }),
                  ...(medium.name === "mp_cinema" && {
                  feecinema,
                  onTotalMediaChange: handleCinemaTotalChange,
                  onBurstsChange: handleCinemaBurstsChange,
                  onInvestmentChange: (rows) => handleInvestmentChange("cinema", rows),
                  }),
                  ...(medium.name === "mp_television" && {
                  feeTelevision,
                  onTotalMediaChange: handleTelevisionTotalChange,
                  onBurstsChange: handleTelevisionBurstsChange,
                  onInvestmentChange: (rows) => handleInvestmentChange("television", rows),
                  }),
                  ...(medium.name === "mp_radio" && {
                  feeRadio,
                  onTotalMediaChange: handleRadioTotalChange,
                  onBurstsChange: handleRadioBurstsChange,
                  onInvestmentChange: (rows) => handleInvestmentChange("radio", rows),
                  }),
                  ...(medium.name === "mp_newspaper" && {
                  feeNewspapers,
                  onTotalMediaChange: handleNewspaperTotalChange,
                  onBurstsChange: handleNewspaperBurstsChange,
                  onInvestmentChange: (rows) => handleInvestmentChange("newspaper", rows),
                  }),
                  ...(medium.name === "mp_magazines" && {
                  feeMagazines,
                  onTotalMediaChange: handleMagazinesTotalChange,
                  onBurstsChange: handleMagazineBurstsChange,
                  onInvestmentChange: (rows) => handleInvestmentChange("magazines", rows),
                  }),
                  ...(medium.name === "mp_ooh" && {
                  feeOoh,
                  onTotalMediaChange: handleOohTotalChange,
                  onBurstsChange: handleOohBurstsChange,
                  onInvestmentChange: (rows) => handleInvestmentChange("ooh", rows),
                  }),
                  ...(medium.name === "mp_production" && {
                  feesearch: feeProduction,
                  onTotalMediaChange: handleProductionTotalChange,
                  onBurstsChange: handleProductionBurstsChange,
                  onInvestmentChange: (rows) => handleInvestmentChange("production", rows),
                  }),
                  ...(medium.name === "mp_influencers" && {
                  feeinfluencers,
                  onTotalMediaChange: handleInfluencersTotalChange,
                  onBurstsChange: handleInfluencersBurstsChange,
                  onInvestmentChange: (rows) => handleInvestmentChange("influencers", rows),
                  }),                
                  
                };
                return (
                  <div key={medium.name} id={`media-section-${medium.name}`} className="mt-6 scroll-mt-24">
                    <Suspense fallback={<MediaContainerSuspenseFallback label={medium.label} />}>
                      {medium.name === "mp_search" && (
                        <Suspense fallback={<MediaContainerSuspenseFallback label="search container" />}>
                          <SearchContainer
                            clientId={selectedClientId}
                            feesearch={feesearch || 0}
                            onTotalMediaChange={handleSearchTotalChange}
                            onBurstsChange={handleSearchBurstsChange}
                            onInvestmentChange={(rows) => handleInvestmentChange("search", rows)}
                            onLineItemsChange={handleSearchItemsChange}
                            onMediaLineItemsChange={handleSearchMediaLineItemsChange}
                            campaignStartDate={campaignStart}
                            campaignEndDate={campaignEnd}
                            campaignBudget={watchedCampaignBudget}
                            campaignId={""}
                            mediaTypes={["search"]}
                          />
                        </Suspense>
                      )}
                      {medium.name === "mp_production" && (
                        <Suspense fallback={<MediaContainerSuspenseFallback label="Production" />}>
                          <ProductionContainer
                            clientId={selectedClientId}
                            onTotalMediaChange={handleProductionTotalChange}
                            onBurstsChange={handleProductionBurstsChange}
                            onInvestmentChange={(rows) => handleInvestmentChange("production", rows)}
                            onLineItemsChange={handleProductionItemsChange}
                            onMediaLineItemsChange={handleProductionMediaLineItemsChange}
                            campaignStartDate={campaignStart}
                            campaignEndDate={campaignEnd}
                            campaignBudget={watchedCampaignBudget}
                            campaignId={""}
                            mediaTypes={mediaTypes.map((m) => ({ value: m.label, label: m.label }))}
                          />
                        </Suspense>
                      )}
                      {medium.name === "mp_socialmedia" && (
                        <Suspense fallback={<MediaContainerSuspenseFallback label="Social Media" />}>
                          <SocialMediaContainer
                            clientId={selectedClientId}
                            feesocial={feesocial || 0}
                            onTotalMediaChange={handleSocialMediaTotalChange}
                            onBurstsChange={handleSocialMediaBurstsChange}
                            onInvestmentChange={(rows) => handleInvestmentChange("socialmedia", rows)}
                            onLineItemsChange={handleSocialMediaItemsChange}
                            onSocialMediaLineItemsChange={handleSocialMediaLineItemsStateChange}
                            onMediaLineItemsChange={handleSocialMediaMediaLineItemsChange}
                            campaignStartDate={campaignStart}
                            campaignEndDate={campaignEnd}
                            campaignBudget={watchedCampaignBudget}
                            campaignId={""}
                            mediaTypes={["social"]}
                          />
                        </Suspense>
                      )}
                      {medium.name === "mp_bvod" && (
                        <Suspense fallback={<MediaContainerSuspenseFallback label="BVOD" />}>
                          <BVODContainer
                            clientId={selectedClientId}
                            feebvod={feebvod || 0}
                            onTotalMediaChange={handleBVODTotalChange}
                            onBurstsChange={handleBVODBurstsChange}
                            onInvestmentChange={(rows) => handleInvestmentChange("bvod", rows)}
                            onLineItemsChange={handleBVODItemsChange}
                            onMediaLineItemsChange={handleBvodMediaLineItemsChange}
                            campaignStartDate={campaignStart}
                            campaignEndDate={campaignEnd}
                            campaignBudget={watchedCampaignBudget}
                            campaignId={""}
                            mediaTypes={["bvod"]}
                          />
                        </Suspense>
                      )}
                      {medium.name === "mp_integration" && (
                        <Suspense fallback={<MediaContainerSuspenseFallback label="Integration" />}>
                          <IntegrationContainer
                            clientId={selectedClientId}
                            feeintegration={feeintegration || 0}
                            onTotalMediaChange={handleIntegrationTotalChange}
                            onBurstsChange={handleIntegrationBurstsChange}
                            onInvestmentChange={(rows) => handleInvestmentChange("integration", rows)}
                            onLineItemsChange={handleIntegrationItemsChange}
                            onMediaLineItemsChange={handleIntegrationMediaLineItemsChange}
                            campaignStartDate={campaignStart}
                            campaignEndDate={campaignEnd}
                            campaignBudget={watchedCampaignBudget}
                            campaignId={""}
                            mediaTypes={["integration"]}
                          />
                        </Suspense>
                      )}
                      {medium.name === "mp_cinema" && (
                        <Suspense fallback={<MediaContainerSuspenseFallback label="Cinema" />}>
                          <CinemaContainer
                            clientId={selectedClientId}
                            feecinema={feecinema || 0}
                            onTotalMediaChange={handleCinemaTotalChange}
                            onBurstsChange={handleCinemaBurstsChange}
                            onInvestmentChange={(rows) => handleInvestmentChange("cinema", rows)}
                            onLineItemsChange={handleCinemaItemsChange}
                            onMediaLineItemsChange={handleCinemaMediaLineItemsChange}
                            campaignStartDate={campaignStart}
                            campaignEndDate={campaignEnd}
                            campaignBudget={watchedCampaignBudget}
                            campaignId={""}
                            mediaTypes={["cinema"]}
                          />
                        </Suspense>
                      )}
                      {medium.name === "mp_progaudio" && (
                        <Suspense fallback={<MediaContainerSuspenseFallback label="Prog Audio" />}>
                          <ProgAudioContainer
                            clientId={selectedClientId}
                            feeprogaudio={feeprogaudio || 0}
                            onTotalMediaChange={handleProgAudioTotalChange}
                            onBurstsChange={handleProgAudioBurstsChange}
                            onInvestmentChange={(rows) => handleInvestmentChange("progaudio", rows)}
                            onLineItemsChange={handleProgAudioItemsChange}
                            onMediaLineItemsChange={handleProgAudioMediaLineItemsChange}
                            campaignStartDate={campaignStart}
                            campaignEndDate={campaignEnd}
                            campaignBudget={watchedCampaignBudget}
                            campaignId={""}
                            mediaTypes={["progaudio"]}
                          />
                        </Suspense>
                      )}
                      {medium.name === "mp_progbvod" && (
                        <Suspense fallback={<MediaContainerSuspenseFallback label="Prog BVOD" />}>
                          <ProgBVODContainer
                            clientId={selectedClientId}
                            feeprogbvod={feeprogbvod || 0}
                            onTotalMediaChange={handleProgBvodTotalChange}
                            onBurstsChange={handleProgBvodBurstsChange}
                            onInvestmentChange={(rows) => handleInvestmentChange("progbvod", rows)}
                            onLineItemsChange={handleProgBvodItemsChange}
                            onMediaLineItemsChange={handleProgBvodMediaLineItemsChange}
                            campaignStartDate={campaignStart}
                            campaignEndDate={campaignEnd}
                            campaignBudget={watchedCampaignBudget}
                            campaignId={""}
                            mediaTypes={["progbvod"]}
                          />
                        </Suspense>
                      )}
                      {medium.name === "mp_progooh" && (
                        <Suspense fallback={<MediaContainerSuspenseFallback label="Prog OOH" />}>
                          <ProgOOHContainer
                            clientId={selectedClientId}
                            feeprogooh={feeprogooh || 0}
                            onTotalMediaChange={handleProgOohTotalChange}
                            onBurstsChange={handleProgOohBurstsChange}
                            onInvestmentChange={(rows) => handleInvestmentChange("progooh", rows)}
                            onLineItemsChange={setProgOohItems}
                            onMediaLineItemsChange={handleProgOohMediaLineItemsChange}
                            campaignStartDate={campaignStart}
                            campaignEndDate={campaignEnd}
                            campaignBudget={watchedCampaignBudget}
                            campaignId={""}
                            mediaTypes={["progooh"]}
                          />
                        </Suspense>
                      )}
                    </Suspense>
                    {medium.name === "mp_digiaudio" && (
                      <Suspense fallback={<MediaContainerSuspenseFallback label="Digi Audio" />}>
                        <DigitalAudioContainer
                          clientId={selectedClientId}
                          feedigiaudio={feedigiaudio || 0}
                          onTotalMediaChange={handleDigiAudioTotalChange}
                          onBurstsChange={handleDigiAudioBurstsChange}
                          onInvestmentChange={(rows) => handleInvestmentChange("digiaudio", rows)}
                          onLineItemsChange={setDigiAudioItems}
                          onMediaLineItemsChange={handleDigiAudioMediaLineItemsChange}
                          campaignStartDate={campaignStart}
                          campaignEndDate={campaignEnd}
                          campaignBudget={watchedCampaignBudget}
                          campaignId={""}
                          mediaTypes={["digiaudio"]}
                        />
                      </Suspense>
                    )}
                    {medium.name === "mp_digidisplay" && (
                      <Suspense fallback={<MediaContainerSuspenseFallback label="Digi Display" />}>
                        <DigitalDisplayContainer
                          clientId={selectedClientId}
                          feedigidisplay={feedigidisplay || 0}
                          onTotalMediaChange={handleDigiDisplayTotalChange}
                          onBurstsChange={handleDigiDisplayBurstsChange}
                          onInvestmentChange={(rows) => handleInvestmentChange("digidisplay", rows)}
                          onLineItemsChange={setDigiDisplayItems}
                          onMediaLineItemsChange={handleDigiDisplayMediaLineItemsChange}
                          campaignStartDate={campaignStart}
                          campaignEndDate={campaignEnd}
                          campaignBudget={watchedCampaignBudget}
                          campaignId={""}
                          mediaTypes={["digidisplay"]}
                        />
                      </Suspense>
                    )}
                    {medium.name === "mp_digivideo" && (
                      <Suspense fallback={<MediaContainerSuspenseFallback label="Digi Video" />}>
                        <DigitalVideoContainer
                          clientId={selectedClientId}
                          feedigivideo={feedigivideo || 0}
                          onTotalMediaChange={handleDigiVideoTotalChange}
                          onBurstsChange={handleDigiVideoBurstsChange}
                          onInvestmentChange={(rows) => handleInvestmentChange("digivideo", rows)}
                          onLineItemsChange={setDigiVideoItems}
                          onMediaLineItemsChange={handleDigiVideoMediaLineItemsChange}
                          campaignStartDate={campaignStart}
                          campaignEndDate={campaignEnd}
                          campaignBudget={watchedCampaignBudget}
                          campaignId={""}
                          mediaTypes={["digivideo"]}
                        />
                      </Suspense>
                    )}
                    {medium.name === "mp_progdisplay" && (
                      <Suspense fallback={<MediaContainerSuspenseFallback label="Prog Display" />}>
                        <ProgDisplayContainer
                          clientId={selectedClientId}
                          feeprogdisplay={feeprogdisplay || 0}
                          onTotalMediaChange={handleProgDisplayTotalChange}
                          onBurstsChange={handleProgDisplayBurstsChange}
                          onInvestmentChange={(rows) => handleInvestmentChange("progdisplay", rows)}
                          onLineItemsChange={setProgDisplayItems}
                          onMediaLineItemsChange={handleProgDisplayMediaLineItemsChange}
                          campaignStartDate={campaignStart}
                          campaignEndDate={campaignEnd}
                          campaignBudget={watchedCampaignBudget}
                          campaignId={""}
                          mediaTypes={["progdisplay"]}
                        />
                      </Suspense>
                    )}
                    {medium.name === "mp_progvideo" && (
                      <Suspense fallback={<MediaContainerSuspenseFallback label="Prog Video" />}>
                        <ProgVideoContainer
                          clientId={selectedClientId}
                          feeprogvideo={feeprogvideo || 0}
                          onTotalMediaChange={handleProgVideoTotalChange}
                          onBurstsChange={handleProgVideoBurstsChange}
                          onInvestmentChange={(rows) => handleInvestmentChange("progvideo", rows)}
                          onLineItemsChange={setProgVideoItems}
                          onMediaLineItemsChange={handleProgVideoMediaLineItemsChange}
                          campaignStartDate={campaignStart}
                          campaignEndDate={campaignEnd}
                          campaignBudget={watchedCampaignBudget}
                          campaignId={""}
                          mediaTypes={["progvideo"]}
                        />
                      </Suspense>
                    )}
                    { medium.name === "mp_television" && (
                       <Suspense fallback={<MediaContainerSuspenseFallback label="Television" />}>
                        <TelevisionContainer
                          clientId={selectedClientId}
                          feetelevision={feeTelevision || 0}
                          onTotalMediaChange={handleTelevisionTotalChange}
                          onBurstsChange={handleTelevisionBurstsChange}
                          onInvestmentChange={(rows) => handleInvestmentChange("television", rows)}
                          onLineItemsChange={setTelevisionItems}
                          onTelevisionLineItemsChange={setTelevisionLineItems}
                          onMediaLineItemsChange={handleTelevisionMediaLineItemsChange}
                          campaignStartDate={campaignStart}
                          campaignEndDate={campaignEnd}
                          campaignBudget={watchedCampaignBudget}
                          campaignId={""}
                          mediaTypes={["television"]}
                        />
                      </Suspense>
                    )}
                    { medium.name === "mp_radio" && (
                      <Suspense fallback={<MediaContainerSuspenseFallback label="Radio" />}>
                       <RadioContainer
                         clientId={selectedClientId}
                         feeradio={feeRadio || 0}
                         onTotalMediaChange={handleRadioTotalChange}
                         onBurstsChange={handleRadioBurstsChange}
                         onInvestmentChange={(rows) => handleInvestmentChange("radio", rows)}
                         onLineItemsChange={setRadioItems}
                         onMediaLineItemsChange={handleRadioMediaLineItemsChange}
                         campaignStartDate={campaignStart}
                         campaignEndDate={campaignEnd}
                         campaignBudget={watchedCampaignBudget}
                         campaignId={""}
                         mediaTypes={["radio"]}
                         initialLineItems={
                           radioMediaLineItems.length > 0
                             ? radioMediaLineItems
                             : undefined
                         }
                       />
                      </Suspense>
                    )}
                    { medium.name === "mp_newspaper" && (
                        <Suspense fallback={<MediaContainerSuspenseFallback label="Newspapers" />}>
                          <NewspaperContainer
                            clientId={selectedClientId}
                            feenewspapers={feeNewspapers || 0}
                            onTotalMediaChange={handleNewspaperTotalChange}
                            onBurstsChange={handleNewspaperBurstsChange}
                            onInvestmentChange={(rows) => handleInvestmentChange("newspaper", rows)}
                            onLineItemsChange={setNewspaperItems}
                            onNewspaperLineItemsChange={setNewspaperLineItems}
                            onMediaLineItemsChange={handleNewspaperMediaLineItemsChange}
                            campaignStartDate={campaignStart}
                            campaignEndDate={campaignEnd}
                            campaignBudget={watchedCampaignBudget}
                            campaignId={""}
                            mediaTypes={["newspapers"]}
                          />
                        </Suspense>
                    )}
                    { medium.name === "mp_magazines" && (
                        <Suspense fallback={<MediaContainerSuspenseFallback label="Magazines" />}>
                          <MagazinesContainer
                            clientId={selectedClientId}
                            feemagazines={feeMagazines || 0}
                            onTotalMediaChange={handleMagazinesTotalChange}
                            onBurstsChange={handleMagazineBurstsChange}
                            onInvestmentChange={(rows) => handleInvestmentChange("magazines", rows)}
                            onLineItemsChange={setMagazineItems}
                            onMediaLineItemsChange={handleMagazineMediaLineItemsChange}
                            campaignStartDate={campaignStart}
                            campaignEndDate={campaignEnd}
                            campaignBudget={watchedCampaignBudget}
                            campaignId={""}
                            mediaTypes={["magazines"]}
                          />
                        </Suspense>
                    )}
                    { medium.name === "mp_ooh" && (
                        <Suspense fallback={<MediaContainerSuspenseFallback label="OOH" />}>
                          <OOHContainer
                            clientId={selectedClientId}
                            feeooh={feeOoh || 0}
                            onTotalMediaChange={handleOohTotalChange}
                            onBurstsChange={handleOohBurstsChange}
                            onInvestmentChange={(rows) => handleInvestmentChange("ooh", rows)}
                            onLineItemsChange={setOohItems}
                            onMediaLineItemsChange={handleOohMediaLineItemsChange}
                            campaignStartDate={campaignStart}
                            campaignEndDate={campaignEnd}
                            campaignBudget={watchedCampaignBudget}
                            campaignId={""}
                            mediaTypes={["ooh"]}
                            initialLineItems={
                              oohMediaLineItems.length > 0
                                ? oohMediaLineItems
                                : undefined
                            }
                          />
                        </Suspense>
                    )}
                    { medium.name === "mp_influencers" && (
                        <Suspense fallback={<MediaContainerSuspenseFallback label="Influencers" />}>
                          <InfluencersContainer
                            clientId={selectedClientId}
                            feeinfluencers={feeinfluencers || 0}
                            onTotalMediaChange={handleInfluencersTotalChange}
                            onBurstsChange={handleInfluencersBurstsChange}
                            onInvestmentChange={(rows) => handleInvestmentChange("influencers", rows)}
                            onLineItemsChange={setInfluencersItems}
                            onMediaLineItemsChange={handleInfluencersMediaLineItemsChange}
                            campaignStartDate={campaignStart}
                            campaignEndDate={campaignEnd}
                            campaignBudget={watchedCampaignBudget}
                            campaignId={""}
                            mediaTypes={["influencers"]}
                          />
                        </Suspense>
                    )}                                                                               
                  </div>
                );
              }
              return null;
            })}
            </div>
            <section id="review-export" data-create-step className="scroll-mt-[18px] rounded-frame border border-border bg-card p-4 shadow-e1 sm:p-5">
              <div className="mb-5 flex flex-col gap-1">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Step 04</p>
                <h2 className="text-xl font-semibold text-foreground">Review &amp; files</h2>
                <p className="text-sm text-muted-foreground">Generate draft files or save the campaign once allocations and billing are ready.</p>
              </div>

              {dateWarning.hasViolation ? (
                <div className="mb-4 rounded-card border border-pacing-critical bg-pacing-critical-bg p-3 text-sm font-medium text-status-critical-fg">
                  {dateWarning.offendingCount === 1
                    ? "1 line item has flight dates outside the campaign window"
                    : `${dateWarning.offendingCount} line items have flight dates outside the campaign window`}
                </div>
              ) : null}

              <CampaignExportsSection
                variant="inline"
                mbaNumber={mbaNumber?.trim() ? String(mbaNumber) : "—"}
                lineItemCount={builderLineItemCount}
                isBusy={
                  isDownloading ||
                  isDownloadingAa ||
                  isNamingDownloading ||
                  isLoading ||
                  isPlanSaving ||
                  isVersionSaving
                }
                ariaStatus=""
                className="max-w-full"
              >
                <p className="max-w-md text-xs text-muted-foreground">
                  Use the pinned action bar to generate, save, and download campaign files.
                </p>
              </CampaignExportsSection>
            </section>
          </form>
          </Form>
      </PlanWizardShell>

      <UnsavedChangesDialog
        open={isUnsavedPromptOpen}
        onStay={stayOnPage}
        onSave={handleSaveAll}
        onLeave={confirmNavigation}
        isSaving={isLoading || isPlanSaving || isVersionSaving}
      />
    </>
  )
}

export default function CreateMediaPlanPage() {
  return (
    <Suspense fallback={<MediaContainerSuspenseFallback label="campaign form" />}>
      <CreateMediaPlan />
    </Suspense>
  )
}
