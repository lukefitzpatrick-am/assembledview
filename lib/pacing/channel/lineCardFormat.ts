import { formatMoney } from "@/lib/format/money"
import { formatRatioAsPercent } from "@/lib/pacing/kpi/formatKpi"
import type { LineCardKpi, LineCardKpiSource } from "./lineCardTypes"
import type { SingleKpiStatus } from "@/lib/pacing/kpi/computeKpiStatus"

export function formatCount(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—"
  return new Intl.NumberFormat("en-AU", { maximumFractionDigits: 0 }).format(value)
}

export function formatWholeMoney(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—"
  return formatMoney(value, { decimals: 0 })
}

export function formatRateMoney(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—"
  return formatMoney(value, { decimals: 2 })
}

export function kpiChip(input: {
  label: string
  delivered: string
  target: string | null
  source: LineCardKpiSource
  status: SingleKpiStatus | null
}): LineCardKpi {
  return {
    label: input.label,
    delivered: input.delivered,
    target: input.target ?? "",
    source: input.source,
    status: input.status,
  }
}

export function formatKpiCaption(kpi: LineCardKpi): string {
  if (kpi.status === "no-delivery" && !kpi.delivered) return "No delivery to judge"
  if (!kpi.target && kpi.status == null) {
    return kpi.delivered ? `${kpi.label} · ${kpi.delivered}` : kpi.label
  }
  if (kpi.status === "no-target" || !kpi.target) {
    return `${kpi.label} ${kpi.delivered} · no target saved`
  }
  if (kpi.source === "rate") {
    return `${kpi.label} ${kpi.delivered} plan ${kpi.target}`
  }
  if (kpi.source === "benchmark") {
    return `${kpi.label} ${kpi.delivered} vs ${kpi.target} benchmark`
  }
  return `${kpi.label} ${kpi.delivered} vs ${kpi.target} target`
}

export function ratioOrDash(value: number | null | undefined): string {
  return formatRatioAsPercent(value)
}
