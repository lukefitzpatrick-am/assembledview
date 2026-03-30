"use client"

import { AlertCircle, BarChart3, Target } from "lucide-react"

import { ClientKpiSection } from "@/components/dashboard/ClientKpiSection"
import { SlideOver } from "@/components/ui/SlideOver"

export interface KPIsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  urlSlug: string
  clientName: string
}

export function KPIsModal({ open, onOpenChange, urlSlug, clientName }: KPIsModalProps) {
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
        <div className="h-1 w-full bg-gradient-to-r from-emerald-500/60 via-emerald-500 to-emerald-500/60" />

        <div className="min-h-0 flex-1 overflow-y-auto">
          {hasSlug && hasClientName ? (
            <div className="space-y-6 p-6">
              <div className="flex items-center gap-3 border-b border-border pb-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/10">
                  <Target className="h-5 w-5 text-emerald-600" />
                </div>
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

              <div className="flex items-start gap-2 rounded-lg border border-blue-500/20 bg-blue-500/5 px-4 py-3 text-sm text-blue-600 dark:text-blue-400">
                <BarChart3 className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  KPI benchmarks are stored per client in Xano. Add rows for each publisher and media type; bid strategy
                  options depend on the selected media type.
                </span>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/10">
                <AlertCircle className="h-8 w-8 text-amber-500" />
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
