"use client"

import { useState, useEffect } from "react"
import { useForm, useFieldArray } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Textarea } from "@/components/ui/textarea"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { useToast } from "@/components/ui/use-toast"
import { getPublishersForSearch, getClientInfo } from "@/lib/api"
import { format } from "date-fns"
import { useMediaPlanContext } from "@/contexts/MediaPlanContext"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { CalendarIcon } from "lucide-react"
import { cn } from "@/lib/utils"

const burstSchema = z.object({
  budget: z.string().min(1, "Budget is required"),
  buyAmount: z.string().min(1, "Buy Amount is required"),
  startDate: z.date(),
  endDate: z.date(),
  calculatedValue: z.number().optional(),
})

const lineItemSchema = z.object({
  platform: z.string().min(1, "Platform is required"),
  bidStrategy: z.string().min(1, "Bid Strategy is required"),
  buyType: z.string().min(1, "Buy Type is required"),
  creativeTargeting: z.string(),
  fixedCostMedia: z.boolean(),
  clientPaysForMedia: z.boolean(),
  bursts: z.array(burstSchema).min(1, "At least one burst is required"),
})

const searchFormSchema = z.object({
  lineItems: z.array(lineItemSchema).min(1, "At least one line item is required"),
})

type SearchFormValues = z.infer<typeof searchFormSchema>

interface Publisher {
  id: number
  publisher_name: string
}

interface SearchContainerProps {
  clientId: string
}

