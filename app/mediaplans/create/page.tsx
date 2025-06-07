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
import { OutcomeModal } from "@/components/OutcomeModal"
import { Table, TableBody, TableCell, TableHeader, TableRow, TableHead, TableFooter } from "@/components/ui/table"
import { Download, FileText } from "lucide-react"
import type { BillingBurst, BillingMonth } from "@/lib/billing/types"; // adjust path if needed
import { generateMediaPlan, MediaPlanHeader, LineItem, MediaItems } from '@/lib/generateMediaPlan'
import { saveAs } from 'file-saver'

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
  mbanumber: z.string(),
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
  const [modalOpen, setModalOpen] = useState(false)
  const [modalTitle, setModalTitle] = useState("")
  const [modalOutcome, setModalOutcome] = useState("")
  const [modalLoading, setModalLoading] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)
  const [clientAddress, setClientAddress] = useState("")
  const [clientSuburb, setClientSuburb] = useState("")
  const [clientState, setClientState] = useState("")
  const [clientPostcode, setClientPostcode] = useState("")

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
      mbanumber: "",
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
          mediaCosts: { search: 0, socialMedia: 0, progAudio: 0, cinema: 0, digiAudio: 0, digiDisplay: 0, digiVideo: 0, progDisplay: 0, progVideo: 0, progBvod: 0, progOoh: 0, television: 0, radio: 0, newspaper: 0, magazines: 0, ooh: 0, /* Add other media types as needed */ }
      };
      cur.setMonth(cur.getMonth() + 1);
      cur.setDate(1);
  }
    // 2. Distribute a single burst and track its media type.
    function distribute(burst: BillingBurst, mediaType: 'search' | 'socialMedia' | 'progAudio' | 'cinema' | 'digiAudio' | 'digiDisplay' | 'digiVideo' | 'progDisplay' | 'progVideo' | 'progBvod' | 'progOoh' | 'television' | 'radio' | 'newspaper' | 'magazines' | 'ooh' | 'bvod') {
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
  progAudioBursts.forEach(b => distributeAdServing(b, 'progAudio'))
  progVideoBursts.forEach(b => distributeAdServing(b, 'progVideo'))
  progBvodBursts.forEach(b => distributeAdServing(b, 'progBvod'))
  progOohBursts.forEach(b => distributeAdServing(b, 'progOoh'))
  cinemaBursts.forEach(b => distributeAdServing(b, 'cinema'))
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

              integration: "$0.00", influencers: "$0.00"
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

  const handleGenerateMBA = async () => {
    setIsLoading(true);

    const fv = form.getValues();

    // Validate required fields
    if (!fv.mbanumber) {
      toast({
        title: "Error",
        description: "MBA number is required to generate MBA",
        variant: "destructive",
      });
      setIsLoading(false);
      return;
    }

    // Inside handleGenerateMBA, before you build `body`:
const visibleMedia = mediaTypes
  .filter(medium => form.watch(medium.name as keyof MediaPlanFormValues))
  .map(medium => ({
    media_type: medium.label,
    gross_amount: calculateMediaTotal(medium.name),
  }));

    const body = {
      ...fv,
      gross_media: visibleMedia,
      grossMediaTotal,
      calculateAssembledFee: calculateAssembledFee(),
      calculateProductionCosts: calculateProductionCosts(),
      calculateAdServingFees: calculateAdServingFees(),
      totalInvestment,
      clientAddress,
      clientSuburb,
      clientState,
      clientPostcode
    };

    try {
      const res = await fetch('/api/mba/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to generate MBA');
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `MBA_${fv.mp_clientname}_${fv.mp_campaignname}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

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
      case "mp_magazine":
      default:
        return 0;
    }
  };

  const calculateGrossMediaTotal = (): number => {
    return (
      (searchTotal ?? 0) +
      (socialmediaTotal ?? 0) +
      (progAudioTotal ?? 0) +
      (cinemaTotal ?? 0) +
      (digiAudioTotal ?? 0) +
      (digiDisplayTotal ?? 0) +
      (digiVideoTotal ?? 0) +
      (bvodTotal ?? 0) +
      (progDisplayTotal ?? 0) +
      (progVideoTotal ?? 0) +
      (progBvodTotal ?? 0) +
      (progOohTotal ?? 0) +
      (televisionTotal ?? 0) +
      (radioTotal ?? 0) +
      (newspaperTotal ?? 0) +
      (magazineTotal ?? 0) +
      (oohTotal ?? 0)
    );
  };


  // Calculate the Assembled Fee (sum of all fees)
  const calculateAssembledFee = (): number => {
    return (
      (searchFeeTotal ?? 0) +
      (socialMediaFeeTotal ?? 0) +
      (progAudioFeeTotal ?? 0) +
      (cinemaFeeTotal ?? 0) +
      (digiAudioFeeTotal ?? 0) +
      (digiDisplayFeeTotal ?? 0) +
      (digiVideoFeeTotal ?? 0) +
      (bvodFeeTotal ?? 0) +
      (progDisplayFeeTotal ?? 0) +
      (progVideoFeeTotal ?? 0) +
      (progBvodFeeTotal ?? 0) +
      (televisionFeeTotal ?? 0) +
      (radioFeeTotal ?? 0) +
      (newspaperFeeTotal ?? 0) +
      (magazineFeeTotal ?? 0) +
      (oohFeeTotal ?? 0)
    );
  };

  // Calculate Ad Serving Fees
  const calculateAdServingFees = () => {
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
  
  function getRateForMediaType(mediaType: string): number {
    switch(mediaType) {
      case 'progVideo':
      case 'progBvod':
      case 'digiVideo':
      case 'bvod':  
        return adservvideo  ?? 0
      case 'progAudio':
      case 'digiAudio':
        return adservaudio ?? 0
      case 'progDisplay':
      case 'digiDisplay':
        return adservdisplay ?? 0
      default:
        return adservimp    ?? 0
    }
  }
  // Calculate Production Costs (assuming content creator fees count as production)
  const calculateProductionCosts = () => {
    return feecontentcreator ?? 0;
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

  async function onSubmit(data: MediaPlanFormValues) {
    setIsLoading(true)
    try {
      // First, save the media plan
      const response = await fetch("/api/mediaplans", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      })

      if (!response.ok) {
        throw new Error("Failed to create media plan")
      }

      const mediaPlanData = await response.json()
      const mbaNumber = mediaPlanData.mbanumber || data.mbanumber
      
      // Then, save search data if search is enabled
      if (data.mp_search && mbaNumber) {
        try {
          // @ts-ignore - Accessing the saveSearchData function from the window object
          if (window.saveSearchData) {
            // @ts-ignore - Calling the saveSearchData function
            await window.saveSearchData(mbaNumber)
            console.log("Search data saved successfully")
          } else {
            console.warn("saveSearchData function not found")
          }
        } catch (error) {
          console.error("Failed to save search data:", error)
          // Continue with the media plan creation even if search data saving fails
        }
      }

      // Then, save social media data if social media is enabled
      if (data.mp_socialmedia && mbaNumber) {
        try {
          // @ts-ignore - Accessing the saveSocialMediaData function from the window object
          if (window.saveSocialMediaData) {
            // @ts-ignore - Calling the saveSocialMediaData function
            await window.saveSocialMediaData(mbaNumber)
            console.log("Social media data saved successfully")
          } else {
            console.warn("saveSocialMediaData function not found")
          }
        } catch (error) {
          console.error("Failed to save social media data:", error)
          // Continue with the media plan creation even if social media data saving fails
        }
      }
      
      // Then, save cinema data if cinema is enabled
      if (data.mp_cinema && mbaNumber) {
        try {
          // @ts-ignore - Accessing the saveCinemaData function from the window object
          if (window.saveCinemaData) {
            // @ts-ignore - Calling the saveCinemaData function 
            await window.saveCinemaData(mbaNumber)
            console.log("Cinema data saved successfully")
          } else {
            console.warn("saveCinemaData function not found")
          }
        } catch (error) {
          console.error("Failed to save cinema data:", error)
          // Continue with the media plan creation even if cinema data saving fails
        }
      }

      // Then, save digiAudio data if digiAudio is enabled
      if (data.mp_digiaudio && mbaNumber) {
        try {
          // @ts-ignore - Accessing the saveDigiAudioData function from the window object
          if (window.saveDigiAudioData) {
            // @ts-ignore - Calling the saveDigiAudioData function
            await window.saveDigiAudioData(mbaNumber)
            console.log("DigiAudio data saved successfully")
          } else {
            console.warn("saveDigiAudioData function not found")
          }
        } catch (error) {
          console.error("Failed to save digiAudio data:", error)
          // Continue with the media plan creation even if digiAudio data saving fails
        }
      }

      // Then, save digiDisplay data if digiDisplay is enabled
      if (data.mp_digidisplay && mbaNumber) {
        try {
          // @ts-ignore - Accessing the saveDigiDisplayData function from the window object
          if (window.saveDigiDisplayData) {
            // @ts-ignore - Calling the saveDigiDisplayData function
            await window.saveDigiDisplayData(mbaNumber)
            console.log("DigiDisplay data saved successfully")
          } else {
            console.warn("saveDigiDisplayData function not found")
          }
        } catch (error) {
          console.error("Failed to save digiDisplay data:", error)
          // Continue with the media plan creation even if digiDisplay data saving fails  
        }
      }

      // Then, save digiVideo data if digiVideo is enabled
      if (data.mp_digivideo && mbaNumber) {
        try {
          // @ts-ignore - Accessing the saveDigiVideoData function from the window object
          if (window.saveDigiVideoData) {
            // @ts-ignore - Calling the saveDigiVideoData function
            await window.saveDigiVideoData(mbaNumber)
            console.log("DigiVideo data saved successfully")
          } else {
            console.warn("saveDigiVideoData function not found")
          }
        } catch (error) {
          console.error("Failed to save digiVideo data:", error)
          // Continue with the media plan creation even if digiVideo data saving fails
        }
      }

      // Then, save progDisplay data if progDisplay is enabled
      if (data.mp_progdisplay && mbaNumber) {
        try {
          // @ts-ignore - Accessing the saveProgDisplayData function from the window object
          if (window.saveProgDisplayData) {
            // @ts-ignore - Calling the saveProgDisplayData function
            await window.saveProgDisplayData(mbaNumber)
            console.log("ProgDisplay data saved successfully")
          } else {
            console.warn("saveProgDisplayData function not found")
          }
        } catch (error) {
          console.error("Failed to save progDisplay data:", error)
          // Continue with the media plan creation even if progDisplay data saving fails
        }
      }

      // Then, save progVideo data if progVideo is enabled  
      if (data.mp_progvideo && mbaNumber) {
        try {
          // @ts-ignore - Accessing the saveProgVideoData function from the window object
          if (window.saveProgVideoData) {
            // @ts-ignore - Calling the saveProgVideoData function
            await window.saveProgVideoData(mbaNumber)
            console.log("ProgVideo data saved successfully")
          } else {
            console.warn("saveProgVideoData function not found")
          }
        } catch (error) {
          console.error("Failed to save progVideo data:", error)
          // Continue with the media plan creation even if progVideo data saving fails
        }
      }

      // Then, save progBvod data if progBvod is enabled
      if (data.mp_progbvod && mbaNumber) {
        try {
          // @ts-ignore - Accessing the saveProgBvodData function from the window object
          if (window.saveProgBvodData) {
            // @ts-ignore - Calling the saveProgBvodData function
            await window.saveProgBvodData(mbaNumber)
            console.log("ProgBvod data saved successfully")
          } else {
            console.warn("saveProgBvodData function not found")
          }
        } catch (error) {
          console.error("Failed to save progBvod data:", error)
          // Continue with the media plan creation even if progBvod data saving fails
        }
      }

      // Then, save progOoh data if progOoh is enabled
      if (data.mp_progooh && mbaNumber) {
        try {
          // @ts-ignore - Accessing the saveProgOohData function from the window object
          if (window.saveProgOohData) {
            // @ts-ignore - Calling the saveProgOohData function
            await window.saveProgOohData(mbaNumber)
            console.log("ProgOoh data saved successfully")
          } else {
            console.warn("saveProgOohData function not found")
          }
        } catch (error) {
          console.error("Failed to save progOoh data:", error)
          // Continue with the media plan creation even if progOoh data saving fails
        }
      }

      // Then, save television data if television is enabled
      if (data.mp_television && mbaNumber) {
        try {
          // @ts-ignore - Accessing the saveTelevisionData function from the window object
          if (window.saveTelevisionData) {
            // @ts-ignore - Calling the saveTelevisionData function
            await window.saveTelevisionData(mbaNumber)
            console.log("Television data saved successfully")
          } else {
            console.warn("saveTelevisionData function not found")
          }
        } catch (error) {
          console.error("Failed to save television data:", error)
          // Continue with the media plan creation even if television data saving fails
        }
      }

      // Then, save radio data if radio is enabled
      if (data.mp_radio && mbaNumber) {
        try {
          // @ts-ignore - Accessing the saveRadioData function from the window object
          if (window.saveRadioData) {
            // @ts-ignore - Calling the saveRadioData function
            await window.saveRadioData(mbaNumber)
            console.log("Radio data saved successfully")
          } else {
            console.warn("saveRadioData function not found")
          }
        } catch (error) {
          console.error("Failed to save radio data:", error)
          // Continue with the media plan creation even if radio data saving fails
        }
      }

      // Then, save newspaper data if newspaper is enabled
      if (data.mp_newspaper && mbaNumber) {
        try {
          // @ts-ignore - Accessing the saveNewspaperData function from the window object
          if (window.saveNewspaperData) {
            // @ts-ignore - Calling the saveNewspaperData function
            await window.saveNewspaperData(mbaNumber)
            console.log("Newspaper data saved successfully")
          } else {
            console.warn("saveNewspaperData function not found")
          }
        } catch (error) {
          console.error("Failed to save newspaper data:", error)
          // Continue with the media plan creation even if newspaper data saving fails
        }
      }

      // Then, save magazine data if magazine is enabled
      if (data.mp_magazines && mbaNumber) {
        try {
          // @ts-ignore - Accessing the saveMagazineData function from the window object
          if (window.saveMagazinesData) {
            // @ts-ignore - Calling the saveMagazineData function
            await window.saveMagazinesData(mbaNumber)
            console.log("Magazines data saved successfully")
          } else {
            console.warn("saveMagazinesData function not found")
          }
        } catch (error) {
          console.error("Failed to save magazine data:", error)
          // Continue with the media plan creation even if magazine data saving fails
        }
      }

      // Then, save ooh data if ooh is enabled
      if (data.mp_ooh && mbaNumber) {
        try {
          // @ts-ignore - Accessing the saveOOHData function from the window object
          if (window.saveOOHData) {
            // @ts-ignore - Calling the saveOOHData function
            await window.saveOOHData(mbaNumber)
            console.log("OOH data saved successfully")
          } else {
            console.warn("saveOOHData function not found")
          }
        } catch (error) {
          console.error("Failed to save ooh data:", error)
          // Continue with the media plan creation even if ooh data saving fails
        }
      }
      // Handle successful creation
      console.log("Media plan created successfully")
      toast({
        title: "Success",
        description: "Media plan created successfully",
      })
      
      // Redirect to the edit page
      router.push(`/mediaplans/${mediaPlanData.id}/edit`)
    } catch (error) {
      console.error("Failed to create media plan:", error)
      toast({
        title: "Error",
        description: error.message || "Failed to create media plan",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
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
      form.setValue("mbanumber", "")
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
    type: 'search' | 'socialMedia' | 'digiAudio' | 'digiDisplay' | 'digiVideo' | 'bvod' | 'feeTotal' | 'progDisplay' | 'progVideo' | 'progBvod' | 'progOoh' | 'progAudio' | 'cinema' | 'newspaper' | 'magazines' | 'ooh' | 'television' | 'radio', 
    rawValue: string
  ) {
    const copy = [...manualBillingMonths];
    const numericValue = parseFloat(rawValue.replace(/[^0-9.-]/g, "")) || 0;
    const formatter = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" });
    const formattedValue = formatter.format(numericValue);

    // Update the specific value the user edited
    if (type === 'search') {
      copy[index].mediaCosts.search = formattedValue;
    } else if (type === 'socialMedia') {
      copy[index].mediaCosts.socialMedia = formattedValue;
    } else if (type === 'cinema') {
      copy[index].mediaCosts.cinema = formattedValue;
    } else if (type === 'digiAudio') {
      copy[index].mediaCosts.digiAudio = formattedValue;
    } else if (type === 'digiDisplay') {
      copy[index].mediaCosts.digiDisplay = formattedValue;
    } else if (type === 'digiVideo') {
      copy[index].mediaCosts.digiVideo = formattedValue;
    } else if (type === 'feeTotal') {
      copy[index].feeTotal = formattedValue;
    } else if (type === 'bvod') {
      copy[index].mediaCosts.bvod = formattedValue;
    } else if (type === 'progDisplay') {
      copy[index].mediaCosts.progDisplay = formattedValue;
    } else if (type === 'progVideo') {
      copy[index].mediaCosts.progVideo = formattedValue;
    } else if (type === 'progBvod') {
      copy[index].mediaCosts.progBvod = formattedValue;
    } else if (type === 'progOoh') {
      copy[index].mediaCosts.progOoh = formattedValue;
    } else if (type === 'progAudio') {
      copy[index].mediaCosts.progAudio = formattedValue;
    }
    else if (type === 'television') {
      copy[index].mediaCosts.television = formattedValue;
    } else if (type === 'radio') {
      copy[index].mediaCosts.radio = formattedValue;
    } else if (type === 'newspaper') {
      copy[index].mediaCosts.newspaper = formattedValue;
    } else if (type === 'magazines') {
      copy[index].mediaCosts.magazines = formattedValue;
    } else if (type === 'ooh') {
      copy[index].mediaCosts.ooh = formattedValue;
    }

    // Recalculate the aggregated totals for the affected month.
    const newMediaTotal = Object.values(copy[index].mediaCosts).reduce((sum, current) => {
        return sum + (parseFloat(String(current).replace(/[^0-9.-]/g, '')) || 0);
    }, 0);

    // Update the main mediaTotal and feeTotal properties for the month.
    copy[index].mediaTotal = formatter.format(newMediaTotal);
    const newFeeTotal = parseFloat(copy[index].feeTotal.replace(/[^0-9.-]/g, '')) || 0;
    copy[index].totalAmount = formatter.format(newMediaTotal + newFeeTotal);
    // --- END OF NEW PART ---

    // Recalculate the final Grand Total for the whole schedule.
    const grandTotal = copy.reduce(
      (acc, m) => acc + parseFloat(m.totalAmount.replace(/[^0-9.-]/g, "")),
      0
    );

    // Update state to trigger UI re-render.
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

  const handleSaveCampaign = async () => {
    setIsLoading(true);
    setModalOpen(true);
    setModalTitle("Saving Media Plan");
    setModalLoading(true);
    setModalOutcome("Saving media plan to database...");
    
    try {
      // Get form values
      const formValues = form.getValues();
      
      // Prepare data for the API
      const mediaPlanData = {
        mp_clientname: formValues.mp_clientname,
        mp_campaignstatus: "Draft",
        mp_campaignname: formValues.mp_campaignname,
        mp_campaigndates_start: formValues.mp_campaigndates_start,
        mp_campaigndates_end: formValues.mp_campaigndates_end,
        mp_brand: formValues.mp_brand,
        mp_clientcontact: formValues.mp_clientcontact,
        mp_ponumber: formValues.mp_ponumber,
        mp_campaignbudget: formValues.mp_campaignbudget,
        mbaidentifier: formValues.mbaidentifier,
        mbanumber: formValues.mbanumber,
        mp_fixedfee: formValues.mp_fixedfee || false,
        mp_television: formValues.mp_television || false,
        mp_radio: formValues.mp_radio || false,
        mp_newspaper: formValues.mp_newspaper || false,
        mp_magazines: formValues.mp_magazines || false,
        mp_ooh: formValues.mp_ooh || false,
        mp_cinema: formValues.mp_cinema || false,
        mp_digidisplay: formValues.mp_digidisplay || false,
        mp_digiaudio: formValues.mp_digiaudio || false,
        mp_digivideo: formValues.mp_digivideo || false,
        mp_bvod: formValues.mp_bvod || false,
        mp_integration: formValues.mp_integration || false,
        mp_search: formValues.mp_search || false,
        mp_socialmedia: formValues.mp_socialmedia || false,
        mp_progdisplay: formValues.mp_progdisplay || false,
        mp_progvideo: formValues.mp_progvideo || false,
        mp_progbvod: formValues.mp_progbvod || false,
        mp_progaudio: formValues.mp_progaudio || false,
        mp_progooh: formValues.mp_progooh || false,
        mp_influencers: formValues.mp_influencers || false
      };

      // Send data to API
      const response = await fetch("/api/mediaplans", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(mediaPlanData),
      });

      if (!response.ok) {
        // Try to get error message from response
        let errorMessage = "Failed to save media plan";
        try {
          const errorData = await response.json();
          if (errorData && errorData.error) {
            errorMessage = errorData.error;
          }
        } catch (e) {
          // If we can't parse the error JSON, just use the default message
          console.error("Could not parse error response:", e);
        }
        throw new Error(errorMessage);
      }

      // Only try to parse the response as JSON if it was successful
      const result = await response.json();
      console.log("Media plan saved successfully:", result);
      
      setModalOutcome(`Media plan saved successfully!\n\nClient: ${formValues.mp_clientname}\nCampaign: ${formValues.mp_campaignname}\nStatus: Draft\n\nRedirecting to media plans list...`);
      setModalLoading(false);
      
      // Redirect to the media plans list page after a delay
      setTimeout(() => {
        router.push("/mediaplans");
      }, 2000);
    } catch (error) {
      console.error("Error saving media plan:", error);
      setModalOutcome(`Error saving media plan: ${error instanceof Error ? error.message : "Unknown error"}`);
      setModalLoading(false);
      
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to save media plan",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveAndGenerateAll = async () => {
    setIsLoading(true);
    setModalOpen(true);
    setModalTitle("Save & Generate All");
    setModalLoading(true);
    setModalOutcome("Saving media plan and generating MBA...");
    
    try {
      // First save the media plan
      await handleSaveCampaign();
      
      // Then generate the MBA
      await handleGenerateMBA();
      
      setModalOutcome(`All operations completed successfully!\n\nMedia plan saved and MBA generated.`);
      setModalLoading(false);
      
      // Show success message
      toast({
        title: "Success",
        description: "Media plan saved and MBA generated successfully",
        variant: "default",
      });
    } catch (error) {
      console.error("Error in save and generate all:", error);
      setModalOutcome(`Error in save and generate all: ${error instanceof Error ? error.message : "Unknown error"}`);
      setModalLoading(false);
      
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to complete all operations",
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
        mbaNumber:      form.getValues('mbanumber'),
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
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
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
                name="mbanumber"
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
                <h3 className="text-lg font-semibold mb-4">MBA Details</h3>
    
                {/* Dynamic Media Totals */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col space-y-3">
                    {mediaTypes.map((medium) => {
                      if (form.watch(medium.name as keyof MediaPlanFormValues)) {
                        return (
                          <div key={medium.name} className="text-sm font-medium">
                            {medium.label}
                          </div>
                        );
                      }
                      return null;
                    })}
                  </div>

                  {/* Corresponding Media Totals */}
                  <div className="flex flex-col space-y-3 text-right">
                    {mediaTypes.map((medium) => {
                      if (form.watch(medium.name as keyof MediaPlanFormValues)) {
                        const total = calculateMediaTotal(medium.name);
                        return (
                          <div key={medium.name} className="text-sm font-medium">
                            {new Intl.NumberFormat("en-AU", { style:"currency", currency:"AUD" }).format(total)}
                          </div>
                        );
                      }
                      return null;
                    })}
                  </div>
                </div>

                {/* Separator */}
                <div className="border-t border-gray-400 my-4"></div>

                {/* Gross Media Total */}
                <div className="grid grid-cols-2 gap-4 mb-2">
                  <div className="text-sm font-semibold">Gross Media Total</div>
                  <div className="text-sm font-semibold text-right">
                    {new Intl.NumberFormat("en-AU", { style:"currency", currency:"AUD" }).format(grossMediaTotal)}
                  </div>
                </div>

                {/* Assembled Fee */}
                <div className="grid grid-cols-2 gap-4 mb-2">
                  <div className="text-sm font-semibold">Assembled Fee </div>
                  <div className="text-sm font-semibold text-right">
                    {new Intl.NumberFormat("en-AU", { style:"currency", currency:"AUD" }).format(calculateAssembledFee())}
                  </div>
                </div>

                {/* Ad Serving and Tech Fees */}
                <div className="grid grid-cols-2 gap-4 mb-2">
                  <div className="text-sm font-semibold">Ad Serving & Tech Fees</div>
                  <div className="text-sm font-semibold text-right">
                    {new Intl.NumberFormat("en-AU", { style:"currency", currency:"AUD" }).format(calculateAdServingFees())}
                  </div>
                </div>

                {/* Production Costs */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-sm font-semibold">Production</div>
                  <div className="text-sm font-semibold text-right">
                    {new Intl.NumberFormat("en-AU", { style:"currency", currency:"AUD" }).format(0)}
                  </div>
                </div>

                {/* Total Investment (ex GST) */}
                <div className="grid grid-cols-2 gap-4 mb-2">
                  <div className="text-sm font-bold">Total Investment (ex GST)</div>
                  <div className="text-sm font-bold text-right">
                    {new Intl.NumberFormat("en-AU", { style:"currency", currency:"AUD" }).format(totalInvestment)}
                  </div>
                </div>

              </div>

              <div className="border border-gray-300 rounded-lg p-6 mt-6">
              {/* Dynamic Billing Schedule */}
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">Billing Schedule</h3>
                {isManualBilling ? (
                  <Button onClick={handleResetBilling}>Reset Billing</Button>
                ) : (
                  <Button onClick={handleManualBillingOpen}>Manual Billing</Button>
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
              <Dialog
                open={isManualBillingModalOpen}
                onOpenChange={setIsManualBillingModalOpen}
              >
                <DialogContent className="max-w-5xl max-h-[90vh] overflow-auto">
                  <DialogHeader>
                    <DialogTitle>Manual Billing Schedule</DialogTitle>
                  </DialogHeader>
                  <div style={{ overflowX: "auto" }}>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Month</TableHead>
                          {form.watch('mp_search') && <TableHead className="text-right">Search</TableHead>}
                          {form.watch('mp_socialmedia') && <TableHead className="text-right">Social</TableHead>}
                          {form.watch('mp_bvod') && <TableHead className="text-right">BVOD</TableHead>}
                          {form.watch('mp_digiaudio') && <TableHead className="text-right">Digi Audio</TableHead>}
                          {form.watch('mp_digidisplay') && <TableHead className="text-right">Digi Display</TableHead>}
                          {form.watch('mp_digivideo') && <TableHead className="text-right">Digi Video</TableHead>}
                          {form.watch('mp_cinema') && <TableHead className="text-right">Cinema</TableHead>}
                          {form.watch('mp_progaudio') && <TableHead className="text-right">Prog Audio</TableHead>}
                          {form.watch('mp_progvideo') && <TableHead className="text-right">Prog Video</TableHead>}
                          {form.watch('mp_progbvod') && <TableHead className="text-right">Prog BVOD</TableHead>}
                          {form.watch('mp_progooh') && <TableHead className="text-right">Prog OOH</TableHead>}
                          {form.watch('mp_progdisplay') && <TableHead className="text-right">Prog Display</TableHead>}
                          {form.watch('mp_influencers') && <TableHead className="text-right">Influencers</TableHead>}
                          {form.watch('mp_newspaper') && <TableHead className="text-right">Newspaper</TableHead>}
                          {form.watch('mp_magazines') && <TableHead className="text-right">Magazines</TableHead>}
                          {form.watch('mp_television') && <TableHead className="text-right">Television</TableHead>}
                          {form.watch('mp_radio') && <TableHead className="text-right">Radio</TableHead>}
                          <TableHead className="text-right">Fees</TableHead>
                          <TableHead className="text-right">Ad Serving</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {manualBillingMonths.map((m, i) => {
                          // The row total is now read directly from the state we calculate in handleManualBillingChange
                          const rowTotalFormatted = m.totalAmount || "$0.00";
                          
                          return (
                            <TableRow key={m.monthYear}>
                              <TableCell>{m.monthYear}</TableCell>
                              {form.watch("mp_search") && (
                                <TableCell align="right">
                                  <Input
                                    className="text-right" /* Justify right */
                                    value={m.mediaCosts.search}
                                    /* onBlur finalizes the edit and recalculates everything */
                                    onBlur={e => handleManualBillingChange(i, "search", e.target.value)}
                                    /* onChange provides a smooth typing experience */
                                    onChange={e => {
                                      const tempCopy = [...manualBillingMonths];
                                      tempCopy[i].mediaCosts.search = e.target.value;
                                      setManualBillingMonths(tempCopy);
                                    }}
                                  />
                                </TableCell>
                              )}
                              {form.watch("mp_socialmedia") && (
                                <TableCell align="right">
                                  <Input
                                    className="text-right" /* Justify right */
                                    value={m.mediaCosts.socialMedia}
                                    onBlur={e => handleManualBillingChange(i, "socialMedia", e.target.value)}
                                    onChange={e => {
                                      const tempCopy = [...manualBillingMonths];
                                      tempCopy[i].mediaCosts.socialMedia = e.target.value;
                                      setManualBillingMonths(tempCopy);
                                    }}
                                  />
                                </TableCell>
                              )}
                              {form.watch("mp_bvod") && (
                                <TableCell align="right">
                                  <Input
                                    className="text-right" /* Justify right */
                                    value={m.mediaCosts.bvod}
                                    onBlur={e => handleManualBillingChange(i, "bvod", e.target.value)}
                                    onChange={e => {
                                      const tempCopy = [...manualBillingMonths];
                                      tempCopy[i].mediaCosts.bvod = e.target.value;
                                      setManualBillingMonths(tempCopy);
                                    }}
                                    />
                                </TableCell>
                              )}
                              {form.watch("mp_cinema") && (
                                <TableCell align="right">
                                  <Input
                                    className="text-right" /* Justify right */
                                    value={m.mediaCosts.cinema}
                                    onBlur={e => handleManualBillingChange(i, "cinema", e.target.value)}
                                    onChange={e => {
                                      const tempCopy = [...manualBillingMonths];
                                      tempCopy[i].mediaCosts.cinema = e.target.value;
                                      setManualBillingMonths(tempCopy);
                                    }}
                                  />
                                </TableCell>
                              )}
                              {form.watch("mp_digiaudio") && (
                                <TableCell align="right">
                                  <Input
                                    className="text-right" /* Justify right */
                                    value={m.mediaCosts.digiAudio}
                                    onBlur={e => handleManualBillingChange(i, "digiAudio", e.target.value)}
                                    onChange={e => {
                                      const tempCopy = [...manualBillingMonths];
                                      tempCopy[i].mediaCosts.digiAudio = e.target.value;
                                      setManualBillingMonths(tempCopy);
                                    }}
                                    />
                                </TableCell>
                              )}
                              {form.watch("mp_digidisplay") && (
                                <TableCell align="right">
                                  <Input
                                    className="text-right" /* Justify right */
                                    value={m.mediaCosts.digiDisplay}
                                    onBlur={e => handleManualBillingChange(i, "digiDisplay", e.target.value)}
                                    onChange={e => {
                                      const tempCopy = [...manualBillingMonths];
                                      tempCopy[i].mediaCosts.digiDisplay = e.target.value;
                                      setManualBillingMonths(tempCopy);
                                    }}
                                    />
                                </TableCell>
                              )}
                              {form.watch("mp_digivideo") && (
                                <TableCell align="right">
                                  <Input
                                    className="text-right" /* Justify right */
                                    value={m.mediaCosts.digiVideo}
                                    onBlur={e => handleManualBillingChange(i, "digiVideo", e.target.value)}
                                    onChange={e => {
                                      const tempCopy = [...manualBillingMonths];
                                      tempCopy[i].mediaCosts.digiVideo = e.target.value;
                                      setManualBillingMonths(tempCopy);
                                    }}
                                    />
                                </TableCell>
                              )}
                              {form.watch("mp_progaudio") && (
                                <TableCell align="right">
                                  <Input 
                                    className="text-right" /* Justify right */
                                    value={m.mediaCosts.progAudio}
                                    onBlur={e => handleManualBillingChange(i, "progAudio", e.target.value)}
                                    onChange={e => {
                                      const tempCopy = [...manualBillingMonths];
                                      tempCopy[i].mediaCosts.progAudio = e.target.value;
                                      setManualBillingMonths(tempCopy);
                                    }}
                                    />
                                </TableCell>
                              )}
                              {form.watch("mp_progvideo") && (
                              <TableCell align="right">
                                <Input
                                  className="text-right" /* Justify right */
                                  value={m.feeTotal}
                                  onBlur={e => handleManualBillingChange(i, "feeTotal", e.target.value)}
                                  onChange={e => {
                                    const tempCopy = [...manualBillingMonths];
                                    tempCopy[i].feeTotal = e.target.value;
                                    setManualBillingMonths(tempCopy);
                                  }}
                                />
                              </TableCell>
                              )}
                              {form.watch("mp_progdisplay") && (
                                <TableCell align="right">
                                  <Input
                                    className="text-right" /* Justify right */
                                    value={m.mediaCosts.progDisplay}
                                    onBlur={e => handleManualBillingChange(i, "progDisplay", e.target.value)}
                                    onChange={e => {
                                      const tempCopy = [...manualBillingMonths];
                                      tempCopy[i].mediaCosts.progDisplay = e.target.value;
                                      setManualBillingMonths(tempCopy);
                                    }}
                                  />
                                </TableCell>
                              )}
                              {form.watch("mp_progvideo") && (
                                <TableCell align="right">
                                  <Input
                                    className="text-right" /* Justify right */
                                    value={m.mediaCosts.progVideo}
                                    onBlur={e => handleManualBillingChange(i, "progVideo", e.target.value)}
                                    onChange={e => {
                                      const tempCopy = [...manualBillingMonths];
                                      tempCopy[i].mediaCosts.progVideo = e.target.value;
                                      setManualBillingMonths(tempCopy);
                                    }}
                                  />
                                </TableCell>
                              )}                                    
                              { /* This now displays the pre-formatted total from our state */}
                              <TableCell className="font-semibold text-right">{rowTotalFormatted}</TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                      {/* This new footer will show correctly formatted subtotals */}
                      <TableFooter>
                          <TableRow className="font-bold border-t-2">
                              <TableCell>Subtotals</TableCell>
                              {form.watch('mp_search') && <TableCell className="text-right">{new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(manualBillingMonths.reduce((acc, m) => acc + parseFloat((m.mediaCosts.search || "$0").replace(/[^0-9.-]/g, '')), 0))}</TableCell>}
                              {form.watch('mp_socialmedia') && <TableCell className="text-right">{new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(manualBillingMonths.reduce((acc, m) => acc + parseFloat((m.mediaCosts.socialMedia || "$0").replace(/[^0-np.-]/g, '')), 0))}</TableCell>}
                              {form.watch('mp_bvod') && <TableCell className="text-right">{new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(manualBillingMonths.reduce((acc, m) => acc + parseFloat((m.mediaCosts.bvod || "$0").replace(/[^0-np.-]/g, '')), 0))}</TableCell>}
                              {form.watch('mp_cinema') && <TableCell className="text-right">{new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(manualBillingMonths.reduce((acc, m) => acc + parseFloat((m.mediaCosts.cinema || "$0").replace(/[^0-np.-]/g, '')), 0))}</TableCell>}
                              {form.watch('mp_digiaudio') && <TableCell className="text-right">{new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(manualBillingMonths.reduce((acc, m) => acc + parseFloat((m.mediaCosts.digiAudio || "$0").replace(/[^0-np.-]/g, '')), 0))}</TableCell>}
                              {form.watch('mp_digidisplay') && <TableCell className="text-right">{new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(manualBillingMonths.reduce((acc, m) => acc + parseFloat((m.mediaCosts.digiDisplay || "$0").replace(/[^0-np.-]/g, '')), 0))}</TableCell>}
                              {form.watch('mp_digivideo') && <TableCell className="text-right">{new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(manualBillingMonths.reduce((acc, m) => acc + parseFloat((m.mediaCosts.digiVideo || "$0").replace(/[^0-np.-]/g, '')), 0))}</TableCell>}
                              {form.watch('mp_progaudio') && <TableCell className="text-right">{new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(manualBillingMonths.reduce((acc, m) => acc + parseFloat((m.mediaCosts.progAudio || "$0").replace(/[^0-np.-]/g, '')), 0))}</TableCell>}
                              {form.watch('mp_progdisplay') && <TableCell className="text-right">{new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(manualBillingMonths.reduce((acc, m) => acc + parseFloat((m.mediaCosts.progDisplay || "$0").replace(/[^0-np.-]/g, '')), 0))}</TableCell>}
                              
                              <TableCell className="text-right">{new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(manualBillingMonths.reduce((acc, m) => acc + parseFloat((m.feeTotal || "$0").replace(/[^0-9.-]/g, '')), 0))}</TableCell>
                              <TableCell className="text-right">{manualBillingTotal}</TableCell>
                          </TableRow>
                      </TableFooter>
                    </Table>
                  </div>
                  <div className="mt-4 text-right">
                    <span className="font-bold">Grand Total: {manualBillingTotal}</span>
                  </div>
                  {/* The new footer with Reset, Cancel, and Save buttons */}
                  <DialogFooter className="sm:justify-between pt-4">
                    <Button variant="outline" onClick={handleManualBillingReset} className="sm:mr-auto">
                      Reset
                    </Button>
                    <div className="flex space-x-2">
                        <Button variant="ghost" onClick={() => setIsManualBillingModalOpen(false)}>
                          Cancel
                        </Button>
                        <Button onClick={handleManualBillingSave}>Save</Button>
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
          onClick={handleSaveAndGenerateAll}
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
