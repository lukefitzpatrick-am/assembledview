import { Badge } from "@/components/ui/badge"
import type { TaxonomyRow } from "@/lib/planning/adapter"

export function TaxonomyStatusBadge({ row }: { row: TaxonomyRow }) {
  if (row.rowType === "rollup") {
    return (
      <Badge variant="outline" size="sm" className="font-normal text-muted-foreground">
        not scored
      </Badge>
    )
  }
  if (row.rowType === "injected") {
    return (
      <Badge variant="outline" size="sm" className="font-normal text-muted-foreground">
        modelled — not RM measured
      </Badge>
    )
  }
  if (!row.engine) {
    return (
      <Badge variant="outline" size="sm" className="font-normal text-muted-foreground">
        not scored
      </Badge>
    )
  }
  return (
    <Badge variant="info" size="sm" className="font-normal">
      scored
    </Badge>
  )
}
