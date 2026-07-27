import { NextRequest, NextResponse } from "next/server"

import { requireRole } from "@/lib/requireRole"
import type { ChannelFamily } from "@/lib/naming/channelTabs"
import { suggestAvaNamingTokens } from "@/lib/naming/suggestAvaNamingTokens"
import {
  applyAvaSuggestions,
  type TokenSourceItem,
} from "@/lib/naming/summariseTargetingTokens"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

const ITEM_CAP = 200
const RAW_CAP = 400
const STR_CAP = 120

function asStr(value: unknown, max = STR_CAP): string {
  if (value == null) return ""
  const s = String(value).trim()
  if (!s) return ""
  return s.length <= max ? s : s.slice(0, max)
}

function asItems(raw: unknown): TokenSourceItem[] {
  if (!Array.isArray(raw)) return []
  const out: TokenSourceItem[] = []
  for (const row of raw.slice(0, ITEM_CAP)) {
    if (!row || typeof row !== "object") continue
    const o = row as Record<string, unknown>
    const id = asStr(o.line_item_id, 80)
    if (!id) continue

    const item: TokenSourceItem = {
      line_item_id: id,
      targeting_raw: asStr(o.targeting_raw, RAW_CAP),
      geo_raw: asStr(o.geo_raw, RAW_CAP),
    }

    const channel = asStr(o.channel)
    if (channel) item.channel = channel
    const publisher = asStr(o.publisher)
    if (publisher) item.publisher = publisher
    const media_type = asStr(o.media_type)
    if (media_type) item.media_type = media_type
    const buy_type = asStr(o.buy_type)
    if (buy_type) item.buy_type = buy_type
    const creative_name = asStr(o.creative_name)
    if (creative_name) item.creative_name = creative_name
    const family = asStr(o.family)
    if (family) item.family = family as ChannelFamily
    const brand = asStr(o.brand)
    if (brand) item.brand = brand
    const campaign = asStr(o.campaign)
    if (campaign) item.campaign = campaign
    const notes = asStr(o.best_practice_notes, RAW_CAP)
    if (notes) item.best_practice_notes = notes
    if (Array.isArray(o.element_order)) {
      item.element_order = o.element_order
        .map((v) => asStr(v, 200))
        .filter(Boolean)
        .slice(0, 20)
    }

    out.push(item)
  }
  return out
}

/**
 * Optional AVA pre-fill for naming targeting/geo tokens.
 * Always re-slugifies + validateValue + length-clamp; failures fall back to clamped slugify(raw).
 */
export async function POST(request: NextRequest) {
  const gate = await requireRole(request, ["admin", "manager"])
  if ("response" in gate) return gate.response

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const items = asItems(
    body && typeof body === "object"
      ? (body as { items?: unknown }).items
      : undefined,
  )

  if (items.length === 0) {
    return NextResponse.json({
      overrides: {},
      appliedCount: 0,
      usedAva: false,
    })
  }

  try {
    const suggestions = await suggestAvaNamingTokens(items)
    const { overrides, appliedCount } = applyAvaSuggestions(items, suggestions)
    return NextResponse.json({
      overrides,
      appliedCount,
      usedAva: true,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json(
      {
        overrides: {},
        appliedCount: 0,
        usedAva: false,
        error: message,
      },
      { status: 502 },
    )
  }
}
