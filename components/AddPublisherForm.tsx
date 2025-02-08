"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { SavingModal } from "@/components/ui/saving-modal"
import { SuccessModal } from "@/components/ui/success-modal"

const publisherSchema = z.object({
  publisher_name: z.string().min(1, "Publisher name is required"),
  publisherid: z.string().min(1, "Publisher ID is required"),
  publishertype: z.enum(["direct", "internal_biddable"]),
  billingagency: z.enum(["assembled media", "advertising associates"]),
  financecode: z.string().min(1, "Finance code is required"),
  pub_television: z.boolean().default(false),
  pub_radio: z.boolean().default(false),
  pub_newspaper: z.boolean().default(false),
  pub_magazines: z.boolean().default(false),
  pub_ooh: z.boolean().default(false),
  pub_cinema: z.boolean().default(false),
  pub_digidisplay: z.boolean().default(false),
  pub_digiaudio: z.boolean().default(false),
  pub_digivideo: z.boolean().default(false),
  pub_bvod: z.boolean().default(false),
  pub_integration: z.boolean().default(false),
  pub_search: z.boolean().default(false),
  pub_socialmedia: z.boolean().default(false),
  pub_progdisplay: z.boolean().default(false),
  pub_progvideo: z.boolean().default(false),
  pub_progbvod: z.boolean().default(false),
  pub_progaudio: z.boolean().default(false),
  pub_progooh: z.boolean().default(false),
  pub_influencers: z.boolean().default(false),
  radio_comms: z.number().min(0).max(100).default(0),
  newspaper_comms: z.number().min(0).max(100).default(0),
  television_comms: z.number().min(0).max(100).default(0),
  magazines_comms: z.number().min(0).max(100).default(0),
  ooh_comms: z.number().min(0).max(100).default(0),
  cinema_comms: z.number().min(0).max(100).default(0),
  digidisplay_comms: z.number().min(0).max(100).default(0),
  digiaudio_comms: z.number().min(0).max(100).default(0),
  digivideo_comms: z.number().min(0).max(100).default(0),
  bvod_comms: z.number().min(0).max(100).default(0),
  integration_comms: z.number().min(0).max(100).default(0),
  search_comms: z.number().min(0).max(100).default(0),
  progdisplay_comms: z.number().min(0).max(100).default(0),
  progvideo_comms: z.number().min(0).max(100).default(0),
  progbvod_comms: z.number().min(0).max(100).default(0),
  progaudio_comms: z.number().min(0).max(100).default(0),
  progooh_comms: z.number().min(0).max(100).default(0),
  influencers_comms: z.number().min(0).max(100).default(0),
})

type PublisherFormValues = z.infer<typeof publisherSchema>

interface AddPublisherFormProps {
  onSuccess: () => void
}

