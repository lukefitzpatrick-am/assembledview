/** Normaliser for KPI media_type matching (client hub uses `digitalDisplay`, resolver uses `digiDisplay`). */
export function normMediaTypeKey(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .trim()
}

/** True when row media_type refers to the same channel as `resolverMediaType` (camelCase from containers). */
export function mediaTypeMatchesKpiRow(resolverMediaType: string, kpiRowMediaType: string): boolean {
  const a = normMediaTypeKey(resolverMediaType)
  const b = normMediaTypeKey(kpiRowMediaType)
  if (a === b) return true
  const canon = (x: string): string => {
    if (x === "digitaldisplay" || x === "digidisplay") return "digidisplay"
    if (x === "digitalaudio" || x === "digiaudio") return "digiaudio"
    if (x === "digitalvideo" || x === "digivideo") return "digivideo"
    return x
  }
  return canon(a) === canon(b)
}
