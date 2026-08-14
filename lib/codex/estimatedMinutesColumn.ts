import { sql, type SQL } from "drizzle-orm"

/**
 * `estimated_minutes` is AUTHOR-ONLY migration 0048 — not in the Drizzle
 * `tasks` table until the column exists on the live DB. Codex suites hit
 * that DB today; selecting/inserting the column 500s. Probe once per
 * process, then read/write via raw SQL when present.
 */
type ExecuteClient = {
  execute: (query: SQL) => Promise<unknown>
}

let columnPresent: boolean | undefined

export function resetEstimatedMinutesColumnCache(): void {
  columnPresent = undefined
}

export function executeRows(result: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(result)) return result as Array<Record<string, unknown>>
  if (
    result &&
    typeof result === "object" &&
    Array.isArray((result as { rows?: unknown }).rows)
  ) {
    return (result as { rows: Array<Record<string, unknown>> }).rows
  }
  return []
}

function isPresentFlag(value: unknown): boolean {
  return value === true || value === "t" || value === "true" || value === 1
}

export async function tasksHasEstimatedMinutesColumn(
  database: ExecuteClient
): Promise<boolean> {
  if (columnPresent !== undefined) return columnPresent
  const result = await database.execute(sql`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'tasks'
        AND column_name = 'estimated_minutes'
    ) AS present
  `)
  const present = executeRows(result)[0]?.present
  columnPresent = isPresentFlag(present)
  return columnPresent
}

export async function estimatedMinutesByTaskId(
  database: ExecuteClient,
  ids: number[]
): Promise<Map<number, number | null>> {
  const map = new Map<number, number | null>()
  if (ids.length === 0) return map
  if (!(await tasksHasEstimatedMinutesColumn(database))) return map
  const result = await database.execute(sql`
    SELECT id, estimated_minutes
    FROM tasks
    WHERE id IN (${sql.join(
      ids.map((id) => sql`${id}`),
      sql`, `
    )})
  `)
  for (const row of executeRows(result)) {
    const id = Number(row.id)
    if (!Number.isFinite(id) || id <= 0) continue
    const raw = row.estimated_minutes
    if (raw == null || raw === "") {
      map.set(id, null)
      continue
    }
    const n = Number(raw)
    map.set(id, Number.isFinite(n) ? n : null)
  }
  return map
}

export async function applyEstimatedMinutes<T extends { id: number | string }>(
  database: ExecuteClient,
  tasks: T[]
): Promise<Array<T & { estimated_minutes: number | null }>> {
  if (tasks.length === 0) return tasks.map((t) => ({ ...t, estimated_minutes: null }))
  const map = await estimatedMinutesByTaskId(
    database,
    tasks.map((t) => Number(t.id)).filter((id) => Number.isFinite(id) && id > 0)
  )
  return tasks.map((t) => ({
    ...t,
    estimated_minutes: map.has(Number(t.id))
      ? (map.get(Number(t.id)) ?? null)
      : null,
  }))
}

export async function writeTaskEstimatedMinutes(
  database: ExecuteClient,
  taskId: number,
  minutes: number | null
): Promise<boolean> {
  if (!(await tasksHasEstimatedMinutesColumn(database))) return false
  await database.execute(sql`
    UPDATE public.tasks
    SET estimated_minutes = ${minutes},
        updated_at = now()
    WHERE id = ${taskId}
  `)
  return true
}

export async function sumOpenEstimatedMinutesByAssignee(
  database: ExecuteClient
): Promise<Map<string, number>> {
  const map = new Map<string, number>()
  if (!(await tasksHasEstimatedMinutesColumn(database))) return map
  const result = await database.execute(sql`
    SELECT lower(assignee_email) AS email,
           coalesce(sum(estimated_minutes), 0)::int AS minutes
    FROM tasks
    WHERE deleted_at IS NULL
      AND status <> 'done'
      AND assignee_email IS NOT NULL
    GROUP BY lower(assignee_email)
  `)
  for (const row of executeRows(result)) {
    const email = String(row.email ?? "").trim().toLowerCase()
    if (!email) continue
    map.set(email, Number(row.minutes ?? 0) || 0)
  }
  return map
}
