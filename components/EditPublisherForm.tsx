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

const publisherSchema = z.object({
  id: z.number(),
  publisher_name: z.string().min(1, "Publisher name is required"),
  publisherid: z.string().min(1, "Publisher ID is required"),
  publishertype: z.enum(["direct", "internal_biddable"]),
  billingagency: z.enum(["assembled media", "advertising associates"]),
  financecode: z.string().min(1, "Finance code is required"),
  pub_television: z.boolean(),
  pub_radio: z.boolean(),
  pub_newspaper: z.boolean(),
  pub_magazines: z.boolean(),
  pub_ooh: z.boolean(),
  pub_cinema: z.boolean(),
  pub_digidisplay: z.boolean(),
  pub_digiaudio: z.boolean(),
  pub_digivideo: z.boolean(),
  pub_bvod: z.boolean(),
  pub_integration: z.boolean(),
  pub_search: z.boolean(),
  pub_socialmedia: z.boolean(),
  pub_progdisplay: z.boolean(),
  pub_progvideo: z.boolean(),
  pub_progbvod: z.boolean(),
  pub_progaudio: z.boolean(),
  pub_progooh: z.boolean(),
  pub_influencers: z.boolean(),
  radio_comms: z.number().min(0).max(100),
  newspaper_comms: z.number().min(0).max(100),
  television_comms: z.number().min(0).max(100),
  magazines_comms: z.number().min(0).max(100),
  ooh_comms: z.number().min(0).max(100),
  cinema_comms: z.number().min(0).max(100),
  digidisplay_comms: z.number().min(0).max(100),
  digiaudio_comms: z.number().min(0).max(100),
  digivideo_comms: z.number().min(0).max(100),
  bvod_comms: z.number().min(0).max(100),
  integration_comms: z.number().min(0).max(100),
  search_comms: z.number().min(0).max(100),
  progdisplay_comms: z.number().min(0).max(100),
  progvideo_comms: z.number().min(0).max(100),
  progbvod_comms: z.number().min(0).max(100),
  progaudio_comms: z.number().min(0).max(100),
  progooh_comms: z.number().min(0).max(100),
  influencers_comms: z.number().min(0).max(100),
})

type PublisherFormValues = z.infer<typeof publisherSchema>

interface EditPublisherFormProps {
  publisher: PublisherFormValues
  onSuccess: () => void
}

export function EditPublisherForm({ publisher, onSuccess }: EditPublisherFormProps) {
  const [isSaving, setIsSaving] = useState(false)

  const form = useForm<PublisherFormValues>({
    resolver: zodResolver(publisherSchema),
    defaultValues: publisher,
  })

  async function onSubmit(data: PublisherFormValues) {
    setIsSaving(true)
    try {
      const response = await fetch(`/api/publishers/${data.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      })

      if (!response.ok) {
        throw new Error("Failed to update publisher")
      }

      onSuccess()
    } catch (error) {
      console.error("Failed to update publisher:", error)
      // TODO: Show error message to user
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <FormField
          control={form.control}
          name="publisher_name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Publisher Name</FormLabel>
              <FormControl>
                <Input {...field} />
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
              <FormLabel>Publisher ID</FormLabel>
              <FormControl>
                <Input {...field} />
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
                  <SelectItem value="assembled_media">Assembled Media</SelectItem>
                  <SelectItem value="advertising_associates">Advertising Associates</SelectItem>
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
              <FormLabel>Finance Code</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

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

        <div className="grid grid-cols-3 gap-4">
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
                  <FormLabel>{`${medium.charAt(0).toUpperCase() + medium.slice(1)} Commission (%)`}</FormLabel>
                  <FormControl>
                    <Input type="number" {...field} onChange={(e) => field.onChange(e.target.valueAsNumber)} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          ))}
        </div>

        <Button type="submit" disabled={isSaving}>
          {isSaving ? "Saving..." : "Update Publisher"}
        </Button>
      </form>
      <SavingModal isOpen={isSaving} />
    </Form>
  )
}

