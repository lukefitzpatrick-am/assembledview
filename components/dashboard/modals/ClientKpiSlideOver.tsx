"use client"

import { AlertCircle, BarChart3 } from "lucide-react"

import { ClientMark } from "@/components/brand/EntityMark"
import { ClientKpiSection } from "@/components/dashboard/ClientKpiSection"
import { SlideOver } from "@/components/ui/SlideOver"

export interface ClientKpiSlideOverProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  urlSlug: string
  clientName: string
  /** @deprecated Paints only ClientMark. */
  brandColour?: string
}

export function ClientKpiSlideOver({
  open,
  onOpenChange,
  urlSlug,
  clientName,
  brandColour,
}: ClientKpiSlideOverProps) {
  const hasSlug = Boolean(urlSlug?.trim())
  const hasClientName = Boolean(clientName?.trim())

  return (
    <SlideOver
      open={open}
      onOpenChange={onOpenChange}
      title="Client KPIs & Publisher Requirements"
      description="Performance targets and publisher specifications"
      contentClassName="sm:max-w-[63rem]"
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto">
          {hasSlug && hasClientName ? (
            <div className="space-y-6 p-6">
              <div className="flex items-center gap-3 border-b border-border pb-4">
                <ClientMark name={clientName} colour={brandColour} size="lg" />
                <div>
                  <h3 className="font-semibold text-foreground">Performance Targets</h3>
                  <p className="text-sm text-muted-foreground">KPI defaults and publisher-specific requirements</p>
                </div>
              </div>

              <div className="space-y-6">
                <ClientKpiSection
                  clientName={clientName.trim()}
                  urlSlug={urlSlug.trim()}
                />
              </div>

              <div className="flex items-start gap-2 rounded-lg border border-[color-mix(in_srgb,var(--pacing-on-track)_20%,transparent)] bg-pacing-on-track-bg px-4 py-3 text-sm text-status-on-track-fg">
                <BarChart3 className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  Add rows for each publisher and media type; bid strategy options depend on the selected media type.
                  Groups are ordered digital-first.
                </span>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-pacing-behind-bg">
                <AlertCircle className="h-8 w-8 text-status-behind-fg" />
              </div>
              <h3 className="mb-2 font-semibold text-foreground">Unable to Load KPIs</h3>
              <p className="max-w-[280px] text-sm text-muted-foreground">
                {hasSlug
                  ? "Client name is missing. Please try refreshing the page."
                  : "Client slug is missing. Please try refreshing the page."}
              </p>
            </div>
          )}
        </div>
      </div>
    </SlideOver>
  )
}
