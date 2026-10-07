"use client"

import { ClientMark } from "@/components/brand/EntityMark"
import { ClientBrainPanel } from "@/components/dashboard/ClientBrainPanel"
import { SlideOver } from "@/components/ui/SlideOver"

export interface ClientBrainSlideOverProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  clientName: string
  clientRecord?: Record<string, unknown> | null
  /** @deprecated Paints only ClientMark. */
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
        <div className="flex items-center gap-3 border-b border-border px-6 py-4">
          <ClientMark name={clientName} colour={brandColour} size="md" />
          <p className="min-w-0 truncate font-semibold text-foreground">{clientName}</p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <ClientBrainPanel clientName={clientName} record={clientRecord} />
        </div>
      </div>
    </SlideOver>
  )
}
