/**
 * Create page: once the first Save has created the media plan master, the
 * plan's MBA number and client are fixed. `/api/plans/save` refuses a body
 * whose MBA number does not match the master (422 `MASTER_ID_MISMATCH`), so
 * the page must not mint a new MBA number while it holds a master (B6 notes,
 * F1). The held master is never cleared here: that would orphan it.
 */

export const MASTER_ID_MISMATCH = "MASTER_ID_MISMATCH"

/** Shown under the client picker once the master exists. */
export const CREATE_CLIENT_LOCKED_NOTE = "To use a different client, start a new plan."

/** Save failure text for a 422 `MASTER_ID_MISMATCH`, per page. */
export function masterIdMismatchMessage(page: "create" | "edit"): string {
  return page === "create"
    ? `This plan was first saved under another MBA number, so it can't save under this one. ${CREATE_CLIENT_LOCKED_NOTE}`
    : "This plan's saved record belongs to another MBA number. Reload the plan and try again."
}

/** The MBA identity the master was created with. */
export type HeldMasterIdentity = {
  mbaNumber: string
  clientName: string
  mbaIdentifier: string
}

/**
 * Form values to re-apply after something replaced the form (a draft restore)
 * while a master is held. Null when nothing needs fixing.
 */
export function heldMasterIdentityFixes(
  held: HeldMasterIdentity | null,
  current: { mba_number?: unknown; mp_client_name?: unknown; mbaidentifier?: unknown },
): Partial<{ mba_number: string; mp_client_name: string; mbaidentifier: string }> | null {
  if (!held) return null
  const fixes: Partial<{ mba_number: string; mp_client_name: string; mbaidentifier: string }> = {}
  if (String(current.mba_number ?? "") !== held.mbaNumber) fixes.mba_number = held.mbaNumber
  if (String(current.mp_client_name ?? "") !== held.clientName) fixes.mp_client_name = held.clientName
  if (String(current.mbaidentifier ?? "") !== held.mbaIdentifier) fixes.mbaidentifier = held.mbaIdentifier
  return Object.keys(fixes).length > 0 ? fixes : null
}
