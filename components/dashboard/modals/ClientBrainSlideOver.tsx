"use client"

import { ClientBrainPanel } from "@/components/dashboard/ClientBrainPanel"
import { SlideOver } from "@/components/ui/SlideOver"

export interface ClientBrainSlideOverProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  clientName: string
  clientRecord?: Record<string, unknown> | null
  brandColour?: string
}

export function ClientBrainSlideOver({
  open,
  onOpenChange,
  clientName,
  clientRecord,
  brandColour,
}: ClientBrainSlideOverProps) {
  return (
    <SlideOver
      open={open}
      onOpenChange={onOpenChange}
      title="Client Brain"
      description={`Marketing brain for ${clientName}`}
      contentClassName="sm:max-w-2xl"
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <div
          className="h-1 w-full"
          style={{
            background: brandColour
              ? `linear-gradient(to right, ${brandColour}99, ${brandColour}, ${brandColour}99)`
              : undefined,
          }}
        />
        {!brandColour ? (
          <div className="h-1 w-full bg-gradient-to-r from-primary/60 via-primary to-primary/60" />
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto">
          <ClientBrainPanel clientName={clientName} record={clientRecord} />
        </div>
      </div>
    </SlideOver>
  )
}