export default function SearchContainer({ clientId }: SearchContainerProps) {
  const [publishers, setPublishers] = useState<Publisher[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [clientFeeSearch, setClientFeeSearch] = useState(0)
  const { toast } = useToast()
  const { mbaNumber } = useMediaPlanContext()

  const form = useForm<SearchFormValues>({
    resolver: zodResolver(searchFormSchema),
    defaultValues: {
      lineItems: [
        {
          platform: "",
          bidStrategy: "",
          buyType: "",
          creativeTargeting: "",
          fixedCostMedia: false,
          clientPaysForMedia: false,
          bursts: [
            {
              budget: "",
              buyAmount: "",
              startDate: new Date(),
              endDate: new Date(),
              calculatedValue: 0,
            },
          ],
        },
      ],
    },
  })

  const {
    fields: lineItemFields,
    append: appendLineItem,
    remove: removeLineItem,
  } = useFieldArray({
    control: form.control,
    name: "lineItems",
  })

  useEffect(() => {
    fetchPublishers()
    fetchClientInfo()
  }, []) //Corrected useEffect dependency array

  useEffect(() => {
    const subscription = form.watch((value, { name, type }) => {
      if (name && (name.includes("budget") || name.includes("buyAmount") || name.includes("buyType"))) {
        calculateAllValues()
      }
    })
    return () => subscription.unsubscribe()
  }, [form.watch])

  const calculateAllValues = () => {
    lineItemFields.forEach((_, lineItemIndex) => {
      const buyType = form.getValues(`lineItems.${lineItemIndex}.buyType`)
      const bursts = form.getValues(`lineItems.${lineItemIndex}.bursts`)

      bursts.forEach((burst, burstIndex) => {
        const budget = Number.parseFloat(burst.budget.replace(/[^0-9.]/g, "")) || 0
        const buyAmount = Number.parseFloat(burst.buyAmount.replace(/[^0-9.]/g, "")) || 1
        let value = 0

        switch (buyType) {
          case "cpc":
          case "cpv":
            value = budget / buyAmount
            break
          case "cpm":
            value = (budget / buyAmount) * 1000
            break
          case "fixed_cost":
            value = 1
            break
        }

        form.setValue(`lineItems.${lineItemIndex}.bursts.${burstIndex}.calculatedValue`, value, {
          shouldValidate: true,
        })
      })
    })
  }

  async function fetchPublishers() {
    try {
      const fetchedPublishers = await getPublishersForSearch()
      setPublishers(fetchedPublishers)
    } catch (error) {
      console.error("Error fetching publishers:", error)
      toast({
        title: "Error",
        description: "Failed to fetch publishers. Please try again.",
        variant: "destructive",
      })
      setPublishers([])
    }
  }

  async function fetchClientInfo() {
    if (!clientId) {
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    try {
      const clientInfo = await getClientInfo(clientId)
      setClientFeeSearch(clientInfo.feesearch)
    } catch (error) {
      console.error("Error fetching client information:", error)
      toast({
        title: "Error",
        description: "Failed to fetch client information. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const getTotals = (lineItemIndex: number) => {
    const bursts = form.watch(`lineItems.${lineItemIndex}.bursts`)
    const totalMedia = bursts.reduce((sum, burst) => {
      const budget =
        typeof burst.budget === "string" ? Number.parseFloat(burst.budget.replace(/[^0-9.]/g, "")) : burst.budget || 0
      return sum + budget
    }, 0)
    const totalCalculatedValue = bursts.reduce((sum, burst) => sum + (burst.calculatedValue || 0), 0)

    const fee = totalMedia / ((1 - clientFeeSearch) * clientFeeSearch)

    return { totalMedia, totalCalculatedValue, fee }
  }

  const handleAppendBurst = (lineItemIndex: number) => {
    const currentBursts = form.getValues(`lineItems.${lineItemIndex}.bursts`) || []
    form.setValue(`lineItems.${lineItemIndex}.bursts`, [
      ...currentBursts,
      {
        budget: "",
        buyAmount: "",
        startDate: new Date(),
        endDate: new Date(),
        calculatedValue: 0,
      },
    ])
  }

  const handleRemoveBurst = (lineItemIndex: number, burstIndex: number) => {
    const currentBursts = form.getValues(`lineItems.${lineItemIndex}.bursts`) || []
    form.setValue(
      `lineItems.${lineItemIndex}.bursts`,
      currentBursts.filter((_, index) => index !== burstIndex),
    )
  }

  return (
    <div>
      {isLoading ? (
        <div className="flex justify-center items-center h-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : (
        <div className="space-y-6">
          <Form {...form}>
            <div className="space-y-6">
              {lineItemFields.map((field, lineItemIndex) => {
                const { totalMedia, totalCalculatedValue, fee } = getTotals(lineItemIndex)

                return (
                  <div key={field.id} className="space-y-6">
                    <Card>
                      <CardContent className="py-4">
                        <div className="flex justify-between items-center">
                          <CardTitle className="text-lg font-medium">Totals</CardTitle>
                          <div className="flex space-x-4">
                            <div>
                              <span className="font-semibold mr-2">Media:</span>
                              <span>
                                $
                                {totalMedia.toLocaleString(undefined, {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}
                              </span>
                            </div>
                            <div>
                              <span className="font-semibold mr-2">Total Cost:</span>
                              <span>
                                $
                                {totalMedia.toLocaleString(undefined, {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}
                              </span>
                            </div>
                            <div>
                              <span className="font-semibold mr-2">
                                {form.watch(`lineItems.${lineItemIndex}.buyType`) === "cpc"
                                  ? "Clicks:"
                                  : form.watch(`lineItems.${lineItemIndex}.buyType`) === "cpv"
                                    ? "Views:"
                                    : form.watch(`lineItems.${lineItemIndex}.buyType`) === "cpm"
                                      ? "Impressions:"
                                      : "Fixed Cost:"}
                              </span>
                              <span>
                                {totalCalculatedValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                              </span>
                            </div>
                            <div>
                              <span className="font-semibold mr-2">Fee ({clientFeeSearch * 100}%):</span>
                              <span>
                                $
                                {fee.toLocaleString(undefined, {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}
                              </span>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="pb-4">
                        <div className="flex justify-between items-center">
                          <CardTitle className="text-lg font-medium">Search Line Item {lineItemIndex + 1}</CardTitle>
                          <div className="text-lg font-medium">ID: {`${mbaNumber}SL${lineItemIndex + 1}`}</div>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid grid-cols-3 gap-4">
                          <FormField
                            control={form.control}
                            name={`lineItems.${lineItemIndex}.platform`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Platform</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                  <FormControl>
                                    <SelectTrigger>
                                      <SelectValue placeholder="Select platform" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    {publishers.map((publisher) => (
                                      <SelectItem key={publisher.id} value={publisher.publisher_name}>
                                        {publisher.publisher_name}
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
                            name={`lineItems.${lineItemIndex}.bidStrategy`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Bid Strategy</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                  <FormControl>
                                    <SelectTrigger>
                                      <SelectValue placeholder="Select bid strategy" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    <SelectItem value="target_roas">Target ROAS</SelectItem>
                                    <SelectItem value="manual_cpc">Manual CPC</SelectItem>
                                    <SelectItem value="maximize_conversions">Maximize Conversions</SelectItem>
                                    <SelectItem value="target_cpa">Target CPA</SelectItem>
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name={`lineItems.${lineItemIndex}.buyType`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Buy Type</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                  <FormControl>
                                    <SelectTrigger>
                                      <SelectValue placeholder="Select buy type" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    <SelectItem value="cpc">CPC</SelectItem>
                                    <SelectItem value="cpm">CPM</SelectItem>
                                    <SelectItem value="cpv">CPV</SelectItem>
                                    <SelectItem value="fixed_cost">Fixed Cost</SelectItem>
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>

                        <FormField
                          control={form.control}
                          name={`lineItems.${lineItemIndex}.creativeTargeting`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Creative Targeting</FormLabel>
                              <FormControl>
                                <Textarea {...field} placeholder="Enter creative targeting details" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <div className="flex space-x-4">
                          <FormField
                            control={form.control}
                            name={`lineItems.${lineItemIndex}.fixedCostMedia`}
                            render={({ field }) => (
                              <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                                <FormControl>
                                  <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                                </FormControl>
                                <div className="space-y-1 leading-none">
                                  <FormLabel>Fixed Cost Media</FormLabel>
                                </div>
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name={`lineItems.${lineItemIndex}.clientPaysForMedia`}
                            render={({ field }) => (
                              <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                                <FormControl>
                                  <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                                </FormControl>
                                <div className="space-y-1 leading-none">
                                  <FormLabel>Client Pays for Media</FormLabel>
                                </div>
                              </FormItem>
                            )}
                          />
                        </div>

                        <div className="space-y-4">
                          {form.watch(`lineItems.${lineItemIndex}.bursts`, []).map((burstField, burstIndex) => {
                            return (
                              <Card key={`${lineItemIndex}-${burstIndex}`}>
                                <CardHeader>
                                  <CardTitle className="text-base font-medium">Burst {burstIndex + 1}</CardTitle>
                                </CardHeader>
                                <CardContent>
                                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                    <FormField
                                      control={form.control}
                                      name={`lineItems.${lineItemIndex}.bursts.${burstIndex}.budget`}
                                      render={({ field }) => (
                                        <FormItem>
                                          <FormLabel>Budget</FormLabel>
                                          <FormControl>
                                            <Input
                                              {...field}
                                              type="text"
                                              className="w-full"
                                              onChange={(e) => {
                                                const value = e.target.value.replace(/[^0-9.]/g, "")
                                                field.onChange(value)
                                              }}
                                              onBlur={(e) => {
                                                const value = e.target.value
                                                const formattedValue = new Intl.NumberFormat("en-US", {
                                                  style: "currency",
                                                  currency: "USD",
                                                  minimumFractionDigits: 2,
                                                  maximumFractionDigits: 2,
                                                }).format(Number.parseFloat(value) || 0)
                                                field.onChange(formattedValue)
                                              }}
                                            />
                                          </FormControl>
                                          <FormMessage />
                                        </FormItem>
                                      )}
                                    />

                                    <FormField
                                      control={form.control}
                                      name={`lineItems.${lineItemIndex}.bursts.${burstIndex}.buyAmount`}
                                      render={({ field }) => (
                                        <FormItem>
                                          <FormLabel>Buy Amount</FormLabel>
                                          <FormControl>
                                            <Input
                                              {...field}
                                              type="text"
                                              className="w-full"
                                              onChange={(e) => {
                                                const value = e.target.value.replace(/[^0-9.]/g, "")
                                                field.onChange(value)
                                              }}
                                              onBlur={(e) => {
                                                const value = e.target.value
                                                const formattedValue = new Intl.NumberFormat("en-US", {
                                                  style: "currency",
                                                  currency: "USD",
                                                  minimumFractionDigits: 2,
                                                  maximumFractionDigits: 2,
                                                }).format(Number.parseFloat(value) || 0)
                                                field.onChange(formattedValue)
                                              }}
                                            />
                                          </FormControl>
                                          <FormMessage />
                                        </FormItem>
                                      )}
                                    />

                                    <div className="grid grid-cols-2 gap-2">
                                      <FormField
                                        control={form.control}
                                        name={`lineItems.${lineItemIndex}.bursts.${burstIndex}.startDate`}
                                        render={({ field }) => (
                                          <FormItem>
                                            <FormLabel>Start Date</FormLabel>
                                            <Popover>
                                              <PopoverTrigger asChild>
                                                <FormControl>
                                                  <Button
                                                    variant={"outline"}
                                                    className={cn(
                                                      "w-full pl-3 text-left font-normal",
                                                      !field.value && "text-muted-foreground",
                                                    )}
                                                  >
                                                    {field.value ? format(field.value, "PP") : <span>Pick a date</span>}
                                                    <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                                  </Button>
                                                </FormControl>
                                              </PopoverTrigger>
                                              <PopoverContent className="w-auto p-0" align="start">
                                                <Calendar
                                                  mode="single"
                                                  selected={field.value}
                                                  onSelect={field.onChange}
                                                  disabled={(date) =>
                                                    date < new Date() || date > new Date("2100-01-01")
                                                  }
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
                                        name={`lineItems.${lineItemIndex}.bursts.${burstIndex}.endDate`}
                                        render={({ field }) => (
                                          <FormItem>
                                            <FormLabel>End Date</FormLabel>
                                            <Popover>
                                              <PopoverTrigger asChild>
                                                <FormControl>
                                                  <Button
                                                    variant={"outline"}
                                                    className={cn(
                                                      "w-full pl-3 text-left font-normal",
                                                      !field.value && "text-muted-foreground",
                                                    )}
                                                  >
                                                    {field.value ? format(field.value, "PP") : <span>Pick a date</span>}
                                                    <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                                  </Button>
                                                </FormControl>
                                              </PopoverTrigger>
                                              <PopoverContent className="w-auto p-0" align="start">
                                                <Calendar
                                                  mode="single"
                                                  selected={field.value}
                                                  onSelect={field.onChange}
                                                  disabled={(date) =>
                                                    date < new Date() || date > new Date("2100-01-01")
                                                  }
                                                  initialFocus
                                                />
                                              </PopoverContent>
                                            </Popover>
                                            <FormMessage />
                                          </FormItem>
                                        )}
                                      />
                                    </div>

                                    <FormField
                                      control={form.control}
                                      name={`lineItems.${lineItemIndex}.bursts.${burstIndex}.calculatedValue`}
                                      render={({ field }) => {
                                        const buyType = form.watch(`lineItems.${lineItemIndex}.buyType`)
                                        let title = "Calculated Value"

                                        switch (buyType) {
                                          case "cpc":
                                            title = "Clicks"
                                            break
                                          case "cpv":
                                            title = "Views"
                                            break
                                          case "cpm":
                                            title = "Impressions"
                                            break
                                          case "fixed_cost":
                                            title = "Fixed Cost"
                                            break
                                        }

                                        return (
                                          <FormItem>
                                            <FormLabel>{title}</FormLabel>
                                            <FormControl>
                                              <Input
                                                type="text"
                                                className="w-full"
                                                value={
                                                  field.value?.toLocaleString(undefined, {
                                                    maximumFractionDigits: 0,
                                                  }) || "0"
                                                }
                                                readOnly
                                              />
                                            </FormControl>
                                          </FormItem>
                                        )
                                      }}
                                    />
                                  </div>
                                </CardContent>
                                <CardFooter className="flex justify-end space-x-2">
                                  <Button
                                    type="button"
                                    variant="destructive"
                                    onClick={() => handleRemoveBurst(lineItemIndex, burstIndex)}
                                  >
                                    Remove Burst
                                  </Button>
                                  {burstIndex === form.watch(`lineItems.${lineItemIndex}.bursts`, []).length - 1 && (
                                    <Button type="button" onClick={() => handleAppendBurst(lineItemIndex)}>
                                      Add Burst
                                    </Button>
                                  )}
                                </CardFooter>
                              </Card>
                            )
                          })}
                        </div>
                      </CardContent>
                      <CardFooter className="flex justify-end space-x-2">
                        <Button type="button" variant="destructive" onClick={() => removeLineItem(lineItemIndex)}>
                          Remove Line Item
                        </Button>
                        {lineItemIndex === lineItemFields.length - 1 && (
                          <Button
                            type="button"
                            onClick={() =>
                              appendLineItem({
                                platform: "",
                                bidStrategy: "",
                                buyType: "",
                                creativeTargeting: "",
                                fixedCostMedia: false,
                                clientPaysForMedia: false,
                                bursts: [
                                  {
                                    budget: "",
                                    buyAmount: "",
                                    startDate: new Date(),
                                    endDate: new Date(),
                                    calculatedValue: 0,
                                  },
                                ],
                              })
                            }
                          >
                            Add Line Item
                          </Button>
                        )}
                      </CardFooter>
                    </Card>
                  </div>
                )
              })}
            </div>
          </Form>
        </div>
      )}
    </div>
  )
}

