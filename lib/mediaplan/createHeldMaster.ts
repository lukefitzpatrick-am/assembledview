/**
 * Create page: once the first Save has created the media plan master, the
 * plan's MBA number and client are fixed. `/api/plans/save` refuses a body
 * whose MBA number does not match the master (422 `MASTER_ID_MISMATCH`), so
 * the page must not mint a new MBA number while it holds a master (B6 notes,
 * F1). The held master is never cleared here: that would orphan it.
 */
import { mbaNumberMatchesClientIdentifier } from "@/lib/auth/mbaNumberMatchesClientIdentifier"
import { shouldApplyMbaNumberResponse } from "@/lib/mediaplan/mbaNumberRequestGate"

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

/**
 * Whether an MBA number response (or failure) may touch the form. Only the
 * latest request applies, and never once a master is held: a response still
 * in flight when the first Save created the master must not mint a new
 * number or blank the held one (B6 review, C-165 gap).
 */
export function mayApplyMbaNumberResponse(args: {
  requestToken: number
  currentToken: number
  masterHeld: boolean
}): boolean {
  return !args.masterHeld && shouldApplyMbaNumberResponse(args.requestToken, args.currentToken)
}

/** Save refusal while a new client's MBA number request is in flight (B7 review, finding 1). */
export const MBA_NUMBER_LOADING_MESSAGE = "The MBA number is still loading. Try again in a moment."

/**
 * B8 review finding 2: the create page gives up on the MBA number request
 * after this long. The abort fails the request like any other error, so the
 * in-flight flag clears and the next Save fetches the number again.
 */
export const MBA_NUMBER_FETCH_TIMEOUT_MS = 15_000

/**
 * B8 review finding 1: the "MBA number taken" retry number didn't belong to
 * the client, so the page fetches a fresh number instead of saving under it.
 */
export const MBA_NUMBER_TAKEN_REFETCH_MESSAGE =
  "That MBA number was taken by another plan. Getting a new one now; try again in a moment."

export type MbaNumberClientProblem = {
  message: string
  /** True when fetching the client's number again fixes it. */
  refetch: boolean
}

/**
 * Before a new master is created: the MBA number must be the selected client's
 * MBA identifier followed by digits only (trimmed, case-insensitive). This is
 * the auth matcher `mbaNumberMatchesClientIdentifier` (`^id\d+$`), not a bare
 * prefix check, so `test123001` is refused for identifier `test1` (B8 review
 * finding 3). `allocateNextMbaNumber` always builds `<identifier
 * lowercased><digits>`, so a mismatch means the number belongs to another
 * client (picked before the new one's number came back) or is missing. Null
 * when the pair is fine.
 */
export function mbaNumberClientProblem(mbaNumber: unknown, mbaIdentifier: unknown): MbaNumberClientProblem | null {
  const id = String(mbaIdentifier ?? "").trim()
  const num = String(mbaNumber ?? "").trim()
  if (!id) {
    return {
      message: "This client has no MBA identifier, so the plan can't get an MBA number. Add one on the client, then reload this page.",
      refetch: false,
    }
  }
  if (!num) return { message: "The plan has no MBA number yet. Getting it now; try again in a moment.", refetch: true }
  if (!mbaNumberMatchesClientIdentifier(num, id)) {
    return {
      message: `MBA number ${num} doesn't belong to this client (identifier ${id}). Getting the right number now; try again in a moment.`,
      refetch: true,
    }
  }
  return null
}
