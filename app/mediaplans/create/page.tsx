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
import { getSearchBursts } from "@/components/media-containers/SearchContainer"
import { getSocialMediaBursts } from "@/components/media-containers/SocialMediaContainer";

const CARBONE_TEMPLATE_ID = "6e2f3832fdf95264f33fb862c5e132a6095e3a0ecb1e259bfc0fc4a4f7e2c7c3";

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

export default function CreateMediaPlan() {
  const [clients, setClients] = useState<Client[]>([])
  const [reportId, setReportId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [selectedClientId, setSelectedClientId] = useState<string>("") // Added state for selectedClientId
  const [feesearch, setFeeSearch] = useState<number | null>(null); // ✅ Renamed from clientFee to searchFee
  const [feesocial, setFeeSocial] = useState<number | null>(null);
  const [feeprogdisplay, setFeeProgDisplay] = useState<number | null>(null);
  const [feeprogvideo, setFeeProgVideo] = useState<number | null>(null);
  const [feeprogbvod, setFeeProgBvod] = useState<number | null>(null);
  const [feeprogaudio, setFeeProgAudio] = useState<number | null>(null);
  const [feeprogooh, setFeeProgOoh] = useState<number | null>(null);
  const [feecontentcreator, setFeeContentCreator] = useState<number | null>(null);
  const [adservvideo, setAdServVideo] = useState<number | null>(null);
  const [adservimp, setAdServImp] = useState<number | null>(null);
  const [adservdisplay, setAdServDisplay] = useState<number | null>(null);
  const [adservaudio, setAdServAudio] = useState<number | null>(null);
  const [searchTotal, setSearchTotal] = useState(0);
  const [socialmediaTotal, setSocialMediaTotal] = useState<number>(0)
  const { setMbaNumber } = useMediaPlanContext()
  const [billingTotal, setBillingTotal] = useState("$0.00"); // ✅ New state for total billing amount
  const [billingMonths, setBillingMonths] = useState<{ monthYear: string; amount: string }[]>([]);
  const [burstsData, setBurstsData] = useState([]);
  const [investmentPerMonth, setInvestmentPerMonth] = useState([]);
  const [searchBursts, setSearchBursts] = useState([]);
  const [socialMediaBursts, setSocialMediaBursts] = useState([]);

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
    },
  })

  const [searchFeeTotal, setSearchFeeTotal] = useState(0);

  const handleSearchTotalChange = (totalMedia: number, totalFee: number) => {
    setSearchTotal(totalMedia);
    setSearchFeeTotal(totalFee); // ✅ Store the actual calculated fee
  };
  
const [socialMediaFeeTotal, setSocialMediaFeeTotal] = useState(0);

const handleSocialMediaTotalChange = (totalMedia: number, totalFee: number) => {
  setSocialMediaTotal(totalMedia);
  setSocialMediaFeeTotal(totalFee); // ✅ Store the actual calculated fee
};

const [grossMediaTotal, setGrossMediaTotal] = useState(0);

useEffect(() => {
  setGrossMediaTotal(calculateGrossMediaTotal());
}, [searchTotal, socialmediaTotal]);

const [totalInvestment, setTotalInvestment] = useState(0);

useEffect(() => {
  const newGrossMediaTotal = calculateGrossMediaTotal();
  setGrossMediaTotal(newGrossMediaTotal);

  const newTotalInvestment = newGrossMediaTotal + calculateAssembledFee();
  setTotalInvestment(newTotalInvestment); // ✅ Ensures total investment updates dynamically
}, [searchTotal, socialmediaTotal, searchFeeTotal, socialMediaFeeTotal]);


useEffect(() => {
  calculateBillingSchedule();
}, []); // ✅ Run at mount to initialize with default start & end dates

useEffect(() => {
  if (form.watch("mp_campaigndates_start") && form.watch("mp_campaigndates_end")) {
    calculateBillingSchedule();
  }
}, [burstsData, form.watch("mp_campaigndates_start"), form.watch("mp_campaigndates_end")]); // ✅ Trigger when dates change
  
