"use client"

import { useState, useEffect, lazy, Suspense, use } from "react"
import { useRouter } from "next/navigation"
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
import { getSearchBursts } from "@/components/media-containers/SearchContainer"
import { getSocialMediaBursts } from "@/components/media-containers/SocialMediaContainer"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { toast } from "@/components/ui/use-toast"
import { OutcomeModal } from "@/components/outcome-modal"
import { getSearchLineItems, getSearchBurstHistory } from "@/lib/api"
import { BillingSchedule, type BillingScheduleType } from "@/components/billing/BillingSchedule"
import type { BillingSchedule as BillingScheduleInterface } from "@/types/billing"

const CARBONE_TEMPLATE_ID = "6e2f3832fdf95264f33fb862c5e132a6095e3a0ecb1e259bfc0fc4a4f7e2c7c3"

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
  'mp_influencers',
  'mp_fixedfee'
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
  mbaidentifier: string
  feesearch: number
  feesocial: number
  feeprogdisplay: number
  feeprogvideo: number
  feeprogbvod: number
  feeprogaudio: number
  feeprogooh: number
  feecontentcreator: number
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
const ConsultingContainer = lazy(() => import("@/components/media-containers/ConsultingContainer"))

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
  { name: 'mp_fixedfee', label: "Consulting", component: ConsultingContainer },
];

