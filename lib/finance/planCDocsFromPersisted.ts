/** Plan C S1-P4 — document routes load numbers from persisted version when on. */
export function resolvePlanCDocsFromPersistedMode(
  raw: string | undefined = process.env.PLANC_DOCS_FROM_PERSISTED
): "on" | "off" {
  return String(raw ?? "")
    .trim()
    .toLowerCase() === "on"
    ? "on"
    : "off"
}

/** Browser / client companion — set NEXT_PUBLIC_PLANC_DOCS_FROM_PERSISTED=on alongside server flag. */
export function resolvePlanCDocsFromPersistedModePublic(
  raw: string | undefined = process.env.NEXT_PUBLIC_PLANC_DOCS_FROM_PERSISTED
): "on" | "off" {
  return resolvePlanCDocsFromPersistedMode(raw)
}
