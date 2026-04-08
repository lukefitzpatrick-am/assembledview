import { format } from "date-fns"

export function formatPacingDate(isoDate: string | null | undefined): string {
  if (!isoDate?.trim()) return "—"
  const s = isoDate.trim().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return isoDate
  const d = new Date(`${s}T12:00:00`)
  if (Number.isNaN(d.getTime())) return isoDate
  return format(d, "dd MMM yyyy")
}

/**
 * AUD: no decimals when |value| ≥ 1000; otherwise 2 decimals.
 */
export function formatPacingAud(value: number | null | undefined): string {
  const n = Number(value ?? 0)
  if (!Number.isFinite(n)) return "—"
  const abs = Math.abs(n)
  const maxFrac = abs >= 1000 ? 0 : 2
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: maxFrac,
    maximumFractionDigits: maxFrac,
  }).format(n)
}

export function formatPacingPct1(value: number | null | undefined): string {
  const n = Number(value ?? 0)
  if (!Number.isFinite(n)) return "—"
  return `${n.toFixed(1)}%`
}
