"use client"

import { useState, useMemo } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Combobox } from "@/components/ui/combobox"
import { SavingModal } from "@/components/ui/saving-modal"
import {
  publisherDetailsUpdateSchema,
  type PublisherDetailsFormValues,
  type PublisherDetailsInput,
} from "@/lib/validations/publisher"
import type { Publisher } from "@/lib/types/publisher"
import { normalizePublisherRecord } from "@/lib/publisher/normalizePublisher"
import {
  cssHexFromStored,
  NATIVE_COLOR_INPUT_FALLBACK,
  normalizeDefaultPublisherColour,
} from "@/lib/publisher/publisherColourFormUtils"
import { cn } from "@/lib/utils"

function asBool(v: unknown): boolean {
  return v === true || v === 1 || v === "1"
}

function toDetailsDefaults(publisher: Publisher): PublisherDetailsFormValues {
  return {
    id: publisher.id,
    publisher_name: publisher.publisher_name ?? "",
    publisherid: publisher.publisherid ?? "",
    publishertype: (publisher.publishertype as PublisherDetailsFormValues["publishertype"]) || "direct",
    billingagency: (publisher.billingagency as PublisherDetailsFormValues["billingagency"]) || "assembled media",
    financecode: publisher.financecode ?? "",
    publisher_colour: normalizeDefaultPublisherColour(publisher.publisher_colour ?? null),
    pub_television: asBool(publisher.pub_television),
    pub_radio: asBool(publisher.pub_radio),
    pub_newspaper: asBool(publisher.pub_newspaper),
    pub_magazines: asBool(publisher.pub_magazines),
    pub_ooh: asBool(publisher.pub_ooh),
    pub_cinema: asBool(publisher.pub_cinema),
    pub_digidisplay: asBool(publisher.pub_digidisplay),
    pub_digiaudio: asBool(publisher.pub_digiaudio),
    pub_digivideo: asBool(publisher.pub_digivideo),
    pub_bvod: asBool(publisher.pub_bvod),
    pub_integration: asBool(publisher.pub_integration),
    pub_search: asBool(publisher.pub_search),
    pub_socialmedia: asBool(publisher.pub_socialmedia),
    pub_progdisplay: asBool(publisher.pub_progdisplay),
    pub_progvideo: asBool(publisher.pub_progvideo),
    pub_progbvod: asBool(publisher.pub_progbvod),
    pub_progaudio: asBool(publisher.pub_progaudio),
    pub_progooh: asBool(publisher.pub_progooh),
    pub_influencers: asBool(publisher.pub_influencers),
    radio_comms: Number(publisher.radio_comms) || 0,
    newspaper_comms: Number(publisher.newspaper_comms) || 0,
    television_comms: Number(publisher.television_comms) || 0,
    magazines_comms: Number(publisher.magazines_comms) || 0,
    ooh_comms: Number(publisher.ooh_comms) || 0,
    cinema_comms: Number(publisher.cinema_comms) || 0,
    digidisplay_comms: Number(publisher.digidisplay_comms) || 0,
    digiaudio_comms: Number(publisher.digiaudio_comms) || 0,
    digivideo_comms: Number(publisher.digivideo_comms) || 0,
    bvod_comms: Number(publisher.bvod_comms) || 0,
    integration_comms: Number(publisher.integration_comms) || 0,
    search_comms: Number(publisher.search_comms) || 0,
    socialmedia_comms: Number(publisher.socialmedia_comms) || 0,
    progdisplay_comms: Number(publisher.progdisplay_comms) || 0,
    progvideo_comms: Number(publisher.progvideo_comms) || 0,
    progbvod_comms: Number(publisher.progbvod_comms) || 0,
    progaudio_comms: Number(publisher.progaudio_comms) || 0,
    progooh_comms: Number(publisher.progooh_comms) || 0,
    influencers_comms: Number(publisher.influencers_comms) || 0,
  }
}

interface EditPublisherFormProps {
  publisher: Publisher
  onSuccess: (updated?: Publisher) => void | Promise<void>
}

export function EditPublisherForm({ publisher, onSuccess }: EditPublisherFormProps) {
  const [isSaving, setIsSaving] = useState(false)
  const defaults = useMemo(() => toDetailsDefaults(publisher), [publisher])

  const form = useForm<PublisherDetailsInput, unknown, PublisherDetailsFormValues>({
    resolver: zodResolver(publisherDetailsUpdateSchema),
    values: defaults,
  })

  async function onSubmit(data: PublisherDetailsFormValues) {
    setIsSaving(true)
    try {
      const merged = { ...publisher, ...data }
      const response = await fetch(`/api/publishers/${encodeURIComponent(String(publisher.publisherid).trim())}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(merged),
      })

      if (!response.ok) {
        throw new Error("Failed to update publisher")
      }

      const updated = normalizePublisherRecord((await response.json()) as Publisher)
      await onSuccess(updated)
    } catch (error) {
      console.error("Failed to update publisher:", error)
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
              <FormLabel>Finance Code</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="publisher_colour"
          render={({ field }) => {
            const stored = field.value
            const cssHex = cssHexFromStored(stored)
            const hasValidHex = cssHex != null

            return (
              <FormItem className="flex flex-col space-y-1.5">
                <FormLabel className="text-sm font-medium text-muted-foreground">Brand Colour</FormLabel>
                <FormControl>
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        "h-9 w-9 shrink-0 rounded-lg border",
                        hasValidHex
                          ? "border-border"
                          : "border-dashed border-muted-foreground/40 bg-muted"
                      )}
                      style={hasValidHex ? { backgroundColor: cssHex } : undefined}
                      aria-hidden
                    />
                    <input
                      type="color"
                      className="h-9 w-12 cursor-pointer rounded border-0 bg-transparent p-0"
                      value={hasValidHex ? cssHex : NATIVE_COLOR_INPUT_FALLBACK}
                      onChange={(e) => field.onChange(e.target.value)}
                      aria-label="Pick brand colour"
                    />
                    <Input
                      className="w-28 font-mono text-xs"
                      placeholder="#000000"
                      value={stored ?? ""}
                      onChange={(e) => {
                        const v = e.target.value
                        field.onChange(v.trim() === "" ? null : v)
                      }}
                      onBlur={field.onBlur}
                      name={field.name}
                      ref={field.ref}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      className="text-xs"
                      onClick={() => field.onChange(null)}
                    >
                      Clear
                    </Button>
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )
          }}
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
              name={`pub_${medium}` as keyof PublisherDetailsFormValues}
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
              name={`${medium}_comms` as keyof PublisherDetailsFormValues}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{`${medium.charAt(0).toUpperCase() + medium.slice(1)} Commission (%)`}</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      name={field.name}
                      ref={field.ref}
                      onBlur={field.onBlur}
                      value={typeof field.value === "number" && !Number.isNaN(field.value) ? field.value : ""}
                      onChange={(e) =>
                        field.onChange(Number.isNaN(e.target.valueAsNumber) ? undefined : e.target.valueAsNumber)
                      }
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          ))}
        </div>

        <Button type="submit" disabled={isSaving}>
          {isSaving ? "Saving..." : "Save"}
        </Button>
      </form>
      <SavingModal isOpen={isSaving} />
    </Form>
  )
}
