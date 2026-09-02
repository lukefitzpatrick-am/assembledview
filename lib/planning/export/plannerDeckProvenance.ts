import { isFilteredRmRun } from "@/lib/planning/upload/coverageHonesty"

export function uploadedRunProvenanceLine(opts: {
  source?: "composed" | "uploaded"
  fileName?: string | null
  waveCode?: string | null
  filterLabel?: string | null
}): string | null {
  if ((opts.source ?? "uploaded") === "composed") return null
  const fileName = opts.fileName?.trim() || "unknown file"
  const waveCode = opts.waveCode?.trim() || "—"
  const filter = opts.filterLabel?.trim() ?? ""
  const filtered =
    isFilteredRmRun(filter) ? `, filtered to ${filter}` : ""
  return `Source: uploaded Roy Morgan run — ${fileName}, wave ${waveCode}${filtered}`
}

export function modelledChannelsFootnote(n: number): string | null {
  if (n <= 0) return null
  return `${n} channels modelled from group totals or benchmarks — see the planner for detail.`
}

export function countModelledChannels(
  rows: Array<{ mappingProvenance?: string | null }>
): number {
  let n = 0
  for (const row of rows) {
    if (
      row.mappingProvenance === "inherited" ||
      row.mappingProvenance === "benchmark-only"
    ) {
      n += 1
    }
  }
  return n
}

/** Per-audience slide Placeholder 2. Composed (no provenance) stays definition\\nstats. */
export function audienceDefinitionPlaceholder(
  definition: string,
  stats: string,
  provenance: string | null | undefined
): string {
  if (!provenance) return `${definition}\n${stats}`
  return `${definition}\n${provenance}\n${stats}`
}

/** Reach-architecture commentary; modelled footnote is the methodology line. */
export function audienceReachCommentary(
  base: string,
  modelledCount: number | null | undefined
): string {
  const note = modelledChannelsFootnote(modelledCount ?? 0)
  return note ? `${base}\n${note}` : base
}
