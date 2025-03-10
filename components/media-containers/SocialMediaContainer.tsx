"use client"

import { useState, useEffect } from "react"
import { useForm, useFieldArray } from "react-hook-form"
import { useWatch } from "react-hook-form"
import { useMemo } from "react";
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
import { getPublishersForSocialMedia, getClientInfo } from "@/lib/api"
import { format } from "date-fns"
import { useMediaPlanContext } from "@/contexts/MediaPlanContext"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { CalendarIcon } from "lucide-react"
import { cn } from "@/lib/utils"

// 🆕 Exported utility function to get bursts
export function getAllBursts(form) {
  const lineItems = form.getValues("lineItems") || [];

  return lineItems.flatMap((lineItem) =>
    lineItem.bursts.map((burst) => ({
      startDate: burst.startDate,
      endDate: burst.endDate,
      budget: burst.budget,
    }))
  );
}

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
  // ✅ Add these fields to match the expected dynamic updates
  totalMedia: z.number().optional(),
  totalDeliverables: z.number().optional(),
  totalFee: z.number().optional(),
})

const socialMediaFormSchema = z.object({
  lineItems: z.array(
    z.object({
      platform: z.string().min(1, "Platform is required"),
      bidStrategy: z.string().min(1, "Bid Strategy is required"),
      buyType: z.string().min(1, "Buy Type is required"),
      creativeTargeting: z.string(),
      fixedCostMedia: z.boolean(),
      clientPaysForMedia: z.boolean(),
      bursts: z.array(
        z.object({
          budget: z.string(),
          buyAmount: z.string(),
          startDate: z.date(),
          endDate: z.date(),
          calculatedValue: z.number(),
        })
      ).min(1, "At least one burst is required"),
      totalMedia: z.number().optional(),
      totalDeliverables: z.number().optional(),
      totalFee: z.number().optional(),
    })
  ),
  overallDeliverables: z.number().optional(),
})

type SocialMediaFormValues = z.infer<typeof socialMediaFormSchema>

interface Publisher {
  id: number
  publisher_name: string
}

interface SocialMediaContainerProps {
  clientId: string
  onTotalMediaChange: (totalMedia: number, totalFee: number) => void
  feesocial: number | null;
}

export function getSocialMediaBursts(form) {
  const lineItems = form.getValues("lineItems") || [];

  return lineItems.flatMap((lineItem) =>
    lineItem.bursts.map((burst) => ({
      startDate: burst.startDate,
      endDate: burst.endDate,
      budget: parseFloat(burst.budget.replace(/[^0-9.]/g, "")) || 0,
    }))
  );
}

export default function SocialMediaContainer({ clientId, feesocial, onTotalMediaChange }: SocialMediaContainerProps) {
  const [publishers, setPublishers] = useState<Publisher[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const { toast } = useToast()
  const { mbaNumber } = useMediaPlanContext()

  const form = useForm<SocialMediaFormValues>({
    resolver: zodResolver(socialMediaFormSchema),
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
          // ✅ Ensure these default values exist
          totalMedia: 0,
          totalDeliverables: 0,
          totalFee: 0,
        },
      ],
    },
  })
  
  const watchedLineItems = useWatch({ control: form.control, name: "lineItems" });