// Calculate and distribute burst budgets into monthly billing amounts
const calculateBillingSchedule = () => {
  const startDate = form.watch("mp_campaigndates_start");
  const endDate = form.watch("mp_campaigndates_end");

  if (!startDate || !endDate) return;

  let billingMonthsMap: Record<string, number> = {};

  let current = new Date(startDate);
  while (current <= new Date(endDate)) {
    const monthYear = `${current.toLocaleString("default", { month: "long" })} ${current.getFullYear()}`;
    billingMonthsMap[monthYear] = 0;
    current.setMonth(current.getMonth() + 1);
    current.setDate(1);
  }

  // ✅ Process bursts and distribute budgets correctly
  burstsData.forEach((burst) => {
    const burstStart = new Date(burst.startDate);
    const burstEnd = new Date(burst.endDate);
    const totalDays = Math.ceil((burstEnd.getTime() - burstStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    const dailyBudget = burst.budget / totalDays;

    let current = new Date(burstStart);
    while (current <= burstEnd) {
      const monthYear = `${current.toLocaleString("default", { month: "long" })} ${current.getFullYear()}`;

      // ✅ Calculate days the campaign is active in this month
      const nextMonth = new Date(current);
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      nextMonth.setDate(1);

      const lastDayOfMonth = new Date(nextMonth.getTime() - 1);
      const startOfMonth = new Date(current.getFullYear(), current.getMonth(), 1);
      const endOfMonth = lastDayOfMonth;

      const daysInMonth = Math.min(
        Math.ceil((endOfMonth.getTime() - current.getTime()) / (1000 * 60 * 60 * 24)) + 1,
        Math.ceil((burstEnd.getTime() - current.getTime()) / (1000 * 60 * 60 * 24)) + 1
      );

      // ✅ Multiply the daily budget by the correct number of days in this month
      const monthAllocation = dailyBudget * daysInMonth;

      billingMonthsMap[monthYear] = (billingMonthsMap[monthYear] || 0) + monthAllocation;

      // Move to the next month
      current.setMonth(current.getMonth() + 1);
      current.setDate(1);
    }
  });

  // ✅ Convert to array format
  const updatedBillingMonths = Object.entries(billingMonthsMap).map(([monthYear, amount]) => ({
    monthYear,
    amount: `$${amount.toFixed(2)}`,
  }));

  setBillingMonths(updatedBillingMonths);

  // ✅ Calculate total billing
  const totalAmount = Object.values(billingMonthsMap).reduce((sum, value) => sum + value, 0);
  setBillingTotal(`$${totalAmount.toFixed(2)}`);
};

const handleGenerateMBA = async () => {
  setIsLoading(true);

  try {
    // ✅ Ensure `form.getValues()` is accessible
    const formData = {
      clientName: form.getValues("mp_clientname") || "Unknown Client",
      campaignName: form.getValues("mp_campaignname") || "Unnamed Campaign",
      mbaNumber: form.getValues("mbanumber") || "N/A",
    };

    // ✅ Log data being sent
    console.log("Sending data to API:", formData);

    // ✅ Validate required data
    if (!formData.clientName || !formData.campaignName || !formData.mbaNumber) {
      console.error("❌ Missing required form values for MBA document.");
      alert("⚠️ Please ensure Client Name, Campaign Name, and MBA Number are filled.");
      return;
    }

    // ✅ Send request to Carbone API
    const response = await fetch("/api/carbone", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        templateId: CARBONE_TEMPLATE_ID, // ✅ Using global variable
        jsonData: formData,
      }),
    });

    // ✅ Log API response for debugging
    console.log("API Response:", response);

    if (!response.ok) {
      const errorResponse = await response.json();
      console.error("❌ API request failed:", errorResponse);
      throw new Error(`API request failed with status ${response.status}: ${errorResponse.error}`);
    }

    const data = await response.json();

    if (!data.reportId) {
      console.error("❌ Missing `reportId` in API response.");
      throw new Error("Missing `reportId` in API response.");
    }

    // ✅ Set the report ID for download
    setReportId(data.reportId);
    console.log("✅ MBA document successfully generated:", data.reportId);
  } catch (error) {
    console.error("❌ Error generating MBA document:", error);
    alert(`Failed to generate MBA document: ${error.message}`);
  } finally {
    setIsLoading(false);
  }
};

  // Calculate the total for each media type
