import * as schema from "@/db/schema"
import { coerceNumericStringsToNumbers, toApiRow } from "@/lib/data/toApiRow"

export type PacingOrphanFixInput = {
  adminUserEmail: string
  channel: string
  platformLineItemId: string
  previousLineItemId: string | null
  newLineItemId: string
  adGroupName: string | null
  campaignName: string | null
  note: string | null
}

export type PacingOrphanFixRow = PacingOrphanFixInput & {
  id: number
  created_at: string
}

type InsertChain = {
  values: (row: Record<string, unknown>) => {
    returning: () => Promise<Record<string, unknown>[]>
  }
}

export type PacingOrphanFixDb = {
  insert: (table: typeof schema.pacingOrphanFixes) => InsertChain
  select: () => {
    from: (table: typeof schema.pacingOrphanFixes) => Promise<Record<string, unknown>[]>
  }
}

function mapRow(row: Record<string, unknown>): Record<string, unknown> {
  return coerceNumericStringsToNumbers(toApiRow(row))
}

export async function insertPacingOrphanFix(
  db: PacingOrphanFixDb,
  input: PacingOrphanFixInput,
): Promise<PacingOrphanFixRow> {
  const inserted = await db
    .insert(schema.pacingOrphanFixes)
    .values({
      adminUserEmail: input.adminUserEmail,
      channel: input.channel,
      platformLineItemId: input.platformLineItemId,
      previousLineItemId: input.previousLineItemId,
      newLineItemId: input.newLineItemId,
      adGroupName: input.adGroupName,
      campaignName: input.campaignName,
      note: input.note,
    })
    .returning()
  const row = inserted[0]
  if (!row) throw new Error("pacing_orphan_fixes insert returned no row")
  const api = mapRow(row)
  return {
    id: Number(api.id),
    created_at: String(api.created_at ?? ""),
    adminUserEmail: String(api.admin_user_email ?? input.adminUserEmail),
    channel: String(api.channel ?? input.channel),
    platformLineItemId: String(api.platform_line_item_id ?? input.platformLineItemId),
    previousLineItemId:
      api.previous_line_item_id == null ? null : String(api.previous_line_item_id),
    newLineItemId: String(api.new_line_item_id ?? input.newLineItemId),
    adGroupName: api.ad_group_name == null ? null : String(api.ad_group_name),
    campaignName: api.campaign_name == null ? null : String(api.campaign_name),
    note: api.note == null ? null : String(api.note),
  }
}

export async function selectPacingOrphanFixes(
  db: PacingOrphanFixDb,
): Promise<Record<string, unknown>[]> {
  const rows = await db.select().from(schema.pacingOrphanFixes)
  return rows.map((row) => mapRow(row))
}
