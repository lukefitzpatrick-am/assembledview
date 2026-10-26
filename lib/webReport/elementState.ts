import { formatDateShort } from "@/lib/format/date"
import type { WebElementId } from "@/lib/webReport/elements"
import type { SourceStatus, WebReportData } from "@/lib/webReport/types"

export type ElementViewState = {
  status: SourceStatus
  message: string
}

function stopped(label: string, maxDate: string | null): string {
  const date = maxDate ? formatDateShort(maxDate) : "an unknown date"
  return `${label} data stopped on ${date}`
}

function fromSource(status: SourceStatus, label: string, maxDate: string | null, message: string | null): ElementViewState {
  if (status === "not_connected") return { status, message: "Not connected yet" }
  if (status === "needs_report") return { status, message: "Not available yet" }
  if (status === "stale") return { status, message: stopped(label, maxDate) }
  if (status === "empty") return { status, message: "No rows in this period." }
  if (status === "error") return { status, message: message ?? "This element could not be loaded." }
  return { status: "ok", message: "" }
}

export function elementViewState(id: WebElementId, data: WebReportData): ElementViewState {
  if (id === "notes") return { status: "ok", message: "" }
  if (id === "kpiTracker") {
    const kpis = data.kpis
    if (!kpis || kpis.status === "not_ready") return { status: "needs_report", message: "Not available yet" }
    if (kpis.status === "unavailable") return { status: "error", message: "Saved KPIs could not be loaded." }
    return { status: "ok", message: "" }
  }
  if (id === "events") return { status: "needs_report", message: "Not available yet" }
  if (id === "gscPages") return fromSource(data.gsc.pagesStatus, "Search Console", data.gsc.maxDate, data.gsc.message)
  if (id === "srcmed") {
    if (data.ga4.status === "not_connected" || data.ga4.status === "error" || data.ga4.status === "stale") {
      return fromSource(data.ga4.status, "Google Analytics 4", data.ga4.maxDate, data.ga4.message)
    }
    if (data.ga4.sourceMediumStatus === "needs_report") {
      return { status: "needs_report", message: "Not available yet" }
    }
    return fromSource(data.ga4.sourceMediumStatus, "Google Analytics 4", data.ga4.maxDate, data.ga4.message)
  }
  if (id === "queries" || id === "gscKpi" || id === "gscTrend" || id === "queryBubble" || id === "queryPositions") {
    return fromSource(data.gsc.status, "Search Console", data.gsc.maxDate, data.gsc.message)
  }
  if (id === "searchAds") {
    const slice = data.searchAds
    if (!slice) return { status: "needs_report", message: "Not available yet" }
    return fromSource(slice.status, "Paid search", null, slice.message)
  }
  if (id === "paidSpend") return fromSource(data.paid.status, "Paid media", null, data.paid.message)
  if (id === "costPer") {
    if (data.paid.status === "error") return fromSource(data.paid.status, "Paid media", null, data.paid.message)
    if (data.ga4.status === "not_connected") return fromSource("not_connected", "Google Analytics 4", null, null)
    if (data.ga4.status === "error" || data.ga4.status === "stale") {
      return fromSource(data.ga4.status, "Google Analytics 4", data.ga4.maxDate, data.ga4.message)
    }
    const events = data.ga4.current.keyEvents
    if (data.paid.spend == null || events == null || events === 0) {
      return { status: "empty", message: "No rows in this period." }
    }
    return { status: "ok", message: "" }
  }
  if (id === "kpis" || id === "snapshot") {
    const ga4Down = data.ga4.status === "not_connected" || data.ga4.status === "error"
    const gscDown = data.gsc.status === "not_connected" || data.gsc.status === "error"
    if (ga4Down && gscDown && data.paid.status !== "ok") {
      return fromSource(data.ga4.status, "Google Analytics 4", data.ga4.maxDate, data.ga4.message)
    }
    if (data.ga4.status === "stale") {
      return fromSource("stale", "Google Analytics 4", data.ga4.maxDate, data.ga4.message)
    }
    return { status: "ok", message: "" }
  }
  return fromSource(data.ga4.status, "Google Analytics 4", data.ga4.maxDate, data.ga4.message)
}
