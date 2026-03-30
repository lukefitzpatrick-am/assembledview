"use client"

import { useMemo, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { SavingModal } from "@/components/ui/saving-modal"
import { Panel, PanelContent, PanelDescription, PanelHeader, PanelTitle } from "@/components/layout/Panel"
import {
  publisherKpiUpdateSchema,
  type PublisherKpiFormValues,
} from "@/lib/validations/publisher"
import type { Publisher } from "@/lib/types/publisher"
import { normalizePublisherRecord } from "@/lib/publisher/normalizePublisher"
import {
  KPI_FAMILY_PUB_FLAG,
  KPI_FAMILY_LABELS,
  KPI_METRIC_KEYS,
} from "@/lib/publisher/scheduleLabels"

function kpiDefaultsFromPublisher(publisher: Publisher): PublisherKpiFormValues {
  const base: Record<string, number> = { id: publisher.id }
  for (const family of Object.keys(KPI_FAMILY_PUB_FLAG)) {
    for (const m of KPI_METRIC_KEYS) {
      const key = `${family}_${m}_default` as keyof Publisher
      base[key] = Number(publisher[key] ?? 0) || 0
    }
  }
  return base as PublisherKpiFormValues
}

interface PublisherKpiFormProps {
  publisher: Publisher
  onSuccess: (updated?: Publisher) => void | Promise<void>
}

export function PublisherKpiForm({ publisher, onSuccess }: PublisherKpiFormProps) {
  const [isSaving, setIsSaving] = useState(false)
  const defaults = useMemo(() => kpiDefaultsFromPublisher(publisher), [publisher])

  const form = useForm<PublisherKpiFormValues>({
    resolver: zodResolver(publisherKpiUpdateSchema),
    values: defaults,
  })

  const visibleFamilies = Object.entries(KPI_FAMILY_PUB_FLAG).filter(
    ([, pubFlag]) => publisher[pubFlag as keyof Publisher],
  )

  async function onSubmit(data: PublisherKpiFormValues) {
    setIsSaving(true)
    try {
      const merged = { ...publisher, ...data }
      const response = await fetch(`/api/publishers/${encodeURIComponent(String(publisher.publisherid).trim())}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(merged),
      })
      if (!response.ok) throw new Error("Failed to update KPI defaults")
      const updated = normalizePublisherRecord((await response.json()) as Publisher)
      await onSuccess(updated)
    } catch (e) {
      console.error(e)
    } finally {
      setIsSaving(false)
    }
  }

  if (visibleFamilies.length === 0) {
    return (
      <Panel className="border-muted/70 bg-card shadow-sm">
        <PanelHeader>
          <PanelTitle>Default KPIs</PanelTitle>
          <PanelDescription>
            Enable at least one digital, social, or programmatic media type on this publisher to set default KPIs.
          </PanelDescription>
        </PanelHeader>
      </Panel>
    )
  }

  return (
    <Panel className="border-muted/70 bg-card shadow-sm">
      <PanelHeader className="border-b border-border/50 pb-4">
        <PanelTitle>Default KPIs</PanelTitle>
        <PanelDescription>
          Defaults for CPM, CPC, CPV, CTR, VTR, and frequency by channel (current financial year analytics above are
          unchanged).
        </PanelDescription>
      </PanelHeader>
      <PanelContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            {visibleFamilies.map(([family]) => {
              const label = KPI_FAMILY_LABELS[family] ?? family
              return (
                <div key={family} className="space-y-4 rounded-xl border border-border/60 p-4">
                  <h3 className="text-sm font-semibold">{label}</h3>
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
                    {KPI_METRIC_KEYS.map((metric) => {
                      const name = `${family}_${metric}_default` as keyof PublisherKpiFormValues
                      return (
                        <FormField
                          key={name}
                          control={form.control}
                          name={name}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-xs uppercase text-muted-foreground">{metric}</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  step="any"
                                  {...field}
                                  value={field.value ?? 0}
                                  onChange={(e) => field.onChange(e.target.valueAsNumber)}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      )
                    })}
                  </div>
                </div>
              )
            })}
            <Button type="submit" disabled={isSaving}>
              {isSaving ? "Saving..." : "Update KPIs"}
            </Button>
          </form>
        </Form>
        <SavingModal isOpen={isSaving} />
      </PanelContent>
    </Panel>
  )
}
