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
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { format } from "date-fns"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Checkbox } from "@/components/ui/checkbox"
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Combobox } from "@/components/ui/combobox"
import { MultiSelectCombobox, type MultiSelectOption } from "@/components/ui/multi-select-combobox"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { SingleDatePicker } from "@/components/ui/single-date-picker"
import { CalendarIcon, ChevronDown, ChevronsUpDown, Check, Download, FileText, Loader2, MoreHorizontal, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { CampaignExportsSection } from "@/components/dashboard/CampaignExportsSection"
import { MediaPlanEditorHero } from "@/components/mediaplans/MediaPlanEditorHero"
import FloatingSectionNav from "@/components/mediaplans/FloatingSectionNav"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { sortByLabel } from "@/lib/utils/sort"
import { useMediaPlanContext } from "@/contexts/MediaPlanContext"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose, DialogDescription } from "@/components/ui/dialog"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { toast } from "@/components/ui/use-toast"
import { usePathname, useRouter } from "next/navigation"
import { Table, TableBody, TableCell, TableHeader, TableRow, TableHead, TableFooter } from "@/components/ui/table"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { SavingModal, type SaveStatusItem } from "@/components/ui/saving-modal"
import { OutcomeModal } from "@/components/outcome-modal"
import type { BillingBurst, BillingMonth, BillingLineItem } from "@/lib/billing/types" // adjust path if needed
import { buildBillingScheduleJSON } from "@/lib/billing/buildBillingSchedule"
import { computeBillingAndDeliveryMonths } from "@/lib/billing/computeSchedule"
import {
  appendPartialApprovalToBillingSchedule,
  billingMonthsHaveDetailedLineItems,
  computeLineItemTotalsFromDeliveryMonths,
  recomputePartialMbaFromSelections,
  type PartialApprovalLineItem,
  type PartialApprovalMetadata,
  type PartialMbaValues,
} from "@/lib/mediaplan/partialMba"
import { generateBillingLineItems } from "@/lib/billing/generateBillingLineItems"
import { getMediaTypeHeadersForSchedule } from "@/lib/billing/mediaTypeHeaders"
import { syncLineItemMonthlyAmountAcrossAllMonthRows } from "@/lib/billing/syncLineItemAmountAcrossMonthRows"
import { EditableLineItemMonthInput } from "@/components/billing/EditableLineItemMonthInput"
import { prepareBillingMonthsForLineItemExport } from "@/lib/billing/prepareBillingMonthsForLineItemExport"
import {
  buildBillingScheduleExcelBlob,
  sanitizeFilenamePart,
} from "@/lib/billing/exportBillingScheduleExcel"
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
import { checkMediaDatesOutsideCampaign } from "@/lib/utils/mediaPlanValidation"
import { toDateOnlyString } from "@/lib/timezone"
import { setAssistantContext } from "@/lib/assistantBridge"
import { KPISection } from "@/components/kpis/KPISection"
import { resolveAllKPIs } from "@/lib/kpi/resolve"
import { mergeManualKpiOverrides } from "@/lib/kpi/recalc"
import { getPublisherKPIs, getClientKPIs, saveCampaignKPIs } from "@/lib/api/kpi"
import type { PublisherKPI, ClientKPI, ResolvedKPIRow, CampaignKPI } from "@/lib/kpi/types"
import type { Publisher } from "@/lib/types/publisher"
import {
  advertisingAssociatesFilteredPlanHasLineItems,
  buildAdvertisingAssociatesMbaDataFromMediaItems,
  filterMediaItemsForAdvertisingAssociates,
  planHasAdvertisingAssociatesLineItem,
  shouldIncludeMediaPlanLineItem,
} from "@/lib/mediaplan/advertisingAssociatesExcel"

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
  return (
    <div className="flex items-center gap-3 px-6 py-8">
      <div className="relative h-5 w-5 shrink-0">
        <div className="absolute inset-0 rounded-full border-2 border-muted" />
        <div className="absolute inset-0 animate-spin rounded-full border-2 border-t-primary" />
      </div>
      <span className="text-sm text-muted-foreground">Loading {label}…</span>
    </div>
  )
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

type FormProps = {
  watch: (field: string) => any;
  getValues: () => MediaPlanFormValues;
};

type Burst = {
  startDate: string;
  endDate: string;
  budget: number;
  clientPaysForMedia: boolean;
  feePercentage: number;
  budgetIncludesFees: boolean;
};

