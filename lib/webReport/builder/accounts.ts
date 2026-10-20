import "server-only"

import { and, eq, inArray } from "drizzle-orm"

import { getDb } from "@/db"
import { clientPlatformAccounts, clients } from "@/db/schema"
import { normaliseAccountRef } from "@/lib/clients/platformAccounts"
import {
  PlatformAccountConflictError,
  insertPlatformAccount,
  patchPlatformAccount,
} from "@/lib/clients/platformAccountsRepo"
import { field, isMissingMartView, text } from "@/lib/webReport/rows"
import { querySnowflake } from "@/lib/snowflake/query"

export type WebAccountPlatform = "ga4" | "gsc"

export type WebAccountOption = {
  ref: string
  label: string
  /** Last day of data (Search Console only), YYYY-MM-DD. */
  lastDataDate: string | null
  /** Another client this account is already linked to, or null. */
  linkedTo: string | null
}

export type WebAccountOptions = {
  /** False until V_WEB_ACCOUNTS exists in Snowflake. */
  ready: boolean
  ga4: WebAccountOption[]
  gsc: WebAccountOption[]
}

const OPTIONS_SQL = `
SELECT platform, account_ref, label, last_data_date
FROM ASSEMBLEDVIEW.MART.V_WEB_ACCOUNTS
ORDER BY platform, label
`

export function optionsFromRows(
  rows: Record<string, unknown>[],
  linked: { platform: string; ref: string; clientId: number; clientName: string }[],
  clientId: number,
): Omit<WebAccountOptions, "ready"> {
  const elsewhere = new Map<string, string>()
  for (const row of linked) {
    if (row.clientId === clientId) continue
    elsewhere.set(`${row.platform}|${row.ref.toLowerCase()}`, row.clientName)
  }
  const out: Omit<WebAccountOptions, "ready"> = { ga4: [], gsc: [] }
  for (const row of rows) {
    const platform = text(field(row, "platform"))
    if (platform !== "ga4" && platform !== "gsc") continue
    const ref = text(field(row, "account_ref"))
    if (!ref) continue
    const rawDate = field(row, "last_data_date")
    out[platform].push({
      ref,
      label: text(field(row, "label")) || ref,
      lastDataDate: rawDate == null || rawDate === "" ? null : String(rawDate).slice(0, 10),
      linkedTo: elsewhere.get(`${platform}|${ref.toLowerCase()}`) ?? null,
    })
  }
  return out
}

export async function listWebAccountOptions(clientId: number): Promise<WebAccountOptions> {
  const db = getDb()
  const linked = await db
    .select({
      platform: clientPlatformAccounts.platform,
      ref: clientPlatformAccounts.accountRef,
      clientId: clientPlatformAccounts.clientId,
      clientName: clients.mpClientName,
    })
    .from(clientPlatformAccounts)
    .innerJoin(clients, eq(clients.id, clientPlatformAccounts.clientId))
    .where(and(eq(clientPlatformAccounts.active, true), inArray(clientPlatformAccounts.platform, ["ga4", "gsc"])))

  try {
    const rows = await querySnowflake<Record<string, unknown>>(OPTIONS_SQL, [], { label: "web_accounts_options" })
    return {
      ready: true,
      ...optionsFromRows(
        rows,
        linked.map((row) => ({ ...row, clientName: row.clientName?.trim() || "another client" })),
        clientId,
      ),
    }
  } catch (err) {
    if (isMissingMartView(err, "V_WEB_ACCOUNTS")) return { ready: false, ga4: [], gsc: [] }
    throw err
  }
}

export class WebAccountLinkError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = "WebAccountLinkError"
  }
}

/**
 * Point the client at one GA4 property or Search Console site (or none).
 * Inserts the new row first, so a conflict leaves the current link in place,
 * then deactivates the client's other active rows on that platform.
 */
export async function linkWebAccount(input: {
  clientId: number
  platform: WebAccountPlatform
  ref: string | null
  label: string | null
  actor: string | null
}): Promise<{ ref: string | null }> {
  const db = getDb()
  const current = await db
    .select({ id: clientPlatformAccounts.id, ref: clientPlatformAccounts.accountRef })
    .from(clientPlatformAccounts)
    .where(
      and(
        eq(clientPlatformAccounts.clientId, input.clientId),
        eq(clientPlatformAccounts.platform, input.platform),
        eq(clientPlatformAccounts.active, true),
      ),
    )

  let ref: string | null = null
  if (input.ref) {
    try {
      ref = normaliseAccountRef(input.platform, input.ref)
    } catch (err) {
      throw new WebAccountLinkError(err instanceof Error ? err.message : "Check the account", 400)
    }
  }

  const keep = ref ? current.find((row) => row.ref.toLowerCase() === ref!.toLowerCase()) : undefined
  if (ref && !keep) {
    try {
      await insertPlatformAccount({
        clientId: input.clientId,
        platform: input.platform,
        accountRef: ref,
        label: input.label?.trim() || null,
        createdBy: input.actor,
      })
    } catch (err) {
      if (err instanceof PlatformAccountConflictError) {
        throw new WebAccountLinkError(`Already linked to ${err.clientName}`, 409)
      }
      throw err
    }
  }
  for (const row of current) {
    if (keep && row.id === keep.id) continue
    await patchPlatformAccount({ clientId: input.clientId, id: row.id, active: false })
  }
  return { ref }
}
