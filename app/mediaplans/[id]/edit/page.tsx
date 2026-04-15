"use client"

import { useState, useEffect, lazy, Suspense, useCallback, useRef, useMemo } from "react"
import { useWatch } from "react-hook-form"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
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
import { SingleDatePicker } from "@/components/ui/single-date-picker"
import { cn } from "@/lib/utils"
import { formatMoney } from "@/lib/utils/money"
import { useMediaPlanContext } from "@/contexts/MediaPlanContext"
import { toDateOnlyString } from "@/lib/timezone"
import { getSearchBursts } from "@/components/media-containers/SearchContainer"
import { getSocialMediaBursts } from "@/components/media-containers/SocialMediaContainer"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { toast } from "@/components/ui/use-toast"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { CampaignExportsSection } from "@/components/dashboard/CampaignExportsSection"
import { MediaPlanEditorHero } from "@/components/mediaplans/MediaPlanEditorHero"
import { Download, FileText, Loader2, MoreHorizontal } from "lucide-react"
import type { MediaItems } from "@/lib/generateMediaPlan"
import {
  planHasAdvertisingAssociatesLineItem,
  shouldIncludeMediaPlanLineItem,
} from "@/lib/mediaplan/advertisingAssociatesExcel"
import { SavingModal } from "@/components/ui/saving-modal"
import { OutcomeModal } from "@/components/outcome-modal"
import { 
  getSearchLineItemsByMBA, 
  saveSocialMediaLineItems,
  getTelevisionLineItemsByMBA,
  getRadioLineItemsByMBA,
  getNewspaperLineItemsByMBA,
  getMagazinesLineItemsByMBA,
  getOOHLineItemsByMBA,
  getCinemaLineItemsByMBA,
  getDigitalDisplayLineItemsByMBA,
  getDigitalAudioLineItemsByMBA,
  getDigitalVideoLineItemsByMBA,
  getBVODLineItemsByMBA,
  getIntegrationLineItemsByMBA,
  getProgDisplayLineItemsByMBA,
  getProgVideoLineItemsByMBA,
  getProgBVODLineItemsByMBA,
  getProgAudioLineItemsByMBA,
  getProgOOHLineItemsByMBA,
  getInfluencersLineItemsByMBA,
  getSocialMediaLineItemsByMBA,
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
  saveProgDisplayLineItems,
  saveProgVideoLineItems,
  saveProgBVODLineItems,
  saveProgAudioLineItems,
  saveProgOOHLineItems,
  saveInfluencersLineItems
} from "@/lib/api"
import { BillingSchedule, type BillingScheduleType } from "@/components/billing/BillingSchedule"
import type { BillingSchedule as BillingScheduleInterface } from "@/types/billing"
import { buildBillingScheduleJSON } from "@/lib/billing/buildBillingSchedule"
import { appendPartialApprovalToBillingSchedule, buildPartialApprovalNote, type PartialApprovalLineItem, type PartialApprovalMetadata } from "@/lib/mediaplan/partialMba"
import { getScheduleHeaders } from "@/lib/billing/scheduleHeaders"
import type { BillingMonth, BillingLineItem } from "@/lib/billing/types"
import { checkMediaDatesOutsideCampaign } from "@/lib/utils/mediaPlanValidation"
import { KPISection } from "@/components/kpis/KPISection"
import { resolveAllKPIs } from "@/lib/kpi/resolveKPIs"
import { mergeManualKpiOverrides } from "@/lib/kpi/mergeManualKpiOverrides"
import { getPublisherKPIs, getClientKPIs, getCampaignKPIs, saveCampaignKPIs } from "@/lib/api/kpi"
import type { PublisherKPI, ClientKPI, ResolvedKPIRow, CampaignKPI } from "@/types/kpi"
import type { Publisher } from "@/lib/types/publisher"

// Define media type keys as a const array
const MEDIA_TYPE_KEYS = [
  'mp_television',
  'mp_radio',
  'mp_newspaper',
  'mp_magazines',
  'mp_ooh',
  'mp_cinema',
  'mp_digidisplay',
  'mp_digiaudio',
  'mp_digivideo',
  'mp_bvod',
  'mp_integration',
  'mp_search',
  'mp_socialmedia',
  'mp_progdisplay',
  'mp_progvideo',
  'mp_progbvod',
  'mp_progaudio',
  'mp_progooh',
  'mp_influencers'
] as const;

type MediaTypeKey = typeof MEDIA_TYPE_KEYS[number];

// Create a type for the media fields
type MediaFields = {
  [K in MediaTypeKey]: boolean;
};

// Create a type for the form field names
type FormFieldName = keyof MediaPlanFormValues;

const mediaPlanSchema = z.object({
  mp_clientname: z.string().min(1, "Client name is required"),
  mp_campaignstatus: z.enum(["Draft", "Active", "Completed"]),
  mp_campaignname: z.string().min(1, "Campaign name is required"),
  mp_campaigndates_start: z.date(),
  mp_campaigndates_end: z.date(),
  mp_brand: z.string(),
  mp_clientcontact: z.string().min(1, "Client contact is required"),
  mp_ponumber: z.string(),
  mp_campaignbudget: z.number(),
  mbaidentifier: z.string(),
  mbanumber: z.string(),
  // Media types
  ...Object.fromEntries(
    MEDIA_TYPE_KEYS.map(key => [key, z.boolean()])
  ) as { [K in MediaTypeKey]: z.ZodBoolean },
  lineItems: z.array(
    z.object({
      bursts: z.array(
        z.object({
          startDate: z.string(),
          endDate: z.string(),
          budget: z.string(),
        })
      ),
    })
  ),
})

type MediaPlanFormValues = z.infer<typeof mediaPlanSchema>

interface Client {
  id: number
  clientname_input: string
  mp_client_name?: string
  mbaidentifier: string
  feesearch: number
  feesocial: number
  feeprogdisplay: number
  feeprogvideo: number
  feeprogbvod: number
  feeprogaudio: number
  feeprogooh: number
  feecontentcreator: number
  feedigidisplay?: number
  feedigiaudio?: number
  feedigivideo?: number
  feebvod?: number
  feeintegration?: number
  adservvideo: number
  adservimp: number
  adservdisplay: number
  adservaudio: number
}

// Lazy-loaded components for each media type
const TelevisionContainer = lazy(() => import("@/components/media-containers/TelevisionContainer"))
const RadioContainer = lazy(() => import("@/components/media-containers/RadioContainer"))
const NewspaperContainer = lazy(() => import("@/components/media-containers/NewspaperContainer"))
const MagazinesContainer = lazy(() => import("@/components/media-containers/MagazinesContainer"))
const OOHContainer = lazy(() => import("@/components/media-containers/OOHContainer"))
const CinemaContainer = lazy(() => import("@/components/media-containers/CinemaContainer"))
const DigitalDisplayContainer = lazy(() => import("@/components/media-containers/DigitalDisplayContainer"))
const DigitalAudioContainer = lazy(() => import("@/components/media-containers/DigitalAudioContainer"))
const DigitalVideoContainer = lazy(() => import("@/components/media-containers/DigitalVideoContainer"))
const BVODContainer = lazy(() => import("@/components/media-containers/BVODContainer"))
const IntegrationContainer = lazy(() => import("@/components/media-containers/IntegrationContainer"))
const SearchContainer = lazy(() => import("@/components/media-containers/SearchContainer"))
const SocialMediaContainer = lazy(() => import("@/components/media-containers/SocialMediaContainer"))
const ProgDisplayContainer = lazy(() => import("@/components/media-containers/ProgDisplayContainer"))
const ProgVideoContainer = lazy(() => import("@/components/media-containers/ProgVideoContainer"))
const ProgBVODContainer = lazy(() => import("@/components/media-containers/ProgBVODContainer"))
const ProgAudioContainer = lazy(() => import("@/components/media-containers/ProgAudioContainer"))
const ProgOOHContainer = lazy(() => import("@/components/media-containers/ProgOOHContainer"))
const InfluencersContainer = lazy(() => import("@/components/media-containers/InfluencersContainer"))

// Update mediaTypes array to use the strict type
const mediaTypes: Array<{
  name: MediaTypeKey;
  label: string;
  component: React.LazyExoticComponent<any>;
}> = [
  { name: 'mp_television', label: "Television", component: TelevisionContainer },
  { name: 'mp_radio', label: "Radio", component: RadioContainer },
  { name: 'mp_newspaper', label: "Newspaper", component: NewspaperContainer },
  { name: 'mp_magazines', label: "Magazines", component: MagazinesContainer },
  { name: 'mp_ooh', label: "OOH", component: OOHContainer },
  { name: 'mp_cinema', label: "Cinema", component: CinemaContainer },
  { name: 'mp_digidisplay', label: "Digital Display", component: DigitalDisplayContainer },
  { name: 'mp_digiaudio', label: "Digital Audio", component: DigitalAudioContainer },
  { name: 'mp_digivideo', label: "Digital Video", component: DigitalVideoContainer },
  { name: 'mp_bvod', label: "BVOD", component: BVODContainer },
  { name: 'mp_integration', label: "Integration", component: IntegrationContainer },
  { name: 'mp_search', label: "Search", component: SearchContainer },
  { name: 'mp_socialmedia', label: "Social Media", component: SocialMediaContainer },
  { name: 'mp_progdisplay', label: "Programmatic Display", component: ProgDisplayContainer },
  { name: 'mp_progvideo', label: "Programmatic Video", component: ProgVideoContainer },
  { name: 'mp_progbvod', label: "Programmatic BVOD", component: ProgBVODContainer },
  { name: 'mp_progaudio', label: "Programmatic Audio", component: ProgAudioContainer },
  { name: 'mp_progooh', label: "Programmatic OOH", component: ProgOOHContainer },
  { name: 'mp_influencers', label: "Influencers", component: InfluencersContainer },
];

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

