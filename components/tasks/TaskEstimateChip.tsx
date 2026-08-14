import { Badge } from "@/components/ui/badge"
import { formatMinutesAsEstimate } from "@/lib/codex/estimateParse"

export function TaskEstimateChip({
  minutes,
}: {
  minutes: number | null | undefined
}) {
  const label = formatMinutesAsEstimate(minutes)
  if (!label) return null
  return (
    <Badge variant="outline" size="sm" className="num font-normal">
      {label}
    </Badge>
  )
}