export default function CreateMediaPlan() {

  //general and client info
  const router = useRouter()
  const pathname = usePathname()
  const [clients, setClients] = useState<Client[]>([])
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
  const markUnsavedChanges = useCallback(() => {
    if (!navigationHydratedRef.current) return;
    setHasUnsavedChanges(true);
  }, []);

  // Sticky action bar sizing (ensure scroll space is 2x bar height)
  const stickyBarRef = useRef<HTMLDivElement | null>(null);
  const [stickyBarHeight, setStickyBarHeight] = useState(0);

  useEffect(() => {
    const el = stickyBarRef.current;
    if (!el) return;

    const update = () => {
      const next = el.getBoundingClientRect().height || 0;
      setStickyBarHeight(next);
    };

    update();

    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener("resize", update);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
    };
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
  const [partialMBAError, setPartialMBAError] = useState<string | null>(null);
  const [manualBillingError, setManualBillingError] = useState<string | null>(null);

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

  //Consulting/Production
  const [feeconsulting, setFeeConsulting] = useState<number | null>(null)
  const [consultingTotal, setConsultingTotal] = useState(0)
  const [consultingBursts, setConsultingBursts] = useState<BillingBurst[]>([])
  const [consultingItems, setConsultingItems] = useState<LineItem[]>([])
  const [consultingFeeTotal, setConsultingFeeTotal] = useState(0)
  const [consultingMediaLineItems, setConsultingMediaLineItems] = useState<any[]>([])

  //Ad Serving
  const [adservvideo, setAdServVideo] = useState<number | null>(null)
  const [adservimp, setAdServImp] = useState<number | null>(null)
  const [adservdisplay, setAdServDisplay] = useState<number | null>(null)
  const [adservaudio, setAdServAudio] = useState<number | null>(null)

  //Finance 

  const [investmentPerMonth, setInvestmentPerMonth] = useState([])
  const [isManualBilling, setIsManualBilling] = useState(false)
  const [isManualBillingModalOpen, setIsManualBillingModalOpen] = useState(false)
  const [manualBillingMonths, setManualBillingMonths] = useState<BillingMonth[]>([])
  const [manualBillingTotal, setManualBillingTotal] = useState("$0.00")
  const [manualBillingCostPreBill, setManualBillingCostPreBill] = useState<{
    fee: boolean;
    adServing: boolean;
    production: boolean;
  }>({ fee: false, adServing: false, production: false });
  const manualBillingCostPreBillSnapshotRef = useRef<{
    fee?: string[];
    adServing?: string[];
    production?: string[];
  }>({});
  const manualBillingAutoLineItemSnapshotRef = useRef<
    Record<
      string,
      {
        mediaKey: string;
        lineItemId: string;
        header1: string;
        header2: string;
        monthlyAmounts: Record<string, number>;
        mediaTotal: number;
        feeTotal: number;
      }
    >
  >({});
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [autoBillingMonths, setAutoBillingMonths] = useState<BillingMonth[]>([]);
  const [autoDeliveryMonths, setAutoDeliveryMonths] = useState<BillingMonth[]>([]);
  const deliveryScheduleSnapshotRef = useRef<BillingMonth[] | null>(null);
  const [billingMonths, setBillingMonths] = useState<BillingMonth[]>([])
  const [billingTotal, setBillingTotal] = useState("$0.00")  
  const [grossMediaTotal, setGrossMediaTotal] = useState(0);
  const [totalInvestment, setTotalInvestment] = useState(0);
  const [isPartialMBA, setIsPartialMBA] = useState(false);
  const [isPartialMBAModalOpen, setIsPartialMBAModalOpen] = useState(false);
  const [hasDateWarning, setHasDateWarning] = useState(false);

  const [kpiRows, setKpiRows] = useState<ResolvedKPIRow[]>([])
  const [publisherKPIs, setPublisherKPIs] = useState<PublisherKPI[]>([])
  const [clientKPIs, setClientKPIs] = useState<ClientKPI[]>([])
  const [savedCampaignKPIs, setSavedCampaignKPIs] = useState<CampaignKPI[]>([])
  const [kpiPublishers, setKpiPublishers] = useState<Publisher[]>([])
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
      mp_campaigndates_start: new Date(),
      mp_campaigndates_end: new Date(),
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

  const builderLineItemCount = useMemo(() => {
    return (
      televisionLineItems.length +
      radioMediaLineItems.length +
      newspaperLineItems.length +
      magazineMediaLineItems.length +
      oohMediaLineItems.length +
      cinemaMediaLineItems.length +
      consultingMediaLineItems.length +
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
    consultingMediaLineItems,
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
      production: consultingItems,
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
    consultingItems,
    influencersItems,
    kpiPublishers,
  ])

  useEffect(() => {
    if (kpiRebuildTimerRef.current) clearTimeout(kpiRebuildTimerRef.current)
    kpiRebuildTimerRef.current = setTimeout(() => {
      const fv = form.getValues()
      if (!fv.mp_client_name) return

      if (
        searchItems.length === 0 &&
        socialMediaItems.length === 0 &&
        televisionItems.length === 0 &&
        progDisplayItems.length === 0
      ) {
        // No line items yet — clear KPI rows
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
        mediaItemsByType: {
          search: searchItems,
          socialMedia: socialMediaItems,
          progDisplay: progDisplayItems,
          progVideo: progVideoItems,
          progBvod: progBvodItems,
          progAudio: progAudioItems,
          progOoh: progOohItems,
          digiDisplay: digiDisplayItems,
          digiAudio: digiAudioItems,
          digiVideo: digiVideoItems,
          bvod: bvodItems,
          integration: integrationItems,
          television: televisionItems,
          radio: radioItems,
          newspaper: newspaperItems,
          magazines: magazineItems,
          ooh: oohItems,
          cinema: cinemaItems,
          influencers: influencersItems,
          production: consultingItems,
        },
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
    searchItems,
    socialMediaItems,
    progDisplayItems,
    progVideoItems,
    progBvodItems,
    progAudioItems,
    progOohItems,
    digiDisplayItems,
    digiAudioItems,
    digiVideoItems,
    bvodItems,
    integrationItems,
    televisionItems,
    radioItems,
    newspaperItems,
    magazineItems,
    oohItems,
    cinemaItems,
    influencersItems,
    consultingItems,
    publisherKPIs,
    clientKPIs,
    savedCampaignKPIs,
    kpiPublishers,
    kpiTrigger,
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
  
  // Watch all media type boolean fields to prevent infinite loops
  const watchedMediaTypes = useWatch({
    control: form.control,
    name: [
      "mp_television", "mp_radio", "mp_production", "mp_newspaper", "mp_magazines", "mp_ooh", 
      "mp_cinema", "mp_digidisplay", "mp_digiaudio", "mp_digivideo", "mp_bvod", 
      "mp_integration", "mp_search", "mp_socialmedia", "mp_progdisplay", 
      "mp_progvideo", "mp_progbvod", "mp_progaudio", "mp_progooh", "mp_influencers"
    ]
  })
  
  // Create a mapping object for easier access
  const mediaTypeNames = [
    "mp_television", "mp_radio", "mp_production", "mp_newspaper", "mp_magazines", "mp_ooh", 
    "mp_cinema", "mp_digidisplay", "mp_digiaudio", "mp_digivideo", "mp_bvod", 
    "mp_integration", "mp_search", "mp_socialmedia", "mp_progdisplay", 
    "mp_progvideo", "mp_progbvod", "mp_progaudio", "mp_progooh", "mp_influencers"
  ]
  const watchedMediaTypesMap = mediaTypeNames.reduce((acc, name, index) => {
    acc[name] = watchedMediaTypes[index]
    return acc
  }, {} as Record<string, boolean>)

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

  const enabledSections = useMemo(() => {
    return mediaTypes
      .filter((medium) => medium.name !== "mp_fixedfee")
      .filter((medium) => watchedMediaTypesMap[medium.name] && medium.component)
      .map((medium) => ({
        id: `media-section-${medium.name}`,
        label: medium.label,
      }))
  }, [mediaTypes, watchedMediaTypesMap])

  // Keep mp_production aligned with the Production toggle to persist the flag for saves
  const productionToggle = useWatch({ control: form.control, name: "mp_production" })
  useEffect(() => {
    const next = Boolean(productionToggle)
    const current = form.getValues("mp_production")
    if (current !== next) {
      form.setValue("mp_production", next, { shouldDirty: true })
    }
  }, [form, productionToggle])

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

  /** Billing schedule preview: column visibility from calculated totals (not formatted strings). */
  const billingSchedulePreviewColumns = useMemo(() => {
    const parseMoney = (v: string | undefined) =>
      parseFloat(String(v ?? "0").replace(/[^0-9.-]/g, "")) || 0
    const adServingGrand = billingMonths.reduce((s, m) => s + parseMoney(m.adservingTechFees), 0)
    const productionGrand = billingMonths.reduce((s, m) => s + parseMoney(m.production), 0)
    const eps = 0.005
    return {
      showAdServing: adServingGrand > eps,
      showProduction: productionGrand > eps,
      adServingGrand,
      productionGrand,
    }
  }, [billingMonths])

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
    const start = form.watch("mp_campaigndates_start");
    const end   = form.watch("mp_campaigndates_end");
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
          production: consultingBursts,
        },
        getRateForMediaType,
        adservaudio: adservaudio ?? 0,
        isManualBilling,
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

  // Preserve manual edits but always capture the auto snapshot
  if (!isManualBilling) {
    setBillingMonths(billingMonthsCalculated);
    const grandTotal = billingMonthsCalculated.reduce((sum, m) => sum + parseFloat(m.totalAmount.replace(/[^0-9.-]/g, "")), 0);
    setBillingTotal(formatter.format(grandTotal));
  }
}, [
    form,
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
    consultingBursts,
    getRateForMediaType,
    adservaudio,
    isManualBilling,
    deepCloneBillingMonths,
  ])

  const calculateProductionCosts = useCallback(() => {
    if (isManualBilling) {
      return billingMonths.reduce((sum, month) => {
        const monthProductionTotal = parseFloat(month.production.replace(/[^0-9.-]/g, ""))
        return sum + (monthProductionTotal || 0)
      }, 0)
    }
    return consultingTotal ?? 0
  }, [isManualBilling, billingMonths, consultingTotal])

  const calculateAdServingFees = useCallback(() => {
    if (isManualBilling) {
      return billingMonths.reduce((sum, month) => {
        const monthAdServingTotal = parseFloat(month.adservingTechFees.replace(/[^0-9.-]/g, ""))
        return sum + (monthAdServingTotal || 0)
      }, 0)
    }
    const allBursts = [
      ...progDisplayBursts,
      ...progVideoBursts,
      ...progBvodBursts,
      ...progAudioBursts,
      ...digiAudioBursts,
      ...digiDisplayBursts,
      ...digiVideoBursts,
      ...bvodBursts,
    ]
    return allBursts.reduce((sum, b) => {
      if (b.noAdserving) return sum
      const rate = getRateForMediaType(b.mediaType)
      const buyType = b.buyType?.toLowerCase?.() || ""
      const isCPM = buyType === "cpm"
      const isBonus = buyType === "bonus"
      const isDigiAudio =
        typeof b.mediaType === "string" && b.mediaType.toLowerCase().replace(/\s+/g, "") === "digiaudio"
      const isCpmOrBonusForDigiAudio = isDigiAudio && (isCPM || isBonus)
      const effectiveRate = isCpmOrBonusForDigiAudio ? (adservaudio ?? rate) : rate
      const cost = isCpmOrBonusForDigiAudio
        ? (b.deliverables / 1000) * effectiveRate
        : isCPM
          ? (b.deliverables / 1000) * rate
          : b.deliverables * rate
      return sum + cost
    }, 0)
  }, [
    isManualBilling,
    billingMonths,
    progDisplayBursts,
    progVideoBursts,
    progBvodBursts,
    progAudioBursts,
    digiAudioBursts,
    digiDisplayBursts,
    digiVideoBursts,
    bvodBursts,
    getRateForMediaType,
    adservaudio,
  ])

  const calculateAssembledFee = useCallback((): number => {
    if (isManualBilling) {
      return billingMonths.reduce((sum, month) => {
        const monthFeeTotal = parseFloat(month.feeTotal.replace(/[^0-9.-]/g, ""))
        return sum + (monthFeeTotal || 0)
      }, 0)
    }

    return (
      (searchFeeTotal ?? 0) +
      (socialMediaFeeTotal ?? 0) +
      (progAudioFeeTotal ?? 0) +
      (cinemaFeeTotal ?? 0) +
      (digiAudioFeeTotal ?? 0) +
      (digiDisplayFeeTotal ?? 0) +
      (digiVideoFeeTotal ?? 0) +
      (bvodFeeTotal ?? 0) +
      (integrationFeeTotal ?? 0) +
      (progDisplayFeeTotal ?? 0) +
      (progVideoFeeTotal ?? 0) +
      (progBvodFeeTotal ?? 0) +
      (progOohFeeTotal ?? 0) +
      (influencersFeeTotal ?? 0) +
      (televisionFeeTotal ?? 0) +
      (radioFeeTotal ?? 0) +
      (newspaperFeeTotal ?? 0) +
      (magazineFeeTotal ?? 0) +
      (oohFeeTotal ?? 0)
    )
  }, [
    isManualBilling,
    billingMonths,
    searchFeeTotal,
    socialMediaFeeTotal,
    progAudioFeeTotal,
    cinemaFeeTotal,
    digiAudioFeeTotal,
    digiDisplayFeeTotal,
    digiVideoFeeTotal,
    bvodFeeTotal,
    integrationFeeTotal,
    progDisplayFeeTotal,
    progVideoFeeTotal,
    progBvodFeeTotal,
    progOohFeeTotal,
    influencersFeeTotal,
    televisionFeeTotal,
    radioFeeTotal,
    newspaperFeeTotal,
    magazineFeeTotal,
    oohFeeTotal,
  ])

  const calculateGrossMediaTotal = useCallback((): number => {
    if (isManualBilling) {
      return billingMonths.reduce((sum, month) => {
        const monthMediaTotal = parseFloat(month.mediaTotal.replace(/[^0-9.-]/g, ""))
        return sum + (monthMediaTotal || 0)
      }, 0)
    }
    return (
      (searchTotal ?? 0) +
      (socialmediaTotal ?? 0) +
      (progAudioTotal ?? 0) +
      (cinemaTotal ?? 0) +
      (digiAudioTotal ?? 0) +
      (digiDisplayTotal ?? 0) +
      (digiVideoTotal ?? 0) +
      (bvodTotal ?? 0) +
      (integrationTotal ?? 0) +
      (progDisplayTotal ?? 0) +
      (progVideoTotal ?? 0) +
      (progBvodTotal ?? 0) +
      (progOohTotal ?? 0) +
      (influencersTotal ?? 0) +
      (televisionTotal ?? 0) +
      (radioTotal ?? 0) +
      (newspaperTotal ?? 0) +
      (magazineTotal ?? 0) +
      (oohTotal ?? 0)
    )
  }, [
    isManualBilling,
    billingMonths,
    searchTotal,
    socialmediaTotal,
    progAudioTotal,
    cinemaTotal,
    digiAudioTotal,
    digiDisplayTotal,
    digiVideoTotal,
    bvodTotal,
    integrationTotal,
    progDisplayTotal,
    progVideoTotal,
    progBvodTotal,
    progOohTotal,
    influencersTotal,
    televisionTotal,
    radioTotal,
    newspaperTotal,
    magazineTotal,
    oohTotal,
  ])

  const getDeliveryMbaTotals = useCallback(() => {
    const source =
      deliveryScheduleSnapshotRef.current && deliveryScheduleSnapshotRef.current.length > 0
        ? deliveryScheduleSnapshotRef.current
        : autoDeliveryMonths

    const parseMoney = (v: unknown) =>
      parseFloat(String(v ?? "").replace(/[^0-9.-]/g, "")) || 0

    const mediaCostsByKey: Record<string, number> = {}
    let assembledFee = 0
    let adServing = 0
    let production = 0

    for (const month of source) {
      assembledFee += parseMoney(month.feeTotal)
      adServing += parseMoney(month.adservingTechFees)
      production += parseMoney(month.production)

      if (month.mediaCosts) {
        for (const [k, raw] of Object.entries(month.mediaCosts)) {
          if (k === "production") continue
          mediaCostsByKey[k] = (mediaCostsByKey[k] || 0) + parseMoney(raw)
        }
      }
    }

    const grossMedia = Object.values(mediaCostsByKey).reduce((s, v) => s + v, 0)

    return { grossMedia, assembledFee, adServing, production, mediaCostsByKey }
  }, [autoDeliveryMonths])

  useEffect(() => {
    const newGrossMediaTotal = calculateGrossMediaTotal()
    setGrossMediaTotal(newGrossMediaTotal)

    const newTotalInvestment =
      newGrossMediaTotal +
      calculateAssembledFee() +
      calculateAdServingFees() +
      calculateProductionCosts()
    setTotalInvestment(newTotalInvestment)
  }, [calculateGrossMediaTotal, calculateAssembledFee, calculateAdServingFees, calculateProductionCosts])

  // Check if any media placement dates are outside campaign dates
  useEffect(() => {
    const hasWarning = checkMediaDatesOutsideCampaign(
      campaignStart,
      campaignEnd,
      {
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
      }
    );
    setHasDateWarning(hasWarning);
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
  ]);

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
        consulting: { bursts: consultingBursts, setter: setConsultingBursts },
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
      consultingBursts,
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
        consulting: summarizeBurstsForAssistant(consultingBursts),
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
      },
    })
  }, [
    bvodBursts,
    campaignEnd,
    campaignStart,
    cinemaBursts,
    consultingBursts,
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
  const [partialApprovalMetadata, setPartialApprovalMetadata] = useState<PartialApprovalMetadata | null>(null)



  // Digital Media
  const handleSearchTotalChange = (totalMedia: number, totalFee: number) => {
    setSearchTotal(totalMedia);
    setSearchFeeTotal(totalFee); // ✅ Store the actual calculated fee
  };

  const handleSocialMediaTotalChange = (totalMedia: number, totalFee: number) => {
    setSocialMediaTotal(totalMedia);
    setSocialMediaFeeTotal(totalFee); // ✅ Store the actual calculated fee
  };
  
  const handleDigiAudioTotalChange = (totalMedia: number, totalFee: number) => {
    setDigiAudioTotal(totalMedia);
    setDigiAudioFeeTotal(totalFee);
  };

  const handleDigiDisplayTotalChange = (totalMedia: number, totalFee: number) => {
    setDigiDisplayTotal(totalMedia);
    setDigiDisplayFeeTotal(totalFee);
  };

  const handleDigiVideoTotalChange = (totalMedia: number, totalFee: number) => {
    setDigiVideoTotal(totalMedia);
    setDigiVideoFeeTotal(totalFee);
  };

  const handleBVODTotalChange = (totalMedia: number, totalFee: number) => {
    setBvodTotal(totalMedia);
    setBvodFeeTotal(totalFee);
  };

  const handleIntegrationTotalChange = (totalMedia: number, totalFee: number) => {
    setIntegrationTotal(totalMedia);
    setIntegrationFeeTotal(totalFee);
  };

  const handleProgDisplayTotalChange = (totalMedia: number, totalFee: number) => {
    setProgDisplayTotal(totalMedia);
    setProgDisplayFeeTotal(totalFee);
  };

  const handleProgVideoTotalChange = (totalMedia: number, totalFee: number) => {
    setProgVideoTotal(totalMedia);
    setProgVideoFeeTotal(totalFee);
  };

  const handleProgBvodTotalChange = (totalMedia: number, totalFee: number) => {
    setProgBvodTotal(totalMedia);
    setProgBvodFeeTotal(totalFee);
  };

  const handleProgOohTotalChange = (totalMedia: number, totalFee: number) => {
    markUnsavedChanges();
    setProgOohTotal(totalMedia);
    setProgOohFeeTotal(totalFee);
  };

  const handleProgAudioTotalChange = (totalMedia: number, totalFee: number) => {
    markUnsavedChanges();
    setProgAudioTotal(totalMedia);
    setProgAudioFeeTotal(totalFee);
  };

  // Offline Media
  
  const handleCinemaTotalChange = (totalMedia: number, totalFee: number) => {
    markUnsavedChanges();
    setCinemaTotal(totalMedia);
    setCinemaFeeTotal(totalFee);
  };

  const handleTelevisionTotalChange = (totalMedia: number, totalFee: number) => {
    markUnsavedChanges();
    setTelevisionTotal(totalMedia);
    setTelevisionFeeTotal(totalFee);
  };

  const handleRadioTotalChange = (totalMedia: number, totalFee: number) => {
    markUnsavedChanges();
    setRadioTotal(totalMedia);
    setRadioFeeTotal(totalFee);
  };

  const handleNewspaperTotalChange = (totalMedia: number, totalFee: number) => {
    markUnsavedChanges();
    setNewspaperTotal(totalMedia);
    setNewspaperFeeTotal(totalFee);
  };

  const handleMagazinesTotalChange = (totalMedia: number, totalFee: number) => {
    markUnsavedChanges();
    setMagazineTotal(totalMedia);
    setMagazineFeeTotal(totalFee);
  };

  const handleOohTotalChange = (totalMedia: number, totalFee: number) => {
    markUnsavedChanges();
    setOohTotal(totalMedia);
    setOohFeeTotal(totalFee);
  };

  const handleConsultingTotalChange = (totalMedia: number, totalFee: number) => {
    markUnsavedChanges();
    setConsultingTotal(totalMedia);
    setConsultingFeeTotal(totalFee);
  };

  const handleInfluencersTotalChange = (totalMedia: number, totalFee: number) => {
    markUnsavedChanges();
    setInfluencersTotal(totalMedia);
    setInfluencersFeeTotal(totalFee);
  };

  const handleInvestmentChange = (investmentByMonth) => {
    markUnsavedChanges();
    setInvestmentPerMonth(investmentByMonth);
  };

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

  const handleConsultingMediaLineItemsChange = useCallback((lineItems: any[]) => {
    markUnsavedChanges();
    setConsultingMediaLineItems(lineItems);
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

  const handleConsultingItemsChange = useCallback((items: LineItem[]) => {
    markUnsavedChanges();
    setConsultingItems(items);
    setConsultingMediaLineItems(items);
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
  consultingBursts,
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

    if (isPartialMBA) {
      finalVisibleMedia = Object.entries(partialMBAValues.mediaTotals).map(([key, value]) => {
        const mediaTypeInfo = mediaTypes.find(m => mediaKeyMap[m.name] === key);
        return {
          media_type: mediaTypeInfo ? mediaTypeInfo.label : "Unknown Media",
          gross_amount: value,
        };
      });

      const totalExGst =
        partialMBAValues.grossMedia +
        partialMBAValues.assembledFee +
        partialMBAValues.adServing +
        partialMBAValues.production;

      finalTotals = {
        gross_media: partialMBAValues.grossMedia,
        service_fee: partialMBAValues.assembledFee,
        production: partialMBAValues.production,
        adserving: partialMBAValues.adServing,
        totals_ex_gst: totalExGst,
        total_inc_gst: totalExGst * 1.1,
      };
    } else {
      const deliveryTotals = getDeliveryMbaTotals()

      finalVisibleMedia = mediaTypes
        .filter(medium => medium.name !== "mp_production")
        .filter(medium => form.watch(medium.name as keyof MediaPlanFormValues))
        .map(medium => {
          const billingKey = mediaKeyMap[medium.name]
          const gross_amount =
            billingKey !== undefined ? (deliveryTotals.mediaCostsByKey[billingKey] ?? 0) : 0
          return {
            media_type: medium.label,
            gross_amount,
          }
        })

      const totalExGst =
        deliveryTotals.grossMedia +
        deliveryTotals.assembledFee +
        deliveryTotals.production +
        deliveryTotals.adServing

      finalTotals = {
        gross_media: deliveryTotals.grossMedia,
        service_fee: deliveryTotals.assembledFee,
        production: deliveryTotals.production,
        adserving: deliveryTotals.adServing,
        totals_ex_gst: totalExGst,
        total_inc_gst: totalExGst * 1.1,
      };
    }

    const billingMonthsExGST = billingMonths.map(month => ({
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
    const validConsultingItems = consultingItems.filter(shouldIncludeMediaPlanLineItem);

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
      production:   assignLineItemIds(validConsultingItems,   "PROD"),
    };

    const productionTotal = calculateProductionCosts()

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
        gross_media: mediaTypes
          .filter((medium) => form.watch(medium.name as keyof MediaPlanFormValues))
          .map((medium) => ({
            media_type: medium.label,
            gross_amount: calculateMediaTotal(medium.name),
          })),
        totals: {
          gross_media: grossMediaTotal,
          service_fee: calculateAssembledFee(),
          production: productionTotal,
          adserving: calculateAdServingFees(),
          totals_ex_gst: totalInvestment,
          total_inc_gst: totalInvestment * 1.1,
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

  // Calculate the total for each media type
  const calculateMediaTotal = (mediaName) => {
    switch (mediaName) {
      case "mp_search":
        return searchTotal ?? 0;
      case "mp_cinema":
        return cinemaTotal ?? 0;
      case "mp_digiaudio":
        return digiAudioTotal ?? 0;
      case "mp_digidisplay":
        return digiDisplayTotal ?? 0;
      case "mp_digivideo":
        return digiVideoTotal ?? 0;
      case "mp_socialmedia":
        return socialmediaTotal ?? 0;
      case "mp_progaudio":
        return progAudioTotal ?? 0;
      case "mp_progdisplay":
        return progDisplayTotal ?? 0;
      case "mp_progvideo":
        return progVideoTotal ?? 0;
      case "mp_progbvod":
        return progBvodTotal ?? 0;
      case "mp_progooh":
        return progOohTotal ?? 0;
    case "mp_production":
      return consultingTotal ?? 0;
      case "mp_influencers":
        return influencersTotal ?? 0;
      case "mp_television":
        return televisionTotal ?? 0;
      case "mp_radio":
        return radioTotal ?? 0;
      case "mp_newspaper":
        return newspaperTotal ?? 0;
      case "mp_magazines":
        return magazineTotal ?? 0;
      case "mp_ooh":
        return oohTotal ?? 0;
      case "mp_integration":
        return integrationTotal ?? 0;
      case "mp_bvod":
        return bvodTotal ?? 0;
      default:
        return 0;
    }
  };

  function BillingAndMBASections({ form }: { form: FormProps }) {
    type BillingMonth = {
      monthYear: string;
      amount: string;
    };
    
    const [billingMonths, setBillingMonths] = useState<BillingMonth[]>([]);

    useEffect(() => {
      const startDate = form.watch('mp_campaigndates_start');
      const endDate = form.watch('mp_campaigndates_end');
      if (startDate && endDate) {
        const months: BillingMonth[] = [];
        let current = new Date(startDate);
        const end = new Date(endDate);
        // Generate all months, including partial ones
        while (current <= end) {
          const monthYear = format(current, 'MMMM yyyy');
          months.push({ monthYear, amount: '' });

          // Move to the next month
          current.setMonth(current.getMonth() + 1);
          current.setDate(1); // Ensure we start at the beginning of the month
        }
        setBillingMonths(months);
      }
    }, [form]);
  
    const handleAmountChange = (index: number, value: string) => {
      const updatedMonths = [...billingMonths];
      updatedMonths[index].amount = value;
      setBillingMonths(updatedMonths);
    };
  
    // ✅ Added the missing return statement here
    return (
      <div className="flex flex-col space-y-4">
        {billingMonths.map((month, index) => (
          <div key={index} className="flex items-center justify-between">
            <span className="text-sm font-medium">{month.monthYear}</span>
            <input
              type="text"
              className="border border-border rounded px-3 py-2"
              placeholder="$0.00"
              value={month.amount}
              onChange={(e) => handleAmountChange(index, e.target.value)}
            />
          </div>
        ))}
      </div>
    );
  }

  const calculateTotalInvestment = () => {
    return (
      grossMediaTotal 
      + calculateAssembledFee()
      + calculateAdServingFees()
      + calculateProductionCosts()
    );
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
        form.setValue("mba_number", data.mba_number)
        setMbaNumber(data.mba_number)
      } else {
        console.error("MBA number not found in response:", data)
        throw new Error("MBA number not found in response")
      }
    } catch (error) {
      console.error("Error generating MBA number:", error)
      const errorMessage = error instanceof Error ? error.message : "Error generating MBA number"
      form.setValue("mba_number", "")
      setMbaNumber("")
      // Optionally show a toast notification here if you have toast available
    }
  }

  const handleClientChange = (clientId: string) => {
    const selectedClient = clients.find((client) => client.id.toString() === clientId)
    if (selectedClient) {
      form.setValue("mp_client_name", selectedClient.mp_client_name)
      form.setValue("mbaidentifier", selectedClient.mbaidentifier)
      // Only generate MBA number if mbaidentifier exists
      if (selectedClient.mbaidentifier) {
        generateMBANumber(selectedClient.mbaidentifier)
      } else {
        console.warn("Selected client does not have an MBA identifier")
        form.setValue("mba_number", "")
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
      form.setValue("mp_client_name", "")
      form.setValue("mbaidentifier", "")
      form.setValue("mba_number", "")
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

  const handleSearchBurstsChange = (bursts: BillingBurst[]) =>
    setSearchBursts(normalizeBursts(bursts));

  const handleProgAudioBurstsChange = (bursts: BillingBurst[]) =>
    setProgAudioBursts(normalizeBursts(bursts));

  const handleSocialMediaBurstsChange = (bursts: BillingBurst[]) =>
    setSocialMediaBursts(normalizeBursts(bursts));

  const handleCinemaBurstsChange = (bursts: BillingBurst[]) =>
    setCinemaBursts(normalizeBursts(bursts));

  const handleTelevisionBurstsChange = (bursts: BillingBurst[]) =>
    setTelevisionBursts(normalizeBursts(bursts));

  const handleRadioBurstsChange = (bursts: BillingBurst[]) =>
    setRadioBursts(normalizeBursts(bursts));

  const handleIntegrationBurstsChange = (bursts: BillingBurst[]) =>
    setIntegrationBursts(normalizeBursts(bursts));

  const handleNewspaperBurstsChange = (bursts: BillingBurst[]) =>
    setNewspaperBursts(normalizeBursts(bursts));

  const handleMagazineBurstsChange = (bursts: BillingBurst[]) =>
    setMagazineBursts(normalizeBursts(bursts));

  const handleOohBurstsChange = (bursts: BillingBurst[]) =>
    setOohBursts(normalizeBursts(bursts));

  const handleConsultingBurstsChange = (bursts: BillingBurst[]) =>
    setConsultingBursts(normalizeBursts(bursts));

  const handleInfluencersBurstsChange = (bursts: BillingBurst[]) =>
    setInfluencersBursts(normalizeBursts(bursts));

  const handleDigiAudioBurstsChange = (bursts: BillingBurst[]) =>
    setDigiAudioBursts(normalizeBursts(bursts));

  const handleDigiDisplayBurstsChange = (bursts: BillingBurst[]) =>
    setDigiDisplayBursts(normalizeBursts(bursts));

  const handleDigiVideoBurstsChange = (bursts: BillingBurst[]) =>
    setDigiVideoBursts(normalizeBursts(bursts));

  const handleProgDisplayBurstsChange = (bursts: BillingBurst[]) =>
    setProgDisplayBursts(normalizeBursts(bursts));

  const handleProgVideoBurstsChange = (bursts: BillingBurst[]) =>
    setProgVideoBursts(normalizeBursts(bursts));

  const handleProgBvodBurstsChange = (bursts: BillingBurst[]) =>
    setProgBvodBursts(normalizeBursts(bursts));

  const handleProgOohBurstsChange = (bursts: BillingBurst[]) =>
    setProgOohBursts(normalizeBursts(bursts));

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

    const enabledMediaRows = mediaTypes
      .filter((m) => m.name !== "mp_production")
      .filter((m) => form.watch(m.name as keyof MediaPlanFormValues) && m.component)
      .map((m) => ({ ...m, mediaKey: mediaKeyMap[m.name] }))
      .filter((m) => Boolean((m as any).mediaKey))

    const mediaKeys = enabledMediaRows.map((m) => (m as any).mediaKey as string)
    const mediaLabelByKey = Object.fromEntries(
      mediaTypes
        .filter((m) => m.name !== "mp_production")
        .map((m) => [mediaKeyMap[m.name], m.label])
    ) as Record<string, string>

    const enabledMedia = nextEnabledMedia ?? partialMBAMediaEnabled

    const { values, lineItemsByMedia, metadata } = recomputePartialMbaFromSelections({
      deliveryMonthsForBaseline: deliveryMonthsRaw,
      deliveryMonthsForLineItems: deliveryMonthsWithLineItems,
      selectedMonthYears: nextMonthYears,
      selectedLineItemIdsByMedia: nextSelectedIds,
      mediaKeys,
      enabledMedia,
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
      setIsPartialMBAModalOpen(true)
      return
    }

    const deliveryMonthsRaw = autoDeliveryMonths.length > 0 ? autoDeliveryMonths : billingMonths

    const enabledMediaRows = mediaTypes
      .filter((m) => m.name !== "mp_production")
      .filter((m) => form.watch(m.name as keyof MediaPlanFormValues) && m.component)
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
        currentMediaTotals[mediaKey] = calculateMediaTotal(m.name)
      })
      const fallback = {
        mediaTotals: currentMediaTotals,
        grossMedia: calculateGrossMediaTotal(),
        assembledFee: calculateAssembledFee(),
        adServing: calculateAdServingFees(),
        production: calculateProductionCosts(),
      }
      setPartialMBAValues(fallback)
      setPartialMBALineItemsByMedia({})
      setPartialMBASelectedLineItemIds({})
      setPartialApprovalMetadata(null)
      setOriginalPartialMBAValues(JSON.parse(JSON.stringify(fallback)))
      setIsPartialMBAModalOpen(true)
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
    setIsPartialMBAModalOpen(true)
  }

  function handlePartialMBAMonthsChange(nextMonthYears: string[]) {
    const deliveryMonthsRaw = autoDeliveryMonths.length > 0 ? autoDeliveryMonths : billingMonths
    setPartialMBAMonthYears(nextMonthYears)
    if (!deliveryMonthsRaw.length) return

    recomputePartialMBAFromLineItems(nextMonthYears, partialMBASelectedLineItemIds)
  }

  function handlePartialMBAToggleMedia(mediaKey: string, enabled: boolean) {
    const nextEnabled = { ...partialMBAMediaEnabled, [mediaKey]: enabled }
    setPartialMBAMediaEnabled(nextEnabled)
    const allIds = (partialMBALineItemsByMedia[mediaKey] || []).map((item) => item.lineItemId)
    const nextSelected = {
      ...partialMBASelectedLineItemIds,
      [mediaKey]: enabled ? allIds : [],
    }
    setPartialMBASelectedLineItemIds(nextSelected)
    recomputePartialMBAFromLineItems(partialMBAMonthYears, nextSelected, nextEnabled)
  }

  function handlePartialMBAToggleLineItem(mediaKey: string, lineItemId: string, enabled: boolean) {
    const existing = new Set(partialMBASelectedLineItemIds[mediaKey] || [])
    if (enabled) existing.add(lineItemId)
    else existing.delete(lineItemId)
    const nextSelected = { ...partialMBASelectedLineItemIds, [mediaKey]: Array.from(existing) }
    setPartialMBASelectedLineItemIds(nextSelected)
    const nextEnabled = { ...partialMBAMediaEnabled, [mediaKey]: nextSelected[mediaKey].length > 0 }
    setPartialMBAMediaEnabled(nextEnabled)
    recomputePartialMBAFromLineItems(partialMBAMonthYears, nextSelected, nextEnabled)
  }

  function handlePartialMBAChange(
    field: 'mediaTotal' | 'assembledFee' | 'adServing' | 'production',
    value: string,
    mediaKey?: string
  ) {
    const numericValue = parseFloat(value.replace(/[^0-9.-]/g, "")) || 0;

    setPartialMBAValues(prev => {
      const newValues = { ...prev };
      
      // Update the specific field that was changed
      if (field === 'mediaTotal' && mediaKey) {
        newValues.mediaTotals[mediaKey] = numericValue;
      } else if (field !== 'mediaTotal') {
        newValues[field] = numericValue;
      }

      // Recalculate Gross Media as the sum of all individual media items
      newValues.grossMedia = Object.values(newValues.mediaTotals).reduce((sum, total) => sum + total, 0);

      return newValues;
    });
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

    setPartialMBAError(null)
    setIsPartialMBA(true);
    setIsPartialMBAModalOpen(false);
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
      .filter((m) => form.watch(m.name as keyof MediaPlanFormValues) && m.component)
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
      mp_production: { lineItems: consultingMediaLineItems, key: "production" },
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

  // Manual Billing Functions
  function handleManualBillingOpen() {
    const deepCopiedMonths = JSON.parse(JSON.stringify(billingMonths));

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
      mp_search: { lineItems: searchMediaLineItems, key: "search" },
      mp_socialmedia: { lineItems: socialMediaMediaLineItems, key: "socialMedia" },
      mp_progdisplay: { lineItems: progDisplayMediaLineItems, key: "progDisplay" },
      mp_progvideo: { lineItems: progVideoMediaLineItems, key: "progVideo" },
      mp_progbvod: { lineItems: progBvodMediaLineItems, key: "progBvod" },
      mp_progaudio: { lineItems: progAudioMediaLineItems, key: "progAudio" },
      mp_progooh: { lineItems: progOohMediaLineItems, key: "progOoh" },
      mp_influencers: { lineItems: influencersMediaLineItems, key: "influencers" },
      mp_integration: { lineItems: integrationMediaLineItems, key: "integration" },
    };

    const allLineItems: Record<string, BillingLineItem[]> = {};

    const parseMoney = (v: any) => parseFloat(String(v ?? "").replace(/[^0-9.-]/g, "")) || 0;
    const calculateExpectedLineItemFeeTotal = (sourceLineItem: any): number => {
      let bursts: any[] = [];
      if (typeof sourceLineItem?.bursts_json === "string") {
        try {
          bursts = JSON.parse(sourceLineItem.bursts_json);
        } catch {
          bursts = [];
        }
      } else if (Array.isArray(sourceLineItem?.bursts_json)) {
        bursts = sourceLineItem.bursts_json;
      } else if (Array.isArray(sourceLineItem?.bursts)) {
        bursts = sourceLineItem.bursts;
      }

      return bursts.reduce((sum: number, burst: any) => {
        const budget = parseMoney(burst?.budget) || parseMoney(burst?.buyAmount);
        const feePctRaw =
          burst?.feePercentage ??
          burst?.fee_percentage ??
          sourceLineItem?.feePercentage ??
          sourceLineItem?.fee_percentage;
        const feePct = Number.isFinite(Number(feePctRaw))
          ? Math.max(0, Math.min(100, Number(feePctRaw)))
          : 0;
        const budgetIncludesFees = Boolean(
          burst?.budgetIncludesFees ??
            burst?.budget_includes_fees ??
            sourceLineItem?.budgetIncludesFees ??
            sourceLineItem?.budget_includes_fees
        );
        const clientPaysForMedia = Boolean(
          burst?.clientPaysForMedia ??
            burst?.client_pays_for_media ??
            sourceLineItem?.clientPaysForMedia ??
            sourceLineItem?.client_pays_for_media
        );

        if (budget <= 0 || feePct <= 0) return sum;
        if (budgetIncludesFees) return sum + (budget * feePct) / 100;
        if (feePct >= 100) return sum;
        return (
          sum +
          (clientPaysForMedia
            ? (budget / (100 - feePct)) * feePct
            : (budget * feePct) / (100 - feePct))
        );
      }, 0);
    };

    manualBillingAutoLineItemSnapshotRef.current = {};
    Object.entries(mediaTypeMap).forEach(([mediaTypeKey, { lineItems, key }]) => {
      if (form.watch(mediaTypeKey as keyof MediaPlanFormValues) && lineItems) {
        const billingLineItems = generateBillingLineItems(lineItems, key, deepCopiedMonths, "billing");
        if (billingLineItems.length > 0) {
          allLineItems[key] = billingLineItems;
          billingLineItems.forEach((billingLineItem) => {
            const indexMatch = String(billingLineItem.id).match(/-(\d+)$/);
            const sourceIndex = indexMatch ? Number(indexMatch[1]) : -1;
            const sourceLineItem = sourceIndex >= 0 ? lineItems[sourceIndex] : undefined;
            const feeTotal = sourceLineItem ? calculateExpectedLineItemFeeTotal(sourceLineItem) : 0;
            const snapshotKey = `${key}::${billingLineItem.id}`;
            manualBillingAutoLineItemSnapshotRef.current[snapshotKey] = {
              mediaKey: key,
              lineItemId: billingLineItem.id,
              header1: billingLineItem.header1,
              header2: billingLineItem.header2,
              monthlyAmounts: { ...billingLineItem.monthlyAmounts },
              mediaTotal: billingLineItem.totalAmount || 0,
              feeTotal,
            };
          });
        }
      }
    });

    const currencyFormatter = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" });
    deepCopiedMonths.forEach((month: BillingMonth) => {
      if (!month.lineItems) month.lineItems = {};
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
        };
      }
      if (month.production === undefined) {
        month.production = currencyFormatter.format(0);
      }
      Object.entries(allLineItems).forEach(([key, lineItems]) => {
        month.lineItems![key as keyof typeof month.lineItems] = lineItems;
      });
    });

    setManualBillingMonths(deepCopiedMonths);
    setManualBillingTotal(billingTotal);
    setManualBillingCostPreBill({ fee: false, adServing: false, production: false });
    manualBillingCostPreBillSnapshotRef.current = {};
    setIsManualBillingModalOpen(true);
  }

  function handleManualBillingChange(
    index: number,
    type: 'media' | 'fee' | 'adServing' | 'production' | 'lineItem',
    rawValue: string,
    mediaKey?: string, // e.g., 'search', 'socialMedia'
    lineItemId?: string, // For line item edits
    monthYear?: string // For line item edits
  ) {
    const copy = [...manualBillingMonths];
    const numericValue = parseFloat(rawValue.replace(/[^0-9.-]/g, "")) || 0;
    const formatter = mbaCurrencyFormatter;
    const formattedValue = formatter.format(numericValue);

    // Handle line item changes (grid reads line items from month[0]; per-month state may be cloned, so sync all rows)
    if (type === 'lineItem' && mediaKey && lineItemId && monthYear) {
      const monthIndex = copy.findIndex((m) => m.monthYear === monthYear);
      if (monthIndex >= 0) {
        syncLineItemMonthlyAmountAcrossAllMonthRows(
          copy,
          mediaKey,
          lineItemId,
          monthYear,
          numericValue
        );
        const liKey = mediaKey as keyof NonNullable<BillingMonth["lineItems"]>;
        const lineItemsForTotals =
          (copy[0]?.lineItems?.[liKey] as BillingLineItem[] | undefined) ??
          copy
            .map((m) => m.lineItems?.[liKey] as BillingLineItem[] | undefined)
            .find((a) => a && a.length > 0);
        if (lineItemsForTotals?.length) {
          const mediaTypeTotal = lineItemsForTotals.reduce(
            (sum, li) => sum + (li.monthlyAmounts[monthYear] || 0),
            0
          );
          const mediaCosts = copy[monthIndex].mediaCosts;
          if (mediaCosts) {
            (mediaCosts as any)[mediaKey] = formatter.format(mediaTypeTotal);
          }
        }
      }
    }

    // Dynamically update the correct value
    if (type === 'media' && mediaKey && copy[index].mediaCosts.hasOwnProperty(mediaKey)) {
      copy[index].mediaCosts[mediaKey] = formattedValue;
      // Keep production in sync with its own field when edited via media type
      if (mediaKey === 'production') {
        copy[index].production = formattedValue;
      }
    } else if (type === 'fee') {
      copy[index].feeTotal = formattedValue;
    } else if (type === 'adServing') {
      copy[index].adservingTechFees = formattedValue;
    } else if (type === 'production') {
      copy[index].production = formattedValue;
      if (copy[index].mediaCosts.hasOwnProperty('production')) {
        copy[index].mediaCosts.production = formattedValue;
      }
    }

    // Recalculate totals for the affected month
    const mediaTotal = Object.entries(copy[index].mediaCosts).reduce((sum, [key, current]) => {
        if (key === 'production') return sum;
        return sum + (parseFloat(String(current).replace(/[^0-9.-]/g, '')) || 0);
    }, 0);

    const feeTotal = parseFloat(copy[index].feeTotal.replace(/[^0-9.-]/g, '')) || 0;
    const adServingTotal = parseFloat(copy[index].adservingTechFees.replace(/[^0-9.-]/g, '')) || 0;
    const productionTotal = parseFloat((copy[index].production || '').replace(/[^0-9.-]/g, '')) || 0;

    // Update the aggregated and total amounts for the month
    copy[index].mediaTotal = formatter.format(mediaTotal);
    copy[index].totalAmount = formatter.format(mediaTotal + feeTotal + adServingTotal + productionTotal);

    // Recalculate the final Grand Total for the whole schedule
    const grandTotal = copy.reduce(
      (acc, m) => acc + parseFloat(m.totalAmount.replace(/[^0-9.-]/g, "")),
      0
    );

    // Update state to trigger UI re-render
    setManualBillingTotal(formatter.format(grandTotal));
    setManualBillingMonths(copy);
  }

  const recalculateManualBillingTotals = (months: BillingMonth[], formatter: Intl.NumberFormat) => {
    months.forEach((m) => {
      const mediaTotalNumber = Object.entries(m.mediaCosts || {}).reduce((sum, [key, current]) => {
        if (key === "production") return sum;
        return sum + (parseFloat(String(current).replace(/[^0-9.-]/g, "")) || 0);
      }, 0);

      const feeTotal = parseFloat(String(m.feeTotal || "$0").replace(/[^0-9.-]/g, "")) || 0;
      const adServingTotal = parseFloat(String(m.adservingTechFees || "$0").replace(/[^0-9.-]/g, "")) || 0;
      const productionTotal = parseFloat(String(m.production || "$0").replace(/[^0-9.-]/g, "")) || 0;

      m.mediaTotal = formatter.format(mediaTotalNumber);
      m.totalAmount = formatter.format(mediaTotalNumber + feeTotal + adServingTotal + productionTotal);
    });

    return months.reduce((acc, m) => acc + (parseFloat(String(m.totalAmount || "$0").replace(/[^0-9.-]/g, "")) || 0), 0);
  };

  function handleManualBillingLineItemPreBillToggle(mediaKey: string, lineItemId: string, nextChecked: boolean) {
    const copy = [...manualBillingMonths];
    if (copy.length === 0) return;

    const formatter = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" });
    const monthYears = copy.map((m) => m.monthYear);

    // Determine the desired distribution (robust even if line items are not shared by reference across months)
    const firstMonthLineItems = copy[0]?.lineItems?.[mediaKey as any] as BillingLineItem[] | undefined;
    if (!firstMonthLineItems) return;
    const firstLineItem = firstMonthLineItems.find((li) => li.id === lineItemId);
    if (!firstLineItem) return;

    const desired: Record<string, number> = {};
    if (nextChecked) {
      const total = monthYears.reduce((sum, monthYear) => sum + (firstLineItem.monthlyAmounts?.[monthYear] || 0), 0);
      monthYears.forEach((monthYear, idx) => {
        desired[monthYear] = idx === 0 ? total : 0;
      });
    } else if (firstLineItem.preBillSnapshot) {
      monthYears.forEach((monthYear) => {
        desired[monthYear] = firstLineItem.preBillSnapshot?.[monthYear] || 0;
      });
    } else {
      // Nothing to restore
      return;
    }

    // Apply to this line item across all months
    copy.forEach((month) => {
      const monthLineItems = month?.lineItems?.[mediaKey as any] as BillingLineItem[] | undefined;
      if (!monthLineItems) return;
      const li = monthLineItems.find((x) => x.id === lineItemId);
      if (!li) return;

      if (nextChecked) {
        li.preBillSnapshot = li.preBillSnapshot ?? { ...li.monthlyAmounts };
      }
      monthYears.forEach((monthYear) => {
        li.monthlyAmounts[monthYear] = desired[monthYear] || 0;
      });
      li.totalAmount = monthYears.reduce((sum, monthYear) => sum + (li.monthlyAmounts?.[monthYear] || 0), 0);
      li.preBill = nextChecked;
    });

    // Recalculate this media type total for every month
    copy.forEach((month) => {
      const monthLineItems = month?.lineItems?.[mediaKey as any] as BillingLineItem[] | undefined;
      if (!monthLineItems) return;
      const mediaTypeTotal = monthLineItems.reduce((sum, li) => sum + (li.monthlyAmounts?.[month.monthYear] || 0), 0);
      (month.mediaCosts as any)[mediaKey] = formatter.format(mediaTypeTotal);
    });

    const grandTotalNumber = recalculateManualBillingTotals(copy, formatter);
    setManualBillingTotal(formatter.format(grandTotalNumber));
    setManualBillingMonths(copy);
  }

  function handleManualBillingLineItemResetToAuto(mediaKey: string, lineItemId: string) {
    const copy = [...manualBillingMonths];
    if (copy.length === 0) return;
    const snapshot = manualBillingAutoLineItemSnapshotRef.current[`${mediaKey}::${lineItemId}`];
    if (!snapshot) return;

    copy.forEach((month) => {
      const monthLineItems = month?.lineItems?.[mediaKey as keyof typeof month.lineItems] as
        | BillingLineItem[]
        | undefined;
      if (!monthLineItems) return;
      const li = monthLineItems.find((x) => x.id === lineItemId);
      if (!li) return;
      li.monthlyAmounts = { ...snapshot.monthlyAmounts };
      li.totalAmount = Object.values(li.monthlyAmounts).reduce((sum, v) => sum + (v || 0), 0);
      li.preBill = false;
      li.preBillSnapshot = undefined;
    });

    const formatter = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" });
    copy.forEach((month) => {
      const monthLineItems = month?.lineItems?.[mediaKey as keyof typeof month.lineItems] as
        | BillingLineItem[]
        | undefined;
      if (!monthLineItems) return;
      const mediaTypeTotal = monthLineItems.reduce(
        (sum, li) => sum + (li.monthlyAmounts?.[month.monthYear] || 0),
        0
      );
      (month.mediaCosts as Record<string, string>)[mediaKey] = formatter.format(mediaTypeTotal);
    });

    const grandTotalNumber = recalculateManualBillingTotals(copy, formatter);
    setManualBillingTotal(formatter.format(grandTotalNumber));
    setManualBillingMonths(copy);
  }

  function handleManualBillingCostPreBillToggle(costKey: "fee" | "adServing" | "production", nextChecked: boolean) {
    const copy = [...manualBillingMonths];
    if (copy.length === 0) return;

    const formatter = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" });

    const getValue = (m: BillingMonth) => {
      if (costKey === "fee") return m.feeTotal || "$0.00";
      if (costKey === "adServing") return m.adservingTechFees || "$0.00";
      return m.production || "$0.00";
    };

    const setValue = (m: BillingMonth, v: string) => {
      if (costKey === "fee") m.feeTotal = v;
      else if (costKey === "adServing") m.adservingTechFees = v;
      else {
        m.production = v;
        if (m.mediaCosts?.production !== undefined) {
          m.mediaCosts.production = v;
        }
      }
    };

    if (nextChecked) {
      manualBillingCostPreBillSnapshotRef.current[costKey] = copy.map((m) => getValue(m));
      const total = copy.reduce((acc, m) => acc + (parseFloat(getValue(m).replace(/[^0-9.-]/g, "")) || 0), 0);
      copy.forEach((m, idx) => setValue(m, formatter.format(idx === 0 ? total : 0)));
    } else {
      const snapshot = manualBillingCostPreBillSnapshotRef.current[costKey];
      if (snapshot && snapshot.length === copy.length) {
        copy.forEach((m, idx) => setValue(m, snapshot[idx] ?? formatter.format(0)));
      }
      manualBillingCostPreBillSnapshotRef.current[costKey] = undefined;
    }

    const grandTotalNumber = recalculateManualBillingTotals(copy, formatter);
    setManualBillingTotal(formatter.format(grandTotalNumber));
    setManualBillingMonths(copy);
    setManualBillingCostPreBill((prev) => ({ ...prev, [costKey]: nextChecked }));
  }

  const [billingError, setBillingError] = useState<{ show: boolean; messages: string[] }>({
    show: false,
    messages: [],
  });

  function handleManualBillingSave() {
    const mismatchMessages: string[] = [];
    const firstMonth = manualBillingMonths[0];
    const lineItemGroups = firstMonth?.lineItems;

    if (lineItemGroups) {
      Object.entries(lineItemGroups).forEach(([mediaKey, lineItems]) => {
        (lineItems as BillingLineItem[]).forEach((lineItem) => {
          const snapshot = manualBillingAutoLineItemSnapshotRef.current[`${mediaKey}::${lineItem.id}`];
          if (!snapshot) return;

          const currentMediaTotal = Object.values(lineItem.monthlyAmounts || {}).reduce(
            (sum, v) => sum + (v || 0),
            0
          );
          const mediaDiff = currentMediaTotal - snapshot.mediaTotal;

          if (Math.abs(mediaDiff) > 0.01) {
            mismatchMessages.push(
              `${mediaKey} | ${snapshot.header1} / ${snapshot.header2}: media total differs by ${
                mediaDiff >= 0 ? "+" : "-"
              }${new Intl.NumberFormat("en-AU", {
                style: "currency",
                currency: "AUD",
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              }).format(Math.abs(mediaDiff))} (expected ${new Intl.NumberFormat("en-AU", {
                style: "currency",
                currency: "AUD",
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              }).format(snapshot.mediaTotal)}, current ${new Intl.NumberFormat("en-AU", {
                style: "currency",
                currency: "AUD",
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              }).format(currentMediaTotal)})`
            );
          }

          const currentFeeEstimate =
            snapshot.mediaTotal > 0
              ? (currentMediaTotal / snapshot.mediaTotal) * snapshot.feeTotal
              : snapshot.feeTotal;
          const feeDiff = currentFeeEstimate - snapshot.feeTotal;
          if (Math.abs(feeDiff) > 0.01) {
            mismatchMessages.push(
              `${mediaKey} | ${snapshot.header1} / ${snapshot.header2}: fee total differs by ${
                feeDiff >= 0 ? "+" : "-"
              }${new Intl.NumberFormat("en-AU", {
                style: "currency",
                currency: "AUD",
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              }).format(Math.abs(feeDiff))} (expected ${new Intl.NumberFormat("en-AU", {
                style: "currency",
                currency: "AUD",
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              }).format(snapshot.feeTotal)}, estimated ${new Intl.NumberFormat("en-AU", {
                style: "currency",
                currency: "AUD",
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              }).format(currentFeeEstimate)})`
            );
          }
        });
      });
    }

    if (mismatchMessages.length > 0) {
      setBillingError({
        show: true,
        messages: mismatchMessages,
      });
      return;
    }

    setBillingMonths(JSON.parse(JSON.stringify(manualBillingMonths)));
    setBillingTotal(manualBillingTotal);
    setIsManualBilling(true);
    setIsManualBillingModalOpen(false);
    setBillingError({ show: false, messages: [] });
    toast({ title: "Success", description: "Manual billing schedule has been saved." });
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
  const { isOpen: isUnsavedPromptOpen, confirmNavigation, stayOnPage } = useUnsavedChangesPrompt(shouldBlockNavigation)
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
      // 1. Gather form values
      const fv = form.getValues();
  
      const attachLineItemsToMonths = (
        months: BillingMonth[],
        mode: "billing" | "delivery"
      ): BillingMonth[] => {
        let monthsWithLineItems = (months || []).map(month => ({
          ...month,
          lineItems: month.lineItems || {},
        }));

        if (monthsWithLineItems.length === 0) {
          return [];
        }

        const isAutoLineItems = (items: any): boolean => {
          if (!Array.isArray(items) || items.length === 0) return false;
          return items.every((li) => String(li?.header1 || "").trim() === "Auto");
        };

        const shouldReplace = (existing: any): boolean => {
          if (!existing) return true;
          if (Array.isArray(existing) && existing.length === 0) return true;
          // Replace synthesized “Auto” line items with detailed line items
          if (isAutoLineItems(existing)) return true;
          return false;
        };

        const mediaTypeMap: Record<string, { lineItems: any[], key: string }> = {
          'mp_television': { lineItems: televisionMediaLineItems, key: 'television' },
          'mp_radio': { lineItems: radioMediaLineItems, key: 'radio' },
          'mp_newspaper': { lineItems: newspaperMediaLineItems, key: 'newspaper' },
          'mp_magazines': { lineItems: magazineMediaLineItems, key: 'magazines' },
          'mp_ooh': { lineItems: oohMediaLineItems, key: 'ooh' },
          'mp_cinema': { lineItems: cinemaMediaLineItems, key: 'cinema' },
          'mp_digidisplay': { lineItems: digiDisplayMediaLineItems, key: 'digiDisplay' },
          'mp_digiaudio': { lineItems: digiAudioMediaLineItems, key: 'digiAudio' },
          'mp_digivideo': { lineItems: digiVideoMediaLineItems, key: 'digiVideo' },
          'mp_bvod': { lineItems: bvodMediaLineItems, key: 'bvod' },
          'mp_integration': { lineItems: integrationMediaLineItems, key: 'integration' },
          'mp_search': { lineItems: searchMediaLineItems, key: 'search' },
          'mp_socialmedia': { lineItems: socialMediaMediaLineItems, key: 'socialMedia' },
          'mp_progdisplay': { lineItems: progDisplayMediaLineItems, key: 'progDisplay' },
          'mp_progvideo': { lineItems: progVideoMediaLineItems, key: 'progVideo' },
          'mp_progbvod': { lineItems: progBvodMediaLineItems, key: 'progBvod' },
          'mp_progaudio': { lineItems: progAudioMediaLineItems, key: 'progAudio' },
          'mp_progooh': { lineItems: progOohMediaLineItems, key: 'progOoh' },
          'mp_influencers': { lineItems: influencersMediaLineItems, key: 'influencers' },
          'mp_production': { lineItems: consultingMediaLineItems, key: 'production' },
        };

        const allLineItems: Record<string, BillingLineItem[]> = {};
        Object.entries(mediaTypeMap).forEach(([mediaTypeKey, { lineItems, key }]) => {
          if (fv[mediaTypeKey as keyof typeof fv] && lineItems && lineItems.length > 0) {
            const billingLineItems = generateBillingLineItems(lineItems, key, monthsWithLineItems, mode);
            if (billingLineItems.length > 0) {
              allLineItems[key] = billingLineItems;
            }
          }
        });

        monthsWithLineItems = monthsWithLineItems.map(month => {
          const monthCopy = { ...month, lineItems: month.lineItems || {} };
          Object.entries(allLineItems).forEach(([key, lineItems]) => {
            const existing = (monthCopy.lineItems as any)[key];
            if (shouldReplace(existing)) {
              (monthCopy.lineItems as any)[key] = lineItems;
            }
          });
          return monthCopy;
        });

        // Final safeguard: ensure each month has at least one line item using totals (without overwriting)
        return monthsWithLineItems.map(synthesizeLineItemsFromTotals);
      };

      const hasManualBillingMonths = isManualBilling && manualBillingMonths.length > 0
      const billingScheduleSource = hasManualBillingMonths ? "manual" : "billing"
      const snapshot = deliveryScheduleSnapshotRef.current
      const hasCampaignDates = Boolean(fv.mp_campaigndates_start && fv.mp_campaigndates_end)

      let billingMonthsSource: BillingMonth[]
      let deliveryMonthsSource: BillingMonth[]

      if (hasCampaignDates) {
        const freshSchedule = computeBillingAndDeliveryMonths({
          campaignStart: fv.mp_campaigndates_start,
          campaignEnd: fv.mp_campaigndates_end,
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
            production: consultingBursts,
          },
          getRateForMediaType,
          adservaudio: adservaudio ?? 0,
          isManualBilling,
        })
        billingMonthsSource = hasManualBillingMonths ? manualBillingMonths : freshSchedule.billingMonths
        deliveryMonthsSource = freshSchedule.deliveryMonths
      } else {
        billingMonthsSource = hasManualBillingMonths ? manualBillingMonths : billingMonths
        deliveryMonthsSource =
          snapshot && snapshot.length > 0
            ? deepCloneBillingMonths(snapshot)
            : autoDeliveryMonths.length > 0
              ? deepCloneBillingMonths(autoDeliveryMonths)
              : deepCloneBillingMonths(billingMonths)
      }

      const deliveryScheduleSource = hasCampaignDates
        ? "computed"
        : snapshot && snapshot.length > 0
          ? "snapshot"
          : autoDeliveryMonths.length > 0
            ? "auto"
            : "billing"

      const billingMonthsWithLineItems = attachLineItemsToMonths(
        deepCloneBillingMonths(billingMonthsSource),
        "billing"
      );

      if (process.env.NODE_ENV !== "production") {
        console.log(`deliverySource = ${deliveryScheduleSource}`, {
          firstMonthYear: deliveryMonthsSource[0]?.monthYear,
        })
        console.log(`billingFirstMonthYear = ${billingMonthsSource[0]?.monthYear}`)
      }

      const deliveryMonthsPrepared = (deliveryMonthsSource || []).map(synthesizeLineItemsFromTotals);
      const deliveryMonthsWithLineItems = attachLineItemsToMonths(
        deliveryMonthsPrepared,
        "delivery"
      );
  
      // 3. Build version payload (include only top‑level and toggles)
      // Transform billing schedule to hierarchical structure (Media Type → line items)
      let billingScheduleJSON = buildBillingScheduleJSON(billingMonthsWithLineItems);
      if (!billingScheduleJSON.length && billingMonthsWithLineItems.length > 0) {
        billingScheduleJSON = buildBillingScheduleJSON(
          billingMonthsWithLineItems.map(synthesizeLineItemsFromTotals)
        );
      }
      billingScheduleJSON = appendPartialApprovalToBillingSchedule({
        billingSchedule: billingScheduleJSON,
        metadata: isPartialMBA ? partialApprovalMetadata : null,
      })

      // Build delivery schedule JSON ONLY from delivery months (snapshot-derived baseline).
      // Do NOT read feeTotal/adservingTechFees/production from billing months.
      let deliveryScheduleJSON = buildBillingScheduleJSON(deliveryMonthsWithLineItems);
      if (!deliveryScheduleJSON.length && deliveryMonthsWithLineItems.length > 0) {
        deliveryScheduleJSON = buildBillingScheduleJSON(
          deliveryMonthsWithLineItems.map(synthesizeLineItemsFromTotals)
        );
      }

      // Safety net: guarantee every month has feeTotal and production before sending to Xano
      const ensureScheduleFields = (schedule: any[], label: string) => {
        if (!Array.isArray(schedule)) return schedule;
        return schedule.map((month, i) => {
          const patched = { ...month };
          if (!patched.feeTotal || patched.feeTotal === "NaN" || patched.feeTotal === "$NaN") {
            console.warn(`[${label}] Month ${i} (${month.monthYear}) missing/invalid feeTotal — defaulting to $0.00`);
            patched.feeTotal = "$0.00";
          }
          if (!patched.production || patched.production === "NaN" || patched.production === "$NaN") {
            patched.production = "$0.00";
          }
          return patched;
        });
      };

      billingScheduleJSON = ensureScheduleFields(billingScheduleJSON, "billingSchedule");
      deliveryScheduleJSON = ensureScheduleFields(deliveryScheduleJSON, "deliverySchedule");

      // Validate required fields - ensure client_name is a non-empty string
      const clientName = typeof fv.mp_client_name === 'string' 
        ? fv.mp_client_name.trim() 
        : String(fv.mp_client_name || '').trim();
      
      if (!clientName) {
        throw new Error("Client name is required. Please select a client.");
      }
      
      console.log("Form values for media plan version:", {
        mp_client_name: clientName,
        mba_number: fv.mba_number,
        mp_plannumber: fv.mp_plannumber,
      });
      
      const shouldEnableProduction = Boolean(
        fv.mp_production || (consultingMediaLineItems?.length ?? 0) > 0
      )

      // Build payload matching Xano's media_plan_versions endpoint expectations
      // IMPORTANT: Field names must match Xano script's $input.* references
      // Xano script maps: client_name -> mp_client_name in database
      // All fields below must be declared in Xano's input block
      const payload = {
        media_plan_master_id: masterId,
        version_number:       parseInt(fv.mp_plannumber, 10),
        mba_number:           fv.mba_number || "",
        campaign_name:        fv.mp_campaignname || "",
        campaign_status:      fv.mp_campaignstatus || "Draft",
        campaign_start_date:  toDateOnlyString(fv.mp_campaigndates_start),
        campaign_end_date:    toDateOnlyString(fv.mp_campaigndates_end),
        brand:                fv.mp_brand || "",
        mp_client_name:       clientName,
        client_contact:       fv.mp_clientcontact || "",
        po_number:            fv.mp_ponumber || "",
        mp_campaignbudget:    fv.mp_campaignbudget || 0,
        fixed_fee:            fv.mp_fixedfee || false,
        mp_production:        shouldEnableProduction,
        mp_television:        fv.mp_television || false,
        mp_radio:             fv.mp_radio || false,
        mp_newspaper:         fv.mp_newspaper || false,
        mp_magazines:         fv.mp_magazines || false,
        mp_ooh:               fv.mp_ooh || false,
        mp_cinema:            fv.mp_cinema || false,
        mp_digidisplay:       fv.mp_digidisplay || false,
        mp_digiaudio:         fv.mp_digiaudio || false,
        mp_digivideo:         fv.mp_digivideo || false,
        mp_bvod:              fv.mp_bvod || false,
        mp_integration:       fv.mp_integration || false,
        mp_search:            fv.mp_search || false,
        mp_socialmedia:       fv.mp_socialmedia || false,
        mp_progdisplay:       fv.mp_progdisplay || false,
        mp_progvideo:         fv.mp_progvideo || false,
        mp_progbvod:          fv.mp_progbvod || false,
        mp_progaudio:         fv.mp_progaudio || false,
        mp_progooh:           fv.mp_progooh || false,
        mp_influencers:       fv.mp_influencers || false,
        billingSchedule:      billingScheduleJSON,
        deliverySchedule:     deliveryScheduleJSON,
        // Xano alias safeguard
        delivery_schedule:    deliveryScheduleJSON,
      };
  
      // 3. Call Xano
      const version = await createMediaPlanVersion(payload);
      // Save campaign KPIs (non-blocking — don't fail the campaign save if KPIs fail)
      if (kpiRows.length > 0) {
        updateSaveStatus("Campaign KPIs", "pending")
        const kpiPayload: CampaignKPI[] = kpiRows.map((row) => ({
          mp_client_name: fv.mp_client_name,
          mba_number: fv.mba_number,
          version_number: parseInt(fv.mp_plannumber ?? "1", 10),
          campaign_name: fv.mp_campaignname,
          media_type: row.media_type,
          publisher: row.publisher,
          bid_strategy: row.bid_strategy,
          ctr: row.ctr,
          cpv: row.cpv,
          conversion_rate: row.conversion_rate,
          vtr: row.vtr,
          frequency: row.frequency,
        }))
        saveCampaignKPIs(kpiPayload)
          .then(() => updateSaveStatus("Campaign KPIs", "success"))
          .catch((err) => updateSaveStatus("Campaign KPIs", "error", err?.message))
      }
      setMediaPlanVersionId(version.id);
      // Update Media Plan Version status to success
      updateSaveStatus('Media Plan Version', 'success')

      // 3b. Generate + upload documents (MBA PDF + Media Plan XLSX) to Xano
      // Do not block core save on upload failures: show in modal as partial success.
      updateSaveStatus("MBA PDF Upload", "pending")
      updateSaveStatus("Media Plan Upload", "pending")
      const documentUploadPromise = (async () => {
        const planVersionForDocs = String(fv.mp_plannumber || "1")

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
          production: consultingItems,
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
      if (shouldEnableProduction && consultingMediaLineItems && consultingMediaLineItems.length > 0) {
        const displayName = mediaTypeDisplayNames.mp_production;
        updateSaveStatus(displayName, 'pending');
        mediaTypeSavePromises.push(
          saveProductionLineItems(
            version.id,
            fv.mba_number,
            fv.mp_client_name,
            fv.mp_plannumber,
            consultingMediaLineItems
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

  const handleBVODBurstsChange = (bursts: BillingBurst[]) =>
    setBvodBursts(normalizeBursts(bursts));

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
  
  return (
    <div
      className="w-full min-h-screen"
      style={{
        // Always keep iOS home-indicator / mobile browser UI from covering content
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      <div className="mx-auto w-full max-w-[1920px] px-4 sm:px-5 md:px-6 xl:px-8 2xl:px-10 pt-0 pb-24 space-y-6">
        <MediaPlanEditorHero
          className="mb-2"
          title="Create a Campaign"
          detail={
            <p>Set up campaign details, select media types, and configure line items.</p>
          }
          actions={
            <Button
              variant="ghost"
              size="sm"
              type="button"
              className="text-xs"
              onClick={handleCopyPageContext}
            >
              Copy Context
            </Button>
          }
        />
        <div className="w-full">
          <Form {...form}>
          <form className="space-y-6">
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 xl:gap-7 2xl:gap-8 xl:items-stretch">
            <div className="flex h-full min-w-0 flex-col gap-4 overflow-hidden rounded-xl border border-border/50 bg-card shadow-sm xl:col-span-2">
              <div className="border-b border-border/40 bg-muted/20 px-6 pb-3 pt-5">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Campaign Details</h3>
              </div>
              <div className="grid w-full flex-1 grid-cols-1 gap-4 px-6 pb-6 md:grid-cols-2 xl:grid-cols-3">
              <FormField
                control={form.control}
                name={"mp_client_name" as keyof MediaPlanFormValues}
                render={({ field }) => {
                  const selectedClient = clients.find((client) => client.mp_client_name === field.value)

                  return (
                    <FormItem>
                      <FormLabel className="text-sm font-medium text-muted-foreground">Client Name</FormLabel>
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
                    <FormLabel className="text-sm font-medium text-muted-foreground">Campaign Name</FormLabel>
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
                    <FormLabel className="text-sm font-medium text-muted-foreground">Brand</FormLabel>
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
                    <FormLabel className="text-sm font-medium text-muted-foreground">Campaign Status</FormLabel>
                    <FormControl>
                      <Combobox
                        value={String(field.value ?? "")}
                        onValueChange={field.onChange}
                        placeholder="Select campaign status"
                        searchPlaceholder="Search statuses..."
                        options={[
                          { value: "approved", label: "Approved" },
                          { value: "booked", label: "Booked" },
                          { value: "cancelled", label: "Cancelled" },
                          { value: "completed", label: "Completed" },
                          { value: "draft", label: "Draft" },
                          { value: "planned", label: "Planned" },
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
                    <FormLabel className="text-sm font-medium text-muted-foreground">Client Contact</FormLabel>
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
                    <FormLabel className="text-sm font-medium text-muted-foreground">PO Number</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="mp_campaigndates_start"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium text-muted-foreground">Campaign Start Date</FormLabel>
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
                    <FormLabel className="text-sm font-medium text-muted-foreground">Campaign End Date</FormLabel>
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
                name="mp_campaignbudget"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium text-muted-foreground">Campaign Budget</FormLabel>
                    <FormControl>
                      <Input
                        type="text"
                        {...field}
                        onChange={(e) => {
                          const value = e.target.value.replace(/[^0-9.]/g, "")
                          field.onChange(value ? Number(value) : 0)
                        }}
                        onBlur={(e) => {
                          const value = e.target.value.replace(/[^0-9.]/g, "")
                          const formattedValue = new Intl.NumberFormat("en-AU", {
                            style: "currency",
                            currency: "AUD",
                          }).format(Number(value) || 0)
                          e.target.value = formattedValue
                        }}
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
                    <FormLabel className="text-sm font-medium text-muted-foreground">MBA Identifier</FormLabel>
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
                    <FormLabel className="text-sm font-medium text-muted-foreground">MBA Number</FormLabel>
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
                    <FormLabel className="text-sm font-medium text-muted-foreground">Media Plan Version</FormLabel>
                    <div className="flex h-10 w-full items-center rounded-md border border-border/40 bg-muted/30 px-3 py-2 text-sm text-foreground">
                      <span className="truncate">1</span>
                    </div>
                    <FormDescription className="text-[11px]">This is the media plan version.</FormDescription>
                  </FormItem>
                )}
              />
              </div>
            </div>

            <div className="flex h-full min-w-0 flex-col overflow-hidden rounded-xl border border-border/50 bg-card shadow-sm xl:col-span-1">
              <div className="border-b border-border/40 bg-muted/20 px-6 pb-3 pt-5">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Media Types</h3>
              </div>
              <div className="grid min-h-0 w-full flex-1 grid-cols-1 content-start gap-x-3 gap-y-1.5 px-6 py-4 md:grid-cols-2">
                {mediaTypes.filter(medium => medium.name !== "mp_fixedfee").map((medium) => (
                  <FormField
                    key={medium.name}
                    control={form.control}
                    name={medium.name as keyof MediaPlanFormValues}
                    render={({ field }) => (
                      <FormItem className="flex items-center gap-3 space-y-0 py-0.5">
                        <FormControl className="shrink-0">
                          <Switch
                            checked={!!field.value}
                            onCheckedChange={(checked) => {
                              field.onChange(checked)
                              if (medium.name === "mp_production") {
                                form.setValue("mp_production", checked, { shouldDirty: true })
                              }
                            }}
                          />
                        </FormControl>
                        <FormLabel className="font-normal leading-snug min-w-0 flex-1 cursor-pointer">
                          {medium.label}
                        </FormLabel>
                      </FormItem>
                    )}
                  />
                ))}
              </div>
            </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 xl:gap-7 2xl:gap-8 xl:items-stretch">
              {/* MBA Details Section */}
              <div className="flex h-full min-w-0 flex-col overflow-hidden rounded-xl border border-border/50 bg-card shadow-sm">
                <div className="flex items-center justify-between border-b border-border/40 bg-muted/20 px-6 pb-3 pt-5">
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">MBA Details</h3>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    {isPartialMBA ? (
                      <>
                        <Button variant="outline" size="sm" type="button" className="shrink-0" onClick={handlePartialMBAOpen}>
                          Edit partial MBA
                        </Button>
                        <Button variant="outline" size="sm" type="button" className="shrink-0" onClick={() => setIsPartialMBA(false)}>
                          Reset to Auto
                        </Button>
                      </>
                    ) : (
                      <Button variant="outline" size="sm" type="button" className="shrink-0" onClick={handlePartialMBAOpen}>
                        Partial MBA
                      </Button>
                    )}
                  </div>
                </div>
                <div className="space-y-3 px-6 py-4">
                  {(() => {
                    const deliveryMbaTotals = getDeliveryMbaTotals();
                    const deliveryInvestmentExGst =
                      deliveryMbaTotals.grossMedia +
                      deliveryMbaTotals.assembledFee +
                      deliveryMbaTotals.adServing +
                      deliveryMbaTotals.production;
                    return (
                      <>
                        {mediaTypes
                          .filter((medium) => medium.name !== "mp_production")
                          .filter((medium) => watchedMediaTypesMap[medium.name] && medium.component)
                          .map((medium) => {
                            const mediaKey = mediaKeyMap[medium.name];
                            const total = isPartialMBA
                              ? partialMBAValues.mediaTotals[mediaKey] || 0
                              : deliveryMbaTotals.mediaCostsByKey[mediaKey] ?? 0;
                            return (
                              <div key={medium.name} className="flex items-center justify-between py-1">
                                <span className="text-sm text-muted-foreground">{medium.label}</span>
                                <span className="text-sm font-medium tabular-nums">{mbaCurrencyFormatter.format(total)}</span>
                              </div>
                            );
                          })}
                        <div className="border-t border-border/40" />
                        <div className="flex items-center justify-between py-1">
                          <span className="text-sm font-semibold">Gross Media</span>
                          <span className="text-sm font-semibold tabular-nums">
                            {mbaCurrencyFormatter.format(
                              isPartialMBA ? partialMBAValues.grossMedia : deliveryMbaTotals.grossMedia
                            )}
                          </span>
                        </div>
                        <div className="flex items-center justify-between py-1">
                          <span className="text-sm font-semibold">Assembled Fee</span>
                          <span className="text-sm font-semibold tabular-nums">
                            {mbaCurrencyFormatter.format(
                              isPartialMBA ? partialMBAValues.assembledFee : deliveryMbaTotals.assembledFee
                            )}
                          </span>
                        </div>
                        <div className="flex items-center justify-between py-1">
                          <span className="text-sm font-semibold">Ad Serving & Tech</span>
                          <span className="text-sm font-semibold tabular-nums">
                            {mbaCurrencyFormatter.format(
                              isPartialMBA ? partialMBAValues.adServing : deliveryMbaTotals.adServing
                            )}
                          </span>
                        </div>
                        <div className="flex items-center justify-between py-1">
                          <span className="text-sm font-semibold">Production</span>
                          <span className="text-sm font-semibold tabular-nums">
                            {mbaCurrencyFormatter.format(
                              isPartialMBA ? partialMBAValues.production : deliveryMbaTotals.production
                            )}
                          </span>
                        </div>
                        <div className="border-t-2 border-primary/20 pt-3">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-bold">Total Investment (ex GST)</span>
                            <span className="text-sm font-bold tabular-nums text-primary">
                              {mbaCurrencyFormatter.format(
                                isPartialMBA
                                  ? partialMBAValues.grossMedia +
                                      partialMBAValues.assembledFee +
                                      partialMBAValues.adServing +
                                      partialMBAValues.production
                                  : deliveryInvestmentExGst
                              )}
                            </span>
                          </div>
                        </div>
                        {isPartialMBA && partialApprovalMetadata?.note ? (
                          <div className="mt-3 rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
                            <div className="mb-1 font-semibold text-foreground">Partial approval changes</div>
                            <div>{partialApprovalMetadata.note}</div>
                          </div>
                        ) : null}
                      </>
                    );
                  })()}
                </div>
              </div>

              {/* Billing Schedule Section */}
              <div className="flex h-full min-w-0 flex-col overflow-hidden rounded-xl border border-border/50 bg-card shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 bg-muted/20 px-6 pb-3 pt-5">
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Billing Schedule</h3>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="shrink-0"
                      disabled={billingMonths.length === 0}
                      onClick={handleDownloadBillingScheduleExcel}
                    >
                      <Download className="mr-2 h-4 w-4" />
                      Download Excel
                    </Button>
                    <Button onClick={handleManualBillingOpen} type="button" className="shrink-0">
                      Edit Billing
                    </Button>
                  </div>
                </div>
                <div className="min-w-0 flex-1 overflow-x-auto px-6 py-4">
                <Table
                  className={cn(
                    "min-w-0 w-full max-w-full text-[10px] [&_th]:h-7 [&_th]:px-1.5 [&_th]:py-1 [&_th]:text-[10px] [&_th]:font-medium [&_td]:px-1.5 [&_td]:py-1 [&_td]:text-[10px] tabular-nums"
                  )}
                >
                  <TableHeader>
                    <TableRow>
                      <TableHead>Month</TableHead>
                      <TableHead align="right">Media</TableHead>
                      <TableHead align="right">Fees</TableHead>
                      {billingSchedulePreviewColumns.showAdServing ? (
                        <TableHead align="right">Ad Serving</TableHead>
                      ) : null}
                      {billingSchedulePreviewColumns.showProduction ? (
                        <TableHead align="right">Production</TableHead>
                      ) : null}
                      <TableHead align="right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {billingMonths.map(m => (
                      <TableRow key={m.monthYear}>
                        <TableCell>{m.monthYear}</TableCell>
                        <TableCell align="right">{m.mediaTotal}</TableCell>
                        <TableCell align="right">{m.feeTotal}</TableCell>
                        {billingSchedulePreviewColumns.showAdServing ? (
                          <TableCell align="right">{m.adservingTechFees}</TableCell>
                        ) : null}
                        {billingSchedulePreviewColumns.showProduction ? (
                          <TableCell align="right">{m.production || "$0.00"}</TableCell>
                        ) : null}
                        <TableCell align="right" className="font-semibold">{m.totalAmount}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="font-bold">
                      <TableCell>Grand Total</TableCell>
                      <TableCell align="right">
                        {mbaCurrencyFormatter.format(
                          billingMonths.reduce((acc, m) => acc + parseFloat(m.mediaTotal.replace(/[^0-9.-]/g, "")), 0)
                        )}
                      </TableCell>
                      <TableCell align="right">
                        {mbaCurrencyFormatter.format(
                          billingMonths.reduce((acc, m) => acc + parseFloat(m.feeTotal.replace(/[^0-9.-]/g, "")), 0)
                        )}
                      </TableCell>
                      {billingSchedulePreviewColumns.showAdServing ? (
                        <TableCell align="right">
                          {mbaCurrencyFormatter.format(billingSchedulePreviewColumns.adServingGrand)}
                        </TableCell>
                      ) : null}
                      {billingSchedulePreviewColumns.showProduction ? (
                        <TableCell align="right">
                          {mbaCurrencyFormatter.format(billingSchedulePreviewColumns.productionGrand)}
                        </TableCell>
                      ) : null}
                      <TableCell align="right" className="font-semibold">
                        {mbaCurrencyFormatter.format(
                          billingMonths.reduce(
                            (acc, m) => acc + parseFloat(m.totalAmount.replace(/[^0-9.-]/g, "")),
                            0,
                          ),
                        )}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
                </div>
              </div>

              <div className="flex h-full min-w-0 flex-col overflow-hidden rounded-xl border border-border/50 bg-card shadow-sm">
                <div className="border-b border-border/40 bg-muted/20 px-6 pb-3 pt-5">
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">KPIs</h3>
                </div>
                <div className="px-4 py-3 overflow-x-auto">
                  <KPISection
                    kpiRows={kpiRows}
                    isLoading={isKPILoading}
                    onKPIChange={setKpiRows}
                    onSave={setKpiRows}
                    onReset={handleKPIReset}
                  />
                </div>
              </div>
            </div>

              {/* === Manual Billing Modal === */}
              <Dialog open={isManualBillingModalOpen} onOpenChange={setIsManualBillingModalOpen}>
  <DialogContent className="flex max-h-[90vh] max-w-5xl flex-col overflow-hidden p-0">
    <div className="h-1 shrink-0 bg-gradient-to-r from-primary via-primary/70 to-primary/40" />
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="shrink-0 border-b px-6 py-4">
        <DialogHeader>
          <DialogTitle>Manual Billing Schedule</DialogTitle>
        </DialogHeader>
        <p className="mt-1 text-sm text-muted-foreground">
          Subtotals are calculated from line items. Fees, ad serving, and production are editable at the bottom.
        </p>
      </div>

      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-4">
        <Accordion type="multiple" className="w-full">
          {mediaTypes
            .filter((medium) => medium.name !== "mp_production")
            .filter((medium) => form.watch(medium.name as keyof MediaPlanFormValues) && medium.component)
            .map((medium) => {
              const mediaKey = mediaKeyMap[medium.name];
              const headers = getMediaTypeHeadersForSchedule(mediaKey);
              const firstMonth = manualBillingMonths[0];
              const lineItems = firstMonth?.lineItems?.[mediaKey as keyof typeof firstMonth.lineItems] as BillingLineItem[] | undefined;

              if (!lineItems || lineItems.length === 0) return null;

              return (
                <AccordionItem key={medium.name} value={`manual-billing-${medium.name}`}>
                  <AccordionTrigger className="text-left">{medium.label}</AccordionTrigger>
                  <AccordionContent>
                    <div className="overflow-x-auto mt-4">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[90px]">Auto</TableHead>
                            <TableHead className="w-[90px]">Pre-bill</TableHead>
                            <TableHead>{headers.header1}</TableHead>
                            <TableHead>{headers.header2}</TableHead>
                            {manualBillingMonths.map((m) => (
                              <TableHead key={m.monthYear} className="text-right whitespace-nowrap">
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
                                  onClick={() => handleManualBillingLineItemResetToAuto(mediaKey, lineItem.id)}
                                >
                                  Reset
                                </Button>
                              </TableCell>
                              <TableCell>
                                <Checkbox
                                  checked={Boolean(lineItem.preBill)}
                                  onCheckedChange={(next) =>
                                    handleManualBillingLineItemPreBillToggle(mediaKey, lineItem.id, Boolean(next))
                                  }
                                />
                              </TableCell>
                              <TableCell>{lineItem.header1}</TableCell>
                              <TableCell>{lineItem.header2}</TableCell>
                              {manualBillingMonths.map((month, monthIndex) => {
                                const monthAmount = lineItem.monthlyAmounts?.[month.monthYear] || 0;
                                return (
                                  <TableCell key={month.monthYear} align="right">
                                    <EditableLineItemMonthInput
                                      key={`${lineItem.id}__${month.monthYear}`}
                                      className="text-right w-28"
                                      amount={monthAmount}
                                      formatter={mbaCurrencyFormatter}
                                      onAmountChange={(numericValue) => {
                                        const tempCopy = [...manualBillingMonths];
                                        syncLineItemMonthlyAmountAcrossAllMonthRows(
                                          tempCopy,
                                          mediaKey,
                                          lineItem.id,
                                          month.monthYear,
                                          numericValue
                                        );
                                        setManualBillingMonths(tempCopy);
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
                                );
                              })}
                              <TableCell className="text-right font-semibold">{mbaCurrencyFormatter.format(lineItem.totalAmount)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>

                        <TableFooter>
                          <TableRow className="font-bold border-t-2 bg-muted/30">
                            <TableCell colSpan={4}>Subtotal</TableCell>
                            {manualBillingMonths.map((m) => {
                              const subtotal = lineItems.reduce((sum, li) => sum + (li.monthlyAmounts?.[m.monthYear] || 0), 0);
                              return (
                                <TableCell key={m.monthYear} className="text-right">
                                  {mbaCurrencyFormatter.format(subtotal)}
                                </TableCell>
                              );
                            })}
                            <TableCell className="text-right">
                              {mbaCurrencyFormatter.format(lineItems.reduce((sum, li) => sum + (li.totalAmount || 0), 0))}
                            </TableCell>
                          </TableRow>
                        </TableFooter>
                      </Table>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              );
            })}

          <AccordionItem value="manual-billing-costs">
            <AccordionTrigger className="text-left">Fees, Ad Serving &amp; Production</AccordionTrigger>
            <AccordionContent>
              <div className="overflow-x-auto mt-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[90px]">Pre-bill</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Details</TableHead>
                      {manualBillingMonths.map((m) => (
                        <TableHead key={m.monthYear} className="text-right whitespace-nowrap">
                          {m.monthYear}
                        </TableHead>
                      ))}
                      <TableHead className="text-right font-bold">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {/* Fees */}
                    <TableRow>
                      <TableCell>
                        <Checkbox
                          checked={manualBillingCostPreBill.fee}
                          onCheckedChange={(next) => handleManualBillingCostPreBillToggle("fee", Boolean(next))}
                        />
                      </TableCell>
                      <TableCell className="font-medium">Fees</TableCell>
                      <TableCell className="text-muted-foreground">Total</TableCell>
                      {manualBillingMonths.map((month, monthIndex) => (
                        <TableCell key={month.monthYear} align="right">
                          <Input
                            className="text-right w-28"
                            value={month.feeTotal}
                            onBlur={(e) => handleManualBillingChange(monthIndex, "fee", e.target.value)}
                            onChange={(e) => {
                              const tempCopy = [...manualBillingMonths];
                              tempCopy[monthIndex].feeTotal = e.target.value;
                              setManualBillingMonths(tempCopy);
                            }}
                          />
                        </TableCell>
                      ))}
                      <TableCell className="text-right font-semibold">
                        {mbaCurrencyFormatter.format(
                          manualBillingMonths.reduce(
                            (acc, m) => acc + (parseFloat(String(m.feeTotal || "$0").replace(/[^0-9.-]/g, "")) || 0),
                            0
                          )
                        )}
                      </TableCell>
                    </TableRow>

                    {/* Ad Serving */}
                    <TableRow>
                      <TableCell>
                        <Checkbox
                          checked={manualBillingCostPreBill.adServing}
                          onCheckedChange={(next) => handleManualBillingCostPreBillToggle("adServing", Boolean(next))}
                        />
                      </TableCell>
                      <TableCell className="font-medium">Ad Serving</TableCell>
                      <TableCell className="text-muted-foreground">Tech fees</TableCell>
                      {manualBillingMonths.map((month, monthIndex) => (
                        <TableCell key={month.monthYear} align="right">
                          <Input
                            className="text-right w-28"
                            value={month.adservingTechFees}
                            onBlur={(e) => handleManualBillingChange(monthIndex, "adServing", e.target.value)}
                            onChange={(e) => {
                              const tempCopy = [...manualBillingMonths];
                              tempCopy[monthIndex].adservingTechFees = e.target.value;
                              setManualBillingMonths(tempCopy);
                            }}
                          />
                        </TableCell>
                      ))}
                      <TableCell className="text-right font-semibold">
                        {mbaCurrencyFormatter.format(
                          manualBillingMonths.reduce(
                            (acc, m) => acc + (parseFloat(String(m.adservingTechFees || "$0").replace(/[^0-9.-]/g, "")) || 0),
                            0
                          )
                        )}
                      </TableCell>
                    </TableRow>

                    {/* Production */}
                    <TableRow>
                      <TableCell>
                        <Checkbox
                          checked={manualBillingCostPreBill.production}
                          onCheckedChange={(next) => handleManualBillingCostPreBillToggle("production", Boolean(next))}
                        />
                      </TableCell>
                      <TableCell className="font-medium">Production</TableCell>
                      <TableCell className="text-muted-foreground">Total</TableCell>
                      {manualBillingMonths.map((month, monthIndex) => (
                        <TableCell key={month.monthYear} align="right">
                          <Input
                            className="text-right w-28"
                            value={month.production || "$0.00"}
                            onBlur={(e) => handleManualBillingChange(monthIndex, "production", e.target.value, "production")}
                            onChange={(e) => {
                              const tempCopy = [...manualBillingMonths];
                              tempCopy[monthIndex].production = e.target.value;
                              if (tempCopy[monthIndex].mediaCosts?.production !== undefined) {
                                tempCopy[monthIndex].mediaCosts.production = e.target.value;
                              }
                              setManualBillingMonths(tempCopy);
                            }}
                          />
                        </TableCell>
                      ))}
                      <TableCell className="text-right font-semibold">
                        {mbaCurrencyFormatter.format(
                          manualBillingMonths.reduce(
                            (acc, m) => acc + (parseFloat(String(m.production || "$0").replace(/[^0-9.-]/g, "")) || 0),
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
          {billingError.show && (
            <div className="mt-2 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
              <p className="font-bold">Line Item Billing Mismatch</p>
              <p className="text-sm mt-1">Each line item media and fee total must match expected values.</p>
              <div className="mt-2 max-h-56 overflow-auto text-sm space-y-1">
                {billingError.messages.map((message, idx) => (
                  <p key={`${idx}-${message}`}>- {message}</p>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="shrink-0 border-t px-6 py-4">
        <DialogFooter className="sm:justify-end">
          <div className="flex space-x-2">
            <Button
              variant="ghost"
              onClick={() => {
                setIsManualBillingModalOpen(false);
                setBillingError({ show: false, messages: [] });
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleManualBillingSave}>Save Billing Changes</Button>
          </div>
        </DialogFooter>
      </div>
    </div>
  </DialogContent>
</Dialog>

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

{/* === Partial MBA Modal === */}
<Dialog open={isPartialMBAModalOpen} onOpenChange={(open) => {
  setIsPartialMBAModalOpen(open);
  if (!open) setPartialMBAError(null);
}}>
  <DialogContent className="flex max-h-[90vh] max-w-4xl flex-col overflow-hidden p-0">
    <div className="h-1 shrink-0 bg-gradient-to-r from-primary via-primary/70 to-primary/40" />
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
    <div className="shrink-0 px-6 pt-6">
    <DialogHeader>
      <DialogTitle>Partial MBA Override</DialogTitle>
    </DialogHeader>
    </div>
    <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
    <div className="space-y-4">
      {(() => {
        const campaignBudget = form.watch("mp_campaignbudget") || 0
        const totalInvestment =
          partialMBAValues.grossMedia +
          partialMBAValues.assembledFee +
          partialMBAValues.adServing +
          partialMBAValues.production
        const diff = totalInvestment - campaignBudget
        if (!campaignBudget || Math.abs(diff) <= 2) return null

        return (
          <div className="bg-yellow-50 border-l-4 border-yellow-500 text-yellow-800 p-4 rounded-md" role="alert">
            <p className="font-bold">Budget mismatch (warning)</p>
            <p className="text-sm">
              Campaign Budget: {mbaCurrencyFormatter.format(campaignBudget)}. Total Investment:{" "}
              {mbaCurrencyFormatter.format(totalInvestment)}. Difference: {mbaCurrencyFormatter.format(Math.abs(diff))}{" "}
              {diff > 0 ? "over" : "under"}.
            </p>
          </div>
        )
      })()}

      <div className="space-y-2">
        <label className="text-sm font-medium">Delivery months</label>
        <MultiSelectCombobox
          options={(autoDeliveryMonths.length > 0 ? autoDeliveryMonths : billingMonths).map(
            (m): MultiSelectOption => ({ value: m.monthYear, label: m.monthYear })
          )}
          values={partialMBAMonthYears}
          onValuesChange={handlePartialMBAMonthsChange}
          placeholder="Select months"
          allSelectedText="All months"
        />
        <p className="text-xs text-muted-foreground">
          Changing months or line selection recalculates media from checked lines; assembled fee and ad serving scale with the share of line-item media included.
        </p>
      </div>
      <h4 className="font-semibold text-md border-b pb-2">Media Totals (Expandable by line item)</h4>
      <Accordion type="multiple" className="w-full">
        {mediaTypes
          .filter((medium) => medium.name !== "mp_production")
          .filter((medium) => form.watch(medium.name as keyof MediaPlanFormValues) && medium.component)
          .map((medium) => {
            const mediaKey = mediaKeyMap[medium.name]
            const checked = partialMBAMediaEnabled[mediaKey] ?? true
            const items = partialMBALineItemsByMedia[mediaKey] || []
            return (
              <AccordionItem key={medium.name} value={medium.name}>
                <AccordionTrigger
                  leading={
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(next) => handlePartialMBAToggleMedia(mediaKey, Boolean(next))}
                    />
                  }
                >
                  <div className="flex w-full items-center justify-between pr-4">
                    <span className="text-sm font-medium">{medium.label}</span>
                    <span className="text-sm">{mbaCurrencyFormatter.format(partialMBAValues.mediaTotals[mediaKey] || 0)}</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-2 pl-2">
                    {items.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No line items found for selected months.</p>
                    ) : (
                      items.map((item) => {
                        const itemChecked = (partialMBASelectedLineItemIds[mediaKey] || []).includes(item.lineItemId)
                        return (
                          <div key={item.lineItemId} className="flex items-center justify-between gap-2 text-sm">
                            <label className="flex min-w-0 flex-1 items-start gap-2">
                              <Checkbox
                                className="mt-0.5"
                                checked={itemChecked}
                                onCheckedChange={(next) => handlePartialMBAToggleLineItem(mediaKey, item.lineItemId, Boolean(next))}
                              />
                              <span className="min-w-0 leading-snug">
                                <span className="font-medium tabular-nums text-muted-foreground">
                                  {item.lineNumber != null ? `Line ${item.lineNumber}` : "Line —"}
                                </span>
                                {" · "}
                                <span className="font-medium">{item.header1 || "—"}</span>
                                {item.header2 ? (
                                  <>
                                    {" · "}
                                    <span>{item.header2}</span>
                                  </>
                                ) : null}
                              </span>
                            </label>
                            <span className="shrink-0 tabular-nums">{mbaCurrencyFormatter.format(item.amount)}</span>
                          </div>
                        )
                      })
                    )}
                  </div>
                </AccordionContent>
              </AccordionItem>
            )
          })}
      </Accordion>
      
      {/* Aggregated Totals */}
      <h4 className="font-semibold text-md border-b pb-2 pt-4">Summary Totals</h4>
      <div className="space-y-4 max-w-md mx-auto">
          <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Gross Media Total</label>
              <Input
                  className="text-right w-48 bg-muted"
                  value={mbaCurrencyFormatter.format(partialMBAValues.grossMedia)}
                  readOnly // This field is calculated automatically
              />
          </div>
          <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Assembled Fee</label>
              <Input
                  className="text-right w-48"
                  value={mbaCurrencyFormatter.format(partialMBAValues.assembledFee)}
                  onBlur={(e) => handlePartialMBAChange('assembledFee', e.target.value)}
                  onChange={(e) => setPartialMBAValues(p => ({...p, assembledFee: parseFloat(e.target.value.replace(/[^0-9.-]/g, '')) || 0}))}
              />
          </div>
          <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Ad Serving & Tech Fees</label>
              <Input
                  className="text-right w-48"
                  value={mbaCurrencyFormatter.format(partialMBAValues.adServing)}
                  onBlur={(e) => handlePartialMBAChange('adServing', e.target.value)}
                  onChange={(e) => setPartialMBAValues(p => ({...p, adServing: parseFloat(e.target.value.replace(/[^0-9.-]/g, '')) || 0}))}
              />
          </div>
          <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Production</label>
              <Input
                  className="text-right w-48"
                  value={mbaCurrencyFormatter.format(partialMBAValues.production)}
                  onBlur={(e) => handlePartialMBAChange('production', e.target.value)}
                  onChange={(e) => setPartialMBAValues(p => ({...p, production: parseFloat(e.target.value.replace(/[^0-9.-]/g, '')) || 0}))}
              />
          </div>
          <div className="border-t pt-4 mt-4 flex items-center justify-between">
              <label className="text-sm font-bold">Total Investment (ex GST)</label>
              <div className="text-right w-48 font-bold p-2">
                  {mbaCurrencyFormatter.format(
                      partialMBAValues.grossMedia +
                      partialMBAValues.assembledFee +
                      partialMBAValues.adServing +
                      partialMBAValues.production
                  )}
              </div>
          </div>
      </div>
    </div>
    </div>
    <div className="shrink-0 border-t px-6 py-4">
    <DialogFooter className="sm:justify-between pt-0">
      <Button variant="outline" onClick={handlePartialMBAReset} className="sm:mr-auto">
        Reset Changes
      </Button>
      <div className="flex space-x-2">
        <Button variant="ghost" onClick={() => setIsPartialMBAModalOpen(false)}>
          Cancel
        </Button>
        <Button onClick={handlePartialMBASave}>Save Partial MBA</Button>
      </div>
    </DialogFooter>
    </div>
    </div>
  </DialogContent>
</Dialog>

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
                    onInvestmentChange: handleInvestmentChange
                  }),
                  ...(medium.name === "mp_socialmedia" && { 
                    feesocial, 
                    onTotalMediaChange: handleSocialMediaTotalChange,
                    onBurstsChange: handleSocialMediaBurstsChange,
                    onInvestmentChange: handleInvestmentChange
                  }),
                  ...(medium.name === "mp_bvod" && { 
                    feebvod, 
                    onTotalMediaChange: handleBVODTotalChange,
                    onBurstsChange: handleBVODBurstsChange,
                    onInvestmentChange: handleInvestmentChange
                  }),
                  ...(medium.name === "mp_integration" && {
                    feeintegration,
                    onTotalMediaChange: handleIntegrationTotalChange,
                    onBurstsChange: handleIntegrationBurstsChange,
                    onInvestmentChange: handleInvestmentChange
                  }),
                  ...(medium.name === "mp_progdisplay" && { 
                    feeprogdisplay, 
                    onTotalMediaChange: handleProgDisplayTotalChange,
                    onBurstsChange: handleProgDisplayBurstsChange,
                    onInvestmentChange: handleInvestmentChange
                  }),
                  ...(medium.name === "mp_progvideo" && { 
                    feeprogvideo, 
                    onTotalMediaChange: handleProgVideoTotalChange,
                    onBurstsChange: handleProgVideoBurstsChange,
                    onInvestmentChange: handleInvestmentChange
                  }),
                  ...(medium.name === "mp_digiaudio" && { 
                    feedigiaudio, 
                    onTotalMediaChange: handleDigiAudioTotalChange,
                    onBurstsChange: handleDigiAudioBurstsChange,
                    onInvestmentChange: handleInvestmentChange
                  }),
                  ...(medium.name === "mp_digidisplay" && { 
                    feedigidisplay, 
                    onTotalMediaChange: handleDigiDisplayTotalChange,
                    onBurstsChange: handleDigiDisplayBurstsChange,
                    onInvestmentChange: handleInvestmentChange
                  }),
                  ...(medium.name === "mp_digivideo" && { 
                    feedigivideo, 
                    onTotalMediaChange: handleDigiVideoTotalChange,
                    onBurstsChange: handleDigiVideoBurstsChange,
                    onInvestmentChange: handleInvestmentChange
                  }),
                  ...(medium.name === "mp_progaudio" && { 
                    feeprogaudio, 
                    onTotalMediaChange: handleProgAudioTotalChange,
                    onBurstsChange: handleProgAudioBurstsChange,
                    onInvestmentChange: handleInvestmentChange
                  }),
                  ...(medium.name === "mp_cinema" && {
                  feecinema,
                  onTotalMediaChange: handleCinemaTotalChange,
                  onBurstsChange: handleCinemaBurstsChange,
                  onInvestmentChange: handleInvestmentChange,
                  }),
                  ...(medium.name === "mp_television" && {
                  feeTelevision,
                  onTotalMediaChange: handleTelevisionTotalChange,
                  onBurstsChange: handleTelevisionBurstsChange,
                  onInvestmentChange: handleInvestmentChange,
                  }),
                  ...(medium.name === "mp_radio" && {
                  feeRadio,
                  onTotalMediaChange: handleRadioTotalChange,
                  onBurstsChange: handleRadioBurstsChange,
                  onInvestmentChange: handleInvestmentChange,
                  }),
                  ...(medium.name === "mp_newspaper" && {
                  feeNewspapers,
                  onTotalMediaChange: handleNewspaperTotalChange,
                  onBurstsChange: handleNewspaperBurstsChange,
                  onInvestmentChange: handleInvestmentChange,
                  }),
                  ...(medium.name === "mp_magazines" && {
                  feeMagazines,
                  onTotalMediaChange: handleMagazinesTotalChange,
                  onBurstsChange: handleMagazineBurstsChange,
                  onInvestmentChange: handleInvestmentChange,
                  }),
                  ...(medium.name === "mp_ooh" && {
                  feeOoh,
                  onTotalMediaChange: handleOohTotalChange,
                  onBurstsChange: handleOohBurstsChange,
                  onInvestmentChange: handleInvestmentChange,
                  }),
                  ...(medium.name === "mp_production" && {
                  feesearch: feeconsulting,
                  onTotalMediaChange: handleConsultingTotalChange,
                  onBurstsChange: handleConsultingBurstsChange,
                  onInvestmentChange: handleInvestmentChange,
                  }),
                  ...(medium.name === "mp_influencers" && {
                  feeinfluencers,
                  onTotalMediaChange: handleInfluencersTotalChange,
                  onBurstsChange: handleInfluencersBurstsChange,
                  onInvestmentChange: handleInvestmentChange,
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
                            onInvestmentChange={handleInvestmentChange}
                            onLineItemsChange={handleSearchItemsChange}
                            onMediaLineItemsChange={handleSearchMediaLineItemsChange}
                            campaignStartDate={form.watch("mp_campaigndates_start")}
                            campaignEndDate={form.watch("mp_campaigndates_end")}
                            campaignBudget={form.watch("mp_campaignbudget")}
                            campaignId={""}
                            mediaTypes={["search"]}
                          />
                        </Suspense>
                      )}
                      {medium.name === "mp_production" && (
                        <Suspense fallback={<MediaContainerSuspenseFallback label="Production" />}>
                          <ProductionContainer
                            clientId={selectedClientId}
                            feesearch={feeconsulting || 0}
                            onTotalMediaChange={handleConsultingTotalChange}
                            onBurstsChange={handleConsultingBurstsChange}
                            onInvestmentChange={handleInvestmentChange}
                            onLineItemsChange={handleConsultingItemsChange}
                            onMediaLineItemsChange={handleConsultingMediaLineItemsChange}
                            campaignStartDate={form.watch("mp_campaigndates_start")}
                            campaignEndDate={form.watch("mp_campaigndates_end")}
                            campaignBudget={form.watch("mp_campaignbudget")}
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
                            onInvestmentChange={handleInvestmentChange}
                            onLineItemsChange={handleSocialMediaItemsChange}
                            onSocialMediaLineItemsChange={handleSocialMediaLineItemsStateChange}
                            onMediaLineItemsChange={handleSocialMediaMediaLineItemsChange}
                            campaignStartDate={form.watch("mp_campaigndates_start")}
                            campaignEndDate={form.watch("mp_campaigndates_end")}
                            campaignBudget={form.watch("mp_campaignbudget")}
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
                            onInvestmentChange={handleInvestmentChange}
                            onLineItemsChange={handleBVODItemsChange}
                            onMediaLineItemsChange={handleBvodMediaLineItemsChange}
                            campaignStartDate={form.watch("mp_campaigndates_start")}
                            campaignEndDate={form.watch("mp_campaigndates_end")}
                            campaignBudget={form.watch("mp_campaignbudget")}
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
                            onInvestmentChange={handleInvestmentChange}
                            onLineItemsChange={handleIntegrationItemsChange}
                            onMediaLineItemsChange={handleIntegrationMediaLineItemsChange}
                            campaignStartDate={form.watch("mp_campaigndates_start")}
                            campaignEndDate={form.watch("mp_campaigndates_end")}
                            campaignBudget={form.watch("mp_campaignbudget")}
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
                            onInvestmentChange={handleInvestmentChange}
                            onLineItemsChange={handleCinemaItemsChange}
                            onMediaLineItemsChange={handleCinemaMediaLineItemsChange}
                            campaignStartDate={form.watch("mp_campaigndates_start")}
                            campaignEndDate={form.watch("mp_campaigndates_end")}
                            campaignBudget={form.watch("mp_campaignbudget")}
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
                            onInvestmentChange={handleInvestmentChange}
                            onLineItemsChange={handleProgAudioItemsChange}
                            onMediaLineItemsChange={handleProgAudioMediaLineItemsChange}
                            campaignStartDate={form.watch("mp_campaigndates_start")}
                            campaignEndDate={form.watch("mp_campaigndates_end")}
                            campaignBudget={form.watch("mp_campaignbudget")}
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
                            onInvestmentChange={handleInvestmentChange}
                            onLineItemsChange={handleProgBvodItemsChange}
                            onMediaLineItemsChange={handleProgBvodMediaLineItemsChange}
                            campaignStartDate={form.watch("mp_campaigndates_start")}
                            campaignEndDate={form.watch("mp_campaigndates_end")}
                            campaignBudget={form.watch("mp_campaignbudget")}
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
                            onInvestmentChange={handleInvestmentChange}
                            onLineItemsChange={setProgOohItems}
                            onMediaLineItemsChange={handleProgOohMediaLineItemsChange}
                            campaignStartDate={form.watch("mp_campaigndates_start")}
                            campaignEndDate={form.watch("mp_campaigndates_end")}
                            campaignBudget={form.watch("mp_campaignbudget")}
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
                          onInvestmentChange={handleInvestmentChange}
                          onLineItemsChange={setDigiAudioItems}
                          onMediaLineItemsChange={handleDigiAudioMediaLineItemsChange}
                          campaignStartDate={form.watch("mp_campaigndates_start")}
                          campaignEndDate={form.watch("mp_campaigndates_end")}
                          campaignBudget={form.watch("mp_campaignbudget")}
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
                          onInvestmentChange={handleInvestmentChange}
                          onLineItemsChange={setDigiDisplayItems}
                          onMediaLineItemsChange={handleDigiDisplayMediaLineItemsChange}
                          campaignStartDate={form.watch("mp_campaigndates_start")}
                          campaignEndDate={form.watch("mp_campaigndates_end")}
                          campaignBudget={form.watch("mp_campaignbudget")}
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
                          onInvestmentChange={handleInvestmentChange}
                          onLineItemsChange={setDigiVideoItems}
                          onMediaLineItemsChange={handleDigiVideoMediaLineItemsChange}
                          campaignStartDate={form.watch("mp_campaigndates_start")}
                          campaignEndDate={form.watch("mp_campaigndates_end")}
                          campaignBudget={form.watch("mp_campaignbudget")}
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
                          onInvestmentChange={handleInvestmentChange}
                          onLineItemsChange={setProgDisplayItems}
                          onMediaLineItemsChange={handleProgDisplayMediaLineItemsChange}
                          campaignStartDate={form.watch("mp_campaigndates_start")}
                          campaignEndDate={form.watch("mp_campaigndates_end")}
                          campaignBudget={form.watch("mp_campaignbudget")}
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
                          onInvestmentChange={handleInvestmentChange}
                          onLineItemsChange={setProgVideoItems}
                          onMediaLineItemsChange={handleProgVideoMediaLineItemsChange}
                          campaignStartDate={form.watch("mp_campaigndates_start")}
                          campaignEndDate={form.watch("mp_campaigndates_end")}
                          campaignBudget={form.watch("mp_campaignbudget")}
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
                          onInvestmentChange={handleInvestmentChange}
                          onLineItemsChange={setTelevisionItems}
                          onTelevisionLineItemsChange={setTelevisionLineItems}
                          onMediaLineItemsChange={handleTelevisionMediaLineItemsChange}
                          campaignStartDate={form.watch("mp_campaigndates_start")}
                          campaignEndDate={form.watch("mp_campaigndates_end")}
                          campaignBudget={form.watch("mp_campaignbudget")}
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
                         onInvestmentChange={handleInvestmentChange}
                         onLineItemsChange={setRadioItems}
                         onMediaLineItemsChange={handleRadioMediaLineItemsChange}
                         campaignStartDate={form.watch("mp_campaigndates_start")}
                         campaignEndDate={form.watch("mp_campaigndates_end")}
                         campaignBudget={form.watch("mp_campaignbudget")}
                         campaignId={""}
                         mediaTypes={["radio"]}
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
                            onInvestmentChange={handleInvestmentChange}
                            onLineItemsChange={setNewspaperItems}
                            onNewspaperLineItemsChange={setNewspaperLineItems}
                            onMediaLineItemsChange={handleNewspaperMediaLineItemsChange}
                            campaignStartDate={form.watch("mp_campaigndates_start")}
                            campaignEndDate={form.watch("mp_campaigndates_end")}
                            campaignBudget={form.watch("mp_campaignbudget")}
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
                            onInvestmentChange={handleInvestmentChange}
                            onLineItemsChange={setMagazineItems}
                            onMediaLineItemsChange={handleMagazineMediaLineItemsChange}
                            campaignStartDate={form.watch("mp_campaigndates_start")}
                            campaignEndDate={form.watch("mp_campaigndates_end")}
                            campaignBudget={form.watch("mp_campaignbudget")}
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
                            onInvestmentChange={handleInvestmentChange}
                            onLineItemsChange={setOohItems}
                            onMediaLineItemsChange={handleOohMediaLineItemsChange}
                            campaignStartDate={form.watch("mp_campaigndates_start")}
                            campaignEndDate={form.watch("mp_campaigndates_end")}
                            campaignBudget={form.watch("mp_campaignbudget")}
                            campaignId={""}
                            mediaTypes={["ooh"]}
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
                            onInvestmentChange={handleInvestmentChange}
                            onLineItemsChange={setInfluencersItems}
                            onMediaLineItemsChange={handleInfluencersMediaLineItemsChange}
                            campaignStartDate={form.watch("mp_campaigndates_start")}
                            campaignEndDate={form.watch("mp_campaigndates_end")}
                            campaignBudget={form.watch("mp_campaignbudget")}
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
          </form>
          </Form>
        </div>
      </div>

      <Dialog
        open={isUnsavedPromptOpen}
        onOpenChange={(open) => {
          if (!open) {
            stayOnPage();
          }
        }}
      >
        <DialogContent className="overflow-hidden p-0 sm:max-w-lg">
          <div className="h-1 bg-gradient-to-r from-amber-500 via-amber-400 to-amber-300" />
          <div className="p-6">
            <DialogHeader className="flex flex-row items-start justify-between space-y-0">
              <div className="space-y-2">
                <DialogTitle>Leave without saving?</DialogTitle>
                <DialogDescription>
                  You have unsaved changes. Save your campaign before leaving or continue without saving.
                </DialogDescription>
              </div>
              <DialogClose asChild>
                <button
                  type="button"
                  onClick={stayOnPage}
                  className="ml-2 rounded-md border p-1 text-sm hover:bg-muted"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </DialogClose>
            </DialogHeader>
            <p className="mt-3 text-sm text-muted-foreground">
              Leaving now will discard any unsaved edits to this media plan.
            </p>
            <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:justify-end sm:space-x-2">
              <Button variant="outline" className="w-full sm:w-auto" onClick={stayOnPage}>
                No, stay on page
              </Button>
              <Button
                variant="secondary"
                className="w-full sm:w-auto"
                onClick={async () => {
                  stayOnPage();
                  await handleSaveAll();
                }}
                disabled={isLoading || isPlanSaving || isVersionSaving}
              >
                {isLoading || isPlanSaving || isVersionSaving ? "Saving..." : "Save campaign"}
              </Button>
              <Button variant="destructive" className="w-full sm:w-auto" onClick={confirmNavigation}>
                Yes, leave without saving
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* Spacer so the fixed save bar never covers the last field */}
      <div
        aria-hidden="true"
        style={{ height: stickyBarHeight ? stickyBarHeight + 24 : 160 }}
      />

      {/* Sticky action bar: single centered pill (main column only, excludes sidebar) */}
      <div
        ref={stickyBarRef}
        className="fixed bottom-0 left-0 right-0 z-50 flex justify-center md:left-[var(--sidebar-width)]"
      >
        <div className="inline-flex max-w-full flex-col items-center gap-2 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-2">
          {hasDateWarning && (
            <div className="flex items-center gap-2 text-sm font-medium text-destructive">
              <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-destructive" />
              Media placement outside campaign dates
            </div>
          )}
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
            className="z-40 max-w-[min(98vw,88rem)]"
          >
            <Button
              type="button"
              onClick={handleSaveAll}
              disabled={isLoading || isPlanSaving || isVersionSaving}
              className="h-9 shrink-0 rounded-full bg-success px-4 text-white shadow-sm hover:bg-success-hover focus-visible:ring-2 focus-visible:ring-ring"
            >
              {isLoading || isPlanSaving || isVersionSaving ? "Saving..." : "Save"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleGenerateMBA}
              disabled={isLoading}
              className="h-9 shrink-0 rounded-full border-border px-4 focus-visible:ring-2 focus-visible:ring-ring"
            >
              {isLoading ? "Generating..." : "Generate MBA"}
            </Button>
                <div className="md:hidden">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-9 rounded-full px-4 focus-visible:ring-2 focus-visible:ring-ring"
                        disabled={
                          isDownloading ||
                          isDownloadingAa ||
                          isNamingDownloading ||
                          isLoading ||
                          isPlanSaving ||
                          isVersionSaving
                        }
                      >
                        <MoreHorizontal className="mr-1.5 h-4 w-4" />
                        Downloads
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={handleDownloadMediaPlan}
                        disabled={
                          isDownloading ||
                          isDownloadingAa ||
                          isNamingDownloading ||
                          isLoading ||
                          isPlanSaving ||
                          isVersionSaving
                        }
                      >
                        Media Plan
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={handleDownloadAdvertisingAssociatesMediaPlan}
                        disabled={
                          !hasAdvertisingAssociatesBilling ||
                          isDownloading ||
                          isDownloadingAa ||
                          isNamingDownloading ||
                          isLoading ||
                          isPlanSaving ||
                          isVersionSaving
                        }
                        className={cn(
                          "text-brand-dark focus:bg-highlight/25 focus:text-brand-dark",
                          !hasAdvertisingAssociatesBilling && "opacity-50",
                        )}
                      >
                        Media Plan (AA)
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={handleDownloadNamingConventions}
                        disabled={
                          isDownloading ||
                          isDownloadingAa ||
                          isNamingDownloading ||
                          isLoading ||
                          isPlanSaving ||
                          isVersionSaving
                        }
                      >
                        Naming Conventions
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={handleSaveAndDownloadAll}
                        disabled={
                          isLoading ||
                          isDownloading ||
                          isDownloadingAa ||
                          isPlanSaving ||
                          isVersionSaving
                        }
                      >
                        Save &amp; Download All
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <Button
                  type="button"
                  onClick={handleDownloadMediaPlan}
                  disabled={
                    isDownloading ||
                    isDownloadingAa ||
                    isNamingDownloading ||
                    isLoading ||
                    isPlanSaving ||
                    isVersionSaving
                  }
                  className="hidden h-9 rounded-full px-4 py-2 text-white md:inline-flex bg-lime hover:bg-lime/90 focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {isDownloading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  <span className="ml-2">
                    {isDownloading ? "Creating Media Plan..." : "Media Plan"}
                  </span>
                </Button>
                <Button
                  type="button"
                  onClick={handleDownloadAdvertisingAssociatesMediaPlan}
                  disabled={
                    !hasAdvertisingAssociatesBilling ||
                    isDownloading ||
                    isDownloadingAa ||
                    isNamingDownloading ||
                    isLoading ||
                    isPlanSaving ||
                    isVersionSaving
                  }
                  className={cn(
                    "hidden h-9 rounded-full px-4 py-2 md:inline-flex bg-highlight text-brand-dark hover:bg-highlight/85 focus-visible:ring-2 focus-visible:ring-ring",
                    !hasAdvertisingAssociatesBilling && "opacity-50 grayscale",
                  )}
                >
                  {isDownloadingAa ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  <span className="ml-2">
                    {isDownloadingAa ? "Creating AA Plan..." : "Media Plan (AA)"}
                  </span>
                </Button>
                <Button
                  type="button"
                  onClick={handleDownloadNamingConventions}
                  disabled={
                    isDownloading ||
                    isDownloadingAa ||
                    isNamingDownloading ||
                    isLoading ||
                    isPlanSaving ||
                    isVersionSaving
                  }
                  className="hidden h-9 rounded-full px-4 py-2 md:inline-flex bg-muted text-foreground hover:bg-muted/80 focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {isNamingDownloading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  <span className="ml-2">
                    {isNamingDownloading ? "Generating Names..." : "Naming Conventions"}
                  </span>
                </Button>
                <Button
                  type="button"
                  onClick={handleSaveAndDownloadAll}
                  disabled={
                    isLoading || isDownloading || isDownloadingAa || isPlanSaving || isVersionSaving
                  }
                  className="hidden h-9 rounded-full px-4 py-2 text-white md:inline-flex bg-brand-dark hover:bg-brand-dark/90 focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {isLoading || isDownloading || isDownloadingAa || isPlanSaving || isVersionSaving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <FileText className="h-4 w-4" />
                  )}
                  <span className="ml-2">
                    {isLoading || isDownloading || isDownloadingAa || isPlanSaving || isVersionSaving
                      ? "Processing..."
                      : "Save & Download All"}
                  </span>
                </Button>
              </CampaignExportsSection>
        </div>
      </div>

      <FloatingSectionNav sections={enabledSections} />
    </div>
  )
}
