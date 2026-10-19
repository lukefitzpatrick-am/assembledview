/**
 * Reads and writes billing_partner_packs. The table is selected the same way
 * as report_runs: Drizzle against the service connection, after marker
 * 0100_billing_partner_packs (C-76).
 */
import "server-only"

import { and, desc, eq, inArray } from "drizzle-orm"

import { getDb } from "@/db"
import {
  billingPartnerPackItems,
  billingPartnerPacks,
  migrationMarkers,
} from "@/db/schema"
import type { BillingPartnerPackRow } from "@/lib/finance/billingPartner/cycle"
import { BillingPartnerPackError } from "@/lib/finance/billingPartner/errors"

const PACK_MARKER = "0100_billing_partner_packs"

export type DraftPackItemWrite = {
  mbaNumber: string
  versionId: number
  versionNumber: number
  changeKind: "new" | "amended"
  monthsChanged: string[] | null
  backDated: boolean
}

export type DraftPackWrite = {
  billingMonth: string
  status: "draft"
  createdBy: string
  blobPathname: string
  items: DraftPackItemWrite[]
}

export type PackSentUpdate = {
  packId: string
  status: "sent"
  sentAt: string
  sentBy: string
}

type PackWriter = {
  markSent: (update: PackSentUpdate) => Promise<PackSentUpdate | null>
}

type Db = ReturnType<typeof getDb>

export async function listPacksForMonth(billingMonth: string): Promise<BillingPartnerPackRow[]> {
  const db = getDb()
  await requirePackMarker(db)
  const packs = await db
    .select({
      id: billingPartnerPacks.id,
      createdAt: billingPartnerPacks.createdAt,
      createdBy: billingPartnerPacks.createdBy,
      status: billingPartnerPacks.status,
      sentAt: billingPartnerPacks.sentAt,
      sentBy: billingPartnerPacks.sentBy,
    })
    .from(billingPartnerPacks)
    .where(eq(billingPartnerPacks.billingMonth, billingMonth))
    .orderBy(desc(billingPartnerPacks.createdAt))

  if (packs.length === 0) return []
  const items = await db
    .select({ packId: billingPartnerPackItems.packId })
    .from(billingPartnerPackItems)
    .where(
      inArray(
        billingPartnerPackItems.packId,
        packs.map((pack) => pack.id),
      ),
    )
  const counts = new Map<string, number>()
  for (const item of items) {
    counts.set(item.packId, (counts.get(item.packId) ?? 0) + 1)
  }

  return packs.map((pack) => ({
    id: pack.id,
    createdAt: pack.createdAt,
    createdBy: pack.createdBy,
    status: pack.status === "sent" ? "sent" : "draft",
    itemCount: counts.get(pack.id) ?? 0,
    sentAt: pack.sentAt,
    sentBy: pack.sentBy,
  }))
}

export async function insertDraftPack(row: DraftPackWrite): Promise<{ id: string }> {
  const db = getDb()
  await requirePackMarker(db)
  return db.transaction(async (tx) => {
    const [pack] = await tx
      .insert(billingPartnerPacks)
      .values({
        billingMonth: row.billingMonth,
        status: "draft",
        createdBy: row.createdBy,
        blobPathname: row.blobPathname,
      })
      .returning({ id: billingPartnerPacks.id })
    if (!pack) {
      throw new BillingPartnerPackError("Pack was not created", 500)
    }
    if (row.items.length > 0) {
      await tx.insert(billingPartnerPackItems).values(
        row.items.map((item) => ({
          packId: pack.id,
          mbaNumber: item.mbaNumber,
          versionId: item.versionId,
          versionNumber: item.versionNumber,
          changeKind: item.changeKind,
          monthsChanged: item.monthsChanged,
          backDated: item.backDated,
        })),
      )
    }
    return { id: pack.id }
  })
}

export async function markPackSent(
  input: { packId: string; sentBy: string; now?: Date },
  writer?: PackWriter,
): Promise<PackSentUpdate> {
  const update: PackSentUpdate = {
    packId: input.packId,
    status: "sent",
    sentAt: (input.now ?? new Date()).toISOString(),
    sentBy: input.sentBy,
  }
  const row = await (writer?.markSent ?? markSentInDb)(update)
  if (!row) {
    throw new BillingPartnerPackError("Pack was not found or is already sent", 409)
  }
  return row
}

export async function readPackDownload(packId: string): Promise<{ pathname: string } | null> {
  const db = getDb()
  await requirePackMarker(db)
  const [pack] = await db
    .select({ blobPathname: billingPartnerPacks.blobPathname })
    .from(billingPartnerPacks)
    .where(eq(billingPartnerPacks.id, packId))
    .limit(1)
  const pathname = pack?.blobPathname?.trim()
  if (!pathname) return null
  return { pathname }
}

async function markSentInDb(update: PackSentUpdate): Promise<PackSentUpdate | null> {
  const db = getDb()
  await requirePackMarker(db)
  const [row] = await db
    .update(billingPartnerPacks)
    .set({
      status: "sent",
      sentAt: update.sentAt,
      sentBy: update.sentBy,
    })
    .where(
      and(eq(billingPartnerPacks.id, update.packId), eq(billingPartnerPacks.status, "draft")),
    )
    .returning({
      id: billingPartnerPacks.id,
      sentAt: billingPartnerPacks.sentAt,
      sentBy: billingPartnerPacks.sentBy,
    })
  if (!row?.sentAt || !row.sentBy) return null
  return {
    packId: row.id,
    status: "sent",
    sentAt: row.sentAt,
    sentBy: row.sentBy,
  }
}

async function requirePackMarker(db: Db): Promise<void> {
  const [marker] = await db
    .select({ key: migrationMarkers.key })
    .from(migrationMarkers)
    .where(eq(migrationMarkers.key, PACK_MARKER))
    .limit(1)
  if (!marker) {
    throw new BillingPartnerPackError("Billing partner packs are not available yet", 503)
  }
}
