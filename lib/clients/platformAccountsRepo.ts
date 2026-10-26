import "server-only"

import { and, eq, sql } from "drizzle-orm"

import { getDb } from "@/db"
import { clientPlatformAccounts, clients } from "@/db/schema"
import type { PlatformAccountPlatform } from "@/lib/clients/platformAccounts"

export type PlatformAccountRecord = {
  id: number
  clientId: number
  platform: string
  accountRef: string
  label: string | null
  active: boolean
  createdAt: string
  updatedAt: string | null
}

export class PlatformAccountsNotReadyError extends Error {
  readonly code = "PLATFORM_ACCOUNTS_NOT_READY"
  constructor() {
    super("client_platform_accounts does not exist")
    this.name = "PlatformAccountsNotReadyError"
  }
}

/** The platform check constraint does not allow this platform yet (its SQL is not applied). */
export class PlatformAccountPlatformNotReadyError extends Error {
  readonly code = "PLATFORM_ACCOUNT_PLATFORM_NOT_READY"
  constructor(readonly platform: string) {
    super(`Platform ${platform} needs a database update first`)
    this.name = "PlatformAccountPlatformNotReadyError"
  }
}

export class PlatformAccountConflictError extends Error {
  readonly code = "PLATFORM_ACCOUNT_CONFLICT"
  constructor(readonly clientName: string) {
    super(`Already linked to ${clientName}`)
    this.name = "PlatformAccountConflictError"
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

function isMissingTable(err: unknown): boolean {
  const blob = errorBlob(err)
  return blob.includes("42P01") || /client_platform_accounts/i.test(blob) && /does not exist/i.test(blob)
}

function isPlatformCheckViolation(err: unknown): boolean {
  const blob = errorBlob(err)
  return blob.includes("client_platform_accounts_platform_chk") || (blob.includes("23514") && /platform/i.test(blob))
}

function isUniqueViolation(err: unknown): boolean {
  const blob = errorBlob(err)
  return blob.includes("23505") || /duplicate key|unique constraint/i.test(blob)
}

async function guard<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    if (
      err instanceof PlatformAccountsNotReadyError ||
      err instanceof PlatformAccountConflictError ||
      err instanceof PlatformAccountPlatformNotReadyError
    ) {
      throw err
    }
    if (isMissingTable(err)) throw new PlatformAccountsNotReadyError()
    throw err
  }
}

function toRecord(row: typeof clientPlatformAccounts.$inferSelect): PlatformAccountRecord {
  return {
    id: row.id,
    clientId: row.clientId,
    platform: row.platform,
    accountRef: row.accountRef,
    label: row.label,
    active: row.active,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export async function listActivePlatformAccounts(clientId: number): Promise<PlatformAccountRecord[]> {
  return guard(async () => {
    const db = getDb()
    const rows = await db
      .select()
      .from(clientPlatformAccounts)
      .where(and(eq(clientPlatformAccounts.clientId, clientId), eq(clientPlatformAccounts.active, true)))
      .orderBy(clientPlatformAccounts.platform, clientPlatformAccounts.accountRef)
    return rows.map(toRecord)
  })
}

async function conflictClientName(platform: string, accountRef: string): Promise<string> {
  const db = getDb()
  const [hit] = await db
    .select({ name: clients.mpClientName })
    .from(clientPlatformAccounts)
    .innerJoin(clients, eq(clients.id, clientPlatformAccounts.clientId))
    .where(
      and(
        eq(clientPlatformAccounts.platform, platform),
        sql`lower(${clientPlatformAccounts.accountRef}) = lower(${accountRef})`,
        eq(clientPlatformAccounts.active, true),
      ),
    )
    .limit(1)
  const name = hit?.name?.trim()
  return name || "another client"
}

export async function insertPlatformAccount(input: {
  clientId: number
  platform: PlatformAccountPlatform
  accountRef: string
  label: string | null
  createdBy: string | null
}): Promise<PlatformAccountRecord> {
  return guard(async () => {
    const db = getDb()
    try {
      const [row] = await db
        .insert(clientPlatformAccounts)
        .values({
          clientId: input.clientId,
          platform: input.platform,
          accountRef: input.accountRef,
          label: input.label,
          createdBy: input.createdBy,
        })
        .returning()
      if (!row) throw new Error("Insert returned no row")
      return toRecord(row)
    } catch (err) {
      if (isMissingTable(err)) throw new PlatformAccountsNotReadyError()
      if (isPlatformCheckViolation(err)) throw new PlatformAccountPlatformNotReadyError(input.platform)
      if (isUniqueViolation(err)) {
        throw new PlatformAccountConflictError(await conflictClientName(input.platform, input.accountRef))
      }
      throw err
    }
  })
}

export async function patchPlatformAccount(input: {
  clientId: number
  id: number
  active?: false
  label?: string | null
}): Promise<PlatformAccountRecord | null> {
  return guard(async () => {
    const db = getDb()
    const patch: { active?: boolean; label?: string | null; updatedAt: string } = {
      updatedAt: new Date().toISOString(),
    }
    if (input.active === false) patch.active = false
    if (input.label !== undefined) patch.label = input.label
    const [row] = await db
      .update(clientPlatformAccounts)
      .set(patch)
      .where(
        and(
          eq(clientPlatformAccounts.id, input.id),
          eq(clientPlatformAccounts.clientId, input.clientId),
          eq(clientPlatformAccounts.active, true),
        ),
      )
      .returning()
    return row ? toRecord(row) : null
  })
}
