"use client"

import { Segmented, SegmentedItem } from "@/components/ui/segmented"
import {
  useChannelLayout,
  type ChannelLayout,
} from "@/lib/pacing/channel/channelLayout"
import type { ChannelTabKey } from "@/lib/pacing/channel/lineCardTypes"
import { cn } from "@/lib/utils"

export function ChannelLayoutToggle({
  channel,
  className,
}: {
  channel: ChannelTabKey
  className?: string
}) {
  const { layout, setLayout } = useChannelLayout(channel)

  return (
    <Segmented
      value={layout}
      onValueChange={(value) => {
        if (value === "cards" || value === "table") setLayout(value)
      }}
      aria-label={`${channel} layout`}
      className={cn("shrink-0", className)}
    >
      <SegmentedItem value="cards">Cards</SegmentedItem>
      <SegmentedItem value="table">Table</SegmentedItem>
    </Segmented>
  )
}

export type { ChannelLayout }
