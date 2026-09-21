import { and, isNull, like, ne } from "drizzle-orm"

import { getDb, schema } from "@/db"
import { updateTask } from "@/lib/codex/repo"
import { getAsOfDate } from "@/lib/pacing/maths"
import { shouldAutoCloseAppliedTask } from "./notify"

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
  const asOfYmd = getAsOfDate(now)
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
        await updateTask(id, { status: "done" }, "system")
      },
    )
  } catch (err) {
    console.error("[relabel] auto-close failed", err)
    return 0
  }
}
