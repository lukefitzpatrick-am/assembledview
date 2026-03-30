"use client"

import { useState } from "react"
import { BarChart3, Save } from "lucide-react"
import { PublisherKpiForm } from "@/components/PublisherKpiForm"
import { SlideOver } from "@/components/ui/SlideOver"
import type { Publisher } from "@/lib/types/publisher"

interface PublisherKpiSlideOverProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  publisher: Publisher
  onSuccess: (updated?: Publisher) => void
}

export function PublisherKpiSlideOver({
  open,
  onOpenChange,
  publisher,
  onSuccess,
}: PublisherKpiSlideOverProps) {
  const [refresh, setRefresh] = useState(0)

  const handleSuccess = (updated?: Publisher) => {
    setRefresh((n) => n + 1)
    onSuccess(updated)
  }

  return (
    <SlideOver
      open={open}
      onOpenChange={onOpenChange}
      title="KPIs & Targets"
      description={`Performance targets for ${publisher.publisher_name || "publisher"}`}
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
          <div className="space-y-6 p-6">
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

            <div className="rounded-xl border border-border bg-card/50 p-4">
              <PublisherKpiForm
                key={refresh}
                publisher={publisher}
                onSuccess={handleSuccess}
              />
            </div>

            <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
              <Save className="h-4 w-4 shrink-0" />
              <span>Changes are saved when you click the save button above.</span>
            </div>
          </div>
        </div>
      </div>
    </SlideOver>
  )
}
