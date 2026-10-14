export function field(row: Record<string, unknown>, key: string): unknown {
  if (key in row) return row[key]
  const upper = key.toUpperCase()
  if (upper in row) return row[upper]
  return undefined
}

export function num(value: unknown): number | null {
  if (value == null || value === "") return null
  const n = typeof value === "number" ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

export function text(value: unknown): string | null {
  if (value == null) return null
  const s = String(value).trim()
  return s.length > 0 ? s : null
}

export function dateOnly(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10)
  }
  const s = text(value)
  if (!s) return null
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(s)
  return match ? match[1] : null
}

export function add(left: number | null, right: number | null): number | null {
  if (left == null && right == null) return null
  return (left ?? 0) + (right ?? 0)
}

export function rate(numerator: number | null, denominator: number | null): number | null {
  if (numerator == null || denominator == null || denominator === 0) return null
  return numerator / denominator
}

const STALE_DAYS = 7

export function freshnessStatus(maxDate: string | null, today: string, hasRows: boolean): "ok" | "empty" | "stale" {
  if (!hasRows || !maxDate) return "empty"
  const cutoff = shiftDays(today, -STALE_DAYS)
  if (maxDate < cutoff) return "stale"
  return "ok"
}

function shiftDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number)
  const utc = new Date(Date.UTC(y, m - 1, d))
  utc.setUTCDate(utc.getUTCDate() + days)
  const yy = utc.getUTCFullYear()
  const mm = String(utc.getUTCMonth() + 1).padStart(2, "0")
  const dd = String(utc.getUTCDate()).padStart(2, "0")
  return `${yy}-${mm}-${dd}`
}

export function isMissingMartView(err: unknown, viewName: string): boolean {
  const parts: string[] = []
  let current: unknown = err
  for (let depth = 0; depth < 4 && current; depth++) {
    if (typeof current === "object" && current && "message" in current) {
      parts.push(String((current as { message: unknown }).message))
    } else {
      parts.push(String(current))
    }
    current =
      typeof current === "object" && current && "cause" in current
        ? (current as { cause: unknown }).cause
        : null
  }
  const message = parts.join(" ")
  return new RegExp(viewName, "i").test(message) && /does not exist|not authorized/i.test(message)
}