const calculateMediaTotal = (mediaName) => {
  switch (mediaName) {
    case "mp_search":
      return searchTotal ?? 0;
    case "mp_socialmedia":
      return socialmediaTotal ?? 0;
    case "mp_progdisplay":
      return feeprogdisplay ?? 0;
    case "mp_progvideo":
      return feeprogvideo ?? 0;
    case "mp_progbvod":
      return feeprogbvod ?? 0;
    case "mp_progaudio":
      return feeprogaudio ?? 0;
    case "mp_progooh":
      return feeprogooh ?? 0;
    case "mp_influencers":
      return feecontentcreator ?? 0;
    default:
      return 0;
  }
};

const calculateGrossMediaTotal = () => {
  return (
    (searchTotal ?? 0) +
    (socialmediaTotal ?? 0)
  );
};


// Calculate the Assembled Fee (sum of all fees)
const calculateAssembledFee = () => {
  return (
    (searchFeeTotal ?? 0) +
    (socialMediaFeeTotal ?? 0) 
  );
};

const calculateTotalInvestment = () => {
  return grossMediaTotal + calculateAssembledFee();
};

// Calculate Ad Serving Fees
const calculateAdServingFees = () => {
  return (
    (adservvideo ?? 0) +
    (adservimp ?? 0) +
    (adservdisplay ?? 0) +
    (adservaudio ?? 0)
  );
};

