"use client"

import { useState, useEffect } from "react"
import { useForm, useFieldArray } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { format } from "date-fns"
import { useRouter, useParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Combobox } from "@/components/ui/combobox"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { CalendarIcon, Plus, Trash2, Download, Save } from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "@/components/ui/use-toast"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

const scopeSchema = z.object({
  client_name: z.string().min(1, "Client name is required"),
  contact_name: z.string().min(1, "Contact name is required"),
  contact_email: z.string().email("Invalid email address"),
  scope_date: z.date(),
  scope_version: z.number().default(1),
  project_name: z.string().min(1, "Project name is required"),
  project_status: z.string().min(1, "Project status is required"),
  project_overview: z.string().default(""),
  deliverables: z.string().default(""),
  tasks_steps: z.string().default(""),
  timelines: z.string().default(""),
  responsibilities: z.string().default(""),
  requirements: z.string().default(""),
  assumptions: z.string().default(""),
  exclusions: z.string().default(""),
  cost: z.array(z.object({
    expense_category: z.string().default(""),
    description: z.string().default(""),
    cost: z.number().default(0),
  })).min(3, "At least 3 cost items are required"),
  payment_terms_and_conditions: z.string().default(""),
  billing_schedule: z.array(z.object({
    month: z.string().min(1, "Month is required"),
    cost: z.number().default(0),
  })).min(1, "At least one billing schedule item is required"),
  scope_id: z.string().optional(),
})

type ScopeFormValues = z.infer<typeof scopeSchema>

interface Client {
  id: number
  clientname_input?: string
  mp_client_name?: string
  mbaidentifier: string
}

interface ScopeOfWork {
  id: number
  client_name: string
  contact_name: string
  contact_email: string
  scope_date: string
  scope_version: number
  project_name: string
  project_status: string
  project_overview: string
  deliverables: string
  tasks_steps: string
  timelines: string
  responsibilities: string
  requirements: string
  assumptions: string
  exclusions: string
  cost: any
  payment_terms_and_conditions: string
  billing_schedule?: any
  scope_id?: string
}

// Helper function to generate month/year options (current month ±12 months)
const generateMonthYearOptions = () => {
  const options: { value: string; label: string }[] = []
  const now = new Date()
  const currentMonth = now.getMonth()
  const currentYear = now.getFullYear()

  for (let i = -12; i <= 12; i++) {
    const date = new Date(currentYear, currentMonth + i, 1)
    const monthName = date.toLocaleString('en-US', { month: 'long' })
    const year = date.getFullYear()
    const value = `${year}-${String(date.getMonth() + 1).padStart(2, '0')}`
    const label = `${monthName} ${year}`
    options.push({ value, label })
  }

  return options
}

// Helper function to get next month from a given month string (YYYY-MM)
const getNextMonth = (monthStr: string): string => {
  const [year, month] = monthStr.split('-').map(Number)
  const date = new Date(year, month - 1, 1)
  date.setMonth(date.getMonth() + 1)
  const nextYear = date.getFullYear()
  const nextMonth = String(date.getMonth() + 1).padStart(2, '0')
  return `${nextYear}-${nextMonth}`
}

// Helper function to format month string to display format
const formatMonthDisplay = (monthStr: string): string => {
  const [year, month] = monthStr.split('-').map(Number)
  const date = new Date(year, month - 1, 1)
  const monthName = date.toLocaleString('en-US', { month: 'long' })
  return `${monthName} ${year}`
}

