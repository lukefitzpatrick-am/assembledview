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

const mediaPlanSchema = z.object({
  mp_clientname: z.string().min(1, "Client name is required"),
  mp_campaignstatus: z.string().min(1, "Campaign status is required"),
  mp_campaignname: z.string().min(1, "Campaign name is required"),
  mp_campaigndates_start: z.date(),
  mp_campaigndates_end: z.date(),
  mp_brand: z.string().min(1, "Brand is required"),
  mp_clientcontact: z.string().min(1, "Client contact is required"),
  mp_ponumber: z.string(),
  mp_campaignbudget: z.number().positive("Campaign budget must be positive"),
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
})

type MediaPlanFormValues = z.infer<typeof mediaPlanSchema>

interface Client {
  id: number
  clientname_input: string
  mbaidentifier: string
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
  const [isLoading, setIsLoading] = useState(false)
  const [selectedClientId, setSelectedClientId] = useState<string>("") // Added state for selectedClientId
  const { setMbaNumber } = useMediaPlanContext()

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
    } else {
      form.setValue("mp_clientname", "")
      form.setValue("mbaidentifier", "")
      form.setValue("mbanumber", "")
      setSelectedClientId("")
    }
  }

  useEffect(() => {
    console.log("CreateMediaPlan: selectedClientId changed to", selectedClientId)
  }, [selectedClientId])

  const mediaTypes = [
    { name: "fixedfee", label: "Fixed Fee", component: null },
    { name: "consulting", label: "Consulting", component: ConsultingContainer },
    { name: "television", label: "Television", component: TelevisionContainer },
    { name: "radio", label: "Radio", component: RadioContainer },
    { name: "newspaper", label: "Newspaper", component: NewspaperContainer },
    { name: "magazines", label: "Magazines", component: MagazinesContainer },
    { name: "ooh", label: "OOH", component: OOHContainer },
    { name: "cinema", label: "Cinema", component: CinemaContainer },
    { name: "digidisplay", label: "Digital Display", component: DigitalDisplayContainer },
    { name: "digiaudio", label: "Digital Audio", component: DigitalAudioContainer },
    { name: "digivideo", label: "Digital Video", component: DigitalVideoContainer },
    { name: "bvod", label: "BVOD", component: BVODContainer },
    { name: "integration", label: "Integration", component: IntegrationContainer },
    { name: "search", label: "Search", component: SearchContainer },
    { name: "socialmedia", label: "Social Media", component: SocialMediaContainer },
    { name: "progdisplay", label: "Prog Display", component: ProgDisplayContainer },
    { name: "progvideo", label: "Prog Video", component: ProgVideoContainer },
    { name: "progbvod", label: "Prog BVOD", component: ProgBVODContainer },
    { name: "progaudio", label: "Prog Audio", component: ProgAudioContainer },
    { name: "progooh", label: "Prog OOH", component: ProgOOHContainer },
    { name: "influencers", label: "Influencers", component: InfluencersContainer },
  ]

  return (
    <div className="min-h-full w-full p-6">
      <h1 className="text-3xl font-bold mb-6">Create Media Plan</h1>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="w-full space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <FormField
              control={form.control}
              name="mp_clientname"
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
              name="mp_campaignstatus"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Campaign Status</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
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
              name="mp_campaignname"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Campaign Name</FormLabel>
                  <FormControl>
                    <Input {...field} />
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
                        disabled={(date) => date < new Date() || date > new Date("2100-01-01")}
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
                        disabled={(date) => date < new Date() || date > new Date("2100-01-01")}
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
                  name={medium.name === "fixedfee" ? "mp_fixedfee" : `mp_${medium.name}`}
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center space-x-3 space-y-0">
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                      <FormLabel className="font-normal">{medium.label}</FormLabel>
                    </FormItem>
                  )}
                />
              ))}
            </div>
          </div>

          {form.watch("mp_fixedfee") && (
            <div key="fixedfee" className="border border-gray-200 rounded-lg p-6 mt-6">
              <h2 className="text-xl font-semibold mb-4">Fixed Fee</h2>
              <p>Fixed fee content will be added here.</p>
            </div>
          )}

          {form.watch("mp_consulting") && (
            <div key="consulting" className="border border-gray-200 rounded-lg p-6 mt-6">
              <h2 className="text-xl font-semibold mb-4">Consulting</h2>
              <Suspense fallback={<div>Loading Consulting content...</div>}>
                <ConsultingContainer />
              </Suspense>
            </div>
          )}

          {form.watch("mp_search") && selectedClientId && (
            <div key="search" className="border border-gray-200 rounded-lg p-6 mt-6">
              <h2 className="text-xl font-semibold mb-4">Search</h2>
              <Suspense fallback={<div>Loading Search content...</div>}>
                <SearchContainer clientId={selectedClientId} />
              </Suspense>
            </div>
          )}

          {mediaTypes.map(
            (medium) =>
              medium.name !== "fixedfee" &&
              medium.name !== "consulting" &&
              form.watch(`mp_${medium.name}`) && (
                <div key={medium.name} className="border border-gray-200 rounded-lg p-6 mt-6">
                  <h2 className="text-xl font-semibold mb-4">{medium.label}</h2>
                  <Suspense fallback={<div>Loading {medium.label} content...</div>}>
                    {medium.component === SearchContainer ? (
                      <SearchContainer clientId={selectedClientId} />
                    ) : (
                      <medium.component />
                    )}
                  </Suspense>
                </div>
              ),
          )}
          <Button type="submit" disabled={isLoading} className="w-full">
            {isLoading ? "Creating..." : "Create Media Plan"}
          </Button>
        </form>
      </Form>
    </div>
  )
}

