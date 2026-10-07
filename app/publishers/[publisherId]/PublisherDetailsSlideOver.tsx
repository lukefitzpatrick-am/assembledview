"use client"

import { useState } from "react"
import { Save } from "lucide-react"
import { PublisherMark } from "@/components/brand/EntityMark"
import { EditPublisherForm } from "@/components/EditPublisherForm"
import { SlideOver } from "@/components/ui/SlideOver"
import type { Publisher } from "@/lib/types/publisher"

interface PublisherDetailsSlideOverProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  publisher: Publisher
  onSuccess: (updated?: Publisher) => void
}

export function PublisherDetailsSlideOver({
  open,
  onOpenChange,
  publisher,
  onSuccess,
}: PublisherDetailsSlideOverProps) {
  const [refresh, setRefresh] = useState(0)

  const handleSuccess = (updated?: Publisher) => {
    setRefresh((n) => n + 1)
    onSuccess(updated)
  }

  return (
    <SlideOver
      open={open}
      onOpenChange={onOpenChange}
      title="Publisher details"
      description={`View and manage ${publisher.publisher_name || "publisher"} information`}
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="space-y-6 p-6">
            <div className="flex items-center gap-3 border-b border-border pb-4">
              <PublisherMark
                name={publisher.publisher_name || "Publisher"}
                colour={publisher.publisher_colour}
                size="lg"
              />
              <div>
                <h3 className="font-semibold text-foreground">Publisher Information</h3>
                <p className="text-sm text-muted-foreground">
                  Details, media types, commissions, and brand colour
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card/50 p-4">
              <EditPublisherForm
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
