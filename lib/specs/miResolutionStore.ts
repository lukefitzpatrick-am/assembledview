import { and, eq } from "drizzle-orm"

import type { MiAnswer } from "@/lib/specs/resolve"

import {
  mergeMiResolution,
  parseMiResolution,
  type StoredMiResolution,
} from "./miResolution"

async function postgres() {
  const { getDb, schema } = await import("@/db")
  return { db: getDb(), schema }
}

export async function loadMiResolutionForVersion(
  mbaNumber: string,
  versionNumber: number,
): Promise<StoredMiResolution | null> {
  try {
    const { db, schema } = await postgres()
    const rows = await db
      .select({ miResolution: schema.mediaPlanVersions.miResolution })
      .from(schema.mediaPlanVersions)
      .where(
        and(
          eq(schema.mediaPlanVersions.mbaNumber, mbaNumber),
          eq(schema.mediaPlanVersions.versionNumber, versionNumber),
        ),
      )
      .limit(1)
    return parseMiResolution(rows[0]?.miResolution)
  } catch (error) {
    console.error("mi_resolution load failed", error)
    return null
  }
}

export async function persistMiResolutionForVersion(input: {
  mbaNumber: string
  versionNumber: number
  incoming: MiAnswer[]
  updatedBy: string
  updatedAt?: string
}): Promise<StoredMiResolution | null> {
  try {
    const existing = await loadMiResolutionForVersion(
      input.mbaNumber,
      input.versionNumber,
    )
    const merged = mergeMiResolution(
      existing,
      input.incoming,
      input.updatedBy,
      input.updatedAt ?? new Date().toISOString(),
    )
    const { db, schema } = await postgres()
    await db
      .update(schema.mediaPlanVersions)
      .set({ miResolution: merged })
      .where(
        and(
          eq(schema.mediaPlanVersions.mbaNumber, input.mbaNumber),
          eq(schema.mediaPlanVersions.versionNumber, input.versionNumber),
        ),
      )
    return merged
  } catch (error) {
    console.error("mi_resolution persist failed", error)
    return null
  }
}

/** Load stored answers, merge incoming, persist when scoped + incoming present. */
export async function mergeAnswersForVersion(input: {
  mbaNumber: string
  versionNumber: number | undefined
  incoming: MiAnswer[]
  updatedBy: string
}): Promise<MiAnswer[]> {
  if (input.versionNumber == null) return input.incoming
  const stored = await loadMiResolutionForVersion(input.mbaNumber, input.versionNumber)
  const merged = mergeMiResolution(
    stored,
    input.incoming,
    input.updatedBy,
    new Date().toISOString(),
  )
  if (input.incoming.length > 0) {
    await persistMiResolutionForVersion({
      mbaNumber: input.mbaNumber,
      versionNumber: input.versionNumber,
      incoming: input.incoming,
      updatedBy: input.updatedBy,
    })
  }
  return merged.answers
}
