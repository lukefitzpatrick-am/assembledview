"use client"

import { useState, useEffect, lazy, Suspense } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { format } from "date-fns"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { CalendarIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { useMediaPlanContext } from "@/contexts/MediaPlanContext"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { toast } from "@/components/ui/use-toast"
import { useRouter } from "next/navigation"
import { Table, TableBody, TableCell, TableHeader, TableRow, TableHead, TableFooter } from "@/components/ui/table"
import { Download, FileText } from "lucide-react"
import type { BillingBurst, BillingMonth } from "@/lib/billing/types" // adjust path if needed
import { generateMediaPlan, MediaPlanHeader, LineItem, MediaItems } from '@/lib/generateMediaPlan'
import { generateMBA, MBAData } from '@/lib/generateMBA'
import { saveAs } from 'file-saver'
import { createMediaPlan, createMediaPlanVersion, editMediaPlan } from "@/lib/api"

const mediaPlanSchema = z.object({
  mp_clientname: z.string().min(1, "Client name is required"),
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

interface Client {
  id: number
  clientname_input: string
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
const ProductionContainer = lazy(() => import("@/components/media-containers/ProductionContainer"))

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
  const [clients, setClients] = useState<Client[]>([])
  const [reportId, setReportId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [selectedClientId, setSelectedClientId] = useState<string>("")
  const { setMbaNumber } = useMediaPlanContext() 
  const [burstsData, setBurstsData] = useState([])
  const [isDownloading, setIsDownloading] = useState(false)
  const [clientAddress, setClientAddress] = useState("")
  const [clientSuburb, setClientSuburb] = useState("")
  const [clientState, setClientState] = useState("")
  const [clientPostcode, setClientPostcode] = useState("")
  const [saveStatus, setSaveStatus] = useState<{ message: string; status: 'pending' | 'success' | 'error' }[]>([]);
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [partialMBAError, setPartialMBAError] = useState<string | null>(null);
  const [manualBillingError, setManualBillingError] = useState<string | null>(null);

  // Search
  const [feesearch, setFeeSearch] = useState<number | null>(null)
  const [searchTotal, setSearchTotal] = useState(0)
  const [searchBursts, setSearchBursts] = useState<BillingBurst[]>([])
  const [searchItems, setSearchItems] = useState<LineItem[]>([]);
  const [searchFeeTotal, setSearchFeeTotal,] = useState(0);

  //Social Media
  const [feesocial, setFeeSocial] = useState<number | null>(null)
  const [socialmediaTotal, setSocialMediaTotal] = useState<number>(0)
  const [socialMediaBursts, setSocialMediaBursts] = useState<BillingBurst[]>([])
  const [socialMediaItems, setSocialMediaItems] = useState<LineItem[]>([]);
  const [socialMediaFeeTotal, setSocialMediaFeeTotal] = useState(0);

  //Influencers
  const [feeinfluencers, setFeeInfluencers] = useState<number | null>(null)
  const [influencersTotal, setInfluencersTotal] = useState(0)
  const [influencersBursts, setInfluencersBursts] = useState<BillingBurst[]>([])
  const [influencersItems, setInfluencersItems] = useState<LineItem[]>([])
  const [influencersFeeTotal, setInfluencersFeeTotal] = useState(0)

  //BVOD
  const [feebvod, setFeeBVOD] = useState<number | null>(null)
  const [bvodItems, setBVODItems] = useState<LineItem[]>([]);
  const [bvodTotal, setBvodTotal] = useState(0);
  const [bvodBursts, setBvodBursts] = useState<BillingBurst[]>([]);
  const [bvodFeeTotal, setBvodFeeTotal] = useState(0);

  //Digi Audio
  const [feedigiaudio, setFeeDigiAudio] = useState<number | null>(null)
  const [digiAudioTotal, setDigiAudioTotal] = useState(0)
  const [digiAudioFeeTotal, setDigiAudioFeeTotal] = useState(0)
  const [digiAudioBursts, setDigiAudioBursts] = useState<BillingBurst[]>([])
  const [digiAudioItems, setDigiAudioItems] = useState<LineItem[]>([])

  //Digi Display
  const [feedigidisplay, setFeeDigiDisplay] = useState<number | null>(null)
  const [digiDisplayTotal, setDigiDisplayTotal] = useState(0)
  const [digiDisplayFeeTotal, setDigiDisplayFeeTotal] = useState(0)
  const [digiDisplayBursts, setDigiDisplayBursts] = useState<BillingBurst[]>([])
  const [digiDisplayItems, setDigiDisplayItems] = useState<LineItem[]>([])

  //Digi Video
  const [feedigivideo, setFeeDigiVideo] = useState<number | null>(null)
  const [digiVideoTotal, setDigiVideoTotal] = useState(0)
  const [digiVideoFeeTotal, setDigiVideoFeeTotal] = useState(0)
  const [digiVideoBursts, setDigiVideoBursts] = useState<BillingBurst[]>([])
  const [digiVideoItems, setDigiVideoItems] = useState<LineItem[]>([])

  //Prog Display
  const [feeprogdisplay, setFeeProgDisplay] = useState<number | null>(null)
  const [progDisplayTotal, setProgDisplayTotal] = useState(0)
  const [progDisplayFeeTotal, setProgDisplayFeeTotal] = useState(0)
  const [progDisplayBursts, setProgDisplayBursts] = useState<BillingBurst[]>([])
  const [progDisplayItems, setProgDisplayItems] = useState<LineItem[]>([]);

  //Prog Video
  const [feeprogvideo, setFeeProgVideo] = useState<number | null>(null)
  const [progVideoTotal, setProgVideoTotal] = useState(0)
  const [progVideoFeeTotal, setProgVideoFeeTotal] = useState(0)
  const [progVideoBursts, setProgVideoBursts] = useState<BillingBurst[]>([])
  const [progVideoItems, setProgVideoItems] = useState<LineItem[]>([]);

  //Prog Bvod
  const [feeprogbvod, setFeeProgBvod] = useState<number | null>(null)
  const [progBvodTotal, setProgBvodTotal] = useState(0)
  const [progBvodFeeTotal, setProgBvodFeeTotal] = useState(0)
  const [progBvodBursts, setProgBvodBursts] = useState<BillingBurst[]>([])
  const [progBvodItems, setProgBvodItems] = useState<LineItem[]>([]);

  //Prog Audio
  const [feeprogaudio, setFeeProgAudio] = useState<number | null>(null)
  const [progAudioTotal, setProgAudioTotal] = useState(0)
  const [progAudioFeeTotal, setProgAudioFeeTotal] = useState(0)
  const [progAudioBursts, setProgAudioBursts] = useState<BillingBurst[]>([])
  const [progAudioItems, setProgAudioItems] = useState<LineItem[]>([])

  //Prog Ooh
  const [feeprogooh, setFeeProgOoh] = useState<number | null>(null)
  const [progOohTotal, setProgOohTotal] = useState(0)
  const [progOohBursts, setProgOohBursts] = useState<BillingBurst[]>([])
  const [progOohItems, setProgOohItems] = useState<LineItem[]>([]);
  const [progOohFeeTotal, setProgOohFeeTotal] = useState(0);

  //Integration
  const [feeintegration, setFeeIntegration] = useState<number | null>(null)
  const [integrationTotal, setIntegrationTotal] = useState(0)
  const [integrationFeeTotal, setIntegrationFeeTotal] = useState(0)
  const [integrationBursts, setIntegrationBursts] = useState<BillingBurst[]>([])
  const [integrationItems, setIntegrationItems] = useState<LineItem[]>([]);

  //Content Creator
  const [feecontentcreator, setFeeContentCreator] = useState<number | null>(null)

  // Traditional Media

  //Cinema
  const [feecinema, setFeeCinema] = useState<number | null>(null)
  const [cinemaTotal, setCinemaTotal] = useState(0)
  const [cinemaFeeTotal, setCinemaFeeTotal] = useState(0)
  const [cinemaBursts, setCinemaBursts] = useState<BillingBurst[]>([])
  const [cinemaItems, setCinemaItems] = useState<LineItem[]>([])

 // ─ Television
  const [feeTelevision, setFeeTelevision] = useState<number | null>(null)
  const [televisionItems, setTelevisionItems] = useState<LineItem[]>([])
  const [televisionBursts, setTelevisionBursts] = useState<BillingBurst[]>([])
  const [televisionTotal, setTelevisionTotal] = useState(0)
  const [televisionFeeTotal, setTelevisionFeeTotal] = useState(0)

  // ─ Radio
  const [feeRadio, setFeeRadio] = useState<number | null>(null)
  const [radioItems, setRadioItems] = useState<LineItem[]>([])
  const [radioBursts, setRadioBursts] = useState<BillingBurst[]>([])
  const [radioTotal, setRadioTotal] = useState(0)
  const [radioFeeTotal, setRadioFeeTotal] = useState(0)

  // ─ Newspapers
  const [feeNewspapers, setFeeNewspapers] = useState<number | null>(null)
  const [newspaperItems, setNewspaperItems] = useState<LineItem[]>([])
  const [newspaperBursts, setNewspaperBursts] = useState<BillingBurst[]>([])
  const [newspaperTotal, setNewspaperTotal] = useState(0)
  const [newspaperFeeTotal, setNewspaperFeeTotal] = useState(0)

  // ─ Magazines
  const [feeMagazines, setFeeMagazines] = useState<number | null>(null)
  const [magazineItems, setMagazineItems] = useState<LineItem[]>([])
  const [magazineBursts, setMagazineBursts] = useState<BillingBurst[]>([])
  const [magazineTotal, setMagazineTotal] = useState(0)
  const [magazineFeeTotal, setMagazineFeeTotal] = useState(0)

  // ─ OOH
  const [feeOoh, setFeeOoh] = useState<number | null>(null)
  const [oohItems, setOohItems] = useState<LineItem[]>([])
  const [oohBursts, setOohBursts] = useState<BillingBurst[]>([])
  const [oohTotal, setOohTotal] = useState(0)
  const [oohFeeTotal, setOohFeeTotal] = useState(0)

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
  const [originalManualBillingMonths, setOriginalManualBillingMonths] = useState<BillingMonth[]>([]);
  const [originalManualBillingTotal, setOriginalManualBillingTotal] = useState<string>("$0.00");
  const [billingMonths, setBillingMonths] = useState<BillingMonth[]>([])
  const [billingTotal, setBillingTotal] = useState("$0.00")  
  const [grossMediaTotal, setGrossMediaTotal] = useState(0);
  const [totalInvestment, setTotalInvestment] = useState(0);
  const [isPartialMBA, setIsPartialMBA] = useState(false);
  const [isPartialMBAModalOpen, setIsPartialMBAModalOpen] = useState(false);

  const form = useForm<MediaPlanFormValues>({
    resolver: zodResolver(mediaPlanSchema),
    defaultValues: {
      mp_clientname: "",
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


  const currencyFormatter = new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
  });

  function bufferToBase64(buffer: ArrayBuffer) {
    let binary = ''
    const bytes = new Uint8Array(buffer)
    bytes.forEach(b => binary += String.fromCharCode(b))
    return window.btoa(binary)
  }

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

  function calculateBillingSchedule() {
    const start = form.watch("mp_campaigndates_start");
    const end   = form.watch("mp_campaigndates_end");
    if (!start || !end) return;

    // 1. Build a more detailed map to hold costs per media type for each month.
    const map: Record<string, {
      totalMedia: number;
      totalFee: number;
      adServing: number,
      mediaCosts: Record<string, number>;
  }> = {};
  
  let cur = new Date(start);
  while (cur <= end) {
      const key = format(cur, "MMMM yyyy");
      map[key] = {
          totalMedia: 0,
          totalFee: 0,
          adServing: 0,
          mediaCosts: { search: 0, socialMedia: 0, progAudio: 0, cinema: 0, digiAudio: 0, digiDisplay: 0, digiVideo: 0, progDisplay: 0, progVideo: 0, progBvod: 0, progOoh: 0, television: 0, radio: 0, newspaper: 0, magazines: 0, ooh: 0, bvod: 0, integration: 0, influencers: 0 /* Add other media types as needed */ }
      };
      cur.setMonth(cur.getMonth() + 1);
      cur.setDate(1);
  }
    // 2. Distribute a single burst and track its media type.
    function distribute(burst: BillingBurst, mediaType: 'search' | 'socialMedia' | 'progAudio' | 'cinema' | 'digiAudio' | 'digiDisplay' | 'digiVideo' | 'progDisplay' | 'progVideo' | 'progBvod' | 'progOoh' | 'television' | 'radio' | 'newspaper' | 'magazines' | 'ooh' | 'bvod' | 'integration' | 'influencers') {
      const s = new Date(burst.startDate);
      const e = new Date(burst.endDate);
      if (isNaN(s.getTime()) || isNaN(e.getTime()) || s > e) return; // Guard against invalid dates
      
      const daysTotal = Math.ceil((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      if (daysTotal <= 0) return;

      let d = new Date(s);
      while (d <= e) {
          const key = format(d, "MMMM yyyy");
          if (map[key]) {
              const monthStart = new Date(d.getFullYear(), d.getMonth(), 1);
              const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0);
              const sliceStart = Math.max(s.getTime(), monthStart.getTime());
              const sliceEnd = Math.min(e.getTime(), monthEnd.getTime());
              const daysInMonth = Math.ceil((sliceEnd - sliceStart) / (1000 * 60 * 60 * 24)) + 1;
              
              const mediaShare = burst.mediaAmount * (daysInMonth / daysTotal);
              const feeShare = burst.feeAmount * (daysInMonth / daysTotal);

              map[key].mediaCosts[mediaType] += mediaShare;
              map[key].totalMedia += mediaShare;
              map[key].totalFee += feeShare;
          }
          d.setMonth(d.getMonth() + 1);
          d.setDate(1);
      }
  }

    // 3. Distribute all bursts, passing their type.
    searchBursts.forEach(b => distribute(b, 'search'));
    socialMediaBursts.forEach(b => distribute(b, 'socialMedia'));
    progAudioBursts.forEach(b => distribute(b, 'progAudio'));
    cinemaBursts.forEach(b => distribute(b, 'cinema'));
    digiAudioBursts.forEach(b => distribute(b, 'digiAudio'));
    digiDisplayBursts.forEach(b => distribute(b, 'digiDisplay'));
    digiVideoBursts.forEach(b => distribute(b, 'digiVideo'));
    progDisplayBursts.forEach(b => distribute(b, 'progDisplay'));
    progVideoBursts.forEach(b => distribute(b, 'progVideo'));
    progBvodBursts.forEach(b => distribute(b, 'progBvod'));
    progOohBursts.forEach(b => distribute(b, 'progOoh'));
    televisionBursts.forEach(b => distribute(b, 'television'));
    radioBursts.forEach(b => distribute(b, 'radio'));
    newspaperBursts.forEach(b => distribute(b, 'newspaper'));
    magazineBursts.forEach(b => distribute(b, 'magazines'));
    oohBursts.forEach(b => distribute(b, 'ooh'));
    bvodBursts.forEach(b => distribute(b, 'bvod'));
    integrationBursts.forEach(b => distribute(b, 'integration'));
    influencersBursts.forEach(b => distribute(b, 'influencers'));

    // 4. Format into BillingMonth[]
    const formatter = new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency: "AUD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
  });

  //distribute ad serving fees

  function distributeAdServing(burst: BillingBurst, mediaType: string) {
    const s = new Date(burst.startDate)
    const e = new Date(burst.endDate)
    if (burst.noAdserving) return;
    if (isNaN(s.getTime()) || isNaN(e.getTime()) || s > e) return
  
    const daysTotal = Math.ceil((e.getTime() - s.getTime()) / (1000*60*60*24)) + 1
    let d = new Date(s)
  
    while (d <= e) {
      const monthKey = format(d, "MMMM yyyy")
      if (map[monthKey]) {
        const monthStart = new Date(d.getFullYear(), d.getMonth(), 1)
        const monthEnd   = new Date(d.getFullYear(), d.getMonth()+1, 0)
        const sliceStart = Math.max(s.getTime(), monthStart.getTime())
        const sliceEnd   = Math.min(e.getTime(), monthEnd.getTime())
        const daysInMonth = Math.ceil((sliceEnd - sliceStart)/(1000*60*60*24)) + 1
        const share = burst.deliverables * (daysInMonth/daysTotal)
  
        const rate = getRateForMediaType(mediaType)
        const cost = burst.buyType === "cpm"
          ? (share /1000 ) * rate
          : (share * rate)
  
        map[monthKey].adServing += cost
      }
      d.setMonth(d.getMonth()+1)
      d.setDate(1)
    }
  }

  // 5. Distribute ad serving fees
  digiAudioBursts.forEach(b => distributeAdServing(b, 'digiAudio'))
  digiDisplayBursts.forEach(b => distributeAdServing(b, 'digiDisplay'))
  digiVideoBursts.forEach(b => distributeAdServing(b, 'digiVideo'))
  bvodBursts.forEach(b => distributeAdServing(b, 'bvod'))
  progAudioBursts.forEach(b => distributeAdServing(b, 'progAudio'))
  progVideoBursts.forEach(b => distributeAdServing(b, 'progVideo'))
  progBvodBursts.forEach(b => distributeAdServing(b, 'progBvod'))
  progOohBursts.forEach(b => distributeAdServing(b, 'progOoh'))
  progDisplayBursts.forEach(b => distributeAdServing(b, 'progDisplay'))

  const months: BillingMonth[] = Object.entries(map).map(
      ([monthYear, { totalMedia, totalFee, adServing,mediaCosts }]) => ({
          monthYear,
          mediaTotal: formatter.format(totalMedia),
          feeTotal: formatter.format(totalFee),
          totalAmount: formatter.format(totalMedia + totalFee + adServing),
          adservingTechFees: formatter.format(adServing),
          production: "$0.00",
          mediaCosts: { // This now contains the detailed, calculated breakdown
              search: formatter.format(mediaCosts.search || 0),
              socialMedia: formatter.format(mediaCosts.socialMedia || 0),
              digiAudio: formatter.format(mediaCosts.digiAudio || 0),
              digiDisplay: formatter.format(mediaCosts.digiDisplay || 0),
              digiVideo: formatter.format(mediaCosts.digiVideo || 0),
              progAudio: formatter.format(mediaCosts.progAudio || 0),
              cinema: formatter.format(mediaCosts.cinema || 0),
              progDisplay: formatter.format(mediaCosts.progDisplay || 0),
              progVideo: formatter.format(mediaCosts.progVideo || 0),
              progBvod: formatter.format(mediaCosts.progBvod || 0),
              progOoh: formatter.format(mediaCosts.progOoh || 0),
              bvod: formatter.format(mediaCosts.bvod || 0),
              television: formatter.format(mediaCosts.television || 0),
              radio: formatter.format(mediaCosts.radio || 0),
              newspaper: formatter.format(mediaCosts.newspaper || 0),
              magazines: formatter.format(mediaCosts.magazines || 0),
              ooh: formatter.format(mediaCosts.ooh || 0),
              integration: formatter.format(mediaCosts.integration || 0),
              influencers: formatter.format(mediaCosts.influencers || 0),
             }
      })
  ); 
  
  setBillingMonths(months);
  const grandTotal = months.reduce((sum, m) => sum + parseFloat(m.totalAmount.replace(/[^0-9.-]/g, "")), 0);
  setBillingTotal(formatter.format(grandTotal));
}

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
    setProgOohTotal(totalMedia);
    setProgOohFeeTotal(totalFee);
  };

  const handleProgAudioTotalChange = (totalMedia: number, totalFee: number) => {
    setProgAudioTotal(totalMedia);
    setProgAudioFeeTotal(totalFee);
  };

  // Offline Media
  
  const handleCinemaTotalChange = (totalMedia: number, totalFee: number) => {
    setCinemaTotal(totalMedia);
    setCinemaFeeTotal(totalFee);
  };

  const handleTelevisionTotalChange = (totalMedia: number, totalFee: number) => {
    setTelevisionTotal(totalMedia);
    setTelevisionFeeTotal(totalFee);
  };

  const handleRadioTotalChange = (totalMedia: number, totalFee: number) => {
    setRadioTotal(totalMedia);
    setRadioFeeTotal(totalFee);
  };

  const handleNewspaperTotalChange = (totalMedia: number, totalFee: number) => {
    setNewspaperTotal(totalMedia);
    setNewspaperFeeTotal(totalFee);
  };

  const handleMagazinesTotalChange = (totalMedia: number, totalFee: number) => {
    setMagazineTotal(totalMedia);
    setMagazineFeeTotal(totalFee);
  };

  const handleOohTotalChange = (totalMedia: number, totalFee: number) => {
    setOohTotal(totalMedia);
    setOohFeeTotal(totalFee);
  };

  const handleInvestmentChange = (investmentByMonth) => {
    setInvestmentPerMonth(investmentByMonth);
  };

  useEffect(() => {
    const newGrossMediaTotal = calculateGrossMediaTotal();
    setGrossMediaTotal(newGrossMediaTotal);

    const newTotalInvestment = newGrossMediaTotal + calculateAssembledFee() + calculateAdServingFees();
    setTotalInvestment(newTotalInvestment);
  }, [

    //Digital Media
    searchTotal,
    searchFeeTotal,
    searchBursts,
   
    socialmediaTotal,
    socialMediaFeeTotal,
    socialMediaBursts,

    integrationTotal,
    integrationFeeTotal,
    integrationBursts,
 
    digiAudioTotal,
    digiAudioBursts,
    digiAudioFeeTotal,,

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
  ]);

  useEffect(() => {
    calculateBillingSchedule();
  }, []); // ✅ Run at mount to initialize with default start & end dates

  useEffect(() => {
    if (form.watch("mp_campaigndates_start") && form.watch("mp_campaigndates_end")) {
    calculateBillingSchedule();
  }
}, [
  form.watch("mp_campaigndates_start"),
  form.watch("mp_campaigndates_end"),
  //Digital Media
  searchTotal,
  searchFeeTotal,
  searchBursts,
 
  socialmediaTotal,
  socialMediaFeeTotal,
  socialMediaBursts,


  digiAudioTotal,
  digiAudioBursts,
  digiAudioFeeTotal,,

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
]);

  // in page.tsx

  const handleGenerateMBA = async () => {
    setIsLoading(true);
  
    const fv = form.getValues();
  
    if (!fv.mba_number) {
      toast({
        title: "Error",
        description: "MBA number is required to generate MBA",
        variant: "destructive",
      });
      setIsLoading(false);
      return;
    }

    let finalVisibleMedia: { media_type: string; gross_amount: number }[];
    let finalTotals: MBAData['totals'];

    // Conditionally build the data payload based on whether Partial MBA is active
    if (isPartialMBA) {
      // --- Use Partial MBA Data ---
      finalVisibleMedia = Object.entries(partialMBAValues.mediaTotals)
        .map(([key, value]) => {
            const mediaTypeInfo = mediaTypes.find(m => mediaKeyMap[m.name] === key);
            return {
              media_type: mediaTypeInfo ? mediaTypeInfo.label : 'Unknown Media',
              gross_amount: value,
            };
        });

      const totalExGst = partialMBAValues.grossMedia + partialMBAValues.assembledFee + partialMBAValues.adServing + partialMBAValues.production;

      finalTotals = {
        gross_media: partialMBAValues.grossMedia,
        service_fee: partialMBAValues.assembledFee,
        production: partialMBAValues.production,
        adserving: partialMBAValues.adServing,
        totals_ex_gst: totalExGst,
        total_inc_gst: totalExGst * 1.1,
      };

    } else {
      // --- Use Automatic Calculation Data (Original Logic) ---
      finalVisibleMedia = mediaTypes
        .filter(medium => form.watch(medium.name as keyof MediaPlanFormValues))
        .map(medium => ({
          media_type: medium.label,
          gross_amount: calculateMediaTotal(medium.name),
        }));

      const totalExGst = totalInvestment;

      finalTotals = {
        gross_media: grossMediaTotal,
        service_fee: calculateAssembledFee(),
        production: calculateProductionCosts(),
        adserving: calculateAdServingFees(),
        totals_ex_gst: totalExGst,
        total_inc_gst: totalExGst * 1.1,
      };
    }
  
    const billingScheduleWithGST = billingMonths.map(month => {
      const amountExGst = parseFloat(month.totalAmount.replace(/[^0-9.-]/g, ""));
      const amountIncGst = amountExGst * 1.10;
      return {
        ...month,
        totalAmount: new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(amountIncGst)
      };
    });
  
    // Construct the final body with either manual or auto data
    const body: MBAData = {
      date: format(new Date(), "dd/MM/yyyy"),
      mba_number: fv.mba_number,
      campaign_name: fv.mp_campaignname,
      campaign_brand: fv.mp_brand,
      po_number: fv.mp_ponumber,
      media_plan_version: fv.mp_plannumber,
      client: {
        name: fv.mp_clientname,
        streetaddress: clientAddress,
        suburb: clientSuburb,
        state: clientState,
        postcode: clientPostcode,
      },
      campaign: {
        date_start: format(fv.mp_campaigndates_start, "dd/MM/yyyy"),
        date_end: format(fv.mp_campaigndates_end, "dd/MM/yyyy"),
      },
      gross_media: finalVisibleMedia,
      totals: finalTotals,
      billingSchedule: billingScheduleWithGST,
    };
  
    try {
      const blob = await generateMBA(body);
      saveAs(blob, `MBA_${fv.mp_clientname}_${fv.mp_campaignname}.pdf`);
      toast({
        title: "Success",
        description: "MBA generated successfully",
      });
    } catch (e: any) {
      console.error("MBA Generation Error:", e);
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
      case "mp_influencers":
        return feecontentcreator ?? 0;
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

  


  

  


    function getRateForMediaType(mediaType: string): number {
      switch(mediaType) {
        case 'progVideo':
        case 'progBvod':
        case 'digiVideo':
        case 'digi video':
        case 'bvod':  
          return adservvideo  ?? 0
        case 'progAudio':
        case 'digiAudio':
        case 'digi audio':
          return adservaudio ?? 0
        case 'progDisplay':
        case 'digiDisplay':
        case 'digi display':
          return adservdisplay ?? 0
        default:
          return adservimp    ?? 0
      }
    }
    // Calculate Production Costs (assuming content creator fees count as production)
    const calculateProductionCosts = () => {
      return 0;
    };

    // Calculate Ad Serving Fees
  const calculateAdServingFees = () => {
    // If manual billing is active, sum the ad serving totals from the manual schedule
    if (isManualBilling) {
      return billingMonths.reduce((sum, month) => {
        const monthAdServingTotal = parseFloat(month.adservingTechFees.replace(/[^0-9.-]/g, ""));
        return sum + (monthAdServingTotal || 0);
      }, 0);
    }
    // Original logic for automated calculation
    const allBursts = [
      ...progDisplayBursts,
      ...progVideoBursts,
      ...progBvodBursts,
      ...progAudioBursts,
      ...digiAudioBursts,
      ...digiDisplayBursts,
      ...digiVideoBursts,
      ...bvodBursts
    ]
    return allBursts.reduce((sum, b) => {
      if (b.noAdserving) return sum;
      const rate = getRateForMediaType(b.mediaType)
      const isCPM = b.buyType.toLowerCase() === "cpm"
      const cost  = isCPM
        ? (b.deliverables/1000)*rate
        : (b.deliverables*rate)
          return sum + cost
    }, 0)
  }

  const calculateAssembledFee = (): number => {
    // If manual billing is active, sum the fee totals from the manual schedule
    if (isManualBilling) {
      return billingMonths.reduce((sum, month) => {
        const monthFeeTotal = parseFloat(month.feeTotal.replace(/[^0-9.-]/g, ""));
        return sum + (monthFeeTotal || 0);
      }, 0);
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
    );
  };

  const calculateGrossMediaTotal = (): number => {
    // If manual billing is active, sum the totals from the manual schedule
    if (isManualBilling) {
      return billingMonths.reduce((sum, month) => {
        const monthMediaTotal = parseFloat(month.mediaTotal.replace(/[^0-9.-]/g, ""));
        return sum + (monthMediaTotal || 0);
      }, 0);
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
  );
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
              className="border border-gray-300 rounded px-3 py-2"
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
    );
  };

    useEffect(() => {
      fetchClients()
    }, [])  

  async function fetchClients() {
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

  const generateMBANumber = async (mbaidentifier: string) => {
    try {
      const response = await fetch(`/api/mediaplans/mbanumber?mbaidentifier=${mbaidentifier}`)
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Failed to generate MBA number")
      }
      const data = await response.json()
      if (data.mba_number) {
        form.setValue("mba_number", data.mba_number)
        setMbaNumber(data.mba_number)
      } else {
        throw new Error("MBA number not found in response")
      }
    } catch (error) {
      console.error("Error generating MBA number:", error)
      form.setValue("mba_number", "Error generating MBA number")
      setMbaNumber("")
    }
  }



  const handleClientChange = (clientId: string) => {
    const selectedClient = clients.find((client) => client.id.toString() === clientId)
    if (selectedClient) {
      form.setValue("mp_clientname", selectedClient.clientname_input)
      form.setValue("mbaidentifier", selectedClient.mbaidentifier)
      generateMBANumber(selectedClient.mbaidentifier)
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
      setClientAddress(selectedClient.streetaddress);
      setClientSuburb(selectedClient.suburb);
      setClientState(selectedClient.state_dropdown);
      setClientPostcode(selectedClient.postcode);
    } else {
      form.setValue("mp_clientname", "")
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

  useEffect(() => {
    console.log("CreateMediaPlan: selectedClientId changed to", selectedClientId)
  }, [selectedClientId])

  const mediaTypes = [
    { name: "mp_fixedfee", label: "Fixed Fee", component: null },
    { name: "mp_consulting", label: "Production", component: ProductionContainer },
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
  ]
  

  const handleSearchBurstsChange = (bursts: BillingBurst[]) =>
    setSearchBursts(bursts)

  const handleProgAudioBurstsChange = (bursts: BillingBurst[]) =>
    setProgAudioBursts(bursts);

  const handleSocialMediaBurstsChange = (bursts: BillingBurst[]) =>
    setSocialMediaBursts(bursts)

  const handleCinemaBurstsChange = (bursts: BillingBurst[]) =>
    setCinemaBursts(bursts)

  const handleTelevisionBurstsChange = (bursts: BillingBurst[]) =>
    setTelevisionBursts(bursts)

  const handleRadioBurstsChange = (bursts: BillingBurst[]) =>
    setRadioBursts(bursts)

  const handleIntegrationBurstsChange = (bursts: BillingBurst[]) =>
    setIntegrationBursts(bursts)

  const handleNewspaperBurstsChange = (bursts: BillingBurst[]) =>
    setNewspaperBursts(bursts)

  const handleMagazineBurstsChange = (bursts: BillingBurst[]) =>
    setMagazineBursts(bursts)

  const handleOohBurstsChange = (bursts: BillingBurst[]) =>
    setOohBursts(bursts)

  const handleDigiAudioBurstsChange = (bursts: BillingBurst[]) =>
    setDigiAudioBursts(bursts)

  const handleDigiDisplayBurstsChange = (bursts: BillingBurst[]) =>
    setDigiDisplayBursts(bursts)

  const handleDigiVideoBurstsChange = (bursts: BillingBurst[]) =>
    setDigiVideoBursts(bursts)

  const handleProgDisplayBurstsChange = (bursts: BillingBurst[]) =>
    setProgDisplayBursts(bursts)

  const handleProgVideoBurstsChange = (bursts: BillingBurst[]) =>
    setProgVideoBursts(bursts)

  const handleProgBvodBurstsChange = (bursts: BillingBurst[]) =>
    setProgBvodBursts(bursts)

  const handleProgOohBurstsChange = (bursts: BillingBurst[]) =>
    setProgOohBursts(bursts)

  // --- Partial MBA Handlers ---

  function handlePartialMBAOpen() {
    // 1. Capture the current, automatically calculated values
    const currentMediaTotals: Record<string, number> = {};
    mediaTypes
      .filter(medium => form.watch(medium.name as keyof MediaPlanFormValues))
      .forEach(medium => {
        const key = mediaKeyMap[medium.name];
        if (key) {
          currentMediaTotals[key] = calculateMediaTotal(medium.name);
        }
      });

    const currentValues = {
      mediaTotals: currentMediaTotals,
      grossMedia: calculateGrossMediaTotal(),
      assembledFee: calculateAssembledFee(),
      adServing: calculateAdServingFees(),
      production: calculateProductionCosts(),
    };

    // 2. Set the state for the modal and create a backup for the 'reset' button
    setPartialMBAValues(currentValues);
    setOriginalPartialMBAValues(JSON.parse(JSON.stringify(currentValues))); // Deep copy for a clean snapshot
    setIsPartialMBAModalOpen(true);
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

    // Validate that the new total is within $2.00 of the campaign budget
    if (Math.abs(newTotalInvestment - campaignBudget) > 2) {
      setPartialMBAError("MBA does not match Campaign Budget. The total must be within $2.00 of the budget.");
     return;
    }

    setPartialMBAError(null);
    setIsPartialMBA(true);
    setIsPartialMBAModalOpen(false);
    toast({ title: "Success", description: "Partial MBA details have been saved." });
  }

  function handlePartialMBAReset() {
    // Revert to the original values that were present when the modal was opened
    setPartialMBAValues(JSON.parse(JSON.stringify(originalPartialMBAValues)));
    toast({ title: "Changes Reset", description: "Values have been reset to their original state." });
  }
  // Manual Billing Functions
  function handleManualBillingOpen() {
    // The main `billingMonths` state now contains the correct, detailed breakdown.
    // We just need to copy it to the modal's state.
    const deepCopiedMonths = JSON.parse(JSON.stringify(billingMonths));

    // For the "Reset" functionality from our previous discussion
    setOriginalManualBillingMonths(deepCopiedMonths);
    setOriginalManualBillingTotal(billingTotal);
    
    // Set the state for the modal to use
    setManualBillingMonths(deepCopiedMonths);
    setManualBillingTotal(billingTotal);
    setIsManualBillingModalOpen(true);
  }

  // apps/web/src/app/mediaplans/create/page.tsx

  function handleManualBillingChange(
    index: number,
    type: 'media' | 'fee' | 'adServing',
    rawValue: string,
    mediaKey?: string // e.g., 'search', 'socialMedia'
  ) {
    const copy = [...manualBillingMonths];
    const numericValue = parseFloat(rawValue.replace(/[^0-9.-]/g, "")) || 0;
    const formatter = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" });
    const formattedValue = formatter.format(numericValue);

    // Dynamically update the correct value
    if (type === 'media' && mediaKey && copy[index].mediaCosts.hasOwnProperty(mediaKey)) {
      copy[index].mediaCosts[mediaKey] = formattedValue;
    } else if (type === 'fee') {
      copy[index].feeTotal = formattedValue;
    } else if (type === 'adServing') {
      copy[index].adservingTechFees = formattedValue;
    }

    // Recalculate totals for the affected month
    const mediaTotal = Object.values(copy[index].mediaCosts).reduce((sum, current) => {
        return sum + (parseFloat(String(current).replace(/[^0-9.-]/g, '')) || 0);
    }, 0);
    
    const feeTotal = parseFloat(copy[index].feeTotal.replace(/[^0-9.-]/g, '')) || 0;
    const adServingTotal = parseFloat(copy[index].adservingTechFees.replace(/[^0-9.-]/g, '')) || 0;

    // Update the aggregated and total amounts for the month
    copy[index].mediaTotal = formatter.format(mediaTotal);
    copy[index].totalAmount = formatter.format(mediaTotal + feeTotal + adServingTotal);

    // Recalculate the final Grand Total for the whole schedule
    const grandTotal = copy.reduce(
      (acc, m) => acc + parseFloat(m.totalAmount.replace(/[^0-9.-]/g, "")),
      0
    );

    // Update state to trigger UI re-render
    setManualBillingTotal(formatter.format(grandTotal));
    setManualBillingMonths(copy);
  }

  function handleManualBillingSave() {
    // 1. Get the campaign budget and the new manual total as numbers.
    const campaignBudget = form.getValues("mp_campaignbudget") || 0;
    const currentManualTotalNumber = parseFloat(manualBillingTotal.replace(/[^0-9.-]/g, "")) || 0;

    // 2. VALIDATION: Check if the difference is more than $2.00.
    if (Math.abs(currentManualTotalNumber - campaignBudget) > 2) {
      // If validation fails, show a detailed error toast and stop.
      toast({
        title: "Budget Mismatch",
        description: `The Billing Schedule Total (${manualBillingTotal}) must be within $2.00 of the Campaign Budget. Please adjust values.`,
        variant: "destructive",
        duration: 7000,
      });
      return; // Stop the function here.
    }

    // 3. COMMIT: If validation passes, update the main page's billing schedule.
    setBillingMonths(JSON.parse(JSON.stringify(manualBillingMonths)));
    setBillingTotal(manualBillingTotal);
    setIsManualBilling(true); // Keep track that billing is now manually set.
    setIsManualBillingModalOpen(false); // Close the modal.
    toast({ title: "Success", description: "Manual billing schedule has been saved." });
  }

  function handleManualBillingReset() {
    // Restore the modal's state from our "original" snapshot.
    setManualBillingMonths(JSON.parse(JSON.stringify(originalManualBillingMonths)));
    setManualBillingTotal(originalManualBillingTotal);
    toast({ title: "Schedule Reset", description: "Your changes have been discarded." });
  }

  function handleResetBilling() {
    setIsManualBilling(false)
    calculateBillingSchedule()
  }
    
  // page.tsx

  const handleSaveCampaign = async () => {
    setSaveStatus([{ message: "Starting save process...", status: 'pending' }]);
    setIsSaveModalOpen(true);
    setIsLoading(true);
  
    try {
        const formValues = form.getValues();
  
        // --- Step 1: Create the Media Plan ---
        setSaveStatus(prev => [...prev, { message: "Saving main media plan...", status: 'pending' }]);
        const mediaPlanPayload = {
            mp_clientname: formValues.mp_clientname,
            mp_campaignname: formValues.mp_campaignname,
            mba_number: formValues.mba_number,
        };
        const newMediaPlan = await createMediaPlan(mediaPlanPayload);
  
        if (!newMediaPlan || !newMediaPlan.id) {
            throw new Error("Failed to save media plan or did not receive an ID.");
        }
        setSaveStatus(prev => [...prev, { message: `Media Plan saved with ID: ${newMediaPlan.id}`, status: 'success' }]);
  
  
        // --- Step 2: Create the Media Plan Version, linking the ID ---
        setSaveStatus(prev => [...prev, { message: "Saving version details...", status: 'pending' }]);
        
          // START: NEW CLEANING LOGIC
        const sourceBillingData = isManualBilling ? manualBillingMonths : billingMonths;

        const cleanBillingSchedule = sourceBillingData.map(month => {
            // Helper function to safely parse currency strings into numbers
            const parseCurrency = (value: string | number): number => {
                if (typeof value === 'number') return value;
                // Remove '$', ',', and any non-numeric characters except the decimal point
                return parseFloat(String(value).replace(/[^0-9.-]/g, '')) || 0;
            };

            // Clean up the nested mediaCosts object
            const cleanedMediaCosts = Object.entries(month.mediaCosts).reduce((acc, [key, value]) => {
                acc[key] = parseCurrency(value as string);
                return acc;
            }, {} as Record<string, number>);

            // Return a new object with all values as numbers
            return {
                monthYear: month.monthYear,
                mediaTotal: parseCurrency(month.mediaTotal),
                feeTotal: parseCurrency(month.feeTotal),
                totalAmount: parseCurrency(month.totalAmount),
                adservingTechFees: parseCurrency(month.adservingTechFees),
                production: parseCurrency(month.production),
                mediaCosts: cleanedMediaCosts,
            };
        });
        // END: NEW CLEANING LOGIC

        const versionPayload = {
          version_number: parseInt(formValues.mp_plannumber, 10) || 1,
          
          // Map form names (e.g., mp_campaignname) to API names (e.g., campaign_name)
          mba_number: formValues.mba_number,
          po_number: formValues.mp_ponumber,
          campaign_name: formValues.mp_campaignname,
          campaign_status: formValues.mp_campaignstatus,
          brand: formValues.mp_brand,
          client_name: formValues.mp_clientname,
          client_contact: formValues.mp_clientcontact,
          fixed_fee: formValues.mp_fixedfee,
          mp_campaignbudget: formValues.mp_campaignbudget,

          // Dates and Billing
          campaign_start_date: format(formValues.mp_campaigndates_start, "yyyy-MM-dd"),
          campaign_end_date: format(formValues.mp_campaigndates_end, "yyyy-MM-dd"),
          billingSchedule: cleanBillingSchedule, // <-- USE THE CLEANED DATA

          // Media Type Booleans
          mp_television: formValues.mp_television,
          mp_radio: formValues.mp_radio,
          mp_newspaper: formValues.mp_newspaper,
          mp_magazines: formValues.mp_magazines,
          mp_ooh: formValues.mp_ooh,
          mp_cinema: formValues.mp_cinema,
          mp_digidisplay: formValues.mp_digidisplay,
          mp_digiaudio: formValues.mp_digiaudio,
          mp_digivideo: formValues.mp_digivideo,
          mp_bvod: formValues.mp_bvod,
          mp_integration: formValues.mp_integration,
          mp_search: formValues.mp_search,
          mp_socialmedia: formValues.mp_socialmedia,
          mp_progdisplay: formValues.mp_progdisplay,
          mp_progvideo: formValues.mp_progvideo,
          mp_progbvod: formValues.mp_progbvod,
          mp_progaudio: formValues.mp_progaudio,
          mp_progooh: formValues.mp_progooh,
          mp_influencers: formValues.mp_influencers,
        };
  
        const newVersion = await createMediaPlanVersion(versionPayload);
         if (!newVersion || !newVersion.id) {
            throw new Error("Failed to save media plan version or did not receive an ID.");
        }
        setSaveStatus(prev => [...prev, { message: `Version ${newVersion.version_number} saved.`, status: 'success' }]);
  
        // --- Step 3: Update the Media Plan with the latest_version_id ---
        setSaveStatus(prev => [...prev, { message: "Linking version to plan...", status: 'pending' }]);
        await editMediaPlan(newMediaPlan.id, { latest_version_id: newVersion.id });
        setSaveStatus(prev => [...prev, { message: "Link successful!", status: 'success' }]);
  
        // --- Final Success ---
        toast({
            title: "Success!",
            description: "Your media plan and version have been saved correctly.",
        });
        setTimeout(() => {
            setIsSaveModalOpen(false);
            router.push(`/mediaplans`); // Redirect on success
        }, 2500);
  
    } catch (error: any) {
        const errorMessage = error.message || "An unknown error occurred.";
        setSaveStatus(prev => [...prev, { message: errorMessage, status: 'error' }]);
        toast({
            title: "Save Failed",
            description: errorMessage,
            variant: "destructive",
        });
    } finally {
        setIsLoading(false);
    }
  };
  
  const handleGenerateMediaPlan = async () => {
    setIsDownloading(true)
    try {
      // fetch and encode logo
      const logoBuf   = await fetch('/assembled-logo.png').then(r => r.arrayBuffer())
      const logoBase64 = bufferToBase64(logoBuf)
  
      // build header payload
      const header: MediaPlanHeader = {
        logoBase64,
        logoWidth: 457,
        logoHeight: 71,
        client:         form.getValues('mp_clientname'),
        brand:          form.getValues('mp_brand'),
        campaignName:   form.getValues('mp_campaignname'),
        mbaNumber:      form.getValues('mba_number'),
        clientContact:  form.getValues('mp_clientcontact'),
        planVersion:    '1',
        poNumber:       form.getValues('mp_ponumber'),
        campaignBudget: new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD'}).format(form.getValues('mp_campaignbudget')),
        campaignStatus: form.getValues('mp_campaignstatus'),
        campaignStart:  format(form.getValues('mp_campaigndates_start'), "dd/MM/yyyy"),
        campaignEnd:    format(form.getValues('mp_campaigndates_end'), "dd/MM/yyyy"),
      }

      // Exclude any items with no budget to avoid NaN values
      const validSearchItems = searchItems.filter(item =>
        parseFloat(item.deliverablesAmount.replace(/[^0-9.]/g, '')) > 0
        );

      const validSocialMediaItems = socialMediaItems.filter(item =>
        parseFloat(item.deliverablesAmount.replace(/[^0-9.]/g, '')) > 0
        );

      const validDigiAudioItems = digiAudioItems.filter(item =>
        parseFloat(item.deliverablesAmount.replace(/[^0-9.]/g, '')) > 0
        );

      const validDigiDisplayItems = digiDisplayItems.filter(item =>
        parseFloat(item.deliverablesAmount.replace(/[^0-9.]/g, '')) > 0
        );

      const validDigiVideoItems = digiVideoItems.filter(item =>
        parseFloat(item.deliverablesAmount.replace(/[^0-9.]/g, '')) > 0
        );

      const validBvodItems = bvodItems.filter(item =>
        parseFloat(item.deliverablesAmount.replace(/[^0-9.]/g, '')) > 0
        );

      const validProgDisplayItems = progDisplayItems.filter(item =>
        parseFloat(item.deliverablesAmount.replace(/[^0-9.]/g, '')) > 0
        );

      const validProgVideoItems = progVideoItems.filter(item =>
        parseFloat(item.deliverablesAmount.replace(/[^0-9.]/g, '')) > 0
        );

      const validProgBvodItems = progBvodItems.filter(item =>
        parseFloat(item.deliverablesAmount.replace(/[^0-9.]/g, '')) > 0
        );

      const validProgOohItems = progOohItems.filter(item =>
        parseFloat(item.deliverablesAmount.replace(/[^0-9.]/g, '')) > 0
        );

      const validProgAudioItems = progAudioItems.filter(item =>
        parseFloat(item.deliverablesAmount.replace(/[^0-9.]/g, '')) > 0
        );

      const validNewspaperItems = newspaperItems.filter(item =>
        parseFloat(item.deliverablesAmount.replace(/[^0-9.]/g, '')) > 0
        );

      const validMagazinesItems = magazineItems.filter(item =>
        parseFloat(item.deliverablesAmount.replace(/[^0-9.]/g, '')) > 0
        );

      const validTelevisionItems = televisionItems.filter(item =>
        parseFloat(item.deliverablesAmount.replace(/[^0-9.]/g, '')) > 0
        );

      const validRadioItems = radioItems.filter(item =>
        parseFloat(item.deliverablesAmount.replace(/[^0-9.]/g, '')) > 0
        );

      const validOohItems = oohItems.filter(item =>
        parseFloat(item.deliverablesAmount.replace(/[^0-9.]/g, '')) > 0
        );

      const validCinemaItems = cinemaItems.filter(item =>
        parseFloat(item.deliverablesAmount.replace(/[^0-9.]/g, '')) > 0
        );

      const validIntegrationItems = integrationItems.filter(item =>
        parseFloat(item.deliverablesAmount.replace(/[^0-9.]/g, '')) > 0
        );

        
      /// 1️⃣ Build a mediaItems object
      const mediaItems: MediaItems = {
        search: validSearchItems, // Assuming validSearchItems are filtered LineItem[]
        socialMedia: validSocialMediaItems,
        digiAudio: validDigiAudioItems,
        digiDisplay: validDigiDisplayItems,
        digiVideo: validDigiVideoItems,
        bvod: validBvodItems,
        progDisplay: validProgDisplayItems,
        progVideo: validProgVideoItems,
        progBvod: validProgBvodItems,
        progOoh: validProgOohItems,
        progAudio: validProgAudioItems, // Ensure this key matches MediaItems interface
        newspaper: validNewspaperItems,
        magazines: validMagazinesItems,
        television: validTelevisionItems,
        radio: validRadioItems,
        ooh: validOohItems, // Make sure you have a state for oohItems and it's populated
        cinema: validCinemaItems, // Make sure you have a state for cinemaItems
        integration: validIntegrationItems, // etc. for all types
      };

const workbook = await generateMediaPlan(header, mediaItems);

      const arrayBuffer = await workbook.xlsx.writeBuffer() as ArrayBuffer
      
      // make the Blob and trigger download
     const blob = new Blob([ arrayBuffer ], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
       })
       saveAs(blob, `MediaPlan_${header.client}_${header.campaignName}.xlsx`)

    toast({ title: 'Success', description: 'Media plan generated successfully' })
  } catch (error: any) {
    console.error(error)
    toast({
      title: 'Error',
      description: error.message || 'Failed to generate media plan',
      variant: 'destructive',
    })
  } finally {
    setIsDownloading(false)
    }
  }
  
  // Transform mediaTypes to match expected format
  const transformedMediaTypes = mediaTypes.map(media => ({
    name: media.name,
    feePercentage: media.name === "mp_search" ? feesearch || 0 : 0,
    lineItems: []
  }));

  const handleBVODBurstsChange = (bursts: BillingBurst[]) => {
    setBvodBursts(bursts);
  };
  
  return (
    <div className="w-full min-h-screen">
      <h1 className="text-4xl font-bold p-4">Create a Media Plan</h1>
      <div className="w-full px-4 py-6 space-y-6">
        <Form {...form}>
          <form className="space-y-8">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6 w-full">
              <FormField
                control={form.control}
                name={"mp_clientname" as keyof MediaPlanFormValues}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Client Name</FormLabel>
                    <Select
                    onValueChange={(value) => {
                      const selectedClient = clients.find((client) => client.id.toString() === value)
                      if (selectedClient) {
                        field.onChange(selectedClient.clientname_input)
                        handleClientChange(value)
                      }
                    }}
                    value={clients.find((client) => client.clientname_input === field.value)?.id.toString() || ""}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a client" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {clients.map((client) => (
                          <SelectItem key={client.id} value={client.id.toString()}>
                            {client.clientname_input}
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
                name={"mp_campaignstatus" as keyof MediaPlanFormValues}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Campaign Status</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={String(field.value)}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select campaign status" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="draft">Draft</SelectItem>
                        <SelectItem value="planned">Planned</SelectItem>
                        <SelectItem value="approved">Approved</SelectItem>
                        <SelectItem value="booked">Booked</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                        <SelectItem value="cancelled">Cancelled</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name={"mp_campaignname" as keyof MediaPlanFormValues}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Campaign Name</FormLabel>
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
                    <FormLabel>Brand</FormLabel>
                    <FormControl>
                      <Input {...field} value={String(field.value)} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="mp_campaigndates_start"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Campaign Start Date</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant={"outline"}
                            className={cn("w-full pl-3 text-left font-normal", !field.value && "text-muted-foreground")}
                          >
                            {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          disabled={(date) => date > new Date("2100-01-01")}
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
                name="mp_campaigndates_end"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Campaign End Date</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant={"outline"}
                            className={cn("w-full pl-3 text-left font-normal", !field.value && "text-muted-foreground")}
                          >
                            {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          disabled={(date) => date > new Date("2100-01-01")}
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
                name="mp_clientcontact"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Client Contact</FormLabel>
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
                    <FormLabel>PO Number</FormLabel>
                    <FormControl>
                      <Input {...field} />
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
                    <FormLabel>Campaign Budget</FormLabel>
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
                    <FormLabel>MBA Identifier</FormLabel>
                    <div className="p-2 bg-gray-100 rounded-md">{field.value || "No client selected"}</div>
                    <FormDescription>This field is automatically populated based on the selected client.</FormDescription>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="mba_number"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>MBA Number</FormLabel>
                    <div className="p-2 bg-gray-100 rounded-md">{field.value || "No MBA Number generated"}</div>
                    <FormDescription>This field is automatically generated based on the MBA Identifier.</FormDescription>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="mp_plannumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Media Plan Version</FormLabel>
                    <div className="p-2 bg-gray-100 rounded-md">1</div>
                    <FormDescription>This is the media plan version.</FormDescription>
                  </FormItem>
                )}
              />
            </div>

            <div className="border border-gray-200 rounded-lg p-6 mt-6">
              <h2 className="text-xl font-semibold mb-4">Select Media Types</h2>
              <div className="grid grid-cols-4 gap-4 w-full">
                {mediaTypes.filter(medium => medium.name !== "mp_fixedfee").map((medium) => (
                  <FormField
                    key={medium.name}
                    control={form.control}
                    name={medium.name as keyof MediaPlanFormValues}
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center space-x-3 space-y-0">
                        <FormControl>
                          <Switch checked={!!field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                        <FormLabel className="font-normal">{medium.label}</FormLabel>
                      </FormItem>
                    )}
                  />
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 border border-gray-300 rounded-lg p-6 mt-6">
              {/* MBA Details Section */}
<div className="flex flex-col space-y-4 border border-gray-300 rounded-lg p-6 mt-6">
  <div className="flex items-center justify-between">
    <h3 className="text-lg font-semibold">MBA Details</h3>
    {isPartialMBA ? (
      <Button variant="outline" size="sm" type="button" onClick={() => setIsPartialMBA(false)}>Reset to Auto</Button>
    ) : (
      <Button variant="outline" size="sm" type="button" onClick={handlePartialMBAOpen}>Partial MBA</Button>
    )}
  </div>

  {/* Dynamic Media Totals */}
  <div className="grid grid-cols-2 gap-4">
    <div className="flex flex-col space-y-3">
      {mediaTypes
        .filter(medium => form.watch(medium.name as keyof MediaPlanFormValues) && medium.component)
        .map(medium => (
        <div key={medium.name} className="text-sm font-medium">
          {medium.label}
        </div>
      ))}
    </div>

    <div className="flex flex-col space-y-3 text-right">
      {mediaTypes
        .filter(medium => form.watch(medium.name as keyof MediaPlanFormValues) && medium.component)
        .map(medium => {
          const mediaKey = mediaKeyMap[medium.name];
          const total = isPartialMBA ? partialMBAValues.mediaTotals[mediaKey] || 0 : calculateMediaTotal(medium.name);
          return (
            <div key={medium.name} className="text-sm font-medium">
              {currencyFormatter.format(total)}
            </div>
          );
        })}
    </div>
  </div>

  <div className="border-t border-gray-400 my-4"></div>

  {/* Gross Media Total */}
  <div className="grid grid-cols-2 gap-4 mb-2">
    <div className="text-sm font-semibold">Gross Media Total</div>
    <div className="text-sm font-semibold text-right">
      {currencyFormatter.format(isPartialMBA ? partialMBAValues.grossMedia : grossMediaTotal)}
    </div>
  </div>

  {/* Assembled Fee */}
  <div className="grid grid-cols-2 gap-4 mb-2">
    <div className="text-sm font-semibold">Assembled Fee</div>
    <div className="text-sm font-semibold text-right">
      {currencyFormatter.format(isPartialMBA ? partialMBAValues.assembledFee : calculateAssembledFee())}
    </div>
  </div>

  {/* Ad Serving and Tech Fees */}
  <div className="grid grid-cols-2 gap-4 mb-2">
    <div className="text-sm font-semibold">Ad Serving & Tech Fees</div>
    <div className="text-sm font-semibold text-right">
      {currencyFormatter.format(isPartialMBA ? partialMBAValues.adServing : calculateAdServingFees())}
    </div>
  </div>

  {/* Production Costs */}
  <div className="grid grid-cols-2 gap-4">
    <div className="text-sm font-semibold">Production</div>
    <div className="text-sm font-semibold text-right">
      {currencyFormatter.format(isPartialMBA ? partialMBAValues.production : calculateProductionCosts())}
    </div>
  </div>

  {/* Total Investment (ex GST) */}
  <div className="grid grid-cols-2 gap-4 mb-2">
    <div className="text-sm font-bold">Total Investment (ex GST)</div>
    <div className="text-sm font-bold text-right">
      {currencyFormatter.format(
        isPartialMBA
          ? partialMBAValues.grossMedia + partialMBAValues.assembledFee + partialMBAValues.adServing + partialMBAValues.production
          : totalInvestment
      )}
    </div>
  </div>
</div>

              <div className="border border-gray-300 rounded-lg p-6 mt-6">
              {/* Dynamic Billing Schedule */}
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">Billing Schedule</h3>
                {isManualBilling ? (
                  <Button onClick={handleResetBilling} type="button">Reset Billing</Button>
                ) : (
                  <Button onClick={handleManualBillingOpen} type="button">Manual Billing</Button>
                )}
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Month</TableHead>
                      <TableHead align="right">Media</TableHead>
                      <TableHead align="right">Fees</TableHead>
                      <TableHead align="right">Ad Serving</TableHead>
                      <TableHead align="right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {billingMonths.map(m => (
                      <TableRow key={m.monthYear}>
                        <TableCell>{m.monthYear}</TableCell>
                        <TableCell align="right">{m.mediaTotal}</TableCell>
                        <TableCell align="right">{m.feeTotal}</TableCell>
                        <TableCell align="right">{m.adservingTechFees}</TableCell>
                        <TableCell align="right" className="font-semibold">{m.totalAmount}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="font-bold">
                      <TableCell>Grand Total</TableCell>
                      <TableCell align="right">
                        {new Intl.NumberFormat("en-AU", { style:"currency", currency:"AUD" })
                          .format(billingMonths.reduce((acc, m) => acc + parseFloat(m.mediaTotal.replace(/[^0-9.-]/g,"")), 0))}
                      </TableCell>
                      <TableCell align="right">
                        {new Intl.NumberFormat("en-AU", { style:"currency", currency:"AUD" })
                          .format(billingMonths.reduce((acc, m) => acc + parseFloat(m.feeTotal.replace(/[^0-9.-]/g,"")), 0))}
                      </TableCell>
                      <TableCell align="right">
                        {new Intl.NumberFormat("en-AU", { style:"currency", currency:"AUD" })
                          .format(billingMonths.reduce((acc, m) => acc + parseFloat(m.adservingTechFees.replace(/[^0-9.-]/g,"")), 0))}
                      </TableCell>
                      <TableCell align="right" className="font-semibold">{billingTotal}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>

              {/* === Manual Billing Modal === */}
              <Dialog open={isManualBillingModalOpen} onOpenChange={setIsManualBillingModalOpen}>
  <DialogContent className="max-w-7xl max-h-[90vh] overflow-y-auto">
    <DialogHeader>
      <DialogTitle>Manual Billing Schedule</DialogTitle>
    </DialogHeader>
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="sticky left-0 bg-white z-10">Month</TableHead>
            {mediaTypes
              .filter(medium => form.watch(medium.name as keyof MediaPlanFormValues) && medium.component)
              .map(medium => (
                <TableHead key={medium.name} className="text-right">{medium.label}</TableHead>
              ))}
            <TableHead className="text-right">Fees</TableHead>
            <TableHead className="text-right">Ad Serving</TableHead>
            <TableHead className="text-right font-bold">Total</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {manualBillingMonths.map((month, monthIndex) => (
            <TableRow key={month.monthYear}>
              <TableCell className="sticky left-0 bg-white z-10 font-medium">{month.monthYear}</TableCell>
              {mediaTypes
                .filter(medium => form.watch(medium.name as keyof MediaPlanFormValues) && medium.component)
                .map(medium => {
                  const mediaKey = mediaKeyMap[medium.name];
                  return (
                    <TableCell key={medium.name} align="right">
                      <Input
                        className="text-right"
                        value={month.mediaCosts[mediaKey] || '$0.00'}
                        onBlur={e => handleManualBillingChange(monthIndex, "media", e.target.value, mediaKey)}
                        onChange={e => {
                          const tempCopy = [...manualBillingMonths];
                          tempCopy[monthIndex].mediaCosts[mediaKey] = e.target.value;
                          setManualBillingMonths(tempCopy);
                        }}
                      />
                    </TableCell>
                  );
                })}
              <TableCell align="right">
                <Input
                  className="text-right"
                  value={month.feeTotal}
                  onBlur={e => handleManualBillingChange(monthIndex, "fee", e.target.value)}
                  onChange={e => {
                    const tempCopy = [...manualBillingMonths];
                    tempCopy[monthIndex].feeTotal = e.target.value;
                    setManualBillingMonths(tempCopy);
                  }}
                />
              </TableCell>
              <TableCell align="right">
                <Input
                  className="text-right"
                  value={month.adservingTechFees}
                  onBlur={e => handleManualBillingChange(monthIndex, "adServing", e.target.value)}
                  onChange={e => {
                    const tempCopy = [...manualBillingMonths];
                    tempCopy[monthIndex].adservingTechFees = e.target.value;
                    setManualBillingMonths(tempCopy);
                  }}
                />
              </TableCell>
              <TableCell className="font-semibold text-right">{month.totalAmount}</TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow className="font-bold border-t-2">
            <TableCell className="sticky left-0 bg-white z-10">Subtotals</TableCell>
            {mediaTypes
              .filter(medium => form.watch(medium.name as keyof MediaPlanFormValues) && medium.component)
              .map(medium => {
                const mediaKey = mediaKeyMap[medium.name];
                const subtotal = manualBillingMonths.reduce((acc, m) => acc + parseFloat((m.mediaCosts[mediaKey] || "$0").replace(/[^0-9.-]/g, '')), 0);
                return (
                  <TableCell key={medium.name} className="text-right">
                    {currencyFormatter.format(subtotal)}
                  </TableCell>
                );
              })}
            <TableCell className="text-right">
              {currencyFormatter.format(manualBillingMonths.reduce((acc, m) => acc + parseFloat((m.feeTotal || "$0").replace(/[^0-9.-]/g, '')), 0))}
            </TableCell>
            <TableCell className="text-right">
              {currencyFormatter.format(manualBillingMonths.reduce((acc, m) => acc + parseFloat((m.adservingTechFees || "$0").replace(/[^0-9.-]/g, '')), 0))}
            </TableCell>
            <TableCell className="text-right">{manualBillingTotal}</TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </div>
    <div className="mt-4 text-right">
      <span className="font-bold">Grand Total: {manualBillingTotal}</span>
    </div>
    <DialogFooter className="sm:justify-between pt-4">
      <Button variant="outline" onClick={handleManualBillingReset} className="sm:mr-auto">
        Reset to Automatic
      </Button>
      <div className="flex space-x-2">
        <Button variant="ghost" onClick={() => setIsManualBillingModalOpen(false)}>
          Cancel
        </Button>
        <Button onClick={handleManualBillingSave}>Save Manual Schedule</Button>
      </div>
    </DialogFooter>
  </DialogContent>
</Dialog>

{/* === Save Status Modal === */}
<Dialog open={isSaveModalOpen} onOpenChange={setIsSaveModalOpen}>
    <DialogContent>
        <DialogHeader>
            <DialogTitle>Saving Progress</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
            {saveStatus.map((item, index) => (
                <div key={index} className="flex items-center space-x-3">
                    {item.status === 'pending' && (
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-gray-900"></div>
                    )}
                    {item.status === 'success' && (
                        <svg className="h-6 w-6 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    )}
                    {item.status === 'error' && (
                        <svg className="h-6 w-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    )}
                    <span className="text-sm font-medium">{item.message}</span>
                </div>
            ))}
        </div>
        <DialogFooter>
            <Button onClick={() => setIsSaveModalOpen(false)}>Close</Button>
        </DialogFooter>
    </DialogContent>
</Dialog>

{/* === Partial MBA Modal === */}
<Dialog open={isPartialMBAModalOpen} onOpenChange={(open) => {
  setIsPartialMBAModalOpen(open);
  if (!open) setPartialMBAError(null);
}}>
  <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
    <DialogHeader>
      <DialogTitle>Partial MBA Override</DialogTitle>
    </DialogHeader>
    <div className="space-y-4 p-4">
      {partialMBAError && (
        <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 rounded-md" role="alert">
          <p className="font-bold">Budget Mismatch</p>
          <p>{partialMBAError}</p>
        </div>
      )}
      {/* Individual Media Items */}
      <h4 className="font-semibold text-md border-b pb-2">Media Totals</h4>
      <div className="grid grid-cols-3 gap-x-8 gap-y-4">
        {mediaTypes
          .filter(medium => form.watch(medium.name as keyof MediaPlanFormValues) && medium.component)
          .map(medium => {
            const mediaKey = mediaKeyMap[medium.name];
            return (
              <div key={medium.name} className="flex items-center justify-between">
                <label className="text-sm font-medium">{medium.label}</label>
                <Input
                  className="text-right w-40"
                  value={currencyFormatter.format(partialMBAValues.mediaTotals[mediaKey] || 0)}
                  onBlur={(e) => handlePartialMBAChange('mediaTotal', e.target.value, mediaKey)}
                  onChange={(e) => {
                      const tempValues = {...partialMBAValues};
                      tempValues.mediaTotals[mediaKey] = parseFloat(e.target.value.replace(/[^0-9.-]/g, '')) || 0;
                      setPartialMBAValues(tempValues);
                  }}
                />
              </div>
            );
          })}
      </div>
      
      {/* Aggregated Totals */}
      <h4 className="font-semibold text-md border-b pb-2 pt-4">Summary Totals</h4>
      <div className="space-y-4 max-w-md mx-auto">
          <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Gross Media Total</label>
              <Input
                  className="text-right w-48 bg-gray-100"
                  value={currencyFormatter.format(partialMBAValues.grossMedia)}
                  readOnly // This field is calculated automatically
              />
          </div>
          <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Assembled Fee</label>
              <Input
                  className="text-right w-48"
                  value={currencyFormatter.format(partialMBAValues.assembledFee)}
                  onBlur={(e) => handlePartialMBAChange('assembledFee', e.target.value)}
                  onChange={(e) => setPartialMBAValues(p => ({...p, assembledFee: parseFloat(e.target.value.replace(/[^0-9.-]/g, '')) || 0}))}
              />
          </div>
          <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Ad Serving & Tech Fees</label>
              <Input
                  className="text-right w-48"
                  value={currencyFormatter.format(partialMBAValues.adServing)}
                  onBlur={(e) => handlePartialMBAChange('adServing', e.target.value)}
                  onChange={(e) => setPartialMBAValues(p => ({...p, adServing: parseFloat(e.target.value.replace(/[^0-9.-]/g, '')) || 0}))}
              />
          </div>
          <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Production</label>
              <Input
                  className="text-right w-48"
                  value={currencyFormatter.format(partialMBAValues.production)}
                  onBlur={(e) => handlePartialMBAChange('production', e.target.value)}
                  onChange={(e) => setPartialMBAValues(p => ({...p, production: parseFloat(e.target.value.replace(/[^0-9.-]/g, '')) || 0}))}
              />
          </div>
          <div className="border-t pt-4 mt-4 flex items-center justify-between">
              <label className="text-sm font-bold">Total Investment (ex GST)</label>
              <div className="text-right w-48 font-bold p-2">
                  {currencyFormatter.format(
                      partialMBAValues.grossMedia +
                      partialMBAValues.assembledFee +
                      partialMBAValues.adServing +
                      partialMBAValues.production
                  )}
              </div>
          </div>
      </div>
    </div>
    <DialogFooter className="sm:justify-between pt-4">
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
  </DialogContent>
</Dialog>
            </div>

            {mediaTypes.map((medium) => {
              if (form.watch(medium.name as keyof MediaPlanFormValues) && medium.component) {
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
                  
                };
                return (
                  <div key={medium.name} className="border border-gray-200 rounded-lg p-6 mt-6">
                    <h2 className="text-xl font-semibold mb-4">{medium.label}</h2>
                    <Suspense fallback={<div>Loading {medium.label}...</div>}>
                      {medium.name === "mp_search" && (
                        <Suspense fallback={<div>Loading search container...</div>}>
                          <SearchContainer
                            clientId={selectedClientId}
                            feesearch={feesearch || 0}
                            onTotalMediaChange={handleSearchTotalChange}
                            onBurstsChange={handleSearchBurstsChange}
                            onInvestmentChange={handleInvestmentChange}
                            onLineItemsChange={setSearchItems}
                            campaignStartDate={form.watch("mp_campaigndates_start")}
                            campaignEndDate={form.watch("mp_campaigndates_end")}
                            campaignBudget={form.watch("mp_campaignbudget")}
                            campaignId={""}
                            mediaTypes={["search"]}
                          />
                        </Suspense>
                      )}
                      {medium.name === "mp_socialmedia" && (
                        <Suspense fallback={<div>Loading Social Media...</div>}>
                          <SocialMediaContainer
                            clientId={selectedClientId}
                            feesocial={feesocial || 0}
                            onTotalMediaChange={handleSocialMediaTotalChange}
                            onBurstsChange={handleSocialMediaBurstsChange}
                            onInvestmentChange={handleInvestmentChange}
                            onLineItemsChange={setSocialMediaItems}
                            campaignStartDate={form.watch("mp_campaigndates_start")}
                            campaignEndDate={form.watch("mp_campaigndates_end")}
                            campaignBudget={form.watch("mp_campaignbudget")}
                            campaignId={""}
                            mediaTypes={["social"]}
                          />
                        </Suspense>
                      )}
                      {medium.name === "mp_bvod" && (
                        <Suspense fallback={<div>Loading BVOD...</div>}>
                          <BVODContainer
                            clientId={selectedClientId}
                            feebvod={feebvod || 0}
                            onTotalMediaChange={handleBVODTotalChange}
                            onBurstsChange={handleBVODBurstsChange}
                            onInvestmentChange={handleInvestmentChange}
                            onLineItemsChange={setBVODItems}
                            campaignStartDate={form.watch("mp_campaigndates_start")}
                            campaignEndDate={form.watch("mp_campaigndates_end")}
                            campaignBudget={form.watch("mp_campaignbudget")}
                            campaignId={""}
                            mediaTypes={["bvod"]}
                          />
                        </Suspense>
                      )}
                      {medium.name === "mp_integration" && (
                        <Suspense fallback={<div>Loading Integration...</div>}>
                          <IntegrationContainer
                            clientId={selectedClientId}
                            feeintegration={feeintegration || 0}
                            onTotalMediaChange={handleIntegrationTotalChange}
                            onBurstsChange={handleIntegrationBurstsChange}
                            onInvestmentChange={handleInvestmentChange}
                            onLineItemsChange={setIntegrationItems}
                            campaignStartDate={form.watch("mp_campaigndates_start")}
                            campaignEndDate={form.watch("mp_campaigndates_end")}
                            campaignBudget={form.watch("mp_campaignbudget")}
                            campaignId={""}
                            mediaTypes={["integration"]}
                          />
                        </Suspense>
                      )}
                      {medium.name === "mp_cinema" && (
                        <Suspense fallback={<div>Loading Cinema...</div>}>
                          <CinemaContainer
                            clientId={selectedClientId}
                            feecinema={feecinema || 0}
                            onTotalMediaChange={handleCinemaTotalChange}
                            onBurstsChange={handleCinemaBurstsChange}
                            onInvestmentChange={handleInvestmentChange}
                            onLineItemsChange={setCinemaItems}
                            campaignStartDate={form.watch("mp_campaigndates_start")}
                            campaignEndDate={form.watch("mp_campaigndates_end")}
                            campaignBudget={form.watch("mp_campaignbudget")}
                            campaignId={""}
                            mediaTypes={["cinema"]}
                          />
                        </Suspense>
                      )}
                      {medium.name === "mp_progaudio" && (
                        <Suspense fallback={<div>Loading Prog Audio...</div>}>
                          <ProgAudioContainer
                            clientId={selectedClientId}
                            feeprogaudio={feeprogaudio || 0}
                            onTotalMediaChange={handleProgAudioTotalChange}
                            onBurstsChange={handleProgAudioBurstsChange}
                            onInvestmentChange={handleInvestmentChange}
                            onLineItemsChange={setProgAudioItems}
                            campaignStartDate={form.watch("mp_campaigndates_start")}
                            campaignEndDate={form.watch("mp_campaigndates_end")}
                            campaignBudget={form.watch("mp_campaignbudget")}
                            campaignId={""}
                            mediaTypes={["progaudio"]}
                          />
                        </Suspense>
                      )}
                      {medium.name === "mp_progbvod" && (
                        <Suspense fallback={<div>Loading Prog BVOD...</div>}>
                          <ProgBVODContainer
                            clientId={selectedClientId}
                            feeprogbvod={feeprogbvod || 0}
                            onTotalMediaChange={handleProgBvodTotalChange}
                            onBurstsChange={handleProgBvodBurstsChange}
                            onInvestmentChange={handleInvestmentChange}
                            onLineItemsChange={setProgBvodItems}
                            campaignStartDate={form.watch("mp_campaigndates_start")}
                            campaignEndDate={form.watch("mp_campaigndates_end")}
                            campaignBudget={form.watch("mp_campaignbudget")}
                            campaignId={""}
                            mediaTypes={["progbvod"]}
                          />
                        </Suspense>
                      )}
                      {medium.name === "mp_progooh" && (
                        <Suspense fallback={<div>Loading Prog OOH...</div>}>
                          <ProgOOHContainer
                            clientId={selectedClientId}
                            feeprogooh={feeprogooh || 0}
                            onTotalMediaChange={handleProgOohTotalChange}
                            onBurstsChange={handleProgOohBurstsChange}
                            onInvestmentChange={handleInvestmentChange}
                            onLineItemsChange={setProgOohItems}
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
                      <Suspense fallback={<div>Loading Digi Audio...</div>}>
                        <DigitalAudioContainer
                          clientId={selectedClientId}
                          feedigiaudio={feedigiaudio || 0}
                          onTotalMediaChange={handleDigiAudioTotalChange}
                          onBurstsChange={handleDigiAudioBurstsChange}
                          onInvestmentChange={handleInvestmentChange}
                          onLineItemsChange={setDigiAudioItems}
                          campaignStartDate={form.watch("mp_campaigndates_start")}
                          campaignEndDate={form.watch("mp_campaigndates_end")}
                          campaignBudget={form.watch("mp_campaignbudget")}
                          campaignId={""}
                          mediaTypes={["digiaudio"]}
                        />
                      </Suspense>
                    )}
                    {medium.name === "mp_digidisplay" && (
                      <Suspense fallback={<div>Loading Digi Display...</div>}>
                        <DigitalDisplayContainer
                          clientId={selectedClientId}
                          feedigidisplay={feedigidisplay || 0}
                          onTotalMediaChange={handleDigiDisplayTotalChange}
                          onBurstsChange={handleDigiDisplayBurstsChange}
                          onInvestmentChange={handleInvestmentChange}
                          onLineItemsChange={setDigiDisplayItems}
                          campaignStartDate={form.watch("mp_campaigndates_start")}
                          campaignEndDate={form.watch("mp_campaigndates_end")}
                          campaignBudget={form.watch("mp_campaignbudget")}
                          campaignId={""}
                          mediaTypes={["digidisplay"]}
                        />
                      </Suspense>
                    )}
                    {medium.name === "mp_digivideo" && (
                      <Suspense fallback={<div>Loading Digi Video...</div>}>
                        <DigitalVideoContainer
                          clientId={selectedClientId}
                          feedigivideo={feedigivideo || 0}
                          onTotalMediaChange={handleDigiVideoTotalChange}
                          onBurstsChange={handleDigiVideoBurstsChange}
                          onInvestmentChange={handleInvestmentChange}
                          onLineItemsChange={setDigiVideoItems}
                          campaignStartDate={form.watch("mp_campaigndates_start")}
                          campaignEndDate={form.watch("mp_campaigndates_end")}
                          campaignBudget={form.watch("mp_campaignbudget")}
                          campaignId={""}
                          mediaTypes={["digivideo"]}
                        />
                      </Suspense>
                    )}
                    {medium.name === "mp_progdisplay" && (
                      <Suspense fallback={<div>Loading Prog Display...</div>}>
                        <ProgDisplayContainer
                          clientId={selectedClientId}
                          feeprogdisplay={feeprogdisplay || 0}
                          onTotalMediaChange={handleProgDisplayTotalChange}
                          onBurstsChange={handleProgDisplayBurstsChange}
                          onInvestmentChange={handleInvestmentChange}
                          onLineItemsChange={setProgDisplayItems}
                          campaignStartDate={form.watch("mp_campaigndates_start")}
                          campaignEndDate={form.watch("mp_campaigndates_end")}
                          campaignBudget={form.watch("mp_campaignbudget")}
                          campaignId={""}
                          mediaTypes={["progdisplay"]}
                        />
                      </Suspense>
                    )}
                    {medium.name === "mp_progvideo" && (
                      <Suspense fallback={<div>Loading Prog Video...</div>}>
                        <ProgVideoContainer
                          clientId={selectedClientId}
                          feeprogvideo={feeprogvideo || 0}
                          onTotalMediaChange={handleProgVideoTotalChange}
                          onBurstsChange={handleProgVideoBurstsChange}
                          onInvestmentChange={handleInvestmentChange}
                          onLineItemsChange={setProgVideoItems}
                          campaignStartDate={form.watch("mp_campaigndates_start")}
                          campaignEndDate={form.watch("mp_campaigndates_end")}
                          campaignBudget={form.watch("mp_campaignbudget")}
                          campaignId={""}
                          mediaTypes={["progvideo"]}
                        />
                      </Suspense>
                    )}
                    { medium.name === "mp_television" && (
                       <Suspense fallback={<div>Loading Television…</div>}>
                        <TelevisionContainer
                          clientId={selectedClientId}
                          feetelevision={feeTelevision || 0}
                          onTotalMediaChange={handleTelevisionTotalChange}
                          onBurstsChange={handleTelevisionBurstsChange}
                          onInvestmentChange={handleInvestmentChange}
                          onLineItemsChange={setTelevisionItems}
                          campaignStartDate={form.watch("mp_campaigndates_start")}
                          campaignEndDate={form.watch("mp_campaigndates_end")}
                          campaignBudget={form.watch("mp_campaignbudget")}
                          campaignId={""}
                          mediaTypes={["television"]}
                        />
                      </Suspense>
                    )}
                    { medium.name === "mp_radio" && (
                      <Suspense fallback={<div>Loading Radio…</div>}>
                       <RadioContainer
                         clientId={selectedClientId}
                         feeradio={feeRadio || 0}
                         onTotalMediaChange={handleRadioTotalChange}
                         onBurstsChange={handleRadioBurstsChange}
                         onInvestmentChange={handleInvestmentChange}
                         onLineItemsChange={setRadioItems}
                         campaignStartDate={form.watch("mp_campaigndates_start")}
                         campaignEndDate={form.watch("mp_campaigndates_end")}
                         campaignBudget={form.watch("mp_campaignbudget")}
                         campaignId={""}
                         mediaTypes={["radio"]}
                       />
                      </Suspense>
                    )}
                    { medium.name === "mp_newspaper" && (
                        <Suspense fallback={<div>Loading Newspapers…</div>}>
                          <NewspaperContainer
                            clientId={selectedClientId}
                            feenewspapers={feeNewspapers || 0}
                            onTotalMediaChange={handleNewspaperTotalChange}
                            onBurstsChange={handleNewspaperBurstsChange}
                            onInvestmentChange={handleInvestmentChange}
                            onLineItemsChange={setNewspaperItems}
                            campaignStartDate={form.watch("mp_campaigndates_start")}
                            campaignEndDate={form.watch("mp_campaigndates_end")}
                            campaignBudget={form.watch("mp_campaignbudget")}
                            campaignId={""}
                            mediaTypes={["newspapers"]}
                          />
                        </Suspense>
                    )}
                    { medium.name === "mp_magazines" && (
                        <Suspense fallback={<div>Loading Magazines…</div>}>
                          <MagazinesContainer
                            clientId={selectedClientId}
                            feemagazines={feeMagazines || 0}
                            onTotalMediaChange={handleMagazinesTotalChange}
                            onBurstsChange={handleMagazineBurstsChange}
                            onInvestmentChange={handleInvestmentChange}
                            onLineItemsChange={setMagazineItems}
                            campaignStartDate={form.watch("mp_campaigndates_start")}
                            campaignEndDate={form.watch("mp_campaigndates_end")}
                            campaignBudget={form.watch("mp_campaignbudget")}
                            campaignId={""}
                            mediaTypes={["magazines"]}
                          />
                        </Suspense>
                    )}
                    { medium.name === "mp_ooh" && (
                        <Suspense fallback={<div>Loading OOH…</div>}>
                          <OOHContainer
                            clientId={selectedClientId}
                            feeooh={feeOoh || 0}
                            onTotalMediaChange={handleOohTotalChange}
                            onBurstsChange={handleOohBurstsChange}
                            onInvestmentChange={handleInvestmentChange}
                            onLineItemsChange={setOohItems}
                            campaignStartDate={form.watch("mp_campaigndates_start")}
                            campaignEndDate={form.watch("mp_campaigndates_end")}
                            campaignBudget={form.watch("mp_campaignbudget")}
                            campaignId={""}
                            mediaTypes={["ooh"]}
                          />
                        </Suspense>
                    )}                                                                               
                  </div>
                );
              }
              return null;
            })}
          </form>
        </Form>
      </div>

      {/* Sticky Action Bar */}
      <div className="fixed bottom-0 left-[240px] right-0 bg-background/95 backdrop-blur-sm border-t p-4 flex justify-end space-x-2 z-50">
        <Button
          onClick={handleSaveCampaign}
          disabled={isLoading}
          className="bg-[#008e5e] text-white hover:bg-[#008e5e]/90"
        >
          {isLoading ? "Saving..." : "Save"}
        </Button>
        <Button
          onClick={handleGenerateMBA}
          disabled={isLoading}
          className="bg-[#fd7adb] text-white hover:bg-[#fd7adb]/90"
        >
          {isLoading ? "Generating..." : "Generate MBA"}
        </Button>
        <Button
          type="button"
          onClick={handleGenerateMediaPlan}
          disabled={isDownloading}
          className="bg-[#fd7adb] text-white hover:bg-[#fd7adb]/90"
        >
          {isDownloading ? "Creating Media Plan..." : "Download Media Plan"}
        </Button>
        <Button
          type="button"
          onClick={handleSaveCampaign}
          disabled={isLoading}
          className="bg-[#008e5e] text-white hover:bg-[#008e5e]/90"
        >
          {isLoading ? "Processing..." : "Save and Download All"}
        </Button>
      </div>
      {/* Add padding to the bottom of the page to account for the sticky bar */}
      <div className="h-24" /> {/* This creates space at the bottom of the page */}
    </div>
  )
}
