import { Badge } from "@/components/ui/badge"
import type { TaxonomyRow } from "@/lib/planning/adapter"

export function taxonomyHonestyKind(row: TaxonomyRow):
  | { kind: "none" }
  | { kind: "inherited"; group: string }
  | { kind: "benchmark" }
  | { kind: "injected" }
  | { kind: "scored" }
  | { kind: "no-benchmark" } {
  if (row.rowType === "rollup") return { kind: "none" }
  if (row.mappingProvenance === "inherited") {
    return { kind: "inherited", group: row.inheritedFromLabel ?? "group" }
  }
  if (row.mappingProvenance === "benchmark-only") {
    return { kind: "benchmark" }
  }
  if (row.rowType === "injected") {
    return { kind: "injected" }
  }
  if (row.engineChannelId) {
    return { kind: "scored" }
  }
  return { kind: "no-benchmark" }
}

export function TaxonomyStatusBadge({ row }: { row: TaxonomyRow }) {
  const kind = taxonomyHonestyKind(row)
  if (kind.kind === "none") return null

  if (kind.kind === "inherited") {
    return (
      <Badge variant="outline" size="sm" className="font-normal text-muted-foreground">
        inherited from {kind.group}
      </Badge>
    )
  }

  if (kind.kind === "benchmark") {
    return (
      <Badge variant="outline" size="sm" className="font-normal">
        Benchmark
      </Badge>
    )
  }

  if (kind.kind === "injected") {
    return (
      <Badge variant="outline" size="sm" className="font-normal text-muted-foreground">
        modelled — not RM measured
      </Badge>
    )
  }

  if (kind.kind === "scored") {
    return (
      <Badge variant="info" size="sm" className="font-normal">
        scored
      </Badge>
    )
  }

  return (
    <Badge variant="outline" size="sm" className="font-normal text-muted-foreground">
      no benchmark
    </Badge>
  )
}
