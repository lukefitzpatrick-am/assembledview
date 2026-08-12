/**
 * Provisioning audit rows — injectable so unit tests never touch Postgres.
 */

export type M365ProvisioningLogRow = {
  entityType: string
  entityId: string | null
  action: string
  requestId: string | null
  actor: string | null
  outcome: "success" | "failure" | "skipped"
  error: string | null
}

export type ProvisioningLogWriter = (
  row: M365ProvisioningLogRow
) => Promise<void>

/** In-memory log for tests / local dry-runs. */
export function createMemoryProvisioningLogWriter(sink: M365ProvisioningLogRow[] = []) {
  const write: ProvisioningLogWriter = async (row) => {
    sink.push({ ...row })
  }
  return { write, sink }
}