// Calculate Production Costs (assuming content creator fees count as production)
const calculateProductionCosts = () => {
  return feecontentcreator ?? 0;
};

  function BillingAndMBASections({ form }) {
    const [billingMonths, setBillingMonths] = useState<{ monthYear: string; amount: string }[]>([]);
  
    useEffect(() => {
      const startDate = form.watch('mp_campaigndates_start');
      const endDate = form.watch('mp_campaigndates_end');
      if (startDate && endDate) {
        const months = [];
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
  
    const handleAmountChange = (index, value) => {
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

      useEffect(() => {
        calculateBillingSchedule();
      }, [searchBursts, socialMediaBursts]); // Triggers when bursts change      

      const calculateBillingSchedule = () => {
        const startDate = form.watch("mp_campaigndates_start");
        const endDate = form.watch("mp_campaigndates_end");
      
        if (!startDate || !endDate) return; // Ensure dates are selected
      
        let billingMonthsMap: Record<string, number> = {};
      
        let current = new Date(startDate);
        while (current <= new Date(endDate)) {
          const monthYear = `${current.toLocaleString("default", { month: "long" })} ${current.getFullYear()}`;
          billingMonthsMap[monthYear] = 0; 
          current.setMonth(current.getMonth() + 1);
          current.setDate(1);
        }
      
        // Combine bursts from both sources
        const allBursts = [...searchBursts, ...socialMediaBursts];
      
        allBursts.forEach((burst) => {
          const start = new Date(burst.startDate);
          const end = new Date(burst.endDate);
          const totalDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
          const dailyBudget = burst.budget / totalDays;
      
          let current = new Date(start);
          while (current <= end) {
            const monthYear = `${current.toLocaleString("default", { month: "long" })} ${current.getFullYear()}`;
            billingMonthsMap[monthYear] = (billingMonthsMap[monthYear] || 0) + dailyBudget;
            current.setDate(current.getDate() + 1);
          }
        });
      
        // Convert map to array
        const updatedBillingMonths = Object.entries(billingMonthsMap).map(([monthYear, amount]) => ({
          monthYear,
          amount: `$${(amount as number).toFixed(2)}`,
        }));
      
        setBillingMonths(updatedBillingMonths);
      };
          
      
      // Handle successful creation (e.g., show a success message, redirect, etc.)
      console.log("Media plan created successfully")
    } catch (error) {
      console.error("Failed to create media plan:", error)
      // TODO: Show error message to user
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
      console.log("Updated feesearch:", selectedClient.feesearch); // ✅ Debugging log
      setFeeSocial(selectedClient.feesocial);
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
    } else {
      form.setValue("mp_clientname", "")
      form.setValue("mbaidentifier", "")
      form.setValue("mbanumber", "")
      setSelectedClientId("")

      setFeeSearch(null);
      setFeeSocial(null);
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
    }
  }

  useEffect(() => {
    console.log("CreateMediaPlan: selectedClientId changed to", selectedClientId)
  }, [selectedClientId])

  const mediaTypes = [
    { name: "mp_fixedfee", label: "Fixed Fee", component: null },
    { name: "mp_consulting", label: "Consulting", component: ConsultingContainer },
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
  

  return (
    <div className="min-h-full w-full p-6">
      <h1 className="text-3xl font-bold mb-6">Create Media Plan</h1>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="w-full space-y-6">
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

          <div className="border border-gray-200 rounded-lg p-6 mt-6">
            <h2 className="text-xl font-semibold mb-4">Select Media Types</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 w-full">
              {mediaTypes.map((medium) => (
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
              ${total.toLocaleString()}
            </div>
          );
        }
        return null;
      })}
    </div>
  </div>

  {/* Separator */}
  <div className="border-t border-gray-400 my-4"></div>

  {/* ✅ Gross Media Total */}
<div className="grid grid-cols-2 gap-4 mb-2">
  <div className="text-sm font-semibold">Gross Media Total</div>
  <div className="text-sm font-semibold text-right">${grossMediaTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
</div>

  {/* Assembled Fee */}
  <div className="grid grid-cols-2 gap-4 mb-2">
    <div className="text-sm font-semibold">Assembled Fee </div>
    <div className="text-sm font-semibold text-right">${calculateAssembledFee().toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
  </div>

  {/* Ad Serving and Tech Fees */}
  <div className="grid grid-cols-2 gap-4 mb-2">
    <div className="text-sm font-semibold">Ad Serving & Tech Fees</div>
    <div className="text-sm font-semibold text-right">$ 0.00</div>
  </div>

  {/* Production Costs */}
  <div className="grid grid-cols-2 gap-4">
    <div className="text-sm font-semibold">Production</div>
    <div className="text-sm font-semibold text-right">$ 0.00</div>
  </div>

  {/* Total Investment (ex GST) */}
<div className="grid grid-cols-2 gap-4 mb-2">
  <div className="text-sm font-bold">Total Investment (ex GST)</div>
  <div className="text-sm font-bold text-right">${totalInvestment.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
</div>

</div>

{/* Billing Schedule Section */}
<div className="flex flex-col space-y-4 border border-gray-300 rounded-lg p-6 mt-6">
  <h3 className="text-lg font-semibold mb-4">Billing Schedule</h3>

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
      {/* ✅ New: Total Billing Amount */}
      <div className="border-t border-gray-400 my-4"></div>
      <div className="flex items-center justify-between font-semibold text-lg">
        <span>Total Billing:</span>
        <span>{parseFloat(billingTotal.replace(/[^0-9.]/g, "")).toLocaleString(undefined, { style: "currency", currency: "USD" })}</span>
      </div>
    </div>
  )}
</div>


       </div>

          {mediaTypes.map((medium) => {
  if (form.watch(medium.name as keyof MediaPlanFormValues) && medium.component) {
    const Component = medium.component;
    const componentProps = {
      clientId: selectedClientId,
      ...(medium.name === "mp_search" && { feesearch, onTotalMediaChange: handleSearchTotalChange, onBurstsChange: setBurstsData, onInvestmentChange: setInvestmentPerMonth }),
      ...(medium.name === "mp_socialmedia" && { feesocial, onTotalMediaChange: handleSocialMediaTotalChange, onBurstsChange: setBurstsData }),
    };
    return (
      <div key={medium.name} className="border border-gray-200 rounded-lg p-6 mt-6">
        <h2 className="text-xl font-semibold mb-4"></h2>
        <Suspense fallback={<div>Loading {medium.label}...</div>}>
          <Component {...componentProps} />
        </Suspense>
      </div>
    );
  }
  return null;
})}


          <Button type="submit" disabled={isLoading} className="w-full">
            {isLoading ? "Creating..." : "Create Media Plan"}
          </Button>

          <Button
           onClick={handleGenerateMBA}
            disabled={isLoading}
            className="w-full mt-4 bg-blue-600 text-white hover:bg-blue-700"
>
            {isLoading ? "Generating MBA..." : "Generate MBA"}
          </Button>

        </form>
      </Form>
    </div>
  )
}
;
