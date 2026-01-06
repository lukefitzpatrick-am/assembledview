"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useForm, useFieldArray, UseFormReturn, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { format } from "date-fns"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { CalendarIcon, Check, ChevronsUpDown, Copy, Plus, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import type { BillingBurst } from "@/lib/billing/types"
import type { LineItem } from "@/lib/generateMediaPlan"
import { useMediaPlanContext } from "@/contexts/MediaPlanContext"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"

const burstSchema = z.object({
  cost: z.number().min(0, "Cost is required"),
  amount: z.number().min(0, "Amount is required"),
  startDate: z.date(),
  endDate: z.date(),
})

const lineItemSchema = z.object({
  mediaType: z.string().min(1, "Media type is required"),
  publisher: z.string().optional(),
  description: z.string().optional(),
  market: z.string().optional(),
  bursts: z.array(burstSchema).min(1, "At least one burst is required"),
  lineItemId: z.string().optional(),
})

const formSchema = z.object({
  lineItems: z.array(lineItemSchema).min(1, "At least one line item is required"),
})

type ProductionFormValues = z.infer<typeof formSchema>

export function getAllBursts(form: UseFormReturn<ProductionFormValues>) {
  const lineItems = form.getValues("lineItems") || []
  return lineItems.flatMap((lineItem) =>
    lineItem.bursts.map((burst) => ({
      startDate: burst.startDate,
      endDate: burst.endDate,
      cost: burst.cost,
      amount: burst.amount,
    }))
  )
}

// Normalize to a date-only value (local midnight) to avoid TZ off-by-one.
const toDateOnly = (d?: Date | string | null): Date | null => {
  if (!d) return null
  const dateObj = d instanceof Date ? d : new Date(d)
  if (isNaN(dateObj.getTime())) return null
  return new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate())
}

const formatDateString = (d?: Date | string): string => {
  const dateObj = toDateOnly(d)
  if (!dateObj) return ""
  const year = dateObj.getUTCFullYear()
  const month = (dateObj.getUTCMonth() + 1).toString().padStart(2, "0")
  const day = dateObj.getUTCDate().toString().padStart(2, "0")
  return `${year}-${month}-${day}`
}

type MediaTypeOption = { value: string; label: string }

interface ProductionContainerProps {
  clientId: string
  feesearch?: number
  onTotalMediaChange: (totalMedia: number, totalFee: number) => void
  onBurstsChange: (bursts: BillingBurst[]) => void
  onInvestmentChange: (investmentByMonth: any) => void
  onLineItemsChange: (items: LineItem[]) => void
  campaignStartDate: Date
  campaignEndDate: Date
  campaignBudget: number
  campaignId: string
  mediaTypes: Array<string | MediaTypeOption>
}

const defaultBurst = (): z.infer<typeof burstSchema> => ({
  cost: 0,
  amount: 0,
  startDate: new Date(),
  endDate: new Date(),
})

const buildMediaTypeOptions = (mediaTypes: Array<string | MediaTypeOption>): MediaTypeOption[] => {
  return mediaTypes.map((item) =>
    typeof item === "string" ? { value: item, label: item } : item
  )
}

const buildBillingBursts = (lineItems: ProductionFormValues["lineItems"]): BillingBurst[] => {
  return lineItems.flatMap((lineItem) =>
    lineItem.bursts.map((burst) => {
      const startDate = toDateOnly(burst.startDate) || new Date()
      const endDate = toDateOnly(burst.endDate) || startDate
      const mediaAmount = (burst.cost || 0) * (burst.amount || 0)
      return {
        startDate,
        endDate,
        mediaAmount,
        feeAmount: 0,
        totalAmount: mediaAmount,
        mediaType: "production",
        feePercentage: 0,
        clientPaysForMedia: false,
        budgetIncludesFees: false,
        noAdserving: false,
        deliverables: burst.amount || 0,
        buyType: "production",
      } as BillingBurst
    })
  )
}