export function AddPublisherForm({ onSuccess }: AddPublisherFormProps) {
  const [isSaving, setIsSaving] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)

  const formatPercentage = (value: string) => {
    const numericValue = value.replace(/[^0-9.]/g, "")
    return numericValue ? `${Number.parseFloat(numericValue).toFixed(2)}%` : ""
  }

  const form = useForm<PublisherFormValues>({
    resolver: zodResolver(publisherSchema),
    defaultValues: {
      publisher_name: "",
      publisherid: "",
      publishertype: "direct",
      billingagency: "assembled media",
      financecode: "",
      pub_television: false,
      pub_radio: false,
      pub_newspaper: false,
      pub_magazines: false,
      pub_ooh: false,
      pub_cinema: false,
      pub_digidisplay: false,
      pub_digiaudio: false,
      pub_digivideo: false,
      pub_bvod: false,
      pub_integration: false,
      pub_search: false,
      pub_socialmedia: false,
      pub_progdisplay: false,
      pub_progvideo: false,
      pub_progbvod: false,
      pub_progaudio: false,
      pub_progooh: false,
      pub_influencers: false,
      radio_comms: 0,
      newspaper_comms: 0,
      television_comms: 0,
      magazines_comms: 0,
      ooh_comms: 0,
      cinema_comms: 0,
      digidisplay_comms: 0,
      digiaudio_comms: 0,
      digivideo_comms: 0,
      bvod_comms: 0,
      integration_comms: 0,
      search_comms: 0,
      progdisplay_comms: 0,
      progvideo_comms: 0,
      progbvod_comms: 0,
      progaudio_comms: 0,
      progooh_comms: 0,
      influencers_comms: 0,
    },
  })

  async function onSubmit(data: PublisherFormValues) {
    setIsSaving(true)
    try {
      const response = await fetch("/api/publishers", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      })

      if (!response.ok) {
        throw new Error("Failed to create publisher")
      }

      setShowSuccess(true)
      onSuccess()
    } catch (error) {
      console.error("Failed to create publisher:", error)
      // TODO: Show error message to user
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8 max-w-6xl mx-auto">
          <FormField
            control={form.control}
            name="publisher_name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Publisher Name <span className="text-red-500">*</span>
                </FormLabel>
                <FormControl>
                  <Input {...field} value={field.value || ""} placeholder="Enter details" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="publisherid"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Publisher ID <span className="text-red-500">*</span>
                </FormLabel>
                <FormControl>
                  <Input {...field} value={field.value || ""} placeholder="Enter details" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="publishertype"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Publisher Type</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select publisher type" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="direct">Direct</SelectItem>
                    <SelectItem value="internal_biddable">Internal Biddable</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="billingagency"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Billing Agency</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select billing agency" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="assembled media">assembled media</SelectItem>
                    <SelectItem value="advertising associates">advertising associates</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="financecode"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Finance Code <span className="text-red-500">*</span>
                </FormLabel>
                <FormControl>
                  <Input {...field} value={field.value || ""} placeholder="Enter details" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="border border-black p-4 rounded-md">
            <h3 className="text-lg font-semibold mb-4">Media Types Offered</h3>
            <div className="grid grid-cols-3 gap-4">
              {[
                "television",
                "radio",
                "newspaper",
                "magazines",
                "ooh",
                "cinema",
                "digidisplay",
                "digiaudio",
                "digivideo",
                "bvod",
                "integration",
                "search",
                "socialmedia",
                "progdisplay",
                "progvideo",
                "progbvod",
                "progaudio",
                "progooh",
                "influencers",
              ].map((medium) => (
                <FormField
                  key={medium}
                  control={form.control}
                  name={`pub_${medium}` as keyof PublisherFormValues}
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                      <FormControl>
                        <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel>{medium.charAt(0).toUpperCase() + medium.slice(1)}</FormLabel>
                      </div>
                    </FormItem>
                  )}
                />
              ))}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-6">
            {[
              "radio",
              "newspaper",
              "television",
              "magazines",
              "ooh",
              "cinema",
              "digidisplay",
              "digiaudio",
              "digivideo",
              "bvod",
              "integration",
              "search",
              "progdisplay",
              "progvideo",
              "progbvod",
              "progaudio",
              "progooh",
              "influencers",
            ].map((medium) => (
              <FormField
                key={medium}
                control={form.control}
                name={`${medium}_comms` as keyof PublisherFormValues}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="whitespace-nowrap">{`${medium.charAt(0).toUpperCase() + medium.slice(1)} Commission`}</FormLabel>
                    <FormControl>
                      <Input
                        type="text"
                        {...field}
                        value={formatPercentage(field.value.toString())}
                        onChange={(e) => {
                          const numericValue = e.target.value.replace(/[^0-9.]/g, "")
                          field.onChange(numericValue ? Number.parseFloat(numericValue) : 0)
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ))}
          </div>

          <Button type="submit" disabled={isSaving}>
            {isSaving ? "Creating..." : "Create Publisher"}
          </Button>
        </form>
      </Form>

      <SavingModal isOpen={isSaving} />
      <SuccessModal
        isOpen={showSuccess}
        onClose={() => setShowSuccess(false)}
        message="Publisher created successfully!"
      />
    </>
  )
}

