/**
 * S5b (C-388) and S5c (switch `client_alias_on_relabel`): on relabel apply the planner
 * can save the entity's supplier campaign name as a naming alias of the
 * target plan's client (`clients.client_name_aliases`). Fireflies and the
 * relabel Match tab read the same aliases (`parseClientNameAliases`).
 *
 * The campaign name comes from the warehouse, never from the request. The
 * rule (`clientAliasRefusal`, another client's Fireflies phrase) and the
 * warehouse check (delivery on another client's plan) run at preview and at
 * apply before any write; the write itself checks again, under a lock, that no
 * client holds the name in any spelling yet.
 */
import "server-only"

import { sql } from "drizzle-orm"

import { getDb, type Db } from "@/db"
import { clientAliasRefusal, parseClientNameAliases } from "@/lib/clients/clientNameAliases"
import { rowsOf } from "@/lib/xero/dbRows"

import { buildTitleClientIndex } from "@/lib/fireflies/titleClients"
import { parseMbaNumberFromLineItemId } from "@/lib/mediaplan/lineItemIds"
import { labelMapJoinSql, labelMapOneCteSql, resolvedLineIdSql } from "@/lib/pacing/admin/unmappedPlacements"

import { resolveEntityCampaignName } from "./entity"
import { PACING_FACT, SEARCH_PACING_FACT, SOCIAL_PACING_FACT } from "./shared/types"
import type { ClientAliasOffer, RelabelPreview, RelabelQueryFn } from "./shared/types"

type Exec = Pick<Db, "execute">

/** Every title phrase Fireflies holds for clients outside this client and its MBA identifier group. */
async function otherClientPhrases(db: Exec, clientId: number, group: string): Promise<string[]> {
  const rows = rowsOf<{ id: number | string; name: string | null; mbaidentifier: string | null; aliases: unknown; anchor: boolean }>(
    await db.execute(sql`
      SELECT id, mp_client_name AS name, mbaidentifier, client_name_aliases AS aliases, m365_is_anchor AS anchor
      FROM clients WHERE id <> ${clientId}
    `),
  )
  const others = rows.filter((r) => !group || (r.mbaidentifier ?? "").trim().toLowerCase() !== group)
  return buildTitleClientIndex(
    others.map((r) => ({
      clientId: Number(r.id),
      displayName: (r.name ?? "").trim() || `Client ${r.id}`,
      mbaidentifier: r.mbaidentifier,
      aliases: parseClientNameAliases(r.aliases),
      isAnchor: Boolean(r.anchor),
    })),
  ).flatMap((entry) => entry.phrases)
}

/** Campaign names compared with case, spaces and punctuation gone. */
const compactName = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, "")

const DELIVERY_WINDOW_DAYS = 30

/** S5c: the preview-time delivery check stops here; a late read is a failed read (refused). */
const DELIVERY_CHECK_DEADLINE_MS = 10_000

function campaignDeliverySelect(table: string): string {
  return `
      SELECT DISTINCT LOWER(${resolvedLineIdSql("f", "m")}) AS RID
      FROM ${table} f
      ${labelMapJoinSql("f", "m")}
      WHERE CAST(f.DATE_DAY AS DATE) >= DATEADD(day, -${DELIVERY_WINDOW_DAYS}, CURRENT_DATE())
        AND REGEXP_REPLACE(LOWER(CAST(f.CAMPAIGN_NAME AS VARCHAR)), '[^a-z0-9]', '') = ?`
}

/**
 * An MBA of another client (or of no client) with delivery under this
 * campaign name in the last 30 days, or null. The Match tab joins a client's
 * delivery on campaign name, so such an alias would pull that plan's delivery
 * in. Throws when the warehouse read fails: the caller refuses (fail closed).
 */