export default function EditMediaPlan({ params }: { params: Promise<{ id: string }> }) {
  // Extract the id from params
  const [id, setId] = useState<string>('')
  
  useEffect(() => {
    params.then(({ id: paramId }) => {
      setId(paramId)
    })
  }, [params])
  
  const router = useRouter()
  const { setMbaNumber } = useMediaPlanContext()
  
  const [clients, setClients] = useState<Client[]>([])
  const [reportId, setReportId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [selectedClientId, setSelectedClientId] = useState<string>("")
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [feesearch, setFeeSearch] = useState<number | null>(null)
  const [feesocial, setFeeSocial] = useState<number | null>(null)
  const [feeprogdisplay, setFeeProgDisplay] = useState<number | null>(null)
  const [feeprogvideo, setFeeProgVideo] = useState<number | null>(null)
  const [feeprogbvod, setFeeProgBvod] = useState<number | null>(null)
  const [feeprogaudio, setFeeProgAudio] = useState<number | null>(null)
  const [feeprogooh, setFeeProgOoh] = useState<number | null>(null)
  const [feecontentcreator, setFeeContentCreator] = useState<number | null>(null)
  const [adservvideo, setAdServVideo] = useState<number | null>(null)
  const [adservimp, setAdServImp] = useState<number | null>(null)
  const [adservdisplay, setAdServDisplay] = useState<number | null>(null)
  const [adservaudio, setAdServAudio] = useState<number | null>(null)
  const [searchTotal, setSearchTotal] = useState(0)
  const [socialmediaTotal, setSocialMediaTotal] = useState<number>(0)
  const [billingTotal, setBillingTotal] = useState("$0.00")
  const [billingMonths, setBillingMonths] = useState<{ monthYear: string; amount: string }[]>([])
  const [burstsData, setBurstsData] = useState<any[]>([])
  const [investmentPerMonth, setInvestmentPerMonth] = useState<any[]>([])
  const [searchBursts, setSearchBursts] = useState<any[]>([])
  const [socialMediaBursts, setSocialMediaBursts] = useState<any[]>([])
  const [isManualBilling, setIsManualBilling] = useState(false)
  const [isManualBillingModalOpen, setIsManualBillingModalOpen] = useState(false)
  const [manualBillingMonths, setManualBillingMonths] = useState<{ monthYear: string; amount: string }[]>([])
  const [manualBillingTotal, setManualBillingTotal] = useState("$0.00")
  const [isSaving, setIsSaving] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [modalTitle, setModalTitle] = useState("")
  const [modalOutcome, setModalOutcome] = useState("")
  const [modalLoading, setModalLoading] = useState(false)
  const [searchFeeTotal, setSearchFeeTotal] = useState(0)
  const [socialMediaFeeTotal, setSocialMediaFeeTotal] = useState(0)
  const [televisionTotal, setTelevisionTotal] = useState(0)
  const [televisionFeeTotal, setTelevisionFeeTotal] = useState(0)
  const [radioTotal, setRadioTotal] = useState(0)
  const [radioFeeTotal, setRadioFeeTotal] = useState(0)
  const [newspaperTotal, setNewspaperTotal] = useState(0)
  const [newspaperFeeTotal, setNewspaperFeeTotal] = useState(0)
  const [magazinesTotal, setMagazinesTotal] = useState(0)
  const [magazinesFeeTotal, setMagazinesFeeTotal] = useState(0)
  const [oohTotal, setOohTotal] = useState(0)
  const [oohFeeTotal, setOohFeeTotal] = useState(0)
  const [cinemaTotal, setCinemaTotal] = useState(0)
  const [cinemaFeeTotal, setCinemaFeeTotal] = useState(0)
  const [digitalDisplayTotal, setDigitalDisplayTotal] = useState(0)
  const [digitalDisplayFeeTotal, setDigitalDisplayFeeTotal] = useState(0)
  const [digitalAudioTotal, setDigitalAudioTotal] = useState(0)
  const [digitalAudioFeeTotal, setDigitalAudioFeeTotal] = useState(0)
  const [digitalVideoTotal, setDigitalVideoTotal] = useState(0)
  const [digitalVideoFeeTotal, setDigitalVideoFeeTotal] = useState(0)
  const [bvodTotal, setBvodTotal] = useState(0)
  const [bvodFeeTotal, setBvodFeeTotal] = useState(0)
  const [integrationTotal, setIntegrationTotal] = useState(0)
  const [integrationFeeTotal, setIntegrationFeeTotal] = useState(0)
  const [progDisplayTotal, setProgDisplayTotal] = useState(0)
  const [progDisplayFeeTotal, setProgDisplayFeeTotal] = useState(0)
  const [progVideoTotal, setProgVideoTotal] = useState(0)
  const [progVideoFeeTotal, setProgVideoFeeTotal] = useState(0)
  const [progBvodTotal, setProgBvodTotal] = useState(0)
  const [progBvodFeeTotal, setProgBvodFeeTotal] = useState(0)
  const [progAudioTotal, setProgAudioTotal] = useState(0)
  const [progAudioFeeTotal, setProgAudioFeeTotal] = useState(0)
  const [progOohTotal, setProgOohTotal] = useState(0)
  const [progOohFeeTotal, setProgOohFeeTotal] = useState(0)
  const [influencersTotal, setInfluencersTotal] = useState(0)
  const [influencersFeeTotal, setInfluencersFeeTotal] = useState(0)
  const [totalInvestment, setTotalInvestment] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [mediaPlan, setMediaPlan] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [searchLineItems, setSearchLineItems] = useState<any[]>([])
  const [socialMediaLineItems, setSocialMediaLineItems] = useState<any[]>([])
  
  // State for all media type line items
  const [televisionLineItems, setTelevisionLineItems] = useState<any[]>([])
  const [radioLineItems, setRadioLineItems] = useState<any[]>([])
  const [newspaperLineItems, setNewspaperLineItems] = useState<any[]>([])
  const [magazinesLineItems, setMagazinesLineItems] = useState<any[]>([])
  const [oohLineItems, setOohLineItems] = useState<any[]>([])
  const [cinemaLineItems, setCinemaLineItems] = useState<any[]>([])
  const [digitalDisplayLineItems, setDigitalDisplayLineItems] = useState<any[]>([])
  const [digitalAudioLineItems, setDigitalAudioLineItems] = useState<any[]>([])
  const [digitalVideoLineItems, setDigitalVideoLineItems] = useState<any[]>([])
  const [bvodLineItems, setBvodLineItems] = useState<any[]>([])
  const [integrationLineItems, setIntegrationLineItems] = useState<any[]>([])
  const [progDisplayLineItems, setProgDisplayLineItems] = useState<any[]>([])
  const [progVideoLineItems, setProgVideoLineItems] = useState<any[]>([])
  const [progBvodLineItems, setProgBvodLineItems] = useState<any[]>([])
  const [progAudioLineItems, setProgAudioLineItems] = useState<any[]>([])
  const [progOohLineItems, setProgOohLineItems] = useState<any[]>([])
  const [influencersLineItems, setInfluencersLineItems] = useState<any[]>([])
  
  // State for transformed line items (for onMediaLineItemsChange callbacks)
  const [televisionMediaLineItems, setTelevisionMediaLineItems] = useState<any[]>([])
  const [radioMediaLineItems, setRadioMediaLineItems] = useState<any[]>([])
  const [newspaperMediaLineItems, setNewspaperMediaLineItems] = useState<any[]>([])
  const [magazinesMediaLineItems, setMagazinesMediaLineItems] = useState<any[]>([])
  const [oohMediaLineItems, setOohMediaLineItems] = useState<any[]>([])
  const [cinemaMediaLineItems, setCinemaMediaLineItems] = useState<any[]>([])
  const [digitalDisplayMediaLineItems, setDigitalDisplayMediaLineItems] = useState<any[]>([])
  const [digitalDisplayItems, setDigitalDisplayItems] = useState<any[]>([])
  const [digitalAudioMediaLineItems, setDigitalAudioMediaLineItems] = useState<any[]>([])
  const [digitalVideoMediaLineItems, setDigitalVideoMediaLineItems] = useState<any[]>([])
  const [bvodMediaLineItems, setBvodMediaLineItems] = useState<any[]>([])
  const [integrationMediaLineItems, setIntegrationMediaLineItems] = useState<any[]>([])
  const [searchMediaLineItems, setSearchMediaLineItems] = useState<any[]>([])
  const [socialMediaMediaLineItems, setSocialMediaMediaLineItems] = useState<any[]>([])
  const [progDisplayMediaLineItems, setProgDisplayMediaLineItems] = useState<any[]>([])
  const [progVideoMediaLineItems, setProgVideoMediaLineItems] = useState<any[]>([])
  const [progBvodMediaLineItems, setProgBvodMediaLineItems] = useState<any[]>([])
  const [progAudioMediaLineItems, setProgAudioMediaLineItems] = useState<any[]>([])
  const [progOohMediaLineItems, setProgOohMediaLineItems] = useState<any[]>([])
  const [influencersMediaLineItems, setInfluencersMediaLineItems] = useState<any[]>([])
  
  const [billingSchedule, setBillingSchedule] = useState<BillingScheduleType>([])
  const [billingScheduleData, setBillingScheduleData] = useState<BillingScheduleInterface>({
    months: [],
    overrides: [],
    isManual: false,
    campaignId: ""
  })
  const deliveryScheduleSnapshotRef = useRef<BillingMonth[] | null>(null)
  const [isClientModalOpen, setIsClientModalOpen] = useState(false)
  const hasFetchedContainerDataRef = useRef(false)
  const [hasDateWarning, setHasDateWarning] = useState(false)
  const [isPartialMBA, setIsPartialMBA] = useState(false)
  const [isPartialMBAModalOpen, setIsPartialMBAModalOpen] = useState(false)
  const [partialMBAValues, setPartialMBAValues] = useState({
    mediaTotals: {} as Record<string, number>,
    grossMedia: 0,
    assembledFee: 0,
    adServing: 0,
    production: 0,
  })
  const [partialMBAMonthYears, setPartialMBAMonthYears] = useState<string[]>([])
  const [partialMBALineItemsByMedia, setPartialMBALineItemsByMedia] = useState<Record<string, PartialApprovalLineItem[]>>({})
  const [partialMBASelectedLineItemIds, setPartialMBASelectedLineItemIds] = useState<Record<string, string[]>>({})
  const [partialApprovalMetadata, setPartialApprovalMetadata] = useState<PartialApprovalMetadata | null>(null)

  const grossMediaTotal = useMemo(
    () =>
      (searchTotal ?? 0) +
      (socialmediaTotal ?? 0) +
      (televisionTotal ?? 0) +
      (radioTotal ?? 0) +
      (newspaperTotal ?? 0) +
      (magazinesTotal ?? 0) +
      (oohTotal ?? 0) +
      (cinemaTotal ?? 0) +
      (digitalDisplayTotal ?? 0) +
      (digitalAudioTotal ?? 0) +
      (digitalVideoTotal ?? 0) +
      (bvodTotal ?? 0) +
      (integrationTotal ?? 0) +
      (progDisplayTotal ?? 0) +
      (progVideoTotal ?? 0) +
      (progBvodTotal ?? 0) +
      (progAudioTotal ?? 0) +
      (progOohTotal ?? 0) +
      (influencersTotal ?? 0),
    [
      searchTotal,
      socialmediaTotal,
      televisionTotal,
      radioTotal,
      newspaperTotal,
      magazinesTotal,
      oohTotal,
      cinemaTotal,
      digitalDisplayTotal,
      digitalAudioTotal,
      digitalVideoTotal,
      bvodTotal,
      integrationTotal,
      progDisplayTotal,
      progVideoTotal,
      progBvodTotal,
      progAudioTotal,
      progOohTotal,
      influencersTotal,
    ],
  )

  const calculateMediaTotal = useCallback((mediaName: string) => {
    switch (mediaName) {
      case "mp_search":
        return searchTotal ?? 0
      case "mp_cinema":
        return cinemaTotal ?? 0
      case "mp_digiaudio":
        return digitalAudioTotal ?? 0
      case "mp_digidisplay":
        return digitalDisplayTotal ?? 0
      case "mp_digivideo":
        return digitalVideoTotal ?? 0
      case "mp_socialmedia":
        return socialmediaTotal ?? 0
      case "mp_progaudio":
        return progAudioTotal ?? 0
      case "mp_progdisplay":
        return progDisplayTotal ?? 0
      case "mp_progvideo":
        return progVideoTotal ?? 0
      case "mp_progbvod":
        return progBvodTotal ?? 0
      case "mp_progooh":
        return progOohTotal ?? 0
      case "mp_production":
        return 0
      case "mp_influencers":
        return influencersTotal ?? 0
      case "mp_television":
        return televisionTotal ?? 0
      case "mp_radio":
        return radioTotal ?? 0
      case "mp_newspaper":
        return newspaperTotal ?? 0
      case "mp_magazines":
        return magazinesTotal ?? 0
      case "mp_ooh":
        return oohTotal ?? 0
      case "mp_integration":
        return integrationTotal ?? 0
      case "mp_bvod":
        return bvodTotal ?? 0
      default:
        return 0
    }
  }, [
    searchTotal,
    cinemaTotal,
    digitalAudioTotal,
    digitalDisplayTotal,
    digitalVideoTotal,
    socialmediaTotal,
    progAudioTotal,
    progDisplayTotal,
    progVideoTotal,
    progBvodTotal,
    progOohTotal,
    influencersTotal,
    televisionTotal,
    radioTotal,
    newspaperTotal,
    magazinesTotal,
    oohTotal,
    integrationTotal,
    bvodTotal,
  ])

  const [kpiRows, setKpiRows] = useState<ResolvedKPIRow[]>([])
  const [publisherKPIs, setPublisherKPIs] = useState<PublisherKPI[]>([])
  const [clientKPIs, setClientKPIs] = useState<ClientKPI[]>([])
  const [savedCampaignKPIs, setSavedCampaignKPIs] = useState<CampaignKPI[]>([])
  const [kpiPublishers, setKpiPublishers] = useState<Publisher[]>([])
  const [isKPILoading, setIsKPILoading] = useState(false)
  const kpiRebuildTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const kpiRowsRef = useRef<ResolvedKPIRow[]>([])

  const form = useForm<MediaPlanFormValues>({
    resolver: zodResolver(mediaPlanSchema),
    defaultValues: {
      mp_clientname: "",
      mp_campaignstatus: "Draft",
      mp_campaignname: "",
      mp_campaigndates_start: new Date(),
      mp_campaigndates_end: new Date(),
      mp_brand: "",
      mp_clientcontact: "",
      mp_ponumber: "",
      mp_campaignbudget: 0,
      mbaidentifier: "",
      mbanumber: "",
      ...Object.fromEntries(
        MEDIA_TYPE_KEYS.map(key => [key, false])
      ) as MediaFields,
      lineItems: [],
    },
  })

  // Use useWatch to prevent infinite re-renders from form.watch calls
  const mpSearch = useWatch({ control: form.control, name: 'mp_search' })
  const mpSocialMedia = useWatch({ control: form.control, name: 'mp_socialmedia' })
  const mpTelevision = useWatch({ control: form.control, name: 'mp_television' })
  const mpRadio = useWatch({ control: form.control, name: 'mp_radio' })
  const mpNewspaper = useWatch({ control: form.control, name: 'mp_newspaper' })
  const mpMagazines = useWatch({ control: form.control, name: 'mp_magazines' })
  const mpOoh = useWatch({ control: form.control, name: 'mp_ooh' })
  const mpCinema = useWatch({ control: form.control, name: 'mp_cinema' })
  const mpDigidisplay = useWatch({ control: form.control, name: 'mp_digidisplay' })
  const mpDigiaudio = useWatch({ control: form.control, name: 'mp_digiaudio' })
  const mpDigivideo = useWatch({ control: form.control, name: 'mp_digivideo' })
  const mpBvod = useWatch({ control: form.control, name: 'mp_bvod' })
  const mpIntegration = useWatch({ control: form.control, name: 'mp_integration' })
  const mpProgdisplay = useWatch({ control: form.control, name: 'mp_progdisplay' })
  const mpProgvideo = useWatch({ control: form.control, name: 'mp_progvideo' })
  const mpProgbvod = useWatch({ control: form.control, name: 'mp_progbvod' })
  const mpProgaudio = useWatch({ control: form.control, name: 'mp_progaudio' })
  const mpProgooh = useWatch({ control: form.control, name: 'mp_progooh' })
  const mpInfluencers = useWatch({ control: form.control, name: 'mp_influencers' })
  const campaignStartDate = useWatch({ control: form.control, name: 'mp_campaigndates_start' })
  const campaignEndDate = useWatch({ control: form.control, name: 'mp_campaigndates_end' })
  const campaignBudget = useWatch({ control: form.control, name: 'mp_campaignbudget' })
  const mbanumberWatched = useWatch({ control: form.control, name: "mbanumber" })

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

  const showAaMediaPlanDownload = useMemo(() => {
    const mediaItems: MediaItems = {
      search: searchMediaLineItems.filter(shouldIncludeMediaPlanLineItem),
      socialMedia: socialMediaMediaLineItems.filter(shouldIncludeMediaPlanLineItem),
      digiAudio: digitalAudioMediaLineItems.filter(shouldIncludeMediaPlanLineItem),
      digiDisplay: digitalDisplayMediaLineItems.filter(shouldIncludeMediaPlanLineItem),
      digiVideo: digitalVideoMediaLineItems.filter(shouldIncludeMediaPlanLineItem),
      bvod: bvodMediaLineItems.filter(shouldIncludeMediaPlanLineItem),
      progDisplay: progDisplayMediaLineItems.filter(shouldIncludeMediaPlanLineItem),
      progVideo: progVideoMediaLineItems.filter(shouldIncludeMediaPlanLineItem),
      progBvod: progBvodMediaLineItems.filter(shouldIncludeMediaPlanLineItem),
      progOoh: progOohMediaLineItems.filter(shouldIncludeMediaPlanLineItem),
      progAudio: progAudioMediaLineItems.filter(shouldIncludeMediaPlanLineItem),
      newspaper: newspaperMediaLineItems.filter(shouldIncludeMediaPlanLineItem),
      magazines: magazinesMediaLineItems.filter(shouldIncludeMediaPlanLineItem),
      television: televisionMediaLineItems.filter(shouldIncludeMediaPlanLineItem),
      radio: radioMediaLineItems.filter(shouldIncludeMediaPlanLineItem),
      ooh: oohMediaLineItems.filter(shouldIncludeMediaPlanLineItem),
      cinema: cinemaMediaLineItems.filter(shouldIncludeMediaPlanLineItem),
      integration: integrationMediaLineItems.filter(shouldIncludeMediaPlanLineItem),
      production: [],
    }
    return planHasAdvertisingAssociatesLineItem(mediaItems, kpiPublishers, () => true)
  }, [
    searchMediaLineItems,
    socialMediaMediaLineItems,
    digitalAudioMediaLineItems,
    digitalDisplayMediaLineItems,
    digitalVideoMediaLineItems,
    bvodMediaLineItems,
    progDisplayMediaLineItems,
    progVideoMediaLineItems,
    progBvodMediaLineItems,
    progOohMediaLineItems,
    progAudioMediaLineItems,
    newspaperMediaLineItems,
    magazinesMediaLineItems,
    televisionMediaLineItems,
    radioMediaLineItems,
    oohMediaLineItems,
    cinemaMediaLineItems,
    integrationMediaLineItems,
    kpiPublishers,
  ])

  useEffect(() => {
    if (kpiRebuildTimerRef.current) clearTimeout(kpiRebuildTimerRef.current)
    kpiRebuildTimerRef.current = setTimeout(() => {
      const fv = form.getValues()
      if (!fv.mp_clientname || !mediaPlan) return
      const resolved = resolveAllKPIs({
        mediaItemsByType: {
          search: searchMediaLineItems,
          socialMedia: socialMediaMediaLineItems,
          progDisplay: progDisplayMediaLineItems,
          progVideo: progVideoMediaLineItems,
          progBvod: progBvodMediaLineItems,
          progAudio: progAudioMediaLineItems,
          progOoh: progOohMediaLineItems,
          digiDisplay: digitalDisplayMediaLineItems,
          digiAudio: digitalAudioMediaLineItems,
          digiVideo: digitalVideoMediaLineItems,
          bvod: bvodMediaLineItems,
          integration: integrationMediaLineItems,
          television: televisionMediaLineItems,
          radio: radioMediaLineItems,
          newspaper: newspaperMediaLineItems,
          magazines: magazinesMediaLineItems,
          ooh: oohMediaLineItems,
          cinema: cinemaMediaLineItems,
          influencers: influencersMediaLineItems,
        },
        clientName: fv.mp_clientname,
        mbaNumber: fv.mbanumber ?? "",
        versionNumber: mediaPlan.version_number ?? 1,
        campaignName: fv.mp_campaignname ?? "",
        publisherKPIs,
        clientKPIs,
        savedCampaignKPIs,
        publishers: kpiPublishers,
      })
      setKpiRows(mergeManualKpiOverrides(resolved, kpiRowsRef.current))
    }, 600)
    return () => {
      if (kpiRebuildTimerRef.current) clearTimeout(kpiRebuildTimerRef.current)
    }
  }, [
    searchMediaLineItems,
    socialMediaMediaLineItems,
    progDisplayMediaLineItems,
    progVideoMediaLineItems,
    progBvodMediaLineItems,
    progAudioMediaLineItems,
    progOohMediaLineItems,
    digitalDisplayMediaLineItems,
    digitalAudioMediaLineItems,
    digitalVideoMediaLineItems,
    bvodMediaLineItems,
    integrationMediaLineItems,
    televisionMediaLineItems,
    radioMediaLineItems,
    newspaperMediaLineItems,
    magazinesMediaLineItems,
    oohMediaLineItems,
    cinemaMediaLineItems,
    influencersMediaLineItems,
    publisherKPIs,
    clientKPIs,
    savedCampaignKPIs,
    kpiPublishers,
    mediaPlan?.version_number,
  ])

  const stickyBarRef = useRef<HTMLDivElement | null>(null)
  const [stickyBarHeight, setStickyBarHeight] = useState(0)

  useEffect(() => {
    const el = stickyBarRef.current
    if (!el) return
    const update = () => setStickyBarHeight(el.getBoundingClientRect().height || 0)
    update()
    if (typeof ResizeObserver === "undefined") return
    const ro = new ResizeObserver(update)
    ro.observe(el)
    window.addEventListener("resize", update)
    return () => {
      ro.disconnect()
      window.removeEventListener("resize", update)
    }
  }, [])

  const deepCloneBillingMonths = (months: BillingMonth[]): BillingMonth[] => {
    if (typeof globalThis.structuredClone === "function") {
      return globalThis.structuredClone(months) as BillingMonth[]
    }
    return JSON.parse(JSON.stringify(months)) as BillingMonth[]
  }

  // Reset snapshot only when campaign date range changes OR we switch to a new campaign (id).
  const deliverySnapshotKeyRef = useRef<string | null>(null)
  useEffect(() => {
    const startKey = campaignStartDate ? toDateOnlyString(campaignStartDate) : ""
    const endKey = campaignEndDate ? toDateOnlyString(campaignEndDate) : ""
    const key = `${startKey}|${endKey}|${id ?? ""}`
    if (deliverySnapshotKeyRef.current && deliverySnapshotKeyRef.current !== key) {
      deliveryScheduleSnapshotRef.current = null
    }
    deliverySnapshotKeyRef.current = key
  }, [campaignStartDate, campaignEndDate, id])
  
  // Watch individual media types to prevent infinite re-renders
  // const watchedMediaTypes = useWatch({ control: form.control, name: MEDIA_TYPE_KEYS })

  // Check if any media placement dates are outside campaign dates
  useEffect(() => {
    const hasWarning = checkMediaDatesOutsideCampaign(
      campaignStartDate,
      campaignEndDate,
      {
        televisionMediaLineItems,
        radioMediaLineItems,
        newspaperMediaLineItems,
        magazineMediaLineItems: magazinesMediaLineItems,
        oohMediaLineItems,
        cinemaMediaLineItems,
        digiDisplayMediaLineItems: digitalDisplayMediaLineItems,
        digiAudioMediaLineItems: digitalAudioMediaLineItems,
        digiVideoMediaLineItems: digitalVideoMediaLineItems,
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
    campaignStartDate,
    campaignEndDate,
    televisionMediaLineItems,
    radioMediaLineItems,
    newspaperMediaLineItems,
    magazinesMediaLineItems,
    oohMediaLineItems,
    cinemaMediaLineItems,
    digitalDisplayMediaLineItems,
    digitalAudioMediaLineItems,
    digitalVideoMediaLineItems,
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

  // Add calculateBillingSchedule function with useCallback to prevent infinite loops
  const calculateBillingSchedule = useCallback(() => {
    const startDate = form.getValues("mp_campaigndates_start");
    const endDate = form.getValues("mp_campaigndates_end");
    const budget = form.getValues("mp_campaignbudget");

    if (!startDate || !endDate || !budget) return;

    let billingMonthsMap: Record<string, number> = {};

    // Initialize all months in the campaign period (first-of-month walk avoids setMonth rollover)
    const campaignStartMidnight = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
    const campaignEndMidnight = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
    let current = new Date(campaignStartMidnight);
    while (current <= campaignEndMidnight) {
      const monthYear = `${current.toLocaleString("default", { month: "long" })} ${current.getFullYear()}`;
      billingMonthsMap[monthYear] = 0;
      current = new Date(current.getFullYear(), current.getMonth() + 1, 1);
    }

    // Process all bursts (search and social media)
    const allBursts = [...searchBursts, ...socialMediaBursts];
    
    if (allBursts.length > 0) {
      allBursts.forEach(burst => {
        const burstStart = new Date(burst.startDate);
        const burstEnd = new Date(burst.endDate);
        
        // Calculate total days in burst
        const totalDays = Math.ceil((burstEnd.getTime() - burstStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        
        // Calculate daily budget (media + fee)
        const dailyBudget = burst.budget / totalDays;

        const burstStartMidnight = new Date(burstStart.getFullYear(), burstStart.getMonth(), 1);
        const burstEndMidnight = new Date(burstEnd.getFullYear(), burstEnd.getMonth(), 1);
        let current = new Date(burstStartMidnight);
        while (current <= burstEndMidnight) {
          const monthYear = `${current.toLocaleString("default", { month: "long" })} ${current.getFullYear()}`;

          // Calculate the first and last day of the current month
          const firstDayOfMonth = new Date(current.getFullYear(), current.getMonth(), 1);
          const lastDayOfMonth = new Date(current.getFullYear(), current.getMonth() + 1, 0);

          // Calculate the actual start and end dates for this month's portion of the burst
          const monthStart = new Date(Math.max(burstStart.getTime(), firstDayOfMonth.getTime()));
          const monthEnd = new Date(Math.min(burstEnd.getTime(), lastDayOfMonth.getTime()));

          // Calculate the number of days in this month that overlap with the burst
          const daysInThisMonth = Math.ceil((monthEnd.getTime() - monthStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;

          // Calculate monthly allocation
          const monthlyAllocation = dailyBudget * daysInThisMonth;
          billingMonthsMap[monthYear] = (billingMonthsMap[monthYear] || 0) + monthlyAllocation;

          // Move to the next month
          current = new Date(current.getFullYear(), current.getMonth() + 1, 1);
        }
      });
    } else {
      // If no bursts, distribute budget evenly across months
      const monthCount = Object.keys(billingMonthsMap).length;
      if (monthCount > 0) {
        const amountPerMonth = budget / monthCount;
        Object.keys(billingMonthsMap).forEach(monthYear => {
          billingMonthsMap[monthYear] = amountPerMonth;
        });
      }
    }

    // Convert to array format
    const updatedBillingMonths = Object.entries(billingMonthsMap).map(([monthYear, amount]) => ({
      monthYear,
      amount: formatMoney(amount, {
        locale: "en-AU",
        currency: "AUD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
    }));

    setBillingMonths(updatedBillingMonths);

    // Calculate total billing
    const totalAmount = Object.values(billingMonthsMap).reduce((sum, value) => sum + value, 0);
    setBillingTotal(
      formatMoney(totalAmount, {
        locale: "en-AU",
        currency: "AUD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    );
  }, [form, searchBursts, socialMediaBursts]);

  // Fetch the media plan data
  useEffect(() => {
    const fetchMediaPlan = async () => {
      try {
        console.log(`Fetching media plan with ID: ${id}`)
        const response = await fetch(`/api/mediaplans/${id}`)
        
        if (!response.ok) {
          let errorData: { error?: string; message?: string } = {}
          try {
            errorData = await response.json()
          } catch (parseError) {
            console.error("Failed to parse error response:", parseError)
            errorData = { error: `HTTP ${response.status}: ${response.statusText}` }
          }
          
          console.error("Error response:", {
            status: response.status,
            statusText: response.statusText,
            error: errorData
          })
          
          setModalTitle("Error")
          setModalOutcome(errorData.error || errorData.message || "Failed to fetch media plan")
          setModalOpen(true)
          setModalLoading(false)
          
          setError(errorData.error || errorData.message || "Failed to fetch media plan")
          setLoading(false)
          return
        }

        const data = await response.json()
        console.log("Media plan data:", data)
        
        // Set the media plan data
        setMediaPlan(data)
        
        // Update form with the fetched data - map API field names to form field names
        form.reset({
          mp_clientname: data.client_name || "",
          mp_campaignstatus: data.campaign_status || "Draft",
          mp_campaignname: data.campaign_name || "",
          mp_campaigndates_start: new Date(data.campaign_start_date || new Date()),
          mp_campaigndates_end: new Date(data.campaign_end_date || new Date()),
          mp_brand: data.brand || "",
          mp_clientcontact: data.client_contact || "",
          mp_ponumber: data.po_number || "",
          mp_campaignbudget: data.mp_campaignbudget || 0,
          mbaidentifier: "",
          mbanumber: data.mba_number || "",
          mp_television: data.mp_television || false,
          mp_radio: data.mp_radio || false,
          mp_newspaper: data.mp_newspaper || false,
          mp_magazines: data.mp_magazines || false,
          mp_ooh: data.mp_ooh || false,
          mp_cinema: data.mp_cinema || false,
          mp_digidisplay: data.mp_digidisplay || false,
          mp_digiaudio: data.mp_digiaudio || false,
          mp_digivideo: data.mp_digivideo || false,
          mp_bvod: data.mp_bvod || false,
          mp_integration: data.mp_integration || false,
          mp_search: data.mp_search || false,
          mp_socialmedia: data.mp_socialmedia || false,
          mp_progdisplay: data.mp_progdisplay || false,
          mp_progvideo: data.mp_progvideo || false,
          mp_progbvod: data.mp_progbvod || false,
          mp_progaudio: data.mp_progaudio || false,
          mp_progooh: data.mp_progooh || false,
          mp_influencers: data.mp_influencers || false,
          lineItems: [],
        })
        
        // Set the MBA number in the context
        if (data.mba_number) {
          setMbaNumber(data.mba_number)
        }
        
        // Store client name for later client selection
        if (data.client_name) {
          setSelectedClientId(data.client_name) // Temporarily store client name
        }
        
        // Capture initial delivery/billing schedule snapshot before user edits
        try {
          let parsedSchedule = data.deliverySchedule ?? data.billingSchedule ?? null
          if (typeof parsedSchedule === "string" && parsedSchedule.trim() !== "") {
            parsedSchedule = JSON.parse(parsedSchedule)
          }
          if (Array.isArray(parsedSchedule) && parsedSchedule.length > 0) {
            if (!deliveryScheduleSnapshotRef.current) {
              deliveryScheduleSnapshotRef.current = parsedSchedule
            }
            // Seed editable billing schedule from persisted data if available
            setBillingSchedule(parsedSchedule as BillingScheduleType)
          }
        } catch (parseError) {
          console.warn("Failed to parse delivery/billing schedule for snapshot:", parseError)
        }
        
        // Billing schedule calculation removed to prevent infinite loops
        
        setLoading(false)
      } catch (error) {
        console.error("Error fetching media plan:", error)
        setModalTitle("Error")
        setModalOutcome("Failed to fetch media plan")
        setModalOpen(true)
        setModalLoading(false)
        setError("Failed to fetch media plan")
        setLoading(false)
      }
    }

    fetchMediaPlan()
  }, [form, id, setMbaNumber])

  // Remove problematic useEffect hooks that cause infinite loops
  // Billing schedule will be calculated manually when needed

  // Fetch clients
  useEffect(() => {
    const fetchClients = async () => {
      try {
        const response = await fetch("/api/clients")
        if (!response.ok) {
          throw new Error("Failed to fetch clients")
        }
        const data = await response.json()
        setClients(data)
      } catch (error) {
        console.error("Error fetching clients:", error)
      }
    }

    fetchClients()
  }, [])

  useEffect(() => {
    getPublisherKPIs().then(setPublisherKPIs).catch(console.error)
  }, [])

  // Handle client selection after clients are loaded
  useEffect(() => {
    if (clients.length > 0 && selectedClientId && mediaPlan) {
      const client = clients.find(c => c.clientname_input === selectedClientId)
      if (client && (!selectedClient || selectedClient.id !== client.id)) {
        setSelectedClient(client)
        setFeeSearch(client.feesearch)
        setFeeSocial(client.feesocial)
        setFeeProgDisplay(client.feeprogdisplay)
        setFeeProgVideo(client.feeprogvideo)
        setFeeProgBvod(client.feeprogbvod)
        setFeeProgAudio(client.feeprogaudio)
        setFeeProgOoh(client.feeprogooh)
        setFeeContentCreator(client.feecontentcreator)
        setAdServVideo(client.adservvideo)
        setAdServImp(client.adservimp)
        setAdServDisplay(client.adservdisplay)
        setAdServAudio(client.adservaudio)
        const clientKpiKey =
          (client.mp_client_name && client.mp_client_name.trim()) || client.clientname_input
        if (clientKpiKey) {
          getClientKPIs(clientKpiKey)
            .then(setClientKPIs)
            .catch(console.error)
        }

        // Update the MBA identifier in the form
        form.setValue("mbaidentifier", client.mbaidentifier || "")
      }
    }
  }, [clients, form, selectedClientId, mediaPlan, selectedClient])

  // Fetch container data for all enabled media types when the media plan is loaded
  useEffect(() => {
    const fetchContainerData = async () => {
      if (mediaPlan && mediaPlan.mba_number && !hasFetchedContainerDataRef.current) {
        try {
          console.log("Fetching container data for MBA:", mediaPlan.mba_number, "Version:", mediaPlan.version_number);
          hasFetchedContainerDataRef.current = true;
          
          // Create a mapping of media types to their fetch functions and state setters
          const mediaTypeMap = [
            { flag: 'mp_television', fetchFn: getTelevisionLineItemsByMBA, setter: setTelevisionLineItems },
            { flag: 'mp_radio', fetchFn: getRadioLineItemsByMBA, setter: setRadioLineItems },
            { flag: 'mp_newspaper', fetchFn: getNewspaperLineItemsByMBA, setter: setNewspaperLineItems },
            { flag: 'mp_magazines', fetchFn: getMagazinesLineItemsByMBA, setter: setMagazinesLineItems },
            { flag: 'mp_ooh', fetchFn: getOOHLineItemsByMBA, setter: setOohLineItems },
            { flag: 'mp_cinema', fetchFn: getCinemaLineItemsByMBA, setter: setCinemaLineItems },
            { flag: 'mp_digidisplay', fetchFn: getDigitalDisplayLineItemsByMBA, setter: setDigitalDisplayLineItems },
            { flag: 'mp_digiaudio', fetchFn: getDigitalAudioLineItemsByMBA, setter: setDigitalAudioLineItems },
            { flag: 'mp_digivideo', fetchFn: getDigitalVideoLineItemsByMBA, setter: setDigitalVideoLineItems },
            { flag: 'mp_bvod', fetchFn: getBVODLineItemsByMBA, setter: setBvodLineItems },
            { flag: 'mp_integration', fetchFn: getIntegrationLineItemsByMBA, setter: setIntegrationLineItems },
            { flag: 'mp_search', fetchFn: getSearchLineItemsByMBA, setter: setSearchLineItems },
            { flag: 'mp_socialmedia', fetchFn: getSocialMediaLineItemsByMBA, setter: setSocialMediaLineItems },
            { flag: 'mp_progdisplay', fetchFn: getProgDisplayLineItemsByMBA, setter: setProgDisplayLineItems },
            { flag: 'mp_progvideo', fetchFn: getProgVideoLineItemsByMBA, setter: setProgVideoLineItems },
            { flag: 'mp_progbvod', fetchFn: getProgBVODLineItemsByMBA, setter: setProgBvodLineItems },
            { flag: 'mp_progaudio', fetchFn: getProgAudioLineItemsByMBA, setter: setProgAudioLineItems },
            { flag: 'mp_progooh', fetchFn: getProgOOHLineItemsByMBA, setter: setProgOohLineItems },
            { flag: 'mp_influencers', fetchFn: getInfluencersLineItemsByMBA, setter: setInfluencersLineItems }
          ];

          // Fetch data for each enabled media type with version number
          const fetchPromises = mediaTypeMap.map(async ({ flag, fetchFn, setter }) => {
            if (mediaPlan[flag]) {
              try {
                console.log(`Fetching ${flag} data...`);
                const data = await fetchFn(mediaPlan.mba_number, mediaPlan.version_number);
                console.log(`${flag} data:`, data);
                setter(data || []);
              } catch (error) {
                console.error(`Error fetching ${flag} data:`, error);
                setter([]);
              }
            }
          });

          await Promise.all(fetchPromises);
          console.log("All container data fetched successfully");
          // Load saved KPIs for this version
          try {
            const saved = await getCampaignKPIs(mediaPlan.mba_number, mediaPlan.version_number)
            setSavedCampaignKPIs(saved)
          } catch (kpiErr) {
            console.warn("Could not load saved KPIs:", kpiErr)
          }
        } catch (error) {
          console.error("Error fetching container data:", error);
        }
      }
    };
    
    fetchContainerData();
  }, [mediaPlan, mediaPlan?.mba_number, mediaPlan?.version_number]);

  // Reset the fetch flag when media plan changes
  useEffect(() => {
    hasFetchedContainerDataRef.current = false;
  }, [mediaPlan?.id]);

  const handleClientSelect = (client: Client | null) => {
    if (client) {
      setSelectedClientId(client.id.toString());
      setSelectedClient(client);
      setIsClientModalOpen(false);
    }
  };

  const handleSearchBurstsChange = useCallback((bursts) => {
    setSearchBursts(bursts)
  }, [])

  const handleSocialMediaBurstsChange = useCallback((bursts) => {
    setSocialMediaBursts(bursts)
  }, [])

  const handleKPIReset = useCallback(() => {
    setSavedCampaignKPIs([])
  }, [])

  const handleInvestmentChange = useCallback((investmentByMonth) => {
    setInvestmentPerMonth(investmentByMonth);
    // Initialize manual billing months with the investment data
    const formattedBillingMonths = investmentByMonth.map(month => ({
      monthYear: month.monthYear,
      amount: month.amount.toString()
    }));
    setManualBillingMonths(formattedBillingMonths);
  }, []);

  const handleSearchTotalChange = useCallback((totalMedia: number, totalFee: number) => {
    setSearchTotal(totalMedia)
    setSearchFeeTotal(totalFee)
  }, [])

  const handleSocialMediaTotalChange = useCallback((totalMedia: number, totalFee: number) => {
    setSocialMediaTotal(totalMedia)
    setSocialMediaFeeTotal(totalFee)
  }, [])

  const handleDigiAudioTotalChange = useCallback((totalMedia: number, totalFee: number) => {
    setDigitalAudioTotal(totalMedia)
    setDigitalAudioFeeTotal(totalFee)
  }, [])

  const handleDigiDisplayTotalChange = useCallback((totalMedia: number, totalFee: number) => {
    setDigitalDisplayTotal(totalMedia)
    setDigitalDisplayFeeTotal(totalFee)
  }, [])

  const handleDigiVideoTotalChange = useCallback((totalMedia: number, totalFee: number) => {
    setDigitalVideoTotal(totalMedia)
    setDigitalVideoFeeTotal(totalFee)
  }, [])

  const handleBVODTotalChange = useCallback((totalMedia: number, totalFee: number) => {
    setBvodTotal(totalMedia)
    setBvodFeeTotal(totalFee)
  }, [])

  const handleIntegrationTotalChange = useCallback((totalMedia: number, totalFee: number) => {
    setIntegrationTotal(totalMedia)
    setIntegrationFeeTotal(totalFee)
  }, [])

  const handleProgDisplayTotalChange = useCallback((totalMedia: number, totalFee: number) => {
    setProgDisplayTotal(totalMedia)
    setProgDisplayFeeTotal(totalFee)
  }, [])

  const handleProgVideoTotalChange = useCallback((totalMedia: number, totalFee: number) => {
    setProgVideoTotal(totalMedia)
    setProgVideoFeeTotal(totalFee)
  }, [])

  const handleProgBvodTotalChange = useCallback((totalMedia: number, totalFee: number) => {
    setProgBvodTotal(totalMedia)
    setProgBvodFeeTotal(totalFee)
  }, [])

  const handleProgOohTotalChange = useCallback((totalMedia: number, totalFee: number) => {
    setProgOohTotal(totalMedia)
    setProgOohFeeTotal(totalFee)
  }, [])

  const handleProgAudioTotalChange = useCallback((totalMedia: number, totalFee: number) => {
    setProgAudioTotal(totalMedia)
    setProgAudioFeeTotal(totalFee)
  }, [])

  const handleCinemaTotalChange = useCallback((totalMedia: number, totalFee: number) => {
    setCinemaTotal(totalMedia)
    setCinemaFeeTotal(totalFee)
  }, [])

  const handleTelevisionTotalChange = useCallback((totalMedia: number, totalFee: number) => {
    setTelevisionTotal(totalMedia)
    setTelevisionFeeTotal(totalFee)
  }, [])

  const handleRadioTotalChange = useCallback((totalMedia: number, totalFee: number) => {
    setRadioTotal(totalMedia)
    setRadioFeeTotal(totalFee)
  }, [])

  const handleNewspaperTotalChange = useCallback((totalMedia: number, totalFee: number) => {
    setNewspaperTotal(totalMedia)
    setNewspaperFeeTotal(totalFee)
  }, [])

  const handleMagazinesTotalChange = useCallback((totalMedia: number, totalFee: number) => {
    setMagazinesTotal(totalMedia)
    setMagazinesFeeTotal(totalFee)
  }, [])

  const handleOohTotalChange = useCallback((totalMedia: number, totalFee: number) => {
    setOohTotal(totalMedia)
    setOohFeeTotal(totalFee)
  }, [])

  const handleInfluencersTotalChange = useCallback((totalMedia: number, totalFee: number) => {
    setInfluencersTotal(totalMedia)
    setInfluencersFeeTotal(totalFee)
  }, [])

  const handleBurstsChange = useCallback(() => {
    // Add burst handling if needed
  }, []);

  const handleManualBillingChange = (index: number, value: string) => {
    const newMonths = [...manualBillingMonths];
    // Remove any non-numeric characters except decimal point
    const numericValue = value.replace(/[^0-9.]/g, "");
    newMonths[index] = { ...newMonths[index], amount: numericValue };
    setManualBillingMonths(newMonths);
    
    // Calculate new total
    const total = newMonths.reduce((sum, month) => {
      const amount = parseFloat(month.amount) || 0;
      return sum + amount;
    }, 0);
    
    setManualBillingTotal(
      formatMoney(total, {
        locale: "en-US",
        currency: "USD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    );
  };

  const handleManualBillingSave = () => {
    // Validate that the total matches the campaign budget
    const manualTotal = parseFloat(manualBillingTotal.replace(/[^0-9.]/g, ""));
    const campaignBudget = parseFloat(form.getValues("mp_campaignbudget").toString());
    
    if (manualTotal !== campaignBudget) {
      toast({
        title: "Error",
        description: "Billing total must equal campaign budget",
        variant: "destructive",
      });
      return;
    }

    // Update the billing months and close the modal
    setBillingMonths(manualBillingMonths);
    setBillingTotal(manualBillingTotal);
    setIsManualBilling(true);
    setIsManualBillingModalOpen(false);
  };

  const parseMoney = (value: unknown): number => {
    if (typeof value === "number") return Number.isFinite(value) ? value : 0
    if (typeof value === "string") {
      const parsed = parseFloat(value.replace(/[^0-9.-]/g, ""))
      return Number.isFinite(parsed) ? parsed : 0
    }
    return 0
  }

  const calculateAssembledFee = useCallback(() => {
    return (
      (searchFeeTotal ?? 0) +
      (socialMediaFeeTotal ?? 0) +
      (progAudioFeeTotal ?? 0) +
      (cinemaFeeTotal ?? 0) +
      (digitalAudioFeeTotal ?? 0) +
      (digitalDisplayFeeTotal ?? 0) +
      (digitalVideoFeeTotal ?? 0) +
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
      (magazinesFeeTotal ?? 0) +
      (oohFeeTotal ?? 0)
    )
  }, [
    searchFeeTotal,
    socialMediaFeeTotal,
    progAudioFeeTotal,
    cinemaFeeTotal,
    digitalAudioFeeTotal,
    digitalDisplayFeeTotal,
    digitalVideoFeeTotal,
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
    magazinesFeeTotal,
    oohFeeTotal,
  ])

  const calculateAdServingFees = useCallback(() => {
    let total = 0
    if (adservvideo) total += (grossMediaTotal * adservvideo) / 100
    if (adservimp) total += (grossMediaTotal * adservimp) / 100
    if (adservdisplay) total += (grossMediaTotal * adservdisplay) / 100
    if (adservaudio) total += (grossMediaTotal * adservaudio) / 100
    return total
  }, [adservvideo, adservimp, adservdisplay, adservaudio, grossMediaTotal])

  const calculateProductionCosts = useCallback(() => {
    return billingSchedule.reduce((sum, month) => sum + (month.productionAmount || 0), 0)
  }, [billingSchedule])

  const buildPartialLineItems = useCallback((selectedMonths: string[]) => {
    const selectedSet = new Set(selectedMonths)
    const source = (billingSchedule || []).filter((entry: any) =>
      selectedSet.size ? selectedSet.has(entry.monthYear) : true
    )
    const byMedia: Record<string, Record<string, PartialApprovalLineItem>> = {}
    source.forEach((entry: any) => {
      ;(entry.mediaTypes || []).forEach((mediaType: any) => {
        const mediaKey = String(mediaType.mediaType || "Other")
        if (!byMedia[mediaKey]) byMedia[mediaKey] = {}
        ;(mediaType.lineItems || []).forEach((lineItem: any) => {
          const id = String(lineItem.lineItemId || lineItem.id || `${mediaKey}-${lineItem.header1}-${lineItem.header2}`)
          if (!byMedia[mediaKey][id]) {
            byMedia[mediaKey][id] = {
              lineItemId: id,
              header1: String(lineItem.header1 || ""),
              header2: String(lineItem.header2 || ""),
              amount: 0,
            }
          }
          byMedia[mediaKey][id].amount += parseMoney(lineItem.amount)
        })
      })
    })
    return byMedia
  }, [billingSchedule])

  const recomputePartialFromSelections = useCallback((selectedMonths: string[], selectedByMedia: Record<string, string[]>) => {
    const byMedia = buildPartialLineItems(selectedMonths)
    const channels = Object.entries(byMedia).map(([mediaKey, items]) => {
      const all = Object.values(items)
      const selectedSet = new Set(selectedByMedia[mediaKey] || all.map(i => i.lineItemId))
      const selectedItems = all.filter((item) => selectedSet.has(item.lineItemId))
      const selectedTotal = selectedItems.reduce((sum, item) => sum + item.amount, 0)
      const fullTotal = all.reduce((sum, item) => sum + item.amount, 0)
      return {
        mediaKey,
        mediaType: mediaKey,
        selectedLineItemIds: selectedItems.map((item) => item.lineItemId),
        selectedTotal: formatMoney(selectedTotal, { locale: "en-US", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        fullChannelTotal: formatMoney(fullTotal, { locale: "en-US", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        selectedCount: selectedItems.length,
        totalCount: all.length,
      }
    })
    const mediaTotals = Object.fromEntries(
      channels.map((c) => [c.mediaKey, parseMoney(c.selectedTotal)])
    )
    const grossMedia = Object.values(mediaTotals).reduce((sum, val) => sum + val, 0)
    setPartialMBAValues((prev) => ({ ...prev, mediaTotals, grossMedia }))
    setPartialMBALineItemsByMedia(Object.fromEntries(Object.entries(byMedia).map(([k, v]) => [k, Object.values(v)])))
    setPartialApprovalMetadata({
      isPartial: true,
      selectedMonthYears: [...selectedMonths],
      channels,
      totals: {
        grossMedia: formatMoney(grossMedia, { locale: "en-US", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        assembledFee: formatMoney(partialMBAValues.assembledFee, { locale: "en-US", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        adServing: formatMoney(partialMBAValues.adServing, { locale: "en-US", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        production: formatMoney(partialMBAValues.production, { locale: "en-US", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        totalInvestment: formatMoney(grossMedia + partialMBAValues.assembledFee + partialMBAValues.adServing + partialMBAValues.production, { locale: "en-US", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      },
      note: buildPartialApprovalNote(channels, selectedMonths),
      updatedAt: new Date().toISOString(),
    })
  }, [buildPartialLineItems, partialMBAValues.assembledFee, partialMBAValues.adServing, partialMBAValues.production])

  const handlePartialMBAOpen = useCallback(() => {
    const months = (billingSchedule || []).map((entry: any) => String(entry.monthYear)).filter(Boolean)
    setPartialMBAMonthYears(months)
    const byMedia = buildPartialLineItems(months)
    const selectedIds = Object.fromEntries(Object.entries(byMedia).map(([mediaKey, items]) => [mediaKey, Object.keys(items)]))
    setPartialMBASelectedLineItemIds(selectedIds)
    setPartialMBAValues({
      mediaTotals: {},
      grossMedia: 0,
      assembledFee: calculateAssembledFee(),
      adServing: calculateAdServingFees(),
      production: calculateProductionCosts(),
    })
    recomputePartialFromSelections(months, selectedIds)
    setIsPartialMBAModalOpen(true)
  }, [
    billingSchedule,
    buildPartialLineItems,
    recomputePartialFromSelections,
    calculateAssembledFee,
    calculateAdServingFees,
    calculateProductionCosts,
  ])

  const handlePartialMBAMonthsChange = (nextMonthYears: string[]) => {
    setPartialMBAMonthYears(nextMonthYears)
    recomputePartialFromSelections(nextMonthYears, partialMBASelectedLineItemIds)
  }

  const handlePartialLineItemToggle = (mediaKey: string, lineItemId: string, enabled: boolean) => {
    const existing = new Set(partialMBASelectedLineItemIds[mediaKey] || [])
    if (enabled) existing.add(lineItemId)
    else existing.delete(lineItemId)
    const next = { ...partialMBASelectedLineItemIds, [mediaKey]: Array.from(existing) }
    setPartialMBASelectedLineItemIds(next)
    recomputePartialFromSelections(partialMBAMonthYears, next)
  }

  const handlePartialMBAChannelToggle = (mediaKey: string, enabled: boolean) => {
    const all = (partialMBALineItemsByMedia[mediaKey] || []).map((i) => i.lineItemId)
    const next = { ...partialMBASelectedLineItemIds, [mediaKey]: enabled ? all : [] }
    setPartialMBASelectedLineItemIds(next)
    recomputePartialFromSelections(partialMBAMonthYears, next)
  }

  const handlePartialMBASave = () => {
    setIsPartialMBA(true)
    setIsPartialMBAModalOpen(false)
    toast({ title: "Success", description: "Partial MBA details have been saved." })
  }

  const handleResetBilling = () => {
    setIsManualBilling(false);
    // Billing schedule calculation removed to prevent infinite loops
  };

  // Helper function to generate billing line items from media line items
  const generateBillingLineItems = useCallback((
    mediaLineItems: any[],
    mediaType: string,
    months: { monthYear: string }[]
  ): BillingLineItem[] => {
    if (!mediaLineItems || mediaLineItems.length === 0) return [];

    const lineItemsMap = new Map<string, BillingLineItem>();
    const monthKeys = months.map(m => m.monthYear);

    mediaLineItems.forEach((lineItem, index) => {
      const { header1, header2 } = getScheduleHeaders(mediaType, lineItem);
      const itemId = `${mediaType}-${header1 || "Item"}-${header2 || "Details"}-${index}`;
      const clientPaysForMedia = Boolean(
        (lineItem as any)?.client_pays_for_media ?? (lineItem as any)?.clientPaysForMedia
      );

      if (!lineItemsMap.has(itemId)) {
        lineItemsMap.set(itemId, {
          id: itemId,
          header1,
          header2,
          monthlyAmounts: {},
          totalAmount: 0,
          ...(clientPaysForMedia ? { clientPaysForMedia: true } : {}),
        });
      }

      const billingItem = lineItemsMap.get(itemId)!;
      
      // Process bursts to calculate monthly amounts.
      // Source of truth is bursts_json (emitted by every *Container.onMediaLineItemsChange).
      // Falls back to lineItem.bursts for backward compatibility with older shapes
      // and direct Xano hydration paths.
      const rawBursts: any[] = (() => {
        const fromJson = lineItem.bursts_json;
        if (Array.isArray(fromJson)) return fromJson;
        if (typeof fromJson === "string" && fromJson.trim() !== "") {
          try {
            const parsed = JSON.parse(fromJson);
            return Array.isArray(parsed) ? parsed : [];
          } catch {
            return [];
          }
        }
        if (Array.isArray(lineItem.bursts)) return lineItem.bursts;
        return [];
      })();

      rawBursts.forEach((burst: any) => {
        if (!burst?.startDate || !burst?.endDate) return;

        // Budget can be a number, a plain string ("1500"), or a currency string
        // ("$25,000.00") depending on the source container. Normalise the same way
        // OOHContainer.getOohBursts does.
        const budget = parseFloat(String(burst?.budget ?? "0").replace(/[^0-9.-]/g, "")) || 0;
        if (!budget) return;

        const startDate = new Date(burst.startDate);
        const endDate = new Date(burst.endDate);
        if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return;

        monthKeys.forEach(monthKey => {
          const [monthName, year] = monthKey.split(' ');
          const monthIndex = new Date(`${monthName} 1, ${year}`).getMonth();
          const yearNum = parseInt(year);

          const monthStart = new Date(yearNum, monthIndex, 1);
          const monthEnd = new Date(yearNum, monthIndex + 1, 0);

          if (startDate <= monthEnd && endDate >= monthStart) {
            const overlapStart = new Date(Math.max(startDate.getTime(), monthStart.getTime()));
            const overlapEnd = new Date(Math.min(endDate.getTime(), monthEnd.getTime()));
            const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
            const overlapDays = Math.ceil((overlapEnd.getTime() - overlapStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
            const monthlyAmount = (budget / totalDays) * overlapDays;

            billingItem.monthlyAmounts[monthKey] = (billingItem.monthlyAmounts[monthKey] || 0) + monthlyAmount;
            billingItem.totalAmount += monthlyAmount;
          }
        });
      });
    });

    return Array.from(lineItemsMap.values());
  }, []);

  // Build billing schedule JSON from available data
  const buildBillingScheduleForSave = useCallback((): any[] => {
    // Requirement: billingSchedule saves the *post-change* schedule.
    // - If manual billing is active and manual months exist, use them.
    // - Else use the current editable billingSchedule (auto/post-change).
    const currencyFormatter = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" });

    if (isManualBilling && manualBillingMonths.length > 0) {
      const manualMonthsAsBillingMonths: BillingMonth[] = manualBillingMonths.map((m) => {
        const numeric = parseFloat(String(m.amount).replace(/[^0-9.-]/g, "")) || 0
        return {
          monthYear: m.monthYear,
          mediaTotal: currencyFormatter.format(numeric),
          feeTotal: currencyFormatter.format(0),
          totalAmount: currencyFormatter.format(numeric),
          adservingTechFees: currencyFormatter.format(0),
          production: currencyFormatter.format(0),
          mediaCosts: {
            search: currencyFormatter.format(numeric),
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
          },
          lineItems: {
            search: numeric > 0 ? [{
              id: `manual-billing-${m.monthYear}`,
              header1: "Manual",
              header2: "Manual allocation",
              monthlyAmounts: { [m.monthYear]: numeric },
              totalAmount: numeric,
            }] : [],
          },
        }
      })
      return appendPartialApprovalToBillingSchedule({
        billingSchedule: buildBillingScheduleJSON(manualMonthsAsBillingMonths),
        metadata: isPartialMBA ? partialApprovalMetadata : null,
      })
    }

    const baseSchedule = billingSchedule && billingSchedule.length > 0 ? billingSchedule : []
    if (!baseSchedule || baseSchedule.length === 0) return []

    // Convert to BillingMonth format from the editable BillingScheduleType[].
    const billingMonthsWithLineItems: BillingMonth[] = (baseSchedule as BillingScheduleType).map((scheduleEntry: BillingScheduleType[0]) => {
      const monthData: BillingMonth = {
        monthYear: scheduleEntry.month,
        mediaTotal: currencyFormatter.format(scheduleEntry.searchAmount + scheduleEntry.socialAmount),
        feeTotal: currencyFormatter.format(scheduleEntry.feeAmount || 0),
        totalAmount: currencyFormatter.format(scheduleEntry.totalAmount),
        adservingTechFees: currencyFormatter.format(0), // Will be calculated if available
        production: currencyFormatter.format(0),
        mediaCosts: {
          search: currencyFormatter.format(scheduleEntry.searchAmount),
          socialMedia: currencyFormatter.format(scheduleEntry.socialAmount),
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
        },
        lineItems: {}
      };

      // Generate line items for each enabled media type
      const formValues = form.getValues();
      const mediaTypeMap: Record<string, { lineItems: any[], key: string }> = {
        'mp_television': { lineItems: televisionMediaLineItems, key: 'television' },
        'mp_radio': { lineItems: radioMediaLineItems, key: 'radio' },
        'mp_newspaper': { lineItems: newspaperMediaLineItems, key: 'newspaper' },
        'mp_magazines': { lineItems: magazinesMediaLineItems, key: 'magazines' },
        'mp_ooh': { lineItems: oohMediaLineItems, key: 'ooh' },
        'mp_cinema': { lineItems: cinemaMediaLineItems, key: 'cinema' },
        'mp_digidisplay': { lineItems: digitalDisplayMediaLineItems, key: 'digiDisplay' },
        'mp_digiaudio': { lineItems: digitalAudioMediaLineItems, key: 'digiAudio' },
        'mp_digivideo': { lineItems: digitalVideoMediaLineItems, key: 'digiVideo' },
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
      };

      Object.entries(mediaTypeMap).forEach(([mediaTypeKey, { lineItems, key }]) => {
        const isEnabled = formValues[mediaTypeKey as keyof typeof formValues];
        if (isEnabled && lineItems && lineItems.length > 0) {
          const billingLineItems = generateBillingLineItems(lineItems, key, (baseSchedule as BillingScheduleType).map(m => ({ monthYear: m.month })));
          if (billingLineItems.length > 0 && monthData.lineItems) {
            const lineItemsObj = monthData.lineItems as Record<string, BillingLineItem[]>;
            lineItemsObj[key] = billingLineItems;
          }
        }
      });

      // Ensure edited monthly totals are preserved even when there are no detailed line items
      const lineItemsObj = monthData.lineItems as Record<string, BillingLineItem[]>;
      const ensureAggregateLineItem = (key: string, amount: number, label: string) => {
        if (!amount || amount === 0) return;
        if (lineItemsObj[key] && lineItemsObj[key].length > 0) return;
        lineItemsObj[key] = [{
          id: `billing-${key}-${scheduleEntry.month}`,
          header1: label,
          header2: "Total",
          monthlyAmounts: { [scheduleEntry.month]: amount },
          totalAmount: amount,
        }];
      };

      ensureAggregateLineItem('search', scheduleEntry.searchAmount || 0, 'Search');
      ensureAggregateLineItem('socialMedia', scheduleEntry.socialAmount || 0, 'Social Media');

      return monthData;
    });

    const billingJson = buildBillingScheduleJSON(billingMonthsWithLineItems);
    return appendPartialApprovalToBillingSchedule({
      billingSchedule: billingJson,
      metadata: isPartialMBA ? partialApprovalMetadata : null,
    });
  }, [
    isManualBilling,
    manualBillingMonths,
    billingSchedule,
    televisionMediaLineItems,
    radioMediaLineItems,
    newspaperMediaLineItems,
    magazinesMediaLineItems,
    oohMediaLineItems,
    cinemaMediaLineItems,
    digitalDisplayMediaLineItems,
    digitalAudioMediaLineItems,
    digitalVideoMediaLineItems,
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
    generateBillingLineItems,
    form,
    isPartialMBA,
    partialApprovalMetadata,
  ]);

  const generateMBANumber = async (mbaidentifier: string) => {
    try {
      const response = await fetch(`/api/mediaplans/mbanumber?mbaidentifier=${mbaidentifier}`)
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Failed to generate MBA number")
      }
      const data = await response.json()
      if (data.mbanumber) {
        form.setValue("mbanumber", data.mbanumber)
        setMbaNumber(data.mbanumber)
      } else {
        throw new Error("MBA number not found in response")
      }
    } catch (error) {
      console.error("Error generating MBA number:", error)
      form.setValue("mbanumber", "Error generating MBA number")
      setMbaNumber("")
    }
  }

  const handleSaveCampaign = async () => {
    setIsSaving(true)
    try {
      const formData = form.getValues()
      
      // Build billing schedule JSON
      const billingScheduleJSON = buildBillingScheduleForSave();

      // deliverySchedule must always save the FIRST auto-calculated schedule for this plan/version.
      const hasManualBillingMonths = isManualBilling && manualBillingMonths.length > 0
      const billingScheduleSource = hasManualBillingMonths ? "manual" : "billing"

      const autoMonthsFromCurrentSchedule: BillingMonth[] = (billingSchedule || []).map((entry) => {
        const formatter = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" });
        const searchAmount = entry.searchAmount || 0;
        const socialAmount = entry.socialAmount || 0;
        const productionAmount = entry.productionAmount || 0;
        const feeAmount = entry.feeAmount || 0;
        const totalAmount = entry.totalAmount || 0;

        return {
          monthYear: entry.month,
          mediaTotal: formatter.format(searchAmount + socialAmount),
          feeTotal: formatter.format(feeAmount),
          totalAmount: formatter.format(totalAmount),
          adservingTechFees: formatter.format(0),
          production: formatter.format(productionAmount),
          mediaCosts: {
            search: formatter.format(searchAmount),
            socialMedia: formatter.format(socialAmount),
            television: formatter.format(0),
            radio: formatter.format(0),
            newspaper: formatter.format(0),
            magazines: formatter.format(0),
            ooh: formatter.format(0),
            cinema: formatter.format(0),
            digiDisplay: formatter.format(0),
            digiAudio: formatter.format(0),
            digiVideo: formatter.format(0),
            bvod: formatter.format(0),
            integration: formatter.format(0),
            progDisplay: formatter.format(0),
            progVideo: formatter.format(0),
            progBvod: formatter.format(0),
            progAudio: formatter.format(0),
            progOoh: formatter.format(0),
            influencers: formatter.format(0),
            production: formatter.format(productionAmount),
          },
          lineItems: {
            search: searchAmount > 0 ? [{
              id: `auto-search-${entry.month}`,
              header1: "Auto",
              header2: "Auto allocation",
              monthlyAmounts: { [entry.month]: searchAmount },
              totalAmount: searchAmount,
            }] : [],
            socialMedia: socialAmount > 0 ? [{
              id: `auto-social-${entry.month}`,
              header1: "Auto",
              header2: "Auto allocation",
              monthlyAmounts: { [entry.month]: socialAmount },
              totalAmount: socialAmount,
            }] : [],
          },
        }
      })

      const snapshot = deliveryScheduleSnapshotRef.current
      const currencyFormatter = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" });
      const billingFallbackMonths: BillingMonth[] = hasManualBillingMonths
        ? manualBillingMonths.map((m) => {
            const numeric = parseFloat(String(m.amount).replace(/[^0-9.-]/g, "")) || 0
            return {
              monthYear: m.monthYear,
              mediaTotal: currencyFormatter.format(numeric),
              feeTotal: currencyFormatter.format(0),
              totalAmount: currencyFormatter.format(numeric),
              adservingTechFees: currencyFormatter.format(0),
              production: currencyFormatter.format(0),
              mediaCosts: {
                search: currencyFormatter.format(numeric),
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
              },
              lineItems: {
                search: numeric > 0 ? [{
                  id: `manual-billing-${m.monthYear}`,
                  header1: "Manual",
                  header2: "Manual allocation",
                  monthlyAmounts: { [m.monthYear]: numeric },
                  totalAmount: numeric,
                }] : [],
              },
            }
          })
        : []
      const deliveryScheduleSource =
        snapshot && snapshot.length > 0
          ? "snapshot"
          : (autoMonthsFromCurrentSchedule.length > 0 ? "auto" : "billing")

      const deliveryMonthsSource =
        snapshot && snapshot.length > 0
          ? deepCloneBillingMonths(snapshot)
          : (autoMonthsFromCurrentSchedule.length > 0
            ? deepCloneBillingMonths(autoMonthsFromCurrentSchedule)
            : deepCloneBillingMonths(billingFallbackMonths))

      if (process.env.NODE_ENV !== "production") {
        console.log(`delivery schedule source = ${deliveryScheduleSource}`, {
          monthCount: deliveryMonthsSource.length,
          firstMonthYear: deliveryMonthsSource[0]?.monthYear,
        })
        console.log(`billing schedule source = ${billingScheduleSource}`, {
          monthCount: hasManualBillingMonths ? manualBillingMonths.length : autoMonthsFromCurrentSchedule.length,
          firstMonthYear: hasManualBillingMonths
            ? manualBillingMonths[0]?.monthYear
            : autoMonthsFromCurrentSchedule[0]?.monthYear,
        })
      }

      const deliveryScheduleJSON = buildBillingScheduleJSON(deliveryMonthsSource)
      
      // Create new version in media_plan_versions table
      const response = await fetch(`/api/mediaplans/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...formData,
          search_bursts: searchBursts,
          social_media_bursts: socialMediaBursts,
          investment_by_month: investmentPerMonth,
          billingSchedule: billingScheduleJSON,
          deliverySchedule: deliveryScheduleJSON,
          // Xano alias safeguard
          delivery_schedule: deliveryScheduleJSON,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to save campaign")
      }

      const data = await response.json()
      // Save KPIs (non-blocking)
      if (kpiRows.length > 0) {
        const fv = form.getValues()
        const kpiPayload: CampaignKPI[] = kpiRows.map((row) => ({
          mp_client_name: fv.mp_clientname,
          mba_number: fv.mbanumber,
          version_number: mediaPlan?.version_number ?? 1,
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
        saveCampaignKPIs(kpiPayload).catch((err) => console.warn("KPI save failed:", err))
      }

      // Then, save search data if search is enabled
      if (formData.mp_search && formData.mbanumber) {
        try {
          // @ts-ignore - Accessing the saveSearchData function from the window object
          if (window.saveSearchData) {
            // @ts-ignore - Calling the saveSearchData function
            await window.saveSearchData(formData.mbanumber)
            console.log("Search data saved successfully")
          } else {
            console.warn("saveSearchData function not found")
          }
        } catch (error) {
          console.error("Failed to save search data:", error)
          // Continue with the media plan update even if search data saving fails
        }
      }

      // Save all media line items for enabled media types
      const mediaTypeSavePromises: Promise<any>[] = [];

      // Television
      if (formData.mp_television && televisionMediaLineItems && televisionMediaLineItems.length > 0) {
        mediaTypeSavePromises.push(
          saveTelevisionLineItems(
            data.id,
            formData.mbanumber,
            formData.mp_clientname,
            "1",
            televisionMediaLineItems
          ).catch(error => {
            console.error('Error saving television data:', error);
            return { type: 'television', error };
          })
        );
      }

      // Radio
      if (formData.mp_radio && radioMediaLineItems && radioMediaLineItems.length > 0) {
        mediaTypeSavePromises.push(
          saveRadioLineItems(
            data.id,
            formData.mbanumber,
            formData.mp_clientname,
            "1",
            radioMediaLineItems
          ).catch(error => {
            console.error('Error saving radio data:', error);
            return { type: 'radio', error };
          })
        );
      }

      // Newspaper
      if (formData.mp_newspaper && newspaperMediaLineItems && newspaperMediaLineItems.length > 0) {
        mediaTypeSavePromises.push(
          saveNewspaperLineItems(
            data.id,
            formData.mbanumber,
            formData.mp_clientname,
            "1",
            newspaperMediaLineItems
          ).catch(error => {
            console.error('Error saving newspaper data:', error);
            return { type: 'newspaper', error };
          })
        );
      }

      // Magazines
      if (formData.mp_magazines && magazinesMediaLineItems && magazinesMediaLineItems.length > 0) {
        mediaTypeSavePromises.push(
          saveMagazinesLineItems(
            data.id,
            formData.mbanumber,
            formData.mp_clientname,
            "1",
            magazinesMediaLineItems
          ).catch(error => {
            console.error('Error saving magazines data:', error);
            return { type: 'magazines', error };
          })
        );
      }

      // OOH
      if (formData.mp_ooh && oohMediaLineItems && oohMediaLineItems.length > 0) {
        mediaTypeSavePromises.push(
          saveOOHLineItems(
            data.id,
            formData.mbanumber,
            formData.mp_clientname,
            "1",
            oohMediaLineItems
          ).catch(error => {
            console.error('Error saving OOH data:', error);
            return { type: 'ooh', error };
          })
        );
      }

      // Cinema
      if (formData.mp_cinema && cinemaMediaLineItems && cinemaMediaLineItems.length > 0) {
        mediaTypeSavePromises.push(
          saveCinemaLineItems(
            data.id,
            formData.mbanumber,
            formData.mp_clientname,
            "1",
            cinemaMediaLineItems
          ).catch(error => {
            console.error('Error saving cinema data:', error);
            return { type: 'cinema', error };
          })
        );
      }

      // Digital Display
      if (formData.mp_digidisplay && digitalDisplayMediaLineItems && digitalDisplayMediaLineItems.length > 0) {
        mediaTypeSavePromises.push(
          saveDigitalDisplayLineItems(
            data.id,
            formData.mbanumber,
            formData.mp_clientname,
            "1",
            digitalDisplayMediaLineItems
          ).catch(error => {
            console.error('Error saving digital display data:', error);
            return { type: 'digidisplay', error };
          })
        );
      }

      // Digital Audio
      if (formData.mp_digiaudio && digitalAudioMediaLineItems && digitalAudioMediaLineItems.length > 0) {
        mediaTypeSavePromises.push(
          saveDigitalAudioLineItems(
            data.id,
            formData.mbanumber,
            formData.mp_clientname,
            "1",
            digitalAudioMediaLineItems
          ).catch(error => {
            console.error('Error saving digital audio data:', error);
            return { type: 'digiaudio', error };
          })
        );
      }

      // Digital Video
      if (formData.mp_digivideo && digitalVideoMediaLineItems && digitalVideoMediaLineItems.length > 0) {
        mediaTypeSavePromises.push(
          saveDigitalVideoLineItems(
            data.id,
            formData.mbanumber,
            formData.mp_clientname,
            "1",
            digitalVideoMediaLineItems
          ).catch(error => {
            console.error('Error saving digital video data:', error);
            return { type: 'digivideo', error };
          })
        );
      }

      // BVOD
      if (formData.mp_bvod && bvodMediaLineItems && bvodMediaLineItems.length > 0) {
        mediaTypeSavePromises.push(
          saveBVODLineItems(
            data.id,
            formData.mbanumber,
            formData.mp_clientname,
            "1",
            bvodMediaLineItems
          ).catch(error => {
            console.error('Error saving BVOD data:', error);
            return { type: 'bvod', error };
          })
        );
      }

      // Integration
      if (formData.mp_integration && integrationMediaLineItems && integrationMediaLineItems.length > 0) {
        mediaTypeSavePromises.push(
          saveIntegrationLineItems(
            data.id,
            formData.mbanumber,
            formData.mp_clientname,
            "1",
            integrationMediaLineItems
          ).catch(error => {
            console.error('Error saving integration data:', error);
            return { type: 'integration', error };
          })
        );
      }

      // Search
      if (formData.mp_search && searchMediaLineItems && searchMediaLineItems.length > 0) {
        mediaTypeSavePromises.push(
          saveSearchLineItems(
            data.id,
            formData.mbanumber,
            formData.mp_clientname,
            "1",
            searchMediaLineItems
          ).catch(error => {
            console.error('Error saving search data:', error);
            return { type: 'search', error };
          })
        );
      }

      // Social Media
      if (formData.mp_socialmedia && socialMediaMediaLineItems && socialMediaMediaLineItems.length > 0) {
        mediaTypeSavePromises.push(
          saveSocialMediaLineItems(
            data.id,
            formData.mbanumber,
            formData.mp_clientname,
            "1",
            socialMediaMediaLineItems
          ).catch(error => {
            console.error('Error saving social media data:', error);
            return { type: 'socialmedia', error };
          })
        );
      }

      // Programmatic Display
      if (formData.mp_progdisplay && progDisplayMediaLineItems && progDisplayMediaLineItems.length > 0) {
        mediaTypeSavePromises.push(
          saveProgDisplayLineItems(
            data.id,
            formData.mbanumber,
            formData.mp_clientname,
            "1",
            progDisplayMediaLineItems
          ).catch(error => {
            console.error('Error saving programmatic display data:', error);
            return { type: 'progdisplay', error };
          })
        );
      }

      // Programmatic Video
      if (formData.mp_progvideo && progVideoMediaLineItems && progVideoMediaLineItems.length > 0) {
        mediaTypeSavePromises.push(
          saveProgVideoLineItems(
            data.id,
            formData.mbanumber,
            formData.mp_clientname,
            "1",
            progVideoMediaLineItems
          ).catch(error => {
            console.error('Error saving programmatic video data:', error);
            return { type: 'progvideo', error };
          })
        );
      }

      // Programmatic BVOD
      if (formData.mp_progbvod && progBvodMediaLineItems && progBvodMediaLineItems.length > 0) {
        mediaTypeSavePromises.push(
          saveProgBVODLineItems(
            data.id,
            formData.mbanumber,
            formData.mp_clientname,
            "1",
            progBvodMediaLineItems
          ).catch(error => {
            console.error('Error saving programmatic BVOD data:', error);
            return { type: 'progbvod', error };
          })
        );
      }

      // Programmatic Audio
      if (formData.mp_progaudio && progAudioMediaLineItems && progAudioMediaLineItems.length > 0) {
        mediaTypeSavePromises.push(
          saveProgAudioLineItems(
            data.id,
            formData.mbanumber,
            formData.mp_clientname,
            "1",
            progAudioMediaLineItems
          ).catch(error => {
            console.error('Error saving programmatic audio data:', error);
            return { type: 'progaudio', error };
          })
        );
      }

      // Programmatic OOH
      if (formData.mp_progooh && progOohMediaLineItems && progOohMediaLineItems.length > 0) {
        mediaTypeSavePromises.push(
          saveProgOOHLineItems(
            data.id,
            formData.mbanumber,
            formData.mp_clientname,
            "1",
            progOohMediaLineItems
          ).catch(error => {
            console.error('Error saving programmatic OOH data:', error);
            return { type: 'progooh', error };
          })
        );
      }

      // Influencers
      if (formData.mp_influencers && influencersMediaLineItems && influencersMediaLineItems.length > 0) {
        mediaTypeSavePromises.push(
          saveInfluencersLineItems(
            data.id,
            formData.mbanumber,
            formData.mp_clientname,
            "1",
            influencersMediaLineItems
          ).catch(error => {
            console.error('Error saving influencers data:', error);
            return { type: 'influencers', error };
          })
        );
      }

      // Execute all media type saves in parallel
      if (mediaTypeSavePromises.length > 0) {
        try {
          const results = await Promise.all(mediaTypeSavePromises);
          const errors = results.filter(result => result && result.error);
          
          if (errors.length > 0) {
            console.warn('Some media types failed to save:', errors);
            toast({
              title: 'Partial Success',
              description: `Campaign saved but some media types failed to save. Please check the console for details.`,
              variant: 'destructive'
            });
          } else {
            console.log('All media line items saved successfully');
          }
        } catch (error) {
          console.error('Error saving media line items:', error);
          toast({
            title: 'Warning',
            description: 'Campaign saved but some media data could not be saved. Please try again.',
            variant: 'destructive'
          });
        }
      }
      
      toast({
        title: "Success",
        description: "Campaign saved successfully as new version"
      })
    } catch (error: any) {
      console.error("Error saving campaign:", error)
      toast({
        title: "Error",
        description: error.message || "Failed to save campaign",
        variant: "destructive"
      })
    } finally {
      setIsSaving(false)
    }
  }

  const handleGenerateMBA = async () => {
    try {
      setModalLoading(true)
      setModalTitle("Generating MBA")
      setModalOutcome("Generating your MBA number...")
      setModalOpen(true)

      const formData = form.getValues()
      const mbaidentifier = formData.mbaidentifier
      
      if (!mbaidentifier) {
        throw new Error("MBA Identifier is required to generate an MBA number")
      }
      
      // Use the generateMBANumber function
      await generateMBANumber(mbaidentifier)
      
      setModalTitle("Success")
      setModalOutcome("MBA number generated successfully")
      setModalLoading(false)
    } catch (error) {
      console.error("Error generating MBA:", error)
      setModalTitle("Error")
      setModalOutcome(error.message || "Failed to generate MBA")
      setModalLoading(false)
    }
  }

  const fetchMediaPlanExcelBlob = async (
    excelVariant: "standard" | "advertisingAssociates",
  ): Promise<Blob> => {
    const formData = form.getValues()
    const logoBuf = await fetch("/assembled-logo.png").then((r) => r.arrayBuffer())
    const bytes = new Uint8Array(logoBuf)
    let binary = ""
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]!)
    const logoBase64 = btoa(binary)

    const gross = isPartialMBA ? partialMBAValues.grossMedia : grossMediaTotal
    const prod = isPartialMBA ? partialMBAValues.production : calculateProductionCosts()
    const asm = isPartialMBA ? partialMBAValues.assembledFee : calculateAssembledFee()
    const ads = isPartialMBA ? partialMBAValues.adServing : calculateAdServingFees()
    const totalEx =
      excelVariant === "advertisingAssociates"
        ? gross + prod
        : gross + asm + ads + prod

    const budgetFmt = new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency: "AUD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(formData.mp_campaignbudget)

    const payload: Record<string, unknown> = {
      ...formData,
      mp_client_name: formData.mp_clientname,
      mp_campaignbudget: budgetFmt,
      mp_campaigndates_start: format(formData.mp_campaigndates_start, "dd/MM/yyyy"),
      mp_campaigndates_end: format(formData.mp_campaigndates_end, "dd/MM/yyyy"),
      logoBase64,
      logoWidth: 457,
      logoHeight: 71,
      version_number: String(mediaPlan?.version_number ?? 1),
      search: searchMediaLineItems,
      socialMedia: socialMediaMediaLineItems,
      digiAudio: digitalAudioMediaLineItems,
      digiDisplay: digitalDisplayItems,
      digiVideo: digitalVideoMediaLineItems,
      bvod: bvodMediaLineItems,
      progDisplay: progDisplayMediaLineItems,
      progVideo: progVideoMediaLineItems,
      progBvod: progBvodMediaLineItems,
      progOoh: progOohMediaLineItems,
      progAudio: progAudioMediaLineItems,
      newspaper: newspaperMediaLineItems,
      magazines: magazinesMediaLineItems,
      television: televisionMediaLineItems,
      radio: radioMediaLineItems,
      ooh: oohMediaLineItems,
      cinema: cinemaMediaLineItems,
      integration: integrationMediaLineItems,
      search_bursts: searchBursts,
      social_media_bursts: socialMediaBursts,
      investment_by_month: investmentPerMonth,
      mbaData: {
        gross_media: [],
        totals: {
          gross_media: gross,
          service_fee: excelVariant === "advertisingAssociates" ? 0 : asm,
          production: prod,
          adserving: excelVariant === "advertisingAssociates" ? 0 : ads,
          totals_ex_gst: totalEx,
          total_inc_gst: totalEx * 1.1,
        },
      },
    }

    if (excelVariant === "advertisingAssociates") {
      payload.excelVariant = "advertisingAssociates"
      payload.kpiRows = []
    } else {
      payload.kpiRows = kpiRows.map((r) => ({
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
      }))
    }

    const response = await fetch("/api/mediaplans/download", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const errJson = await response.json().catch(() => ({}))
      throw new Error(
        typeof errJson.error === "string" ? errJson.error : "Failed to download media plan",
      )
    }

    return response.blob()
  }

  const handleDownloadMediaPlan = async () => {
    try {
      setModalLoading(true)
      setModalTitle("Downloading Media Plan")
      setModalOutcome("Preparing your media plan for download...")
      setModalOpen(true)

      const formData = form.getValues()
      const blob = await fetchMediaPlanExcelBlob("standard")
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      const version = mediaPlan?.version_number ?? 1
      const mediaPlanBase = `${formData.mp_campaignname}_MediaPlan`
      a.download = `${formData.mp_clientname}-${mediaPlanBase}-v${version}.xlsx`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)

      setModalTitle("Success")
      setModalOutcome("Media plan downloaded successfully")
      setModalLoading(false)
    } catch (error: any) {
      console.error("Error downloading media plan:", error)
      setModalTitle("Error")
      setModalOutcome(error?.message || "Failed to download media plan")
      setModalLoading(false)
    }
  }

  const handleDownloadAdvertisingAssociatesMediaPlan = async () => {
    try {
      setModalLoading(true)
      setModalTitle("Downloading AA Media Plan")
      setModalOutcome("Preparing your media plan for download...")
      setModalOpen(true)

      const formData = form.getValues()
      const blob = await fetchMediaPlanExcelBlob("advertisingAssociates")
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      const version = mediaPlan?.version_number ?? 1
      const mediaPlanBase = `${formData.mp_campaignname}_MediaPlan`
      a.download = `AA - ${formData.mp_clientname}-${mediaPlanBase}-v${version}.xlsx`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)

      setModalTitle("Success")
      setModalOutcome("Advertising Associates media plan downloaded")
      setModalLoading(false)
    } catch (error: any) {
      console.error("Error downloading AA media plan:", error)
      setModalTitle("Error")
      setModalOutcome(error?.message || "Failed to download media plan")
      setModalLoading(false)
    }
  }

  const handleSaveAndGenerateAll = async () => {
    try {
      setModalLoading(true)
      setModalTitle("Processing")
      setModalOutcome("Saving your campaign and generating MBA number...")
      setModalOpen(true)

      await handleSaveCampaign()
      await handleGenerateMBA()

      setModalTitle("Success")
      setModalOutcome("Campaign saved as new version and MBA number generated successfully")
      setModalLoading(false)
    } catch (error) {
      console.error("Error in save and generate:", error)
      setModalTitle("Error")
      setModalOutcome(error.message || "Failed to process request")
      setModalLoading(false)
    }
  }

  function BillingAndMBASections({ form }) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <h4 className="text-sm font-medium mb-2">Monthly Investment</h4>
            <div className="space-y-2">
              {investmentPerMonth.map((item, index) => (
                <div key={index} className="flex items-center justify-between">
                  <span>{item.monthYear}</span>
                  <span className="font-medium">
                    {formatMoney(item.amount, {
                      locale: "en-US",
                      currency: "USD",
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="space-y-4">
            <h4 className="text-sm font-medium mb-2">Manual Billing</h4>
            <div className="space-y-2">
              {manualBillingMonths.map((item, index) => (
                <div key={index} className="flex items-center justify-between">
                  <span>{item.monthYear}</span>
                  <Input
                    type="text"
                    value={item.amount}
                    onChange={(e) => handleManualBillingChange(index, e.target.value)}
                    className="w-32"
                  />
                </div>
              ))}
            </div>
            <div className="flex space-x-2">
              <Button onClick={handleManualBillingSave}>Save</Button>
              <Button variant="outline" onClick={handleResetBilling}>Reset</Button>
            </div>
          </div>
        </div>
        <div className="space-y-4">
          <h4 className="text-sm font-medium">MBA Number</h4>
          <div className="flex items-center space-x-2">
            <Input
              {...form.register("mbanumber")}
              placeholder="MBA Number"
              disabled
            />
            <Button onClick={handleGenerateMBA}>Generate</Button>
          </div>
        </div>
      </div>
    )
  }

  // Callback handlers for media line items
  const handleTelevisionMediaLineItemsChange = useCallback((lineItems: any[]) => {
    setTelevisionMediaLineItems(lineItems);
  }, []);

  const handleRadioMediaLineItemsChange = useCallback((lineItems: any[]) => {
    setRadioMediaLineItems(lineItems);
  }, []);

  const handleNewspaperMediaLineItemsChange = useCallback((lineItems: any[]) => {
    setNewspaperMediaLineItems(lineItems);
  }, []);

  const handleMagazinesMediaLineItemsChange = useCallback((lineItems: any[]) => {
    setMagazinesMediaLineItems(lineItems);
  }, []);

  const handleOohMediaLineItemsChange = useCallback((lineItems: any[]) => {
    setOohMediaLineItems(lineItems);
  }, []);

  const handleCinemaMediaLineItemsChange = useCallback((lineItems: any[]) => {
    setCinemaMediaLineItems(lineItems);
  }, []);

  const handleDigitalDisplayMediaLineItemsChange = useCallback((lineItems: any[]) => {
    setDigitalDisplayMediaLineItems(lineItems);
  }, []);

  const handleDigitalAudioMediaLineItemsChange = useCallback((lineItems: any[]) => {
    setDigitalAudioMediaLineItems(lineItems);
  }, []);

  const handleDigitalVideoMediaLineItemsChange = useCallback((lineItems: any[]) => {
    setDigitalVideoMediaLineItems(lineItems);
  }, []);

  const handleBvodMediaLineItemsChange = useCallback((lineItems: any[]) => {
    setBvodMediaLineItems(lineItems);
  }, []);

  const handleIntegrationMediaLineItemsChange = useCallback((lineItems: any[]) => {
    setIntegrationMediaLineItems(lineItems);
  }, []);

  const handleSearchMediaLineItemsChange = useCallback((lineItems: any[]) => {
    setSearchMediaLineItems(lineItems);
  }, []);

  const handleSocialMediaMediaLineItemsChange = useCallback((lineItems: any[]) => {
    setSocialMediaMediaLineItems(lineItems);
  }, []);

  const handleProgDisplayMediaLineItemsChange = useCallback((lineItems: any[]) => {
    setProgDisplayMediaLineItems(lineItems);
  }, []);

  const handleProgVideoMediaLineItemsChange = useCallback((lineItems: any[]) => {
    setProgVideoMediaLineItems(lineItems);
  }, []);

  const handleProgBvodMediaLineItemsChange = useCallback((lineItems: any[]) => {
    setProgBvodMediaLineItems(lineItems);
  }, []);

  const handleProgAudioMediaLineItemsChange = useCallback((lineItems: any[]) => {
    setProgAudioMediaLineItems(lineItems);
  }, []);

  const handleProgOohMediaLineItemsChange = useCallback((lineItems: any[]) => {
    setProgOohMediaLineItems(lineItems);
  }, []);

  const handleInfluencersMediaLineItemsChange = useCallback((lineItems: any[]) => {
    setInfluencersMediaLineItems(lineItems);
  }, []);

  const calculateTotalInvestment = () => {
    return grossMediaTotal + calculateAssembledFee() + calculateAdServingFees() + calculateProductionCosts()
  }

  const handleBillingScheduleChange = useCallback((schedule: BillingScheduleType) => {
    setBillingSchedule(schedule);
    setBillingScheduleData({
      months: schedule.map(entry => ({
        monthYear: entry.month,
        mediaTypeAmounts: {
          search: {
            media: entry.searchAmount,
            fee: entry.searchAmount * (feesearch || 0) / 100,
            isOverridden: false,
            manualMediaAmount: null,
            manualFeeAmount: null
          },
          social: {
            media: entry.socialAmount,
            fee: entry.socialAmount * (feesocial || 0) / 100,
            isOverridden: false,
            manualMediaAmount: null,
            manualFeeAmount: null
          },
          production: {
            media: entry.productionAmount,
            fee: 0,
            isOverridden: false,
            manualMediaAmount: null,
            manualFeeAmount: null
          }
        },
        totalAmount: entry.totalAmount
      })),
      overrides: [],
      isManual: isManualBilling,
      campaignId: id || ""
    });

    // Keep delivery snapshot in sync with latest auto-calculation (e.g. after fee % loads)
    if (schedule.length > 0) {
      const formatter = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" });
      const snapshotMonths: BillingMonth[] = schedule.map(entry => {
        const searchAmount = entry.searchAmount || 0;
        const socialAmount = entry.socialAmount || 0;
        const productionAmount = entry.productionAmount || 0;
        const feeAmount = entry.feeAmount || 0;
        const totalAmount = entry.totalAmount || 0;

        return {
          monthYear: entry.month,
          mediaTotal: formatter.format(searchAmount + socialAmount),
          feeTotal: formatter.format(feeAmount),
          totalAmount: formatter.format(totalAmount),
          adservingTechFees: formatter.format(0),
          production: formatter.format(productionAmount),
          mediaCosts: {
            search: formatter.format(searchAmount),
            socialMedia: formatter.format(socialAmount),
            television: formatter.format(0),
            radio: formatter.format(0),
            newspaper: formatter.format(0),
            magazines: formatter.format(0),
            ooh: formatter.format(0),
            cinema: formatter.format(0),
            digiDisplay: formatter.format(0),
            digiAudio: formatter.format(0),
            digiVideo: formatter.format(0),
            bvod: formatter.format(0),
            integration: formatter.format(0),
            progDisplay: formatter.format(0),
            progVideo: formatter.format(0),
            progBvod: formatter.format(0),
            progAudio: formatter.format(0),
            progOoh: formatter.format(0),
            influencers: formatter.format(0),
            production: formatter.format(productionAmount),
          },
          lineItems: {
            search: searchAmount > 0 ? [{
              id: `auto-search-${entry.month}`,
              header1: "Auto",
              header2: "Auto allocation",
              monthlyAmounts: { [entry.month]: searchAmount },
              totalAmount: searchAmount,
            }] : [],
            socialMedia: socialAmount > 0 ? [{
              id: `auto-social-${entry.month}`,
              header1: "Auto",
              header2: "Auto allocation",
              monthlyAmounts: { [entry.month]: socialAmount },
              totalAmount: socialAmount,
            }] : [],
          },
        };
      });
      deliveryScheduleSnapshotRef.current = deepCloneBillingMonths(snapshotMonths)
    }
  }, [feesearch, feesocial, isManualBilling, id]);

  // Memoize BillingSchedule props to prevent re-renders
  const memoizedSearchBursts = useMemo(() => searchBursts.map(burst => ({
    startDate: new Date(burst.startDate),
    endDate: new Date(burst.endDate),
    budget: Number(burst.budget),
    mediaType: 'search',
    feePercentage: feesearch || 0,
    clientPaysForMedia: false,
    budgetIncludesFees: false
  })), [searchBursts, feesearch]);

  const memoizedSocialMediaBursts = useMemo(() => socialMediaBursts.map(burst => ({
    startDate: new Date(burst.startDate),
    endDate: new Date(burst.endDate),
    budget: Number(burst.budget),
    mediaType: 'social',
    feePercentage: feesocial || 0,
    clientPaysForMedia: false,
    budgetIncludesFees: false
  })), [socialMediaBursts, feesocial]);


  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-2xl font-semibold mb-2">Loading...</h2>
          <p className="text-muted-foreground">Please wait while we load your media plan.</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-2xl font-semibold mb-2">Error</h2>
          <p className="text-muted-foreground">{error}</p>
          <Button onClick={() => router.push("/mediaplans")} className="mt-4">
            Return to Media Plans
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div
      className="w-full min-h-screen"
      style={{
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      <div className="mx-auto w-full max-w-[1920px] px-4 sm:px-5 md:px-6 xl:px-8 2xl:px-10 pt-0 pb-24 space-y-6">
        <MediaPlanEditorHero
          className="mb-2"
          title="Edit Media Plan"
          detail={<p>Update campaign details, media types, and line items.</p>}
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
                name="mp_clientname"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium text-muted-foreground">Client Name</FormLabel>
                    <FormControl>
                      <Combobox
                        value={field.value}
                        onValueChange={(value) => {
                          field.onChange(value)
                          handleClientSelect(clients.find((c) => c.clientname_input === value) || null)
                        }}
                        placeholder="Select a client"
                        searchPlaceholder="Search clients..."
                        options={clients.map((client) => ({
                          value: client.clientname_input,
                          label: client.clientname_input,
                          keywords: `${client.mp_client_name ?? ""} ${client.mbaidentifier ?? ""}`.trim(),
                        }))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="mp_campaignname"
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
                name="mp_brand"
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
                name="mp_campaignstatus"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium text-muted-foreground">Campaign Status</FormLabel>
                    <FormControl>
                      <Combobox
                        value={field.value}
                        onValueChange={field.onChange}
                        placeholder="Select status"
                        searchPlaceholder="Search statuses..."
                        options={[
                          { value: "Active", label: "Active" },
                          { value: "Completed", label: "Completed" },
                          { value: "Draft", label: "Draft" },
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
                          const formattedValue = new Intl.NumberFormat("en-US", {
                            style: "currency",
                            currency: "USD",
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
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
                name="mbanumber"
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

              <FormItem>
                <FormLabel className="text-sm font-medium text-muted-foreground">Media Plan Version</FormLabel>
                <div className="flex h-10 w-full items-center rounded-md border border-border/40 bg-muted/30 px-3 py-2 text-sm text-foreground">
                  <span className="truncate">
                    {mediaPlan?.version_number != null ? String(mediaPlan.version_number) : "—"}
                  </span>
                </div>
                <FormDescription className="text-[11px]">This is the media plan version.</FormDescription>
              </FormItem>
                  </div>
                </div>

                <div className="flex h-full min-w-0 flex-col overflow-hidden rounded-xl border border-border/50 bg-card shadow-sm xl:col-span-1">
                  <div className="border-b border-border/40 bg-muted/20 px-6 pb-3 pt-5">
                    <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Media Types</h3>
                  </div>
                  <div className="grid min-h-0 w-full flex-1 grid-cols-1 content-start gap-x-3 gap-y-1.5 px-6 py-4 md:grid-cols-2">
              {mediaTypes.map(({ name, label }) => (
                <FormField
                  key={name}
                  control={form.control}
                  name={name as FormFieldName}
                  render={({ field }) => (
                    <FormItem className="flex items-center gap-3 space-y-0 py-0.5">
                      <FormControl className="shrink-0">
                        <Switch
                          checked={field.value as boolean}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <FormLabel className="font-normal leading-snug min-w-0 flex-1 cursor-pointer">{label}</FormLabel>
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
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 bg-muted/20 px-6 pb-3 pt-5">
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
                    {mediaTypes.map((medium) => {
                      const isEnabled = form.watch(medium.name as FormFieldName)
                      if (!isEnabled) return null
                      const total = isPartialMBA
                        ? partialMBAValues.mediaTotals[medium.label] || 0
                        : calculateMediaTotal(medium.name)
                      return (
                        <div key={medium.name} className="flex items-center justify-between py-1">
                          <span className="text-sm text-muted-foreground">{medium.label}</span>
                          <span className="text-sm font-medium tabular-nums">
                            {formatMoney(total, {
                              locale: "en-US",
                              currency: "USD",
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </span>
                        </div>
                      )
                    })}
                    <div className="border-t border-border/40" />
                    <div className="flex items-center justify-between py-1">
                      <span className="text-sm font-semibold">Gross Media</span>
                      <span className="text-sm font-semibold tabular-nums">
                        {formatMoney(isPartialMBA ? partialMBAValues.grossMedia : grossMediaTotal, {
                          locale: "en-US",
                          currency: "USD",
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-1">
                      <span className="text-sm font-semibold">Assembled Fee</span>
                      <span className="text-sm font-semibold tabular-nums">
                        {formatMoney(isPartialMBA ? partialMBAValues.assembledFee : calculateAssembledFee(), {
                          locale: "en-US",
                          currency: "USD",
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-1">
                      <span className="text-sm font-semibold">Ad Serving & Tech</span>
                      <span className="text-sm font-semibold tabular-nums">
                        {formatMoney(isPartialMBA ? partialMBAValues.adServing : calculateAdServingFees(), {
                          locale: "en-US",
                          currency: "USD",
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-1">
                      <span className="text-sm font-semibold">Production</span>
                      <span className="text-sm font-semibold tabular-nums">
                        {formatMoney(isPartialMBA ? partialMBAValues.production : calculateProductionCosts(), {
                          locale: "en-US",
                          currency: "USD",
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </span>
                    </div>
                    <div className="border-t-2 border-primary/20 pt-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold">Total Investment (ex GST)</span>
                        <span className="text-sm font-bold tabular-nums text-primary">
                          {formatMoney(
                            isPartialMBA
                              ? partialMBAValues.grossMedia +
                                  partialMBAValues.assembledFee +
                                  partialMBAValues.adServing +
                                  partialMBAValues.production
                              : calculateTotalInvestment(),
                            {
                              locale: "en-US",
                              currency: "USD",
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            }
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
                  </div>
                </div>

                {/* Billing Schedule Section */}
                <div className="flex h-full min-w-0 flex-col overflow-hidden rounded-xl border border-border/50 bg-card shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 bg-muted/20 px-6 pb-3 pt-5">
                    <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Billing Schedule</h3>
                    {!isManualBilling ? (
                      <Button
                        type="button"
                        className="shrink-0"
                        onClick={() => {
                          setManualBillingMonths([...billingMonths])
                          setManualBillingTotal(billingTotal)
                          setIsManualBillingModalOpen(true)
                        }}
                      >
                        Edit Billing
                      </Button>
                    ) : (
                      <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={handleResetBilling}>
                        Reset to Automatic
                      </Button>
                    )}
                  </div>

                  <div className="min-w-0 flex-1 overflow-x-auto px-6 py-4">
              {billingMonths.length === 0 ? (
                <p className="text-sm text-muted-foreground">No billing schedule available. Select campaign dates to generate.</p>
              ) : (
                <div className="flex flex-col space-y-4">
                  {billingMonths.map((month, index) => (
                    <div key={index} className="flex items-center justify-between">
                      <span className="text-sm font-medium">{month.monthYear}</span>
                      <input
                        type="text"
                        className="border border-border rounded px-3 py-2"
                        placeholder="$0.00"
                        value={month.amount}
                        readOnly
                      />
                    </div>
                  ))}
                  <div className="border-t border-border my-4"></div>
                  <div className="flex items-center justify-between font-semibold text-lg">
                    <span>Total Billing:</span>
                    <span>{billingTotal}</span>
                  </div>
                </div>
              )}
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
                      onReset={handleKPIReset}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <div className="relative pb-2 pt-8">
                  <div className="absolute inset-x-0 top-4 h-px bg-border/50" />
                  <h3 className="relative inline-block bg-background pr-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                    Media Containers
                  </h3>
                </div>
                <div className="space-y-6">
              {mediaTypes.map((medium) => {
                if (!form.watch(medium.name as any)) return null;
                
                return (
                  <div key={medium.name} className="mt-4">
                    <Suspense fallback={<MediaContainerSuspenseFallback label={medium.label} />}>
                      {medium.name === "mp_television" && (
                        <TelevisionContainer
                          clientId={selectedClientId}
                          feetelevision={selectedClient?.feesearch || 0}
                          onTotalMediaChange={handleTelevisionTotalChange}
                          onBurstsChange={handleBurstsChange}
                          onInvestmentChange={handleInvestmentChange}
                          onLineItemsChange={() => {}}
                          onTelevisionLineItemsChange={handleTelevisionMediaLineItemsChange}
                          onMediaLineItemsChange={handleTelevisionMediaLineItemsChange}
                          campaignStartDate={form.watch("mp_campaigndates_start")}
                          campaignEndDate={form.watch("mp_campaigndates_end")}
                          campaignBudget={form.watch("mp_campaignbudget")}
                          campaignId={id}
                          mediaTypes={["television"]}
                          initialLineItems={televisionLineItems}
                        />
                      )}
                      {medium.name === "mp_radio" && (
                        <RadioContainer
                          clientId={selectedClientId}
                          feeradio={selectedClient?.feesearch || 0}
                          onTotalMediaChange={handleRadioTotalChange}
                          onBurstsChange={handleBurstsChange}
                          onInvestmentChange={handleInvestmentChange}
                          onLineItemsChange={() => {}}
                          onMediaLineItemsChange={handleRadioMediaLineItemsChange}
                          campaignStartDate={form.watch("mp_campaigndates_start")}
                          campaignEndDate={form.watch("mp_campaigndates_end")}
                          campaignBudget={form.watch("mp_campaignbudget")}
                          campaignId={id}
                          mediaTypes={["radio"]}
                          initialLineItems={radioLineItems}
                        />
                      )}
                      {medium.name === "mp_newspaper" && (
                        <NewspaperContainer
                          clientId={selectedClientId}
                          feenewspapers={selectedClient?.feesearch || 0}
                          onTotalMediaChange={handleNewspaperTotalChange}
                          onBurstsChange={handleBurstsChange}
                          onInvestmentChange={handleInvestmentChange}
                          onLineItemsChange={() => {}}
                          onNewspaperLineItemsChange={() => {}}
                          onMediaLineItemsChange={handleNewspaperMediaLineItemsChange}
                          campaignStartDate={form.watch("mp_campaigndates_start")}
                          campaignEndDate={form.watch("mp_campaigndates_end")}
                          campaignBudget={form.watch("mp_campaignbudget")}
                          campaignId={id}
                          mediaTypes={["newspaper"]}
                          initialLineItems={newspaperLineItems}
                        />
                      )}
                      {medium.name === "mp_magazines" && (
                        <MagazinesContainer
                          clientId={selectedClientId}
                          feemagazines={selectedClient?.feesearch || 0}
                          onTotalMediaChange={handleMagazinesTotalChange}
                          onBurstsChange={handleBurstsChange}
                          onInvestmentChange={handleInvestmentChange}
                          onLineItemsChange={() => {}}
                          onMediaLineItemsChange={handleMagazinesMediaLineItemsChange}
                          campaignStartDate={form.watch("mp_campaigndates_start")}
                          campaignEndDate={form.watch("mp_campaigndates_end")}
                          campaignBudget={form.watch("mp_campaignbudget")}
                          campaignId={id}
                          mediaTypes={["magazines"]}
                          initialLineItems={magazinesLineItems}
                        />
                      )}
                      {medium.name === "mp_ooh" && (
                        <OOHContainer
                          clientId={selectedClientId}
                          feeooh={selectedClient?.feesearch || 0}
                          onTotalMediaChange={handleOohTotalChange}
                          onBurstsChange={handleBurstsChange}
                          onInvestmentChange={handleInvestmentChange}
                          onLineItemsChange={() => {}}
                          onMediaLineItemsChange={handleOohMediaLineItemsChange}
                          campaignStartDate={form.watch("mp_campaigndates_start")}
                          campaignEndDate={form.watch("mp_campaigndates_end")}
                          campaignBudget={form.watch("mp_campaignbudget")}
                          campaignId={id}
                          mediaTypes={["ooh"]}
                          initialLineItems={oohLineItems}
                        />
                      )}
                      {medium.name === "mp_cinema" && (
                        <CinemaContainer
                          clientId={selectedClientId}
                          feecinema={selectedClient?.feesearch || 0}
                          onTotalMediaChange={handleCinemaTotalChange}
                          onBurstsChange={handleBurstsChange}
                          onInvestmentChange={handleInvestmentChange}
                          onLineItemsChange={() => {}}
                          onMediaLineItemsChange={handleCinemaMediaLineItemsChange}
                          campaignStartDate={form.watch("mp_campaigndates_start")}
                          campaignEndDate={form.watch("mp_campaigndates_end")}
                          campaignBudget={form.watch("mp_campaignbudget")}
                          campaignId={id}
                          mediaTypes={["cinema"]}
                          initialLineItems={cinemaLineItems}
                        />
                      )}
                      {medium.name === "mp_digidisplay" && (
                        <DigitalDisplayContainer
                          clientId={selectedClientId}
                          feedigidisplay={selectedClient?.feedigidisplay ?? 0}
                          onTotalMediaChange={handleDigiDisplayTotalChange}
                          onBurstsChange={handleBurstsChange}
                          onInvestmentChange={handleInvestmentChange}
                          onLineItemsChange={setDigitalDisplayItems}
                          onMediaLineItemsChange={handleDigitalDisplayMediaLineItemsChange}
                          campaignStartDate={form.watch("mp_campaigndates_start")}
                          campaignEndDate={form.watch("mp_campaigndates_end")}
                          campaignBudget={form.watch("mp_campaignbudget")}
                          campaignId={id}
                          mediaTypes={["digidisplay"]}
                          initialLineItems={digitalDisplayLineItems}
                        />
                      )}
                      {medium.name === "mp_digiaudio" && (
                        <DigitalAudioContainer
                          clientId={selectedClientId}
                          feedigiaudio={selectedClient?.feesearch || 0}
                          onTotalMediaChange={handleDigiAudioTotalChange}
                          onBurstsChange={handleBurstsChange}
                          onInvestmentChange={handleInvestmentChange}
                          onLineItemsChange={() => {}}
                          onMediaLineItemsChange={handleDigitalAudioMediaLineItemsChange}
                          campaignStartDate={form.watch("mp_campaigndates_start")}
                          campaignEndDate={form.watch("mp_campaigndates_end")}
                          campaignBudget={form.watch("mp_campaignbudget")}
                          campaignId={id}
                          mediaTypes={["digiaudio"]}
                          initialLineItems={digitalAudioLineItems}
                        />
                      )}
                      {medium.name === "mp_digivideo" && (
                        <DigitalVideoContainer
                          clientId={selectedClientId}
                          feedigivideo={selectedClient?.feesearch || 0}
                          onTotalMediaChange={handleDigiVideoTotalChange}
                          onBurstsChange={handleBurstsChange}
                          onInvestmentChange={handleInvestmentChange}
                          onLineItemsChange={() => {}}
                          onMediaLineItemsChange={handleDigitalVideoMediaLineItemsChange}
                          campaignStartDate={form.watch("mp_campaigndates_start")}
                          campaignEndDate={form.watch("mp_campaigndates_end")}
                          campaignBudget={form.watch("mp_campaignbudget")}
                          campaignId={id}
                          mediaTypes={["digivideo"]}
                          initialLineItems={digitalVideoLineItems}
                        />
                      )}
                      {medium.name === "mp_bvod" && (
                        <BVODContainer
                          clientId={selectedClientId}
                          feebvod={selectedClient?.feesearch || 0}
                          onTotalMediaChange={handleBVODTotalChange}
                          onBurstsChange={handleBurstsChange}
                          onInvestmentChange={handleInvestmentChange}
                          onLineItemsChange={() => {}}
                          onMediaLineItemsChange={handleBvodMediaLineItemsChange}
                          campaignStartDate={form.watch("mp_campaigndates_start")}
                          campaignEndDate={form.watch("mp_campaigndates_end")}
                          campaignBudget={form.watch("mp_campaignbudget")}
                          campaignId={id}
                          mediaTypes={["bvod"]}
                          initialLineItems={bvodLineItems}
                        />
                      )}
                      {medium.name === "mp_integration" && (
                        <IntegrationContainer
                          clientId={selectedClientId}
                          feeintegration={selectedClient?.feesearch || 0}
                          onTotalMediaChange={handleIntegrationTotalChange}
                          onBurstsChange={handleBurstsChange}
                          onInvestmentChange={handleInvestmentChange}
                          onLineItemsChange={() => {}}
                          onMediaLineItemsChange={handleIntegrationMediaLineItemsChange}
                          campaignStartDate={form.watch("mp_campaigndates_start")}
                          campaignEndDate={form.watch("mp_campaigndates_end")}
                          campaignBudget={form.watch("mp_campaignbudget")}
                          campaignId={id}
                          mediaTypes={["integration"]}
                          initialLineItems={integrationLineItems}
                        />
                      )}
                      {medium.name === "mp_search" && (
                        <SearchContainer
                          clientId={selectedClientId}
                          feesearch={feesearch || 0}
                          onTotalMediaChange={handleSearchTotalChange}
                          onBurstsChange={handleSearchBurstsChange}
                          onInvestmentChange={handleInvestmentChange}
                          onLineItemsChange={() => {}}
                          onMediaLineItemsChange={handleSearchMediaLineItemsChange}
                          campaignStartDate={form.watch("mp_campaigndates_start")}
                          campaignEndDate={form.watch("mp_campaigndates_end")}
                          campaignBudget={form.watch("mp_campaignbudget")}
                          campaignId={id}
                          mediaTypes={["search"]}
                          initialLineItems={searchLineItems}
                        />
                      )}
                      {medium.name === "mp_socialmedia" && (
                        <SocialMediaContainer
                          clientId={selectedClientId}
                          feesocial={feesocial || 0}
                          onTotalMediaChange={handleSocialMediaTotalChange}
                          onBurstsChange={handleSocialMediaBurstsChange}
                          onInvestmentChange={handleInvestmentChange}
                          onLineItemsChange={() => {}}
                          onSocialMediaLineItemsChange={() => {}}
                          onMediaLineItemsChange={handleSocialMediaMediaLineItemsChange}
                          campaignStartDate={form.watch("mp_campaigndates_start")}
                          campaignEndDate={form.watch("mp_campaigndates_end")}
                          campaignBudget={form.watch("mp_campaignbudget")}
                          campaignId={id}
                          mediaTypes={["socialmedia"]}
                          initialLineItems={socialMediaLineItems}
                        />
                      )}
                      {medium.name === "mp_progdisplay" && (
                        <ProgDisplayContainer
                          clientId={selectedClientId}
                          feeprogdisplay={feeprogdisplay || 0}
                          onTotalMediaChange={handleProgDisplayTotalChange}
                          onBurstsChange={handleBurstsChange}
                          onInvestmentChange={handleInvestmentChange}
                          onLineItemsChange={() => {}}
                          onMediaLineItemsChange={handleProgDisplayMediaLineItemsChange}
                          campaignStartDate={form.watch("mp_campaigndates_start")}
                          campaignEndDate={form.watch("mp_campaigndates_end")}
                          campaignBudget={form.watch("mp_campaignbudget")}
                          campaignId={id}
                          mediaTypes={["progdisplay"]}
                          initialLineItems={progDisplayLineItems}
                        />
                      )}
                      {medium.name === "mp_progvideo" && (
                        <ProgVideoContainer
                          clientId={selectedClientId}
                          feeprogvideo={feeprogvideo || 0}
                          onTotalMediaChange={handleProgVideoTotalChange}
                          onBurstsChange={handleBurstsChange}
                          onInvestmentChange={handleInvestmentChange}
                          onLineItemsChange={() => {}}
                          onMediaLineItemsChange={handleProgVideoMediaLineItemsChange}
                          campaignStartDate={form.watch("mp_campaigndates_start")}
                          campaignEndDate={form.watch("mp_campaigndates_end")}
                          campaignBudget={form.watch("mp_campaignbudget")}
                          campaignId={id}
                          mediaTypes={["progvideo"]}
                          initialLineItems={progVideoLineItems}
                        />
                      )}
                      {medium.name === "mp_progbvod" && (
                        <ProgBVODContainer
                          clientId={selectedClientId}
                          feeprogbvod={feeprogbvod || 0}
                          onTotalMediaChange={handleProgBvodTotalChange}
                          onBurstsChange={handleBurstsChange}
                          onInvestmentChange={handleInvestmentChange}
                          onLineItemsChange={() => {}}
                          onMediaLineItemsChange={handleProgBvodMediaLineItemsChange}
                          campaignStartDate={form.watch("mp_campaigndates_start")}
                          campaignEndDate={form.watch("mp_campaigndates_end")}
                          campaignBudget={form.watch("mp_campaignbudget")}
                          campaignId={id}
                          mediaTypes={["progbvod"]}
                          initialLineItems={progBvodLineItems}
                        />
                      )}
                      {medium.name === "mp_progaudio" && (
                        <ProgAudioContainer
                          clientId={selectedClientId}
                          feeprogaudio={feeprogaudio || 0}
                          onTotalMediaChange={handleProgAudioTotalChange}
                          onBurstsChange={handleBurstsChange}
                          onInvestmentChange={handleInvestmentChange}
                          onLineItemsChange={() => {}}
                          onMediaLineItemsChange={handleProgAudioMediaLineItemsChange}
                          campaignStartDate={form.watch("mp_campaigndates_start")}
                          campaignEndDate={form.watch("mp_campaigndates_end")}
                          campaignBudget={form.watch("mp_campaignbudget")}
                          campaignId={id}
                          mediaTypes={["progaudio"]}
                          initialLineItems={progAudioLineItems}
                        />
                      )}
                      {medium.name === "mp_progooh" && (
                        <ProgOOHContainer
                          clientId={selectedClientId}
                          feeprogooh={feeprogooh || 0}
                          onTotalMediaChange={handleProgOohTotalChange}
                          onBurstsChange={handleBurstsChange}
                          onInvestmentChange={handleInvestmentChange}
                          onLineItemsChange={() => {}}
                          onMediaLineItemsChange={handleProgOohMediaLineItemsChange}
                          campaignStartDate={form.watch("mp_campaigndates_start")}
                          campaignEndDate={form.watch("mp_campaigndates_end")}
                          campaignBudget={form.watch("mp_campaignbudget")}
                          campaignId={id}
                          mediaTypes={["progooh"]}
                          initialLineItems={progOohLineItems}
                        />
                      )}
                      {medium.name === "mp_influencers" && (
                        <InfluencersContainer
                          clientId={selectedClientId}
                          feeinfluencers={feecontentcreator || 0}
                          onTotalMediaChange={handleInfluencersTotalChange}
                          onBurstsChange={handleBurstsChange}
                          onInvestmentChange={handleInvestmentChange}
                          onLineItemsChange={() => {}}
                          onMediaLineItemsChange={handleInfluencersMediaLineItemsChange}
                          campaignStartDate={form.watch("mp_campaigndates_start")}
                          campaignEndDate={form.watch("mp_campaigndates_end")}
                          campaignBudget={form.watch("mp_campaignbudget")}
                          campaignId={id}
                          mediaTypes={["influencers"]}
                          initialLineItems={influencersLineItems}
                        />
                      )}
                    </Suspense>
                  </div>
                );
              })}
                </div>
              </div>



          <BillingSchedule
            searchBursts={memoizedSearchBursts}
            socialMediaBursts={memoizedSocialMediaBursts}
          productionBursts={[]}
            campaignStartDate={campaignStartDate || new Date()}
            campaignEndDate={campaignEndDate || new Date()}
            campaignBudget={Number(campaignBudget || 0)}
            onBillingScheduleChange={handleBillingScheduleChange}
          />
            </form>
          </Form>
        </div>
      </div>

      <SavingModal isOpen={isSaving} />

      <OutcomeModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={modalTitle}
        outcome={modalOutcome}
        isLoading={modalLoading}
      />

      {/* Manual Billing Modal */}
      <Dialog open={isManualBillingModalOpen} onOpenChange={setIsManualBillingModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Manual Billing Schedule</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {manualBillingMonths.map((month, index) => (
              <div key={index} className="flex items-center justify-between">
                <span className="text-sm font-medium">{month.monthYear}</span>
                <Input
                  type="text"
                  className="w-32"
                  value={month.amount}
                  onChange={(e) => handleManualBillingChange(index, e.target.value)}
                  placeholder="$0.00"
                />
              </div>
            ))}
            <div className="border-t border-border my-4"></div>
            <div className="flex items-center justify-between font-semibold text-lg">
              <span>Total:</span>
              <span>{manualBillingTotal}</span>
            </div>
            {parseFloat(manualBillingTotal.replace(/[^0-9.]/g, "")) !== parseFloat(form.getValues("mp_campaignbudget").toString()) && (
              <div className="text-red-500 text-sm mt-2">
                Billing total must equal campaign budget
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsManualBillingModalOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleManualBillingSave}
              className="bg-success text-white hover:bg-success-hover"
            >
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isPartialMBAModalOpen} onOpenChange={setIsPartialMBAModalOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Partial MBA Override</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 p-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Delivery months</label>
              <MultiSelectCombobox
                options={(billingSchedule || []).map((m: any): MultiSelectOption => ({ value: m.monthYear, label: m.monthYear }))}
                values={partialMBAMonthYears}
                onValuesChange={handlePartialMBAMonthsChange}
                placeholder="Select months"
                allSelectedText="All months"
              />
            </div>
            <h4 className="font-semibold text-md border-b pb-2">Media Totals (Expandable by line item)</h4>
            <Accordion type="multiple" className="w-full">
              {Object.entries(partialMBALineItemsByMedia).map(([mediaKey, items]) => (
                <AccordionItem key={mediaKey} value={mediaKey}>
                  <AccordionTrigger
                    leading={
                      <Checkbox
                        checked={(partialMBASelectedLineItemIds[mediaKey] || []).length > 0}
                        onCheckedChange={(next) => handlePartialMBAChannelToggle(mediaKey, Boolean(next))}
                      />
                    }
                  >
                    <div className="flex w-full items-center justify-between pr-4">
                      <span className="text-sm font-medium">{mediaKey}</span>
                      <span className="text-sm">
                        {formatMoney(partialMBAValues.mediaTotals[mediaKey] || 0, {
                          locale: "en-US",
                          currency: "USD",
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-2 pl-2">
                      {items.map((item) => {
                        const checked = (partialMBASelectedLineItemIds[mediaKey] || []).includes(item.lineItemId)
                        return (
                          <div key={item.lineItemId} className="flex items-center justify-between gap-2 text-sm">
                            <label className="flex items-center gap-2">
                              <Checkbox
                                checked={checked}
                                onCheckedChange={(next) => handlePartialLineItemToggle(mediaKey, item.lineItemId, Boolean(next))}
                              />
                              <span>{item.header1} {item.header2}</span>
                            </label>
                            <span>
                              {formatMoney(item.amount, {
                                locale: "en-US",
                                currency: "USD",
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPartialMBAModalOpen(false)}>Cancel</Button>
            <Button onClick={handlePartialMBASave}>Save Partial MBA</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div
        aria-hidden="true"
        style={{ height: stickyBarHeight ? stickyBarHeight + 24 : 120 }}
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
              Warning: Media placement outside campaign dates
            </div>
          )}
          <CampaignExportsSection
            variant="embedded"
            mbaNumber={mbanumberWatched?.trim() ? String(mbanumberWatched) : "—"}
            isBusy={isSaving || modalLoading || loading}
            ariaStatus=""
            className="z-40 max-w-[min(98vw,88rem)]"
          >
            <Button
              type="button"
              onClick={handleSaveCampaign}
              disabled={isSaving || loading || modalLoading}
              className="h-9 shrink-0 rounded-full bg-success px-4 text-white shadow-sm hover:bg-success-hover focus-visible:ring-2 focus-visible:ring-ring"
            >
              {isSaving ? "Saving..." : "Save Campaign"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleGenerateMBA}
              disabled={loading || modalLoading}
              className="h-9 shrink-0 rounded-full border-border px-4 focus-visible:ring-2 focus-visible:ring-ring"
            >
              {modalLoading && modalTitle === "Generating MBA" ? "Generating..." : "Generate MBA"}
            </Button>
            <div className="md:hidden">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-9 rounded-full px-4 focus-visible:ring-2 focus-visible:ring-ring"
                    disabled={loading || modalLoading}
                  >
                    <MoreHorizontal className="mr-1.5 h-4 w-4" />
                    More
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={handleDownloadMediaPlan}
                    disabled={loading || modalLoading}
                  >
                    Download media plan
                  </DropdownMenuItem>
                  {showAaMediaPlanDownload ? (
                    <DropdownMenuItem
                      onClick={handleDownloadAdvertisingAssociatesMediaPlan}
                      disabled={loading || modalLoading}
                      className="text-brand-dark focus:bg-highlight/25 focus:text-brand-dark"
                    >
                      Media Plan (AA)
                    </DropdownMenuItem>
                  ) : null}
                  <DropdownMenuItem
                    onClick={handleSaveAndGenerateAll}
                    disabled={loading || modalLoading || isSaving}
                  >
                    Save &amp; generate all
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <Button
              type="button"
              onClick={handleDownloadMediaPlan}
              disabled={loading || modalLoading}
              className="hidden h-9 rounded-full px-4 py-2 text-white md:inline-flex bg-lime hover:bg-lime/90 focus-visible:ring-2 focus-visible:ring-ring"
            >
              {modalLoading &&
              (modalTitle === "Downloading Media Plan" ||
                modalTitle === "Downloading AA Media Plan") ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              <span className="ml-2">
                {modalLoading && modalTitle === "Downloading Media Plan"
                  ? "Downloading..."
                  : "Media Plan"}
              </span>
            </Button>
            {showAaMediaPlanDownload ? (
              <Button
                type="button"
                onClick={handleDownloadAdvertisingAssociatesMediaPlan}
                disabled={loading || modalLoading}
                className="hidden h-9 rounded-full px-4 py-2 md:inline-flex bg-highlight text-brand-dark hover:bg-highlight/85 focus-visible:ring-2 focus-visible:ring-ring"
              >
                {modalLoading && modalTitle === "Downloading AA Media Plan" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                <span className="ml-2">
                  {modalLoading && modalTitle === "Downloading AA Media Plan"
                    ? "Downloading..."
                    : "Media Plan (AA)"}
                </span>
              </Button>
            ) : null}
            <Button
              type="button"
              onClick={handleSaveAndGenerateAll}
              disabled={loading || modalLoading || isSaving}
              className="hidden h-9 rounded-full px-4 py-2 text-white md:inline-flex bg-brand-dark hover:bg-brand-dark/90 focus-visible:ring-2 focus-visible:ring-ring"
            >
              {(modalLoading && modalTitle === "Processing") || isSaving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileText className="h-4 w-4" />
              )}
              <span className="ml-2">
                {(modalLoading && modalTitle === "Processing") || isSaving
                  ? "Processing..."
                  : "Save & Generate All"}
              </span>
            </Button>
          </CampaignExportsSection>
        </div>
      </div>
    </div>
  )
} 