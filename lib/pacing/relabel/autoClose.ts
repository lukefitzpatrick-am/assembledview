import "server-only"

import { and, isNull, like, ne } from "drizzle-orm"

import { getDb, schema } from "@/db"
import { updateTaskFollowingSections } from "@/lib/codex/repo"
import { SYSTEM_ACTORS } from "@/lib/codex/systemActors"
import { shouldAutoCloseAppliedTask } from "./notify"
import { getMelbourneTodayISO } from "@/lib/dates/melbourne"

export type RelabelAutoCloseCandidate = {
  id: number
  avaAutoKey: string | null
  status: string | null
  createdAt: string | null
  updatedAt: string | null
}

export async function closeUntouchedRelabelTasks(
  candidates: RelabelAutoCloseCandidate[],
  asOfYmd: string,
  closeTask: (id: number) => Promise<void>,
): Promise<number> {
  let closed = 0
  for (const row of candidates) {
    if (!shouldAutoCloseAppliedTask(row, asOfYmd)) continue
    await closeTask(row.id)
    closed += 1
  }
  return closed
}

/** Digest-cron closer: applied relabel tasks untouched for 7 Melbourne days. */
export async function runCloseUntouchedRelabelTasks(now: Date = new Date()): Promise<number> {
  const asOfYmd = getMelbourneTodayISO(now)
  try {
    const db = getDb()
    const rows = await db
      .select({
        id: schema.tasks.id,
        avaAutoKey: schema.tasks.avaAutoKey,
        status: schema.tasks.status,
        createdAt: schema.tasks.createdAt,
        updatedAt: schema.tasks.updatedAt,
      })
      .from(schema.tasks)
      .where(
        and(
          like(schema.tasks.avaAutoKey, "relabel:applied:%"),
          ne(schema.tasks.status, "done"),
          isNull(schema.tasks.deletedAt),
        ),
      )
    return closeUntouchedRelabelTasks(
      rows.map((row) => ({
        id: Number(row.id),
        avaAutoKey: row.avaAutoKey,
        status: row.status,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      })),
      asOfYmd,
      async (id) => {
        // C-220 (B42): a project task goes to its first done section.
        // C-264 (B43): recorded as the relabel auto-close, kind system, not a person called "system".
        await updateTaskFollowingSections(id, { status: "done" }, SYSTEM_ACTORS.relabel)
      },
    )
  } catch (err) {
    console.error("[relabel] auto-close failed", err)
    return 0
  }
}
