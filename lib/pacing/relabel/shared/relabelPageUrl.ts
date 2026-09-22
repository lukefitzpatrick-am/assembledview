/** Client-reachable — see the boundary note in `./types`. No db/snowflake here. */
import type { ChannelTabKey } from "@/lib/pacing/channel/lineCardTypes"
import { CM360_PACING_CHANNEL, RELABEL_REVERT_WINDOW_DAYS } from "./types"

export type RelabelsTab = "new" | "unmapped" | "log"

export function parseRelabelsTab(raw: string | null | undefined): RelabelsTab {
  const v = String(raw ?? "").trim().toLowerCase()
  if (v === "unmapped") return "unmapped"
  if (v === "log") return "log"
  return "new"
}

/** Client prefix of an MBA (`BICAU002` → `BICAU`). */
export function mbaStem(mba: string | null | undefined): string {
  const raw = String(mba ?? "").trim().toUpperCase()
  const letters = raw.match(/^[A-Z]+/)
  return letters?.[0] ?? raw
}

export function defaultWarehouseChannel(
  card: ChannelTabKey | null | undefined,
  platform?: string | null,
): string {
  const p = String(platform ?? "")
  if (card === "social") {
    if (/tiktok/i.test(p)) return "Social - TikTok"
    if (/reddit/i.test(p)) return "Social - Reddit"
    return "Social - Meta"
  }
  if (card === "search") {
    if (/pmax|p-?max/i.test(p)) return "PMax - Google Ads"
    if (/shop/i.test(p)) return "Shopping - Google Ads"
    return "Search - Google Ads"
  }
  if (card === "programmatic") {
    if (/ooh/i.test(p)) return "Programmatic - OOH"
    if (/video|ctv/i.test(p)) return "Programmatic - Video"
    return "Programmatic - Display"
  }
  return CM360_PACING_CHANNEL
}

export function relabelsHref(opts: {
  tab?: RelabelsTab
  mba?: string | null
  line?: string | null
  channel?: string | null
  entity?: string | null
  id?: number | string | null
} = {}): string {
  const p = new URLSearchParams()
  if (opts.tab && opts.tab !== "new") p.set("tab", opts.tab)
  if (opts.mba) p.set("mba", opts.mba)
  if (opts.line) p.set("line", opts.line)
  if (opts.channel) p.set("channel", opts.channel)
  if (opts.entity) p.set("entity", opts.entity)
  if (opts.id != null && String(opts.id).trim()) p.set("id", String(opts.id))
  const q = p.toString()
  return q ? `/pacing/admin/relabels?${q}` : "/pacing/admin/relabels"
}

export function canRevertRelabel(
  createdAt: string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!createdAt) return false
  const created = new Date(createdAt).getTime()
  if (!Number.isFinite(created)) return false
  const windowMs = RELABEL_REVERT_WINDOW_DAYS * 24 * 60 * 60 * 1000
  return now.getTime() - created <= windowMs
}