export default function EditMediaPlan({ params }: { params: Promise<{ id: string }> }) {
  // Unwrap the params object
  const unwrappedParams = use(params)
  const id = unwrappedParams.id
  
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
  const [burstsData, setBurstsData] = useState([])
  const [investmentPerMonth, setInvestmentPerMonth] = useState([])
  const [searchBursts, setSearchBursts] = useState([])
  const [socialMediaBursts, setSocialMediaBursts] = useState([])
  const [isManualBilling, setIsManualBilling] = useState(false)
  const [isManualBillingModalOpen, setIsManualBillingModalOpen] = useState(false)
  const [manualBillingMonths, setManualBillingMonths] = useState<{ monthYear: string; amount: string }[]>([])
  const [manualBillingTotal, setManualBillingTotal] = useState("$0.00")
  const [modalOpen, setModalOpen] = useState(false)
  const [modalTitle, setModalTitle] = useState("")
  const [modalOutcome, setModalOutcome] = useState("")
  const [modalLoading, setModalLoading] = useState(false)
  const [searchFeeTotal, setSearchFeeTotal] = useState(0)
  const [socialMediaFeeTotal, setSocialMediaFeeTotal] = useState(0)
  const [grossMediaTotal, setGrossMediaTotal] = useState(0)
  const [totalInvestment, setTotalInvestment] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [mediaPlan, setMediaPlan] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [searchLineItems, setSearchLineItems] = useState<any[]>([])
  const [billingSchedule, setBillingSchedule] = useState<BillingScheduleType>([])
  const [billingScheduleData, setBillingScheduleData] = useState<BillingScheduleInterface>({
    months: [],
    overrides: [],
    isManual: false,
    campaignId: ""
  })
  const [isClientModalOpen, setIsClientModalOpen] = useState(false)

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

  // Add calculateBillingSchedule function
  const calculateBillingSchedule = () => {
    const startDate = form.watch("mp_campaigndates_start");
    const endDate = form.watch("mp_campaigndates_end");
    const budget = form.watch("mp_campaignbudget");

    if (!startDate || !endDate || !budget) return;

    let billingMonthsMap: Record<string, number> = {};

    // Initialize all months in the campaign period
    let current = new Date(startDate);
    while (current <= new Date(endDate)) {
      const monthYear = `${current.toLocaleString("default", { month: "long" })} ${current.getFullYear()}`;
      billingMonthsMap[monthYear] = 0;
      current.setMonth(current.getMonth() + 1);
      current.setDate(1);
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

        let current = new Date(burstStart);
        while (current <= burstEnd) {
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
          current.setMonth(current.getMonth() + 1);
          current.setDate(1);
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
      amount: `$${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    }));

    setBillingMonths(updatedBillingMonths);

    // Calculate total billing
    const totalAmount = Object.values(billingMonthsMap).reduce((sum, value) => sum + value, 0);
    setBillingTotal(`$${totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  };

  // Fetch the media plan data
  useEffect(() => {
    const fetchMediaPlan = async () => {
      try {
        console.log(`Fetching media plan with ID: ${id}`)
        const response = await fetch(`/api/mediaplans/${id}`)
        
        if (!response.ok) {
          const error = await response.json()
          console.error("Error response:", {
            status: response.status,
            statusText: response.statusText,
            error
          })
          
          setModalTitle("Error")
          setModalOutcome(error.error || "Failed to fetch media plan")
          setModalOpen(true)
          setModalLoading(false)
          
          setError(error.error || "Failed to fetch media plan")
          setLoading(false)
          return
        }

        const data = await response.json()
        console.log("Media plan data:", data)
        
        // Set the media plan data
        setMediaPlan(data)
        
        // Update form with the fetched data
        form.reset({
          ...data,
          mp_campaigndates_start: new Date(data.mp_campaigndates_start),
          mp_campaigndates_end: new Date(data.mp_campaigndates_end),
        })
        
        // Set the MBA number in the context
        if (data.mbanumber) {
          setMbaNumber(data.mbanumber)
        }
        
        // Set the client ID
        if (data.mp_clientname) {
          const client = clients.find(c => c.clientname_input === data.mp_clientname)
          if (client) {
            setSelectedClientId(client.id.toString())
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
          }
        }
        
        // Calculate billing schedule after form data is loaded
        setTimeout(() => {
          calculateBillingSchedule();
        }, 100);
        
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
  }, [id, form, setMbaNumber, clients])

  // Add a useEffect to recalculate billing schedule when campaign dates or budget change
  useEffect(() => {
    const startDate = form.watch("mp_campaigndates_start");
    const endDate = form.watch("mp_campaigndates_end");
    const budget = form.watch("mp_campaignbudget");
    
    if (startDate && endDate && budget && !isManualBilling) {
      calculateBillingSchedule();
    }
  }, [form.watch("mp_campaigndates_start"), form.watch("mp_campaigndates_end"), form.watch("mp_campaignbudget")]);

  // Add a useEffect to recalculate billing schedule when bursts change
  useEffect(() => {
    if (!isManualBilling && searchBursts.length > 0 || socialMediaBursts.length > 0) {
      calculateBillingSchedule();
    }
  }, [searchBursts, socialMediaBursts]);

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

  // Fetch search data when the media plan is loaded
  useEffect(() => {
    const fetchSearchData = async () => {
      if (mediaPlan && mediaPlan.mbanumber) {
        try {
          // Fetch line items
          const lineItems = await getSearchLineItems();
          const filteredLineItems = lineItems.filter(item => item.mbanumber === mediaPlan.mbanumber);
          
          // Fetch bursts for each line item
          const bursts = await getSearchBurstHistory();
          
          // Combine line items with their bursts
          const lineItemsWithBursts = filteredLineItems.map(item => {
            const itemBursts = bursts.filter(burst => burst.line_item_id === item.id);
            return {
              ...item,
              bursts: itemBursts,
            };
          });
          
          setSearchLineItems(lineItemsWithBursts);
        } catch (error) {
          console.error("Error fetching search data:", error);
        }
      }
    };
    
    fetchSearchData();
  }, [mediaPlan]);

  const handleClientSelect = (client: Client) => {
    setSelectedClientId(client.id.toString());
    setSelectedClient(client);
    setIsClientModalOpen(false);
  };

  const handleSearchBurstsChange = (bursts) => {
    setSearchBursts(bursts)
  }

  const handleSocialMediaBurstsChange = (bursts) => {
    setSocialMediaBursts(bursts)
  }

  const handleInvestmentChange = (investmentByMonth) => {
    setInvestmentPerMonth(investmentByMonth);
    // Initialize manual billing months with the investment data
    const formattedBillingMonths = investmentByMonth.map(month => ({
      monthYear: month.monthYear,
      amount: month.amount.toString()
    }));
    setManualBillingMonths(formattedBillingMonths);
  };

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
    
    setManualBillingTotal(new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(total));
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

  const handleResetBilling = () => {
    setIsManualBilling(false);
    calculateBillingSchedule();
  };

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
    try {
      setModalLoading(true)
      setModalTitle("Saving")
      setModalOutcome("Saving your campaign...")
      setModalOpen(true)

      const formData = form.getValues()
      
      // First, update the media plan
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
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to save campaign")
      }

      const data = await response.json()
      
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
      
      setModalTitle("Success")
      setModalOutcome("Campaign saved successfully")
      setModalLoading(false)
    } catch (error) {
      console.error("Error saving campaign:", error)
      setModalTitle("Error")
      setModalOutcome(error.message || "Failed to save campaign")
      setModalLoading(false)
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

  const handleDownloadMediaPlan = async () => {
    try {
      setModalLoading(true)
      setModalTitle("Downloading Media Plan")
      setModalOutcome("Preparing your media plan for download...")
      setModalOpen(true)

      const formData = form.getValues()
      const response = await fetch("/api/mediaplans/download", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...formData,
          search_bursts: searchBursts,
          social_media_bursts: socialMediaBursts,
          investment_by_month: investmentPerMonth,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to download media plan")
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `media-plan-${formData.mbanumber || "draft"}.pdf`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)

      setModalTitle("Success")
      setModalOutcome("Media plan downloaded successfully")
      setModalLoading(false)
    } catch (error) {
      console.error("Error downloading media plan:", error)
      setModalTitle("Error")
      setModalOutcome(error.message || "Failed to download media plan")
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
      setModalOutcome("Campaign saved and MBA number generated successfully")
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
                  <span className="font-medium">${item.amount}</span>
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

  const handleSearchTotalChange = (totalMedia: number, totalFee: number) => {
    setSearchTotal(totalMedia)
    setSearchFeeTotal(totalFee)
  }

  const handleSocialMediaTotalChange = (totalMedia: number, totalFee: number) => {
    setSocialMediaTotal(totalMedia)
    setSocialMediaFeeTotal(totalFee)
  }

  // Add calculation functions
  const calculateAssembledFee = () => {
    let total = 0
    if (feesearch) total += searchFeeTotal
    if (feesocial) total += socialMediaFeeTotal
    if (feeprogdisplay) total += (grossMediaTotal * feeprogdisplay) / 100
    if (feeprogvideo) total += (grossMediaTotal * feeprogvideo) / 100
    if (feeprogbvod) total += (grossMediaTotal * feeprogbvod) / 100
    if (feeprogaudio) total += (grossMediaTotal * feeprogaudio) / 100
    if (feeprogooh) total += (grossMediaTotal * feeprogooh) / 100
    if (feecontentcreator) total += (grossMediaTotal * feecontentcreator) / 100
    return total
  }

  const calculateAdServingFees = () => {
    let total = 0
    if (adservvideo) total += (grossMediaTotal * adservvideo) / 100
    if (adservimp) total += (grossMediaTotal * adservimp) / 100
    if (adservdisplay) total += (grossMediaTotal * adservdisplay) / 100
    if (adservaudio) total += (grossMediaTotal * adservaudio) / 100
    return total
  }

  const calculateProductionCosts = () => {
    // This would be calculated based on your production cost logic
    return 0
  }

  const calculateTotalInvestment = () => {
    return grossMediaTotal + calculateAssembledFee() + calculateAdServingFees() + calculateProductionCosts()
  }

  const handleBillingScheduleChange = (schedule: BillingScheduleType) => {
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
          }
        },
        totalAmount: entry.totalAmount
      })),
      overrides: [],
      isManual: isManualBilling,
      campaignId: id || ""
    });
  };

  const mediaTypes = [
    {
      name: "mp_television",
      label: "Television",
      feePercentage: selectedClient?.feeprogvideo || 0,
      lineItems: []
    },
    {
      name: "mp_radio",
      label: "Radio",
      feePercentage: selectedClient?.feeprogaudio || 0,
      lineItems: []
    },
    {
      name: "mp_newspaper",
      label: "Newspaper",
      feePercentage: selectedClient?.feeprogdisplay || 0,
      lineItems: []
    },
    {
      name: "mp_magazines",
      label: "Magazines",
      feePercentage: selectedClient?.feeprogdisplay || 0,
      lineItems: []
    },
    {
      name: "mp_ooh",
      label: "Out of Home",
      feePercentage: selectedClient?.feeprogooh || 0,
      lineItems: []
    },
    {
      name: "mp_cinema",
      label: "Cinema",
      feePercentage: selectedClient?.feeprogdisplay || 0,
      lineItems: []
    },
    {
      name: "mp_digidisplay",
      label: "Digital Display",
      feePercentage: selectedClient?.feeprogdisplay || 0,
      lineItems: []
    },
    {
      name: "mp_digiaudio",
      label: "Digital Audio",
      feePercentage: selectedClient?.feeprogaudio || 0,
      lineItems: []
    },
    {
      name: "mp_digivideo",
      label: "Digital Video",
      feePercentage: selectedClient?.feeprogvideo || 0,
      lineItems: []
    },
    {
      name: "mp_bvod",
      label: "BVOD",
      feePercentage: selectedClient?.feeprogbvod || 0,
      lineItems: []
    }
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-2xl font-semibold mb-2">Loading...</h2>
          <p className="text-gray-500">Please wait while we load your media plan.</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-2xl font-semibold mb-2">Error</h2>
          <p className="text-gray-500">{error}</p>
          <Button onClick={() => router.push("/mediaplans")} className="mt-4">
            Return to Media Plans
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full px-4 py-6 space-y-4">
      <h1 className="text-3xl font-bold">Edit Media Plan</h1>

      <Form {...form}>
        <form className="w-full space-y-6">
          <div className="space-y-6">
            <h3 className="text-lg font-semibold">Campaign Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <FormField
                control={form.control}
                name="mp_clientname"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Client Name</FormLabel>
                    <Select
                      onValueChange={(value) => {
                        field.onChange(value)
                        handleClientSelect(clients.find(c => c.id.toString() === value) || null)
                      }}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a client" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {clients.map((client) => (
                          <SelectItem key={client.id} value={client.clientname_input}>
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
                name="mp_campaignstatus"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Campaign Status</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="Draft">Draft</SelectItem>
                        <SelectItem value="Active">Active</SelectItem>
                        <SelectItem value="Completed">Completed</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="mp_campaignname"
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
                name="mp_brand"
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
                          const formattedValue = new Intl.NumberFormat("en-US", {
                            style: "currency",
                            currency: "USD",
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
            </div>
          </div>

          <div className="space-y-6">
            <h3 className="text-lg font-semibold">Media Types</h3>
            <div className="border border-gray-200 rounded-lg p-6 mt-6">
              <h2 className="text-xl font-semibold mb-4">Select Media Types</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 w-full">
                {mediaTypes.map(({ name, label }) => (
                  <FormField
                    key={name}
                    control={form.control}
                    name={name as FormFieldName}
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center space-x-3 space-y-0">
                        <FormControl>
                          <Switch
                            checked={field.value as boolean}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                        <FormLabel className="font-normal">{label}</FormLabel>
                      </FormItem>
                    )}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 border border-gray-200 rounded-lg p-6 mt-6">
            {/* MBA Details Section */}
            <div className="flex flex-col space-y-4">
              <h3 className="text-lg font-semibold mb-4">MBA Details</h3>
              
              {/* Dynamic Media Totals */}
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col space-y-3">
                  {mediaTypes.map((medium) => {
                    if (form.watch(medium.name as FormFieldName)) {
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
                    if (form.watch(medium.name as FormFieldName)) {
                      let total = 0;
                      if (medium.name === 'mp_search') {
                        total = searchTotal;
                      } else if (medium.name === 'mp_socialmedia') {
                        total = socialmediaTotal;
                      }
                      return (
                        <div key={medium.name} className="text-sm font-medium">
                          {new Intl.NumberFormat('en-US', {
                            style: 'currency',
                            currency: 'USD',
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2
                          }).format(total)}
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
                  {new Intl.NumberFormat('en-US', {
                    style: 'currency',
                    currency: 'USD',
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                  }).format(grossMediaTotal)}
                </div>
              </div>

              {/* Assembled Fee */}
              <div className="grid grid-cols-2 gap-4 mb-2">
                <div className="text-sm font-semibold">Assembled Fee</div>
                <div className="text-sm font-semibold text-right">
                  {new Intl.NumberFormat('en-US', {
                    style: 'currency',
                    currency: 'USD',
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                  }).format(calculateAssembledFee())}
                </div>
              </div>

              {/* Ad Serving and Tech Fees */}
              <div className="grid grid-cols-2 gap-4 mb-2">
                <div className="text-sm font-semibold">Ad Serving & Tech Fees</div>
                <div className="text-sm font-semibold text-right">
                  {new Intl.NumberFormat('en-US', {
                    style: 'currency',
                    currency: 'USD',
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                  }).format(calculateAdServingFees())}
                </div>
              </div>

              {/* Production Costs */}
              <div className="grid grid-cols-2 gap-4">
                <div className="text-sm font-semibold">Production</div>
                <div className="text-sm font-semibold text-right">
                  {new Intl.NumberFormat('en-US', {
                    style: 'currency',
                    currency: 'USD',
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                  }).format(calculateProductionCosts())}
                </div>
              </div>

              {/* Total Investment (ex GST) */}
              <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-gray-400">
                <div className="text-sm font-bold">Total Investment (ex GST)</div>
                <div className="text-sm font-bold text-right">
                  {new Intl.NumberFormat('en-US', {
                    style: 'currency',
                    currency: 'USD',
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                  }).format(calculateTotalInvestment())}
                </div>
              </div>
            </div>

            {/* Billing Schedule Section */}
            <div className="flex flex-col space-y-4 border border-gray-300 rounded-lg p-6 mt-6">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold">Billing Schedule</h3>
                {!isManualBilling ? (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setManualBillingMonths([...billingMonths]);
                      setManualBillingTotal(billingTotal);
                      setIsManualBillingModalOpen(true);
                    }}
                    className="bg-[#fd7adb] text-white font-bold hover:bg-[#fd7adb]/90"
                  >
                    Manual Billing
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    onClick={handleResetBilling}
                    className="bg-[#fd7adb] text-white font-bold hover:bg-[#fd7adb]/90"
                  >
                    Reset to Automatic
                  </Button>
                )}
              </div>

              {billingMonths.length === 0 ? (
                <p className="text-sm text-gray-500">No billing schedule available. Select campaign dates to generate.</p>
              ) : (
                <div className="flex flex-col space-y-4">
                  {billingMonths.map((month, index) => (
                    <div key={index} className="flex items-center justify-between">
                      <span className="text-sm font-medium">{month.monthYear}</span>
                      <input
                        type="text"
                        className="border border-gray-300 rounded px-3 py-2"
                        placeholder="$0.00"
                        value={month.amount}
                        readOnly
                      />
                    </div>
                  ))}
                  <div className="border-t border-gray-400 my-4"></div>
                  <div className="flex items-center justify-between font-semibold text-lg">
                    <span>Total Billing:</span>
                    <span>{billingTotal}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-6">
            <h3 className="text-lg font-semibold">Media Containers</h3>
            <div className="space-y-4">
              {Boolean(form.watch('mp_search' as FormFieldName)) && (
                <Suspense fallback={<div>Loading search container...</div>}>
                  <SearchContainer
                    clientId={selectedClientId}
                    feesearch={feesearch || 0}
                    onTotalMediaChange={handleSearchTotalChange}
                    onBurstsChange={handleSearchBurstsChange}
                    onInvestmentChange={handleInvestmentChange}
                    campaignStartDate={form.watch("mp_campaigndates_start") || new Date()}
                    campaignEndDate={form.watch("mp_campaigndates_end") || new Date()}
                    onBillingScheduleChange={handleBillingScheduleChange}
                    mediaTypes={mediaTypes}
                    campaignBudget={Number(form.watch("mp_campaignbudget") || 0)}
                    campaignId={id || ""}
                  />
                </Suspense>
              )}
              {Boolean(form.watch('mp_socialmedia' as FormFieldName)) && (
                <Suspense fallback={<div>Loading social media container...</div>}>
                  <SocialMediaContainer
                    clientId={selectedClientId}
                    feesocial={feesocial || 0}
                    onTotalMediaChange={handleSocialMediaTotalChange}
                    onBurstsChange={handleSocialMediaBurstsChange}
                    campaignStartDate={form.watch("mp_campaigndates_start") || new Date()}
                    campaignEndDate={form.watch("mp_campaigndates_end") || new Date()}
                    onBillingScheduleChange={handleBillingScheduleChange}
                    mediaTypes={mediaTypes}
                    campaignBudget={Number(form.watch("mp_campaignbudget") || 0)}
                    campaignId={id || ""}
                  />
                </Suspense>
              )}
              {/* Add other media containers here */}
            </div>
          </div>

          <BillingSchedule
            searchBursts={searchBursts.map(burst => ({
              startDate: new Date(burst.startDate),
              endDate: new Date(burst.endDate),
              totalAmount: Number(burst.budget),
              mediaType: 'search',
              feePercentage: feesearch || 0,
              clientPaysForMedia: false,
              budgetIncludesFees: false
            }))}
            socialMediaBursts={socialMediaBursts.map(burst => ({
              startDate: new Date(burst.startDate),
              endDate: new Date(burst.endDate),
              totalAmount: Number(burst.budget),
              mediaType: 'social',
              feePercentage: feesocial || 0,
              clientPaysForMedia: false,
              budgetIncludesFees: false
            }))}
            campaignStartDate={form.watch("mp_campaigndates_start") || new Date()}
            campaignEndDate={form.watch("mp_campaigndates_end") || new Date()}
            campaignBudget={Number(form.watch("mp_campaignbudget") || 0)}
            onBillingScheduleChange={handleBillingScheduleChange}
          />
        </form>
      </Form>

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
            <div className="border-t border-gray-400 my-4"></div>
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
              className="bg-[#008e5e] text-white hover:bg-[#008e5e]/90"
            >
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Sticky Banner */}
      <div className="fixed bottom-0 left-0 right-0 bg-background border-t p-4 flex justify-end space-x-2 z-50">
        <Button
          onClick={handleSaveCampaign}
          disabled={isLoading}
          className="bg-[#008e5e] text-white hover:bg-[#008e5e]/90"
        >
          {isLoading ? "Saving..." : "Save Campaign"}
        </Button>
        <Button
          onClick={handleGenerateMBA}
          disabled={isLoading}
          className="bg-[#fd7adb] text-white hover:bg-[#fd7adb]/90"
        >
          {isLoading ? "Generating..." : "Generate MBA"}
        </Button>
        <Button
          onClick={handleDownloadMediaPlan}
          disabled={isLoading}
          className="bg-[#fd7adb] text-white hover:bg-[#fd7adb]/90"
        >
          {isLoading ? "Downloading..." : "Download Media Plan"}
        </Button>
        <Button
          onClick={handleSaveAndGenerateAll}
          disabled={isLoading}
          className="bg-[#008e5e] text-white hover:bg-[#008e5e]/90"
        >
          {isLoading ? "Processing..." : "Save & Generate All"}
        </Button>
      </div>
    </div>
  )
} 