export default function EditScopePage() {
  const router = useRouter()
  const params = useParams()
  const id = params?.id as string
  const [clients, setClients] = useState<Client[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)
  const [scopeData, setScopeData] = useState<ScopeOfWork | null>(null)
  const [latestVersion, setLatestVersion] = useState<number>(1)
  const [scopeId, setScopeId] = useState<string>("")
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)

  const form = useForm<ScopeFormValues>({
    resolver: zodResolver(scopeSchema),
    defaultValues: {
      client_name: "",
      contact_name: "",
      contact_email: "",
      scope_date: new Date(),
      scope_version: 1,
      project_name: "",
      project_status: "Draft",
      project_overview: "",
      deliverables: "",
      tasks_steps: "",
      timelines: "",
      responsibilities: "",
      requirements: "",
      assumptions: "",
      exclusions: "",
      cost: [
        { expense_category: "", description: "", cost: 0 },
        { expense_category: "", description: "", cost: 0 },
        { expense_category: "", description: "", cost: 0 },
      ],
      payment_terms_and_conditions: "",
      billing_schedule: [{
        month: `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`,
        cost: 0,
      }],
    },
  })

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "cost",
  })

  const { fields: billingFields, append: appendBilling, remove: removeBilling } = useFieldArray({
    control: form.control,
    name: "billing_schedule",
  })

  const monthYearOptions = generateMonthYearOptions()

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

  // Fetch scope data and find latest version
  useEffect(() => {
    const fetchScopeData = async () => {
      if (!id) return

      try {
        setIsLoading(true)
        const response = await fetch(`/api/scopes-of-work/${id}`)
        if (!response.ok) {
          throw new Error("Failed to fetch scope")
        }
        const data = await response.json()
        setScopeData(data)

        // Find latest version of the same scope (same project_name and client_name)
        let maxVersion = data.scope_version || 1
        const allScopesResponse = await fetch("/api/scopes-of-work")
        if (allScopesResponse.ok) {
          const allScopes = await allScopesResponse.json()
          const sameScopes = Array.isArray(allScopes)
            ? allScopes.filter(
                (s: ScopeOfWork) =>
                  s.project_name === data.project_name &&
                  s.client_name === data.client_name
              )
            : []
          
          maxVersion = sameScopes.reduce(
            (max: number, s: ScopeOfWork) => Math.max(max, s.scope_version || 1),
            1
          )
          setLatestVersion(maxVersion)
        }

        // Find the client to get mbaidentifier
        const client = clients.find(c => 
          (c.clientname_input || c.mp_client_name) === data.client_name
        )
        setSelectedClient(client || null)

        // Parse cost if it's a string
        let costData = data.cost || []
        if (typeof costData === "string") {
          try {
            costData = JSON.parse(costData)
          } catch {
            costData = []
          }
        }
        if (!Array.isArray(costData) || costData.length === 0) {
          costData = [
            { expense_category: "", description: "", cost: 0 },
            { expense_category: "", description: "", cost: 0 },
            { expense_category: "", description: "", cost: 0 },
          ]
        }

        // Parse billing_schedule if it's a string
        let billingScheduleData = data.billing_schedule || []
        if (typeof billingScheduleData === "string") {
          try {
            billingScheduleData = JSON.parse(billingScheduleData)
          } catch {
            billingScheduleData = []
          }
        }
        if (!Array.isArray(billingScheduleData) || billingScheduleData.length === 0) {
          billingScheduleData = [{
            month: `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`,
            cost: 0,
          }]
        }

        // Generate new scope_id based on new version
        const newVersion = maxVersion + 1
        let newScopeId = ""
        if (client?.mbaidentifier) {
          const scopeIdPrefix = `${client.mbaidentifier}_sow`
          newScopeId = `${scopeIdPrefix}${newVersion.toString().padStart(3, "0")}`
        }
        setScopeId(newScopeId)

        // Populate form
        form.reset({
          client_name: data.client_name || "",
          contact_name: data.contact_name || "",
          contact_email: data.contact_email || "",
          scope_date: data.scope_date ? new Date(data.scope_date) : new Date(),
          scope_version: newVersion, // Auto-increment from latest version
          project_name: data.project_name || "",
          project_status: data.project_status || "Draft",
          project_overview: data.project_overview || "",
          deliverables: data.deliverables || "",
          tasks_steps: data.tasks_steps || "",
          timelines: data.timelines || "",
          responsibilities: data.responsibilities || "",
          requirements: data.requirements || "",
          assumptions: data.assumptions || "",
          exclusions: data.exclusions || "",
          cost: costData,
          payment_terms_and_conditions: data.payment_terms_and_conditions || "",
          billing_schedule: billingScheduleData,
          scope_id: newScopeId,
        })
      } catch (error) {
        console.error("Error fetching scope:", error)
        toast({
          title: "Error",
          description: "Failed to load scope of work",
          variant: "destructive",
        })
        router.push("/scopes-of-work")
      } finally {
        setIsLoading(false)
      }
    }
    fetchScopeData()
  }, [id, form, router, clients])

  // Watch scope version to update scope_id
  const scopeVersion = form.watch("scope_version")
  useEffect(() => {
    if (selectedClient?.mbaidentifier && scopeVersion) {
      const scopeIdPrefix = `${selectedClient.mbaidentifier}_sow`
      const newScopeId = `${scopeIdPrefix}${scopeVersion.toString().padStart(3, "0")}`
      setScopeId(newScopeId)
      form.setValue("scope_id", newScopeId)
    }
  }, [scopeVersion, selectedClient, form])

  // Calculate total cost
  const totalCost = form.watch("cost").reduce((sum, item) => sum + (item.cost || 0), 0)

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency: "AUD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value)
  }

  const handleCostChange = (index: number, field: "expense_category" | "description" | "cost", value: string | number) => {
    const currentCost = form.getValues("cost")
    currentCost[index] = {
      ...currentCost[index],
      [field]: value,
    }
    form.setValue("cost", currentCost)
  }

  const handleCostBlur = (index: number) => {
    const currentCost = form.getValues("cost")
    const costValue = currentCost[index].cost
    if (typeof costValue === "string") {
      const numericValue = parseFloat(costValue.toString().replace(/[^0-9.]/g, "")) || 0
      currentCost[index].cost = numericValue
      form.setValue("cost", currentCost)
    }
  }

  const onSubmit = async (data: ScopeFormValues) => {
    setIsSaving(true)
    try {
      // Generate new scope_id based on the version being saved
      let newScopeId = scopeId
      if (selectedClient?.mbaidentifier) {
        const scopeIdPrefix = `${selectedClient.mbaidentifier}_sow`
        newScopeId = `${scopeIdPrefix}${data.scope_version.toString().padStart(3, "0")}`
      }

      const response = await fetch(`/api/scopes-of-work/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data,
          scope_date: format(data.scope_date, "yyyy-MM-dd"),
          scope_id: newScopeId,
        }),
      })

      if (!response.ok) {
        throw new Error("Failed to update scope")
      }

      toast({
        title: "Success",
        description: "Scope of work updated successfully",
      })

      router.push("/scopes-of-work")
    } catch (error) {
      console.error("Error updating scope:", error)
      toast({
        title: "Error",
        description: "Failed to update scope of work",
        variant: "destructive",
      })
    } finally {
      setIsSaving(false)
    }
  }

  const handleDownload = async () => {
    setIsDownloading(true)
    try {
      const formData = form.getValues()
      const response = await fetch("/api/scopes-of-work/generate-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          scope_date: format(formData.scope_date, "yyyy-MM-dd"),
        }),
      })

      if (!response.ok) {
        throw new Error("Failed to generate PDF")
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = `Scope_${formData.client_name}_${formData.project_name}.pdf`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)

      toast({
        title: "Success",
        description: "PDF downloaded successfully",
      })
    } catch (error) {
      console.error("Error downloading PDF:", error)
      toast({
        title: "Error",
        description: "Failed to generate PDF",
        variant: "destructive",
      })
    } finally {
      setIsDownloading(false)
    }
  }

  if (isLoading) {
    return (
      <div className="w-full min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p>Loading scope of work...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full min-h-screen pb-24">
      <div className="w-full px-4 py-6 space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold">Edit Scope of Work</h1>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Client Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="client_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Client Name</FormLabel>
                        <FormControl>
                          <Input {...field} readOnly disabled className="bg-muted cursor-not-allowed" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="contact_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Contact Name</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="contact_email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Contact Email</FormLabel>
                        <FormControl>
                          <Input type="email" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="scope_date"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Scope Date</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant={"outline"}
                                className={cn(
                                  "w-full pl-3 text-left font-normal",
                                  !field.value && "text-muted-foreground"
                                )}
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
                    name="scope_version"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Scope Version</FormLabel>
                        <FormControl>
                          <Input type="number" {...field} readOnly value={field.value} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="space-y-2">
                    <FormLabel>Scope ID</FormLabel>
                    <Input value={scopeId || ""} readOnly placeholder="Will be generated on save" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Project Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="project_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Project Name</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="project_status"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Project Status</FormLabel>
                        <FormControl>
                          <Combobox
                            value={field.value}
                            onValueChange={field.onChange}
                            placeholder="Select status"
                            searchPlaceholder="Search statuses..."
                            options={[
                              { value: "Approved", label: "Approved" },
                              { value: "Cancelled", label: "Cancelled" },
                              { value: "Completed", label: "Completed" },
                              { value: "Draft", label: "Draft" },
                              { value: "In-Progress", label: "In-Progress" },
                              { value: "Submitted", label: "Submitted" },
                            ]}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Project Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="project_overview"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Project Overview/Objectives</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          className="min-h-[120px]"
                          placeholder="Enter project overview..."
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="deliverables"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Deliverables</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          className="min-h-[120px]"
                          placeholder="Enter deliverables..."
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="tasks_steps"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tasks/Steps</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          className="min-h-[120px]"
                          placeholder="Enter tasks and steps..."
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="timelines"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Timelines</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          className="min-h-[120px]"
                          placeholder="Enter timelines..."
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="responsibilities"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Responsibilities</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          className="min-h-[120px]"
                          placeholder="Enter responsibilities..."
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="requirements"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Requirements</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          className="min-h-[120px]"
                          placeholder="Enter requirements..."
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="assumptions"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Assumptions</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          className="min-h-[120px]"
                          placeholder="Enter assumptions..."
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="exclusions"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Exclusions</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          className="min-h-[120px]"
                          placeholder="Enter exclusions..."
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Cost Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Expense Category</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right">Cost</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {fields.map((field, index) => (
                      <TableRow key={field.id}>
                        <TableCell>
                          <FormField
                            control={form.control}
                            name={`cost.${index}.expense_category`}
                            render={({ field: formField }) => (
                              <Input
                                {...formField}
                                placeholder="Category"
                              />
                            )}
                          />
                        </TableCell>
                        <TableCell>
                          <FormField
                            control={form.control}
                            name={`cost.${index}.description`}
                            render={({ field: formField }) => (
                              <Input
                                {...formField}
                                placeholder="Description"
                              />
                            )}
                          />
                        </TableCell>
                        <TableCell>
                          <FormField
                            control={form.control}
                            name={`cost.${index}.cost`}
                            render={({ field: formField }) => (
                              <Input
                                type="text"
                                {...formField}
                                value={formField.value || ""}
                                onChange={(e) => {
                                  const value = e.target.value.replace(/[^0-9.]/g, "")
                                  formField.onChange(value)
                                }}
                                onBlur={() => {
                                  formField.onBlur()
                                  handleCostBlur(index)
                                }}
                                placeholder="$0.00"
                                className="text-right"
                              />
                            )}
                          />
                        </TableCell>
                        <TableCell>
                          {fields.length > 3 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => remove(index)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter>
                    <TableRow>
                      <TableCell colSpan={2} className="text-right font-bold">
                        TOTAL (EX GST):
                      </TableCell>
                      <TableCell className="text-right font-bold">
                        {formatCurrency(totalCost)}
                      </TableCell>
                      <TableCell></TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
                <Button
                  type="button"
                  variant="outline"
                  className="mt-4"
                  onClick={() => append({ expense_category: "", description: "", cost: 0 })}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add Row
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Payment Terms and Conditions</CardTitle>
              </CardHeader>
              <CardContent>
                <FormField
                  control={form.control}
                  name="payment_terms_and_conditions"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Textarea
                          {...field}
                          className="min-h-[120px]"
                          placeholder="Enter payment terms and conditions..."
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Billing Schedule</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Month</TableHead>
                      <TableHead className="text-right">Cost</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {billingFields.map((field, index) => (
                      <TableRow key={field.id}>
                        <TableCell>
                          <FormField
                            control={form.control}
                            name={`billing_schedule.${index}.month`}
                            render={({ field: formField }) => (
                              <FormControl>
                                <Combobox
                                  value={formField.value}
                                  onValueChange={formField.onChange}
                                  placeholder="Select month"
                                  searchPlaceholder="Search months..."
                                  options={monthYearOptions.map((option) => ({
                                    value: option.value,
                                    label: option.label,
                                  }))}
                                />
                              </FormControl>
                            )}
                          />
                        </TableCell>
                        <TableCell>
                          <FormField
                            control={form.control}
                            name={`billing_schedule.${index}.cost`}
                            render={({ field: formField }) => (
                              <Input
                                type="text"
                                {...formField}
                                value={formField.value || ""}
                                onChange={(e) => {
                                  const value = e.target.value.replace(/[^0-9.]/g, "")
                                  formField.onChange(value)
                                }}
                                onBlur={() => {
                                  formField.onBlur()
                                  const currentBilling = form.getValues("billing_schedule")
                                  const costValue = currentBilling[index].cost
                                  if (typeof costValue === "string") {
                                    const numericValue = parseFloat(costValue.toString().replace(/[^0-9.]/g, "")) || 0
                                    currentBilling[index].cost = numericValue
                                    form.setValue("billing_schedule", currentBilling)
                                  }
                                }}
                                placeholder="$0.00"
                                className="text-right"
                              />
                            )}
                          />
                        </TableCell>
                        <TableCell>
                          {billingFields.length > 1 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => removeBilling(index)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <Button
                  type="button"
                  variant="outline"
                  className="mt-4"
                  onClick={() => {
                    const currentBilling = form.getValues("billing_schedule")
                    const lastMonth = currentBilling.length > 0 
                      ? currentBilling[currentBilling.length - 1].month 
                      : `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`
                    const nextMonth = getNextMonth(lastMonth)
                    appendBilling({ month: nextMonth, cost: 0 })
                  }}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add Row
                </Button>
              </CardContent>
            </Card>
          </form>
        </Form>
      </div>

      {/* Sticky Footer */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-lg p-4 z-50">
        <div className="max-w-7xl mx-auto flex justify-end space-x-4">
          <Button
            variant="outline"
            onClick={handleDownload}
            disabled={isDownloading}
          >
            <Download className="mr-2 h-4 w-4" />
            {isDownloading ? "Downloading..." : "Download Scope"}
          </Button>
          <Button
            onClick={form.handleSubmit(onSubmit)}
            disabled={isSaving}
          >
            <Save className="mr-2 h-4 w-4" />
            {isSaving ? "Saving..." : "Save Scope"}
          </Button>
        </div>
      </div>
    </div>
  )
}

