/**
 * FP-6 store for client_finance_owners (migration 0105). Server only.
 * While 0105 is not applied every call reports not-ready instead of failing
 * the page (C-76: no SELECT may crash against a missing table).
 */

import "server-only"

import { asc, eq, sql } from "drizzle-orm"

import { getDb } from "@/db"
import { clientFinanceOwners, teamMembers } from "@/db/schema"
import {
  FINANCE_OWNERS_NOT_READY_MESSAGE,
  mergeFinanceOwnerRows,
  type FinanceOwnerCandidate,
  type FinanceOwnersPayload,
  type FinanceOwnerUpdate,
} from "@/lib/finance/financeOwners"
import { rowsOf } from "@/lib/xero/dbRows"

export class FinanceOwnersNotReadyError extends Error {
  readonly code = "FINANCE_OWNERS_NOT_READY"
  constructor() {
    super("client_finance_owners does not exist")
    this.name = "FinanceOwnersNotReadyError"
  }
}

function errorBlob(err: unknown): string {
  const parts: string[] = []
  let current: unknown = err
  for (let depth = 0; depth < 4 && current; depth++) {
    if (typeof current === "object" && current) {
      const row = current as { code?: unknown; message?: unknown; cause?: unknown }
      if (row.code != null) parts.push(String(row.code))
      if (row.message != null) parts.push(String(row.message))
      current = row.cause
    } else {
      parts.push(String(current))
      current = null
    }
  }
  return parts.join(" ")
}

export function isMissingFinanceOwnersTable(err: unknown): boolean {
  const blob = errorBlob(err)
  return blob.includes("42P01") || (/client_finance_owners/i.test(blob) && /does not exist/i.test(blob))
}

async function guard<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    if (err instanceof FinanceOwnersNotReadyError) throw err
    if (isMissingFinanceOwnersTable(err)) throw new FinanceOwnersNotReadyError()
    throw err
  }
}

type OwnerSql = {
  client_id: number | string
  team_member_id: number | string | null
  owner_name: string | null
  updated_at: string | null
  updated_by_name: string | null
}

type ClientSql = { id: number | string; name: string | null }

function intOrNull(value: unknown): number | null {
  const n = Number(value)
  return value != null && Number.isFinite(n) && n > 0 ? Math.trunc(n) : null
}

async function readCandidates(): Promise<FinanceOwnerCandidate[]> {
  const db = getDb()
  const rows = await db
    .select({ id: teamMembers.id, name: teamMembers.name, email: teamMembers.email })
    .from(teamMembers)
    .where(eq(teamMembers.active, true))
    .orderBy(asc(teamMembers.name))
  return rows.map((r) => ({ id: r.id, name: r.name, email: r.email }))
}

export async function readFinanceOwners(): Promise<FinanceOwnersPayload> {
  try {
    return await guard(async () => {
      const db = getDb()
      const [ownerResult, clientResult, candidates] = await Promise.all([
        db.execute(sql`
          SELECT o.client_id, o.team_member_id, t.name AS owner_name,
                 o.updated_at::text AS updated_at, o.updated_by_name
          FROM client_finance_owners o
          LEFT JOIN team_members t ON t.id = o.team_member_id
        `),
        db.execute(sql`
          SELECT c.id, c.mp_client_name AS name
          FROM clients c
          WHERE c.id IS NOT NULL
        `),
        readCandidates(),
      ])
      const owners = rowsOf<OwnerSql>(ownerResult).flatMap((row) => {
        const clientId = intOrNull(row.client_id)
        if (clientId == null) return []
        return [
          {
            clientId,
            teamMemberId: intOrNull(row.team_member_id),
            ownerName: row.owner_name,
            updatedAt: row.updated_at,
            updatedByName: row.updated_by_name,
          },
        ]
      })
      const clientRows = rowsOf<ClientSql>(clientResult).flatMap((row) => {
        const id = intOrNull(row.id)
        return id == null ? [] : [{ id, name: String(row.name ?? "") }]
      })
      return {
        ready: true as const,
        rows: mergeFinanceOwnerRows({ clients: clientRows, owners }),
        candidates,
      }
    })
  } catch (err) {
    if (err instanceof FinanceOwnersNotReadyError) {
      return {
        ready: false,
        reason: "migration_not_applied",
        message: FINANCE_OWNERS_NOT_READY_MESSAGE,
        rows: [],
        candidates: [],
      }
    }
    throw err
  }
}

export type SaveFinanceOwnerResult =
  | { ok: true }
  | { ok: false; status: 404 | 409; error: "client_not_found" | "team_member_not_found" | "not_ready"; message: string }

/** Set or clear one client's owner. Null team member deletes the row. */
export async function saveFinanceOwner(
  update: FinanceOwnerUpdate,
  actor: { id: number | null; name: string | null },
): Promise<SaveFinanceOwnerResult> {
  try {
    return await guard(async () => {
      const db = getDb()
      const clientHit = rowsOf<{ id: number }>(
        await db.execute(sql`SELECT id FROM clients WHERE id = ${update.clientId} LIMIT 1`),
      )
      if (clientHit.length === 0) {
        return { ok: false as const, status: 404 as const, error: "client_not_found" as const, message: "No client with that id." }
      }
      if (update.teamMemberId == null) {
        await db.delete(clientFinanceOwners).where(eq(clientFinanceOwners.clientId, update.clientId))
        return { ok: true as const }
      }
      const member = await db
        .select({ id: teamMembers.id, active: teamMembers.active })
        .from(teamMembers)
        .where(eq(teamMembers.id, update.teamMemberId))
        .limit(1)
      if (member.length === 0 || member[0]!.active !== true) {
        return {
          ok: false as const,
          status: 404 as const,
          error: "team_member_not_found" as const,
          message: "No active team member with that id.",
        }
      }
      const now = new Date().toISOString()
      await db
        .insert(clientFinanceOwners)
        .values({
          clientId: update.clientId,
          teamMemberId: update.teamMemberId,
          updatedAt: now,
          updatedBy: actor.id,
          updatedByName: actor.name,
        })
        .onConflictDoUpdate({
          target: clientFinanceOwners.clientId,
          set: {
            teamMemberId: update.teamMemberId,
            updatedAt: now,
            updatedBy: actor.id,
            updatedByName: actor.name,
          },
        })
      return { ok: true as const }
    })
  } catch (err) {
    if (err instanceof FinanceOwnersNotReadyError) {
      return { ok: false, status: 409, error: "not_ready", message: FINANCE_OWNERS_NOT_READY_MESSAGE }
    }
    throw err
  }
}