const overallTotals = useMemo(() => {
  let overallMedia = 0;
  let overallFee = 0;
  let overallCost = 0;

  const lineItemTotals = watchedLineItems.map((lineItem, index) => {
    let lineMedia = 0;
    let lineDeliverables = 0;
    let lineFee = 0;
    let lineCost = 0;

    lineItem.bursts.forEach((burst) => {
      const budget = parseFloat(burst.budget.replace(/[^0-9.]/g, "")) || 0;
      lineMedia += budget;
      lineDeliverables += burst.calculatedValue || 0;
    });

    lineFee = feesocial ? (lineMedia / (100 - feesocial)) * feesocial : 0;
    lineCost = lineMedia + lineFee;

    overallMedia += lineMedia;
    overallFee += lineFee;
    overallCost += lineCost;

    return {
      index: index + 1,
      deliverables: lineDeliverables,
      media: lineMedia,
      fee: lineFee,
      totalCost: lineCost,
    };
  });

  return { lineItemTotals, overallMedia, overallFee, overallCost };
}, [watchedLineItems, feesocial]); // ✅ Dependency array ensures recalculation when data changes

  const {
    fields: lineItemFields,
    append: appendLineItem,
    remove: removeLineItem,
  } = useFieldArray({
    control: form.control,
    name: "lineItems",
  })

  useEffect(() => {
    const fetchPublishers = async () => {
      try {
        const publishers = await getPublishersForSocialMedia();
        setPublishers(publishers);
      } catch (error) {
        toast({
          title: "Error loading publishers",
          description: error.message,
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchPublishers();
  }, [clientId, toast]);  // ✅ Publishers only load once on mount

  const [overallDeliverables, setOverallDeliverables] = useState(0);

  useEffect(() => {
    let totalMedia = 0;
    let totalFee = 0;
  
    watchedLineItems.forEach((lineItem) => {
      let lineMedia = 0;
      lineItem.bursts.forEach((burst) => {
        const budget = parseFloat(burst?.budget?.replace(/[^0-9.]/g, "")) || 0;
        lineMedia += budget;
      });
  
      let lineFee = feesocial ? (lineMedia / (100 - feesocial)) * feesocial : 0;
      totalMedia += lineMedia;
      totalFee += lineFee;
    });
  
    onTotalMediaChange(totalMedia, totalFee); // ✅ Ensure the total fee is sent to page.tsx
  }, [watchedLineItems, onTotalMediaChange, feesocial]);

  const handleValueChange = (lineItemIndex: number, burstIndex: number) => {
    const burst = form.getValues(`lineItems.${lineItemIndex}.bursts.${burstIndex}`);
    const budget = parseFloat(burst?.budget?.replace(/[^0-9.]/g, "")) || 0;
    const buyAmount = parseFloat(burst?.buyAmount?.replace(/[^0-9.]/g, "")) || 1;
    const buyType = form.getValues(`lineItems.${lineItemIndex}.buyType`);
  
    let calculatedValue = 0;
    switch (buyType) {
      case "cpc":
      case "cpv":
        calculatedValue = buyAmount !== 0 ? budget / buyAmount : 0;
        break;
      case "cpm":
        calculatedValue = buyAmount !== 0 ? (budget / buyAmount) * 1000 : 0;
        break;
      case "fixed_cost":
        calculatedValue = 1;
        break;
      default:
        calculatedValue = 0;
    }
  
    if (form.getValues(`lineItems.${lineItemIndex}.bursts.${burstIndex}.calculatedValue`) !== calculatedValue) {
      form.setValue(`lineItems.${lineItemIndex}.bursts.${burstIndex}.calculatedValue`, calculatedValue, {
        shouldValidate: true,
        shouldDirty: true,
      });
  
      // ✅ Trigger recalculation of line item totals
      handleLineItemValueChange(lineItemIndex);
    }
  };

  const handleLineItemValueChange = (lineItemIndex: number) => {
    const lineItems = form.getValues("lineItems") || [];
    let overallMedia = 0;
    let overallFee = 0;
    let overallCost = 0;
  
    lineItems.forEach((lineItem, index) => {
      let lineMedia = 0;
      let lineFee = 0;
      let lineDeliverables = 0;
  
      lineItem.bursts.forEach((burst) => {
        const budget = parseFloat(burst?.budget?.replace(/[^0-9.]/g, "")) || 0;
        lineMedia += budget;
        lineDeliverables += burst?.calculatedValue || 0;
      });
  
      lineFee = feesocial ? (lineMedia / (100 - feesocial)) * feesocial : 0;
      overallMedia += lineMedia;
      overallFee += lineFee;
      overallCost += lineMedia + lineFee;
    });
  
    // ✅ Store in state instead of form.setValue
    setOverallDeliverables(overallMedia);
    onTotalMediaChange(overallMedia, overallFee);
  };

const handleAppendBurst = (lineItemIndex: number) => {
  const currentBursts = form.getValues(`lineItems.${lineItemIndex}.bursts`) || [];
  form.setValue(`lineItems.${lineItemIndex}.bursts`, [
    ...currentBursts,
    {
      budget: "",
      buyAmount: "",
      startDate: new Date(),
      endDate: new Date(),
      calculatedValue: 0,
    },
  ]);

  // ✅ NEW: Ensure line item totals update
  handleLineItemValueChange(lineItemIndex);
};


  const getDeliverablesLabel = (buyType: string) => {
    switch (buyType.toLowerCase()) {
      case "cpc":
        return "Clicks";
      case "cpv":
        return "Views";
      case "cpm":
        return "Impressions";
      case "fixed_cost":
        return "Fixed Fee";
      default:
        return "Deliverables";
    }
  };
  
  const handleRemoveBurst = (lineItemIndex: number, burstIndex: number) => {
    const currentBursts = form.getValues(`lineItems.${lineItemIndex}.bursts`) || [];
    form.setValue(
      `lineItems.${lineItemIndex}.bursts`,
      currentBursts.filter((_, index) => index !== burstIndex),
    );
  
    // ✅ NEW: Ensure line item totals update
    handleLineItemValueChange(lineItemIndex);
  };
  

  return(
    <div className="space-y-6">
    <div className="mb-6">
  <Card>
    <CardHeader>
      <CardTitle className="pt-4 border-t font-bold text-lg flex justify-between">Social Media</CardTitle>
    </CardHeader>
    <CardContent className="space-y-4">
      {overallTotals.lineItemTotals.map((item) => (
        <div key={item.index} className="flex justify-between border-b pb-2">
          <span className="font-medium">Line Item {item.index}</span>
          <div className="flex space-x-4">
            <span>
                {getDeliverablesLabel(form.getValues(`lineItems.${item.index - 1}.buyType`))}: {item.deliverables.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </span>
            <span>Media: ${item.media.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            <span>Fee: ${item.fee.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            <span>Total Cost: ${item.totalCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
          </div>
        </div>
   ))}

      {/* Overall Totals */}
      <div className="pt-4 border-t font-medium flex justify-between">
        <span>Social Media Totals:</span>
        <div className="flex space-x-4">
          <span>Media: ${overallTotals.overallMedia.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
          <span>Fees ({feesocial}%): ${overallTotals.overallFee.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
          <span>Total Cost: ${overallTotals.overallCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
        </div>
      </div>
    </CardContent>
  </Card>
</div>

    <div>
      {isLoading ? (
        <div className="flex justify-center items-center h-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div> //
      ) : (
        <div className="space-y-6">
          <Form {...form}>
            <div className="space-y-6">
              {lineItemFields.map((field, lineItemIndex) => {
                const getTotals = (lineItemIndex: number) => {
                  const lineItem = form.getValues(`lineItems.${lineItemIndex}`);
                  let totalMedia = 0;
                  let totalCalculatedValue = 0;
                  let fee = 0;

                  lineItem.bursts.forEach((burst) => {
                    const budget = parseFloat(burst.budget.replace(/[^0-9.]/g, "")) || 0;
                    totalMedia += budget;
                    totalCalculatedValue += burst.calculatedValue || 0;
                  });

                  fee = feesocial ? (totalMedia / (100 - feesocial)) * feesocial : 0;

                  return { totalMedia, totalCalculatedValue, fee };
                };

                const { totalMedia, totalCalculatedValue, fee } = getTotals(lineItemIndex);

                return (
                  <div key={field.id} className="space-y-6">
                    
                    <Card>
                      <CardHeader className="pb-4">
                        <div className="flex justify-between items-center">
                          <CardTitle className="text-lg font-medium">Social Line Item {lineItemIndex + 1}</CardTitle>
                          <div className="text-lg font-medium">ID: {`${mbaNumber}ML${lineItemIndex + 1}`}</div>
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
                              <FormLabel>Targeting</FormLabel>
                              <FormControl>
                                <Textarea {...field} placeholder="Enter targeting details" />
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
                                  <div className="grid grid-cols-10 gap-4 items-center">
                                  <FormField
  control={form.control}
  name={`lineItems.${lineItemIndex}.bursts.${burstIndex}.budget`}
  render={({ field }) => (
    <FormItem className="col-span-1">
      <FormLabel>Budget</FormLabel>
      <FormControl>
        <Input
          {...field}
          type="text"
          className="w-full"
          onChange={(e) => {
            const value = e.target.value.replace(/[^0-9.]/g, "");
            field.onChange(value);
            handleValueChange(lineItemIndex, burstIndex);  // ✅ Trigger recalculation immediately
          }}
          onBlur={(e) => {
            const value = e.target.value;
            const formattedValue = new Intl.NumberFormat("en-US", {
              style: "currency",
              currency: "USD",
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            }).format(parseFloat(value) || 0);
            field.onChange(formattedValue);
            handleValueChange(lineItemIndex, burstIndex); // ✅ Ensure formatting triggers recalculation
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
    <FormItem className="col-span-1">
      <FormLabel>Buy Amount</FormLabel>
      <FormControl>
        <Input
          {...field}
          type="text"
          className="w-full"
          onChange={(e) => {
            const value = e.target.value.replace(/[^0-9.]/g, "");
            field.onChange(value);
            handleValueChange(lineItemIndex, burstIndex);  // ✅ Trigger recalculation immediately
          }}
          onBlur={(e) => {
            const value = e.target.value;
            const formattedValue = new Intl.NumberFormat("en-US", {
              style: "currency",
              currency: "USD",
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            }).format(parseFloat(value) || 0);
            field.onChange(formattedValue);
            handleValueChange(lineItemIndex, burstIndex); // ✅ Ensure formatting triggers recalculation
          }}
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
                                          <FormItem className="col-span-2">
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
                                          <FormItem className="col-span-2">
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

                                    <FormField
                                      control={form.control}
                                      name={`lineItems.${lineItemIndex}.bursts.${burstIndex}.calculatedValue`}
                                      render={({ field }) => {
                                         // Get the buyType reactively with useWatch
                                         const buyType = useWatch({
                                             control: form.control,
                                             name: `lineItems.${lineItemIndex}.buyType`,
                                           });

                                           // Calculate the value dynamically using useMemo
                                           const calculatedValue = useMemo(() => {
                                              const budget = parseFloat(form.getValues(`lineItems.${lineItemIndex}.bursts.${burstIndex}.budget`)?.replace(/[^0-9.]/g, "") || "0");
                                              const buyAmount = parseFloat(form.getValues(`lineItems.${lineItemIndex}.bursts.${burstIndex}.buyAmount`)?.replace(/[^0-9.]/g, "") || "1");

                                              switch (buyType) {
                                                case "cpc":
                                                case "cpv":
                                                  return buyAmount !== 0 ? (budget / buyAmount) : "0";
                                                case "cpm":
                                                  return buyAmount !== 0 ? ((budget / buyAmount) * 1000) : "0";
                                                case "fixed_cost":
                                                  return "1";
                                                default:
                                                  return "0";
                                        }
                                      }, [
                                        form.getValues(`lineItems.${lineItemIndex}.bursts.${burstIndex}.budget`),
                                        form.getValues(`lineItems.${lineItemIndex}.bursts.${burstIndex}.buyAmount`),
                                        buyType
                                      ]);

                                          // Set the label based on buyType
    let title = "Calculated Value";
    switch (buyType) {
      case "cpc":
        title = "Clicks";
        break;
      case "cpv":
        title = "Views";
        break;
      case "cpm":
        title = "Impressions";
        break;
      case "fixed_cost":
        title = "Fixed Cost";
        break;
    }

    return (
      <FormItem className="col-span-2">
        <FormLabel>{title}</FormLabel>
        <FormControl>
          <Input
            type="text"
            className="w-full"
            value={calculatedValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            readOnly
          />
        </FormControl>
      </FormItem>
    );
  }}
/>

                                    {/* ✅ Buttons Section - Aligning in the same row */}
                                    <div className="col-span-1 flex justify-center items-center">
                                    {burstIndex === form.watch(`lineItems.${lineItemIndex}.bursts`, []).length - 1 && (
                                    <Button type="button" onClick={() => handleAppendBurst(lineItemIndex)}>
                                     Add Burst
                                    </Button>
                                   )}
                                   </div>
                                   <div className="col-span-1 flex justify-center items-center">
                                     <Button
                                      type="button"
                                      variant="destructive"
                                      onClick={() => handleRemoveBurst(lineItemIndex, burstIndex)}
                                     >
                                      Remove Burst
                                    </Button>
                                 </div>
                               </div>
                             </CardContent>
                            </Card>
              )})}
                        </div>
                      </CardContent>
                      <CardFooter className="flex justify-end space-x-2">
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
                        <Button type="button" variant="destructive" onClick={() => removeLineItem(lineItemIndex)}>
                          Remove Line Item
                        </Button>
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
  </div>)}
