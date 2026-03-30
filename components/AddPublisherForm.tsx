"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Combobox } from "@/components/ui/combobox"
import { SavingModal } from "@/components/ui/saving-modal"
import { SuccessModal } from "@/components/ui/success-modal"
import {
  publisherCreateSchema,
  type PublisherCreateInput,
  type PublisherCreateValues,
} from "@/lib/validations/publisher"
import { defaultKpiValuesRecord } from "@/lib/publisher/scheduleLabels"

type PublisherFormValues = PublisherCreateValues

interface AddPublisherFormProps {
  onSuccess: () => void
}

export function AddPublisherForm({ onSuccess }: AddPublisherFormProps) {
  const [isSaving, setIsSaving] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)

  const numberOrUndefined = (value: string, valueAsNumber: number) => {
    if (value === "") return undefined
    return Number.isFinite(valueAsNumber) ? valueAsNumber : undefined
  }

  const form = useForm<PublisherCreateInput, unknown, PublisherFormValues>({
    resolver: zodResolver(publisherCreateSchema),
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
      socialmedia_comms: 0,
      progdisplay_comms: 0,
      progvideo_comms: 0,
      progbvod_comms: 0,
      progaudio_comms: 0,
      progooh_comms: 0,
      influencers_comms: 0,
      ...defaultKpiValuesRecord(),
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
                <FormControl>
                  <Combobox
                    value={field.value}
                    onValueChange={field.onChange}
                    placeholder="Select publisher type"
                    searchPlaceholder="Search publisher types..."
                    options={[
                      { value: "direct", label: "Direct" },
                      { value: "internal_biddable", label: "Internal Biddable" },
                    ]}
                  />
                </FormControl>
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
                <FormControl>
                  <Combobox
                    value={field.value}
                    onValueChange={field.onChange}
                    placeholder="Select billing agency"
                    searchPlaceholder="Search billing agencies..."
                    options={[
                      { value: "advertising associates", label: "Advertising Associates" },
                      { value: "assembled media", label: "Assembled Media" },
                    ]}
                  />
                </FormControl>
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
                        <Checkbox
                          checked={field.value === true}
                          onCheckedChange={(c) => field.onChange(c === true)}
                        />
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
                name={`${medium}_comms` as keyof PublisherFormValues}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="whitespace-nowrap">{`${medium.charAt(0).toUpperCase() + medium.slice(1)} Commission`}</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input
                          {...field}
                          className="pr-7"
                          type="number"
                          inputMode="decimal"
                          step="0.01"
                          min={0}
                          max={100}
                          value={(field.value as number | undefined) ?? ""}
                          onChange={(e) => field.onChange(numberOrUndefined(e.target.value, e.target.valueAsNumber))}
                          placeholder="0"
                        />
                        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                          %
                        </span>
                      </div>
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

