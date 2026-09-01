/**
 * Persist explicit material-deadline overrides (who / when / value).
 * Missing table (migration 0042 not applied) fail-softs to [].
 */

import { eq } from "drizzle-orm"

import { db, type Db } from "@/db"
import { specDeadlineOverrides } from "@/db/schema/specDeadlineOverrides"
import type { DeadlineOverride } from "./deriveMaterialDeadlines.js"

function isMissingRelation(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code
  return code === "42P01"
}

export async function loadDeadlineOverrides(
  mbaNumber: string,
  database: Db = db,
): Promise<DeadlineOverride[]> {
  const mba = mbaNumber.trim()
  if (!mba) return []
  try {
    const rows = await database
      .select({
        publisherKey: specDeadlineOverrides.publisherKey,
        derivedYmd: specDeadlineOverrides.derivedYmd,
        overrideYmd: specDeadlineOverrides.overrideYmd,
        overriddenBy: specDeadlineOverrides.overriddenBy,
        overriddenAt: specDeadlineOverrides.overriddenAt,
      })
      .from(specDeadlineOverrides)
      .where(eq(specDeadlineOverrides.mbaNumber, mba))
    return rows.map((row) => ({
      publisherKey: row.publisherKey,
      derivedYmd: row.derivedYmd,
      overrideYmd: row.overrideYmd,
      overriddenBy: row.overriddenBy,
      overriddenAt: row.overriddenAt,
    }))
  } catch (err) {
    if (isMissingRelation(err)) return []
    throw err
  }
}

export async function upsertDeadlineOverride(
  mbaNumber: string,
  override: DeadlineOverride,
  database: Db = db,
): Promise<void> {
  await database
    .insert(specDeadlineOverrides)
    .values({
      mbaNumber: mbaNumber.trim(),
      publisherKey: override.publisherKey,
      derivedYmd: override.derivedYmd,
      overrideYmd: override.overrideYmd,
      overriddenBy: override.overriddenBy,
      overriddenAt: override.overriddenAt,
    })
    .onConflictDoUpdate({
      target: [
        specDeadlineOverrides.mbaNumber,
        specDeadlineOverrides.publisherKey,
      ],
      set: {
        derivedYmd: override.derivedYmd,
        overrideYmd: override.overrideYmd,
        overriddenBy: override.overriddenBy,
        overriddenAt: override.overriddenAt,
      },
    })
}
