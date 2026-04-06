"use client"

import { BarChart3, Save } from "lucide-react"
import { PublisherKpiForm } from "@/components/PublisherKpiForm"
import { SlideOver } from "@/components/ui/SlideOver"
import type { Publisher } from "@/lib/types/publisher"

interface PublisherKpiSlideOverProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  publisher: Publisher
  onSuccess?: (updated?: Publisher) => void
}

export function PublisherKpiSlideOver({
  open,
  onOpenChange,
  publisher,
  onSuccess,
}: PublisherKpiSlideOverProps) {
  const handleSuccess = async () => {
    await onSuccess?.()
  }

  return (
    <SlideOver
      open={open}
      onOpenChange={onOpenChange}
      title="KPIs & Targets"
      description={`Performance targets for ${publisher.publisher_name || "publisher"}`}
      contentClassName="w-full sm:max-w-3xl md:max-w-4xl lg:max-w-5xl"
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <div
          className="h-1 w-full"
          style={{
            background: publisher.publisher_colour
              ? `linear-gradient(to right, ${publisher.publisher_colour}99, ${publisher.publisher_colour}, ${publisher.publisher_colour}99)`
              : undefined,
          }}
        />
        {!publisher.publisher_colour && (
          <div className="h-1 w-full bg-gradient-to-r from-primary/60 via-primary to-primary/60" />
        )}

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="w-full min-w-0 space-y-6 p-6">
            <div className="flex items-center gap-3 border-b border-border pb-4">
              <div
                className="flex h-10 w-10 items-center justify-center rounded-full"
                style={{
                  backgroundColor: publisher.publisher_colour
                    ? `${publisher.publisher_colour}15`
                    : undefined,
                }}
              >
                <BarChart3
                  className="h-5 w-5"
                  style={{ color: publisher.publisher_colour || undefined }}
                />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">KPIs & Targets</h3>
                <p className="text-sm text-muted-foreground">
                  Performance targets and tracking for this publisher
                </p>
              </div>
            </div>

            <div className="w-full min-w-0">
              <PublisherKpiForm publisher={publisher} onSuccess={handleSuccess} />
            </div>

            <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
              <Save className="h-4 w-4 shrink-0" />
              <span>
                Add any number of KPI rows (media type + bid strategy + metrics). Use Save on each card, Save all, or
                Add all strategies; stored in Xano (<span className="font-mono text-xs">publisher_kpi</span>), not on
                the publisher record.
              </span>
            </div>
          </div>
        </div>
      </div>
    </SlideOver>
  )
}
