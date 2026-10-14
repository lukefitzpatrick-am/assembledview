import "server-only"

import { and, eq, isNotNull, sql } from "drizzle-orm"

import { db } from "@/db"
import { lineItems, mediaPlanMasters, mediaPlanVersions } from "@/db/schema/planCore"
import { deliveryLineItemDisplayName } from "@/lib/delivery/lineItemDisplayName"

import type { PlanLineHint } from "./metrics"

const SIZE_KEYS = ["size", "creative_size", "dimensions", "aspect_ratio", "format"] as const

export function sizeFromAttrs(attrs: unknown): string | null {
  if (!attrs || typeof attrs !== "object" || Array.isArray(attrs)) return null
  const rec = attrs as Record<string, unknown>
  for (const key of SIZE_KEYS) {
    const value = rec[key]
    if (typeof value === "string" && value.trim()) return value.trim()
  }
  return null
}

/**
 * Labels from the published cut only (`published_version_id` and `published_at`).
 * A plan-read failure leaves labels empty so the warehouse rows still return.
 */
export async function loadPublishedLineLabels(
  mbaNumber: string,
): Promise<Map<string, PlanLineHint>> {
  try {
    const rows = await db
      .select({
        lineItemId: lineItems.lineItemId,
        platform: lineItems.platform,
        publisher: lineItems.publisher,
        attrs: lineItems.attrs,
      })
      .from(mediaPlanMasters)
      .innerJoin(
        mediaPlanVersions,
        and(
          eq(mediaPlanVersions.id, mediaPlanMasters.publishedVersionId),
          eq(mediaPlanVersions.masterId, mediaPlanMasters.id),
          isNotNull(mediaPlanVersions.publishedAt),
        ),
      )
      .innerJoin(lineItems, eq(lineItems.versionId, mediaPlanVersions.id))
      .where(sql`lower(${mediaPlanMasters.mbaNumber}) = lower(${mbaNumber})`)

    const labels = new Map<string, PlanLineHint>()
    for (const row of rows) {
      const key = row.lineItemId.trim().toLowerCase()
      if (!key || labels.has(key)) continue
      const { label } = deliveryLineItemDisplayName({
        platform: row.platform,
        publisher: row.publisher,
        attrs: row.attrs,
        line_item_id: row.lineItemId,
      })
      labels.set(key, { label, size: sizeFromAttrs(row.attrs) })
    }
    return labels
  } catch (err) {
    console.warn("[creative-performance] plan line labels unavailable", err)
    return new Map()
  }
}