async function otherClientDeliveryMba(campaignName: string, clientId: number, query: RelabelQueryFn, db: Exec): Promise<string | null> {
  const key = compactName(campaignName)
  const rows = await query(
    `WITH ${labelMapOneCteSql()}
    ${[PACING_FACT, SOCIAL_PACING_FACT, SEARCH_PACING_FACT].map(campaignDeliverySelect).join("\n      UNION\n")}`,
    [key, key, key],
  )
  const mbas = [
    ...new Set(rows.map((r) => parseMbaNumberFromLineItemId(String(r.RID ?? ""))?.toLowerCase()).filter((m): m is string => Boolean(m))),
  ]
  if (mbas.length === 0) return null
  const [other] = rowsOf<{ mba: string }>(
    await db.execute(sql`
      SELECT lower(m.mba_number) AS mba FROM media_plan_masters m
      WHERE lower(m.mba_number) IN (SELECT jsonb_array_elements_text(${JSON.stringify(mbas)}::jsonb))
        AND m.client_id IS DISTINCT FROM ${clientId}
      ORDER BY 1 LIMIT 1
    `),
  )
  return other?.mba ?? null
}

/**
 * The offer for a preview's entity and its target plan's client. The name
 * rule runs first; only a name it passes costs the warehouse read for other
 * clients' delivery. A failed read throws, and the handlers turn that into a
 * refused offer, so a name nobody could check is never saved. So does a read
 * past `deliveryDeadlineMs`.
 */
export async function loadClientAliasOffer(
  preview: Pick<RelabelPreview, "channel" | "platformEntityId" | "mbaNumber">,
  query: RelabelQueryFn,
  db: Exec = getDb(),
  deliveryDeadlineMs = DELIVERY_CHECK_DEADLINE_MS,
): Promise<ClientAliasOffer> {
  const campaignName = await resolveEntityCampaignName(preview, query)
  const [client] = preview.mbaNumber
    ? rowsOf<{ id: number | string; name: string | null; aliases: unknown; mbaidentifier: string | null }>(
        await db.execute(sql`
          SELECT c.id, c.mp_client_name AS name, c.client_name_aliases AS aliases, c.mbaidentifier
          FROM media_plan_masters m JOIN clients c ON c.id = m.client_id
          WHERE lower(m.mba_number) = lower(${preview.mbaNumber})
          LIMIT 1
        `),
      )
    : []
  if (!client) {
    return { campaignName, clientId: null, clientName: null, refusal: "The target line's plan has no client." }
  }
  const clientId = Number(client.id)
  const phrases = await otherClientPhrases(db, clientId, (client.mbaidentifier ?? "").trim().toLowerCase())
  let refusal = clientAliasRefusal(campaignName, parseClientNameAliases(client.aliases), phrases)
  if (!refusal) {
    let timer: ReturnType<typeof setTimeout> | undefined
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`client alias delivery check passed ${deliveryDeadlineMs} ms`)), deliveryDeadlineMs)
    })
    const mba = await Promise.race([otherClientDeliveryMba(campaignName, clientId, query, db), deadline]).finally(() => clearTimeout(timer))
    if (mba) refusal = `"${campaignName.trim()}" has delivery on ${mba}, another client's plan, in the last ${DELIVERY_WINDOW_DAYS} days.`
  }
  return { campaignName, clientId, clientName: client.name, refusal }
}

/**
 * Appends `alias` to the client's aliases. False when it is already this
 * client's or another client's alias by now (nothing written). One writer at
 * a time (advisory lock), so two clients never take the same alias.
 */
export async function saveClientAlias(clientId: number, alias: string, db: Pick<Db, "transaction"> = getDb()): Promise<boolean> {
  const name = alias.trim()
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('client_name_aliases'))`)
    const rows = rowsOf<{ id: number }>(
      await tx.execute(sql`
        UPDATE clients c
        SET client_name_aliases =
          (CASE WHEN jsonb_typeof(c.client_name_aliases) = 'array' THEN c.client_name_aliases ELSE '[]'::jsonb END)
          || jsonb_build_array(${name}::text)
        WHERE c.id = ${clientId}
          AND NOT EXISTS (
            SELECT 1 FROM clients o, jsonb_array_elements_text(
              CASE WHEN jsonb_typeof(o.client_name_aliases) = 'array' THEN o.client_name_aliases ELSE '[]'::jsonb END
            ) AS a
            WHERE regexp_replace(lower(a), '[^a-z0-9]', '', 'g') = ${compactName(name)}
          )
        RETURNING c.id
      `),
    )
    return rows.length > 0
  })
}
