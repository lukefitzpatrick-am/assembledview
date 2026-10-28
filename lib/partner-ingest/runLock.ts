/**
 * One partner ingest run at a time (DATA-7).
 *
 * Overlapping runs (a manual trigger during the 22:30 UTC cron, or a retry
 * while a timed-out run was still going) each passed the duplicate check before
 * either had logged, and loaded the Vistar 13 Oct file several times. The run
 * now holds a lock; a second run that cannot take it exits straight away and
 * loads nothing.
 *
 * The Postgres lock is `pg_try_advisory_xact_lock` inside one transaction that
 * stays open for the whole run. Transaction-scoped on purpose: the runtime
 * client uses the Supabase transaction pooler (port 6543), where a
 * session-level `pg_try_advisory_lock` could be taken on one backend and
 * released on another. A transaction keeps one backend for its life, and the
 * lock goes at COMMIT or ROLLBACK, or when the connection drops. No table and
 * no migration. The open transaction runs no statements while it waits, so
 * `statement_timeout` does not apply, and `idle_in_transaction_session_timeout`
 * is 0 for the app role (checked 28 Oct 2026).
 */

/** Lock key: `hashtextextended(PARTNER_INGEST_LOCK_NAME, 0)` (-8250635626713281788). */
export const PARTNER_INGEST_LOCK_NAME = "assembledview:partner-ingest"

export type PartnerIngestLockResult<T> =
  | { acquired: true; value: T }
  | { acquired: false }

export type PartnerIngestRunLock = {
  /** Runs `fn` only when no other run holds the lock. Never waits. */
  runExclusive<T>(fn: () => Promise<T>): Promise<PartnerIngestLockResult<T>>
}

/** The tagged-template query function inside a postgres.js transaction. */
export type AdvisoryLockTx = (
  strings: TemplateStringsArray,
  ...values: unknown[]
) => Promise<ReadonlyArray<Record<string, unknown>>>

/** The slice of a postgres.js client the lock needs. */
export type AdvisoryLockSql = {
  begin<T>(fn: (tx: AdvisoryLockTx) => Promise<T>): Promise<T>
}

export function createPostgresAdvisoryRunLock(
  sql: AdvisoryLockSql,
  lockName: string = PARTNER_INGEST_LOCK_NAME
): PartnerIngestRunLock {
  return {
    async runExclusive<T>(fn: () => Promise<T>): Promise<PartnerIngestLockResult<T>> {
      return sql.begin<PartnerIngestLockResult<T>>(async (tx) => {
        const rows = await tx`select pg_try_advisory_xact_lock(hashtextextended(${lockName}, 0)) as acquired`
        if (rows[0]?.acquired !== true) return { acquired: false }
        return { acquired: true, value: await fn() }
      })
    },
  }
}

/**
 * In-process lock, for tests and scripts with no database. Only stops overlap
 * inside one process, so production uses the Postgres lock.
 */
export function createInMemoryRunLock(): PartnerIngestRunLock & { held(): boolean } {
  let busy = false
  return {
    held: () => busy,
    async runExclusive<T>(fn: () => Promise<T>): Promise<PartnerIngestLockResult<T>> {
      if (busy) return { acquired: false }
      busy = true
      try {
        return { acquired: true, value: await fn() }
      } finally {
        busy = false
      }
    },
  }
}
