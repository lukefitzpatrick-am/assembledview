import {
  buildDefaultFinanceScope,
  clampMonthRangeToFy,
  type FinanceBasisDefault,
  type FinanceScopeValues,
} from "@/lib/finance/sections/defaultScope"

export function cloneScope(s: FinanceScopeValues): FinanceScopeValues {
  return {
    fy: s.fy,
    monthRange: { from: s.monthRange.from, to: s.monthRange.to },
    clients: [...s.clients],
    basisDefault: s.basisDefault,
  }
}

export function scopesEqual(a: FinanceScopeValues, b: FinanceScopeValues): boolean {
  if (a.fy !== b.fy) return false
  if (a.basisDefault !== b.basisDefault) return false
  if (a.monthRange.from !== b.monthRange.from || a.monthRange.to !== b.monthRange.to) return false
  if (a.clients.length !== b.clients.length) return false
  const as = [...a.clients].sort((x, y) => x - y)
  const bs = [...b.clients].sort((x, y) => x - y)
  return as.every((v, i) => v === bs[i])
}

function parseClientsParam(raw: string | null): number[] {
  if (!raw || !raw.trim()) return []
  const out: number[] = []
  for (const part of raw.split(",")) {
    const n = Number.parseInt(part.trim(), 10)
    if (Number.isFinite(n) && n > 0) out.push(n)
  }
  return [...new Set(out)]
}

export function parseScopeFromParams(
  params: URLSearchParams,
  today: Date = new Date()
): FinanceScopeValues {
  const defaults = buildDefaultFinanceScope(today)
  const fyRaw = params.get("fy")
  let fy = defaults.fy
  if (fyRaw != null && fyRaw.trim() !== "") {
    const parsed = Number.parseInt(fyRaw, 10)
    if (Number.isFinite(parsed) && parsed >= 2000 && parsed <= 2100) fy = parsed
  }
  const from = params.get("from")?.trim() || defaults.monthRange.from
  const to = params.get("to")?.trim() || defaults.monthRange.to
  const monthRange = clampMonthRangeToFy(fy, { from, to }, today)
  const clients = parseClientsParam(params.get("clients"))
  const basisRaw = (params.get("basis") ?? "").trim().toLowerCase()
  const basisDefault: FinanceBasisDefault =
    basisRaw === "billed" || basisRaw === "booked" ? basisRaw : defaults.basisDefault
  return { fy, monthRange, clients, basisDefault }
}

export const FINANCE_SCOPE_QUERY_KEYS = ["fy", "from", "to", "clients", "basis"] as const

export function scopeToSearchParams(applied: FinanceScopeValues): URLSearchParams {
  const p = new URLSearchParams()
  const [fy, from, to, clients, basis] = FINANCE_SCOPE_QUERY_KEYS
  p.set(fy, String(applied.fy))
  p.set(from, applied.monthRange.from)
  p.set(to, applied.monthRange.to)
  if (applied.clients.length) p.set(clients, applied.clients.join(","))
  if (applied.basisDefault !== "booked") p.set(basis, applied.basisDefault)
  return p
}