const buildInvestmentByMonth = (bursts: BillingBurst[]) => {
  const monthly: Record<string, number> = {}
  bursts.forEach((burst) => {
    const start = new Date(burst.startDate)
    const end = new Date(burst.endDate)
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return
    const totalDays = Math.max(
      1,
      Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1
    )
    let cursor = new Date(start)
    while (cursor <= end) {
      const monthYear = `${cursor.toLocaleString("default", {
        month: "long",
      })} ${cursor.getFullYear()}`
      const nextMonth = new Date(cursor)
      nextMonth.setMonth(nextMonth.getMonth() + 1)
      nextMonth.setDate(0)
      const sliceEnd =
        nextMonth > end ? end : nextMonth
      const daysInThisMonth =
        Math.ceil((sliceEnd.getTime() - cursor.getTime()) / (1000 * 60 * 60 * 24)) + 1
      const share = (burst.mediaAmount || 0) * (daysInThisMonth / totalDays)
      monthly[monthYear] = (monthly[monthYear] || 0) + share
      cursor.setMonth(cursor.getMonth() + 1)
      cursor.setDate(1)
    }
  })
  return Object.entries(monthly).map(([monthYear, amount]) => ({
    monthYear,
    amount: `$${amount.toFixed(2)}`,
  }))
}

const mapLineItemsForExport = (
  lineItems: ProductionFormValues["lineItems"],
  mbaNumber: string
): LineItem[] => {
  let burstIndex = 0
  return lineItems.flatMap((lineItem, lineIndex) =>
    lineItem.bursts.map((burst) => {
      const mediaAmount = (burst.cost || 0) * (burst.amount || 0)
      const lineId = lineItem.lineItemId || `${mbaNumber}PROD${lineIndex + 1}`
      burstIndex += 1
      return {
        market: lineItem.market || "",
        platform: lineItem.mediaType || "",
        network: lineItem.publisher || "",
        creative: lineItem.description || "",
        startDate: formatDateString(burst.startDate),
        endDate: formatDateString(burst.endDate),
        deliverables: burst.amount || 0,
        buyType: "production",
        deliverablesAmount: (burst.cost || 0).toString(),
        grossMedia: mediaAmount.toFixed(2),
        line_item_id: lineId,
        line_item: lineIndex + 1,
      }
    })
  )
}

