"use client"

import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

/** line_channel enum values (postgres). */
export const COST_CHANNEL_OPTIONS = [
  "television",
  "radio",
  "cinema",
  "newspaper",
  "magazines",
  "ooh",
  "prog_display",
  "prog_video",
  "prog_audio",
  "prog_bvod",
  "prog_ooh",
  "digi_display",
  "digi_video",
  "digi_audio",
  "digi_bvod",
  "social",
  "search",
  "influencers",
  "integrations",
  "production",
] as const

export function CostsLocalFilters({
  channel,
  publisher,
  onChannelChange,
  onPublisherChange,
}: {
  channel: string
  publisher: string
  onChannelChange: (v: string) => void
  onPublisherChange: (v: string) => void
}) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="space-y-1 text-xs text-muted-foreground">
        <span className="block font-medium text-foreground">Channel</span>
        <Select
          value={channel || "__all__"}
          onValueChange={(v) => onChannelChange(v === "__all__" ? "" : v)}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="All channels" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All channels</SelectItem>
            {COST_CHANNEL_OPTIONS.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>
      <label className="space-y-1 text-xs text-muted-foreground">
        <span className="block font-medium text-foreground">Publisher</span>
        <Input
          className="w-[220px]"
          placeholder="Filter publisher…"
          value={publisher}
          onChange={(e) => onPublisherChange(e.target.value)}
        />
      </label>
    </div>
  )
}
