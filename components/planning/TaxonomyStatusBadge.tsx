import { Badge } from "@/components/ui/badge"
import type { TaxonomyRow } from "@/lib/planning/adapter"

export function TaxonomyStatusBadge({ row }: { row: TaxonomyRow }) {
  if (row.rowType === "rollup") return null

  if (row.rowType === "injected") {
    return (
      <Badge variant="outline" size="sm" className="font-normal text-muted-foreground">
        modelled — not RM measured
      </Badge>
    )
  }

  // Leaf with an engine mapping is scored (including duplicate RM rows that share
  // an already-scored engine id — they carry engineChannelId but engine: null).
  if (row.engineChannelId) {
    return (
      <Badge variant="info" size="sm" className="font-normal">
        scored
      </Badge>
    )
  }

  // Leaf with no engineChannelId — mapping/benchmark gap (should be rare after defaults).
  return (
    <Badge variant="outline" size="sm" className="font-normal text-muted-foreground">
      no benchmark
    </Badge>
  )
}
