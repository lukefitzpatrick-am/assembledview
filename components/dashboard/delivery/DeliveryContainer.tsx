"use client"

import { ChannelSection } from "./ChannelSection"
import type { ChannelSectionData } from "./channels/types"

export interface DeliveryContainerProps {
  channels: ChannelSectionData[]
  onRefresh?: () => void
}

export function DeliveryContainer({ channels, onRefresh }: DeliveryContainerProps) {
  if (channels.length === 0) return null
  return (
    <div className="space-y-4">
      {channels.map((c, idx) => (
        <ChannelSection
          key={c.key}
          data={c}
          defaultOpen={idx === 0}
          onRefresh={onRefresh}
        />
      ))}
    </div>
  )
}
