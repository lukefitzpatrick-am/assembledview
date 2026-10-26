/**
 * Receivable production service row item codes (pure, client-safe).
 *
 * Since 26 Oct 2026 receivables write G.Production (Advertising Associates)
 * and D.Production (Assembled Media), split by production publisher
 * (`productionServiceRowsForMonth`). "Production" is the older bare code;
 * approved snapshots and billed-line hashes taken before then carry it.
 */

export const PRODUCTION_ITEM_CODES = ["G.Production", "D.Production", "Production"] as const

/** True for G.Production, D.Production and the bare "Production" (trimmed, any case). */
export function isProductionItemCode(code: unknown): boolean {
  const c = String(code ?? "").trim().toLowerCase()
  return c === "production" || c === "g.production" || c === "d.production"
}