export default function ProductionContainer({
  clientId,
  feesearch = 0,
  onTotalMediaChange,
  onBurstsChange,
  onInvestmentChange,
  onLineItemsChange,
  campaignStartDate,
  campaignEndDate,
  campaignBudget,
  campaignId,
  mediaTypes,
}: ProductionContainerProps) {
  const { mbaNumber } = useMediaPlanContext()
  const mediaTypeOptions = useMemo(() => buildMediaTypeOptions(mediaTypes), [mediaTypes])
  const [openMediaIndex, setOpenMediaIndex] = useState<number | null>(null)

  // Keep stable references to parent callbacks to avoid effect loops
  const totalMediaChangeRef = useRef(onTotalMediaChange)
  const burstsChangeRef = useRef(onBurstsChange)
  const investmentChangeRef = useRef(onInvestmentChange)
  const lineItemsChangeRef = useRef(onLineItemsChange)

  useEffect(() => {
    totalMediaChangeRef.current = onTotalMediaChange
  }, [onTotalMediaChange])

  useEffect(() => {
    burstsChangeRef.current = onBurstsChange
  }, [onBurstsChange])

  useEffect(() => {
    investmentChangeRef.current = onInvestmentChange
  }, [onInvestmentChange])

  useEffect(() => {
    lineItemsChangeRef.current = onLineItemsChange
  }, [onLineItemsChange])

  const form = useForm<ProductionFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      lineItems: [
        {
          mediaType: mediaTypeOptions[0]?.value || "",
          publisher: "",
          description: "",
          market: "",
          lineItemId: "",
          bursts: [defaultBurst()],
        },
      ],
    },
  })

  const {
    fields: lineItemFields,
    append: appendLineItem,
    remove: removeLineItem,
    insert: insertLineItem,
  } = useFieldArray({
    control: form.control,
    name: "lineItems",
  })

  const watchedLineItems = useWatch({
    control: form.control,
    name: "lineItems",
  })

  const totals = useMemo(() => {
    const totalMedia = watchedLineItems?.reduce((sum, li) => {
      const burstSum = li.bursts.reduce(
        (burstAcc, b) => burstAcc + (b.cost || 0) * (b.amount || 0),
        0
      )
      return sum + burstSum
    }, 0) || 0
    return { totalMedia }
  }, [watchedLineItems])

  useEffect(() => {
    const bursts = buildBillingBursts(watchedLineItems || [])
    totalMediaChangeRef.current?.(totals.totalMedia, 0)
    burstsChangeRef.current?.(bursts)
    investmentChangeRef.current?.(buildInvestmentByMonth(bursts))
    lineItemsChangeRef.current?.(mapLineItemsForExport(watchedLineItems || [], mbaNumber || "MBA"))
  }, [watchedLineItems, totals.totalMedia, mbaNumber])

  const handleAddLineItem = () => {
    appendLineItem({
      mediaType: mediaTypeOptions[0]?.value || "",
      publisher: "",
      description: "",
      market: "",
      lineItemId: "",
      bursts: [defaultBurst()],
    })
  }

  const handleDuplicateLineItem = (index: number) => {
    const current = form.getValues(`lineItems.${index}`)
    if (current) {
      insertLineItem(index + 1, {
        ...current,
        lineItemId: "",
        bursts: current.bursts.map((b) => ({ ...b })),
      })
    }
  }

  const handleAddBurst = (lineItemIndex: number) => {
    const currentBursts = form.getValues(`lineItems.${lineItemIndex}.bursts`) || []
    const lastBurst = currentBursts[currentBursts.length - 1]
    const nextStart = lastBurst?.endDate
      ? new Date(new Date(lastBurst.endDate).setDate(new Date(lastBurst.endDate).getDate() + 1))
      : new Date()
    const nextEnd = new Date(nextStart)
    nextEnd.setMonth(nextEnd.getMonth() + 1)
    nextEnd.setDate(0)
    form.setValue(`lineItems.${lineItemIndex}.bursts`, [
      ...currentBursts,
      {
        cost: 0,
        amount: 0,
        startDate: nextStart,
        endDate: nextEnd,
      },
    ])
  }

  const handleDuplicateBurst = (lineItemIndex: number, burstIndex: number) => {
    const currentBursts = form.getValues(`lineItems.${lineItemIndex}.bursts`) || []
    const burst = currentBursts[burstIndex]
    if (!burst) return
    const cloned = { ...burst }
    const updated = [
      ...currentBursts.slice(0, burstIndex + 1),
      cloned,
      ...currentBursts.slice(burstIndex + 1),
    ]
    form.setValue(`lineItems.${lineItemIndex}.bursts`, updated)
  }

  const handleRemoveBurst = (lineItemIndex: number, burstIndex: number) => {
    const currentBursts = form.getValues(`lineItems.${lineItemIndex}.bursts`) || []
    form.setValue(
      `lineItems.${lineItemIndex}.bursts`,
      currentBursts.filter((_, idx) => idx !== burstIndex)
    )
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold flex items-center justify-between">
            <span>Production Summary</span>
            <span className="text-sm font-medium">
              Media: ${totals.totalMedia.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </span>
          </CardTitle>
        </CardHeader>
      </Card>

      <Form {...form}>
        <div className="space-y-6">
          {lineItemFields.map((field, lineItemIndex) => {
            const lineItemId =
              form.watch(`lineItems.${lineItemIndex}.lineItemId`) ||
              `${mbaNumber || "MBA"}PROD${lineItemIndex + 1}`

            return (
              <Card key={field.id} className="space-y-4">
                <CardHeader className="flex justify-between">
                  <div>
                    <CardTitle className="text-lg font-semibold">
                      Production Line Item {lineItemIndex + 1}
                    </CardTitle>
                    <div className="text-sm text-muted-foreground">ID: {lineItemId}</div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" type="button" onClick={() => handleDuplicateLineItem(lineItemIndex)}>
                      <Copy className="h-4 w-4 mr-1" /> Duplicate
                    </Button>
                    <Button variant="destructive" size="sm" type="button" onClick={() => removeLineItem(lineItemIndex)}>
                      <Trash2 className="h-4 w-4 mr-1" /> Remove
                    </Button>
                  </div>
                </CardHeader>

                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <FormField
                      control={form.control}
                      name={`lineItems.${lineItemIndex}.mediaType`}
                      render={({ field }) => {
                        const selectedOption = mediaTypeOptions.find((option) => option.value === field.value)
                        const isOpen = openMediaIndex === lineItemIndex

                        return (
                          <FormItem>
                            <FormLabel>Media Type</FormLabel>
                            <Popover open={isOpen} onOpenChange={(open) => setOpenMediaIndex(open ? lineItemIndex : null)}>
                              <PopoverTrigger asChild>
                                <Button
                                  variant="outline"
                                  role="combobox"
                                  aria-expanded={isOpen}
                                  className="w-full justify-between"
                                >
                                  <span className="truncate">
                                    {selectedOption ? selectedOption.label : "Select media type"}
                                  </span>
                                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-[280px] p-0" align="start">
                                <Command>
                                  <CommandInput placeholder="Search media types..." />
                                  <CommandList>
                                    <CommandEmpty>No media types found.</CommandEmpty>
                                    <CommandGroup>
                                      {mediaTypeOptions.map((option) => {
                                        const isSelected = option.value === field.value
                                        return (
                                          <CommandItem
                                            key={option.value}
                                            value={option.label}
                                            onSelect={() => {
                                              field.onChange(option.value)
                                              setOpenMediaIndex(null)
                                            }}
                                          >
                                            <Check
                                              className={cn(
                                                "mr-2 h-4 w-4",
                                                isSelected ? "opacity-100" : "opacity-0"
                                              )}
                                            />
                                            <span className="truncate">{option.label}</span>
                                          </CommandItem>
                                        )
                                      })}
                                    </CommandGroup>
                                  </CommandList>
                                </Command>
                              </PopoverContent>
                            </Popover>
                            <FormMessage />
                          </FormItem>
                        )
                      }}
                    />

                    <FormField
                      control={form.control}
                      name={`lineItems.${lineItemIndex}.publisher`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Publisher</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="Publisher" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name={`lineItems.${lineItemIndex}.market`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Market</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="Market" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name={`lineItems.${lineItemIndex}.description`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Description</FormLabel>
                        <FormControl>
                          <Textarea {...field} placeholder="Description" className="min-h-[80px]" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="font-semibold text-base">Bursts</h4>
                      <Button type="button" size="sm" onClick={() => handleAddBurst(lineItemIndex)}>
                        <Plus className="h-4 w-4 mr-1" /> Add Burst
                      </Button>
                    </div>

                    {(form.watch(`lineItems.${lineItemIndex}.bursts`) || []).map((burst, burstIndex) => {
                      const mediaValue = (burst.cost || 0) * (burst.amount || 0)
                      return (
                        <Card key={`${lineItemIndex}-${burstIndex}`} className="bg-muted/30">
                          <CardContent className="pt-4 space-y-4">
                            <div className="flex items-center justify-between">
                              <div className="font-medium">Burst {burstIndex + 1}</div>
                              <div className="flex gap-2">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleDuplicateBurst(lineItemIndex, burstIndex)}
                                >
                                  <Copy className="h-4 w-4 mr-1" /> Duplicate
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleRemoveBurst(lineItemIndex, burstIndex)}
                                >
                                  <Trash2 className="h-4 w-4 mr-1" /> Remove
                                </Button>
                              </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                              <FormField
                                control={form.control}
                                name={`lineItems.${lineItemIndex}.bursts.${burstIndex}.cost`}
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>Cost ($)</FormLabel>
                                    <FormControl>
                                      <Input
                                        type="number"
                                        step="0.01"
                                        value={field.value ?? 0}
                                        onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                                      />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />

                              <FormField
                                control={form.control}
                                name={`lineItems.${lineItemIndex}.bursts.${burstIndex}.amount`}
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>Amount</FormLabel>
                                    <FormControl>
                                      <Input
                                        type="number"
                                        step="1"
                                        value={field.value ?? 0}
                                        onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                                      />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />

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
                                              "w-full pl-2 text-left font-normal",
                                              !field.value && "text-muted-foreground"
                                            )}
                                          >
                                            {field.value ? format(field.value, "dd/MM/yy") : <span>Pick date</span>}
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
                                              "w-full pl-2 text-left font-normal",
                                              !field.value && "text-muted-foreground"
                                            )}
                                          >
                                            {field.value ? format(field.value, "dd/MM/yy") : <span>Pick date</span>}
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
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                              <div>
                                <p className="text-xs text-muted-foreground">Calculated Value</p>
                                <p className="font-semibold">{burst.amount || 0}</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground">Media (Cost x Amount)</p>
                                <p className="font-semibold">
                                  ${mediaValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </p>
                              </div>
                              <div className="text-xs text-muted-foreground flex items-center">
                                No fees applied to production bursts.
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      )
                    })}
                  </div>
                </CardContent>

                {lineItemIndex === lineItemFields.length - 1 && (
                  <CardFooter className="flex justify-end">
                    <Button type="button" onClick={handleAddLineItem}>
                      <Plus className="h-4 w-4 mr-1" /> Add Line Item
                    </Button>
                  </CardFooter>
                )}
              </Card>
            )
          })}
        </div>
      </Form>
    </div>
  )
}

