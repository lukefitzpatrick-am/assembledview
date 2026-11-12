/**
 * Task assignee and helper writes resolve people by alias (F16, B36),
 * behind `codex_roster_aliases`. Off: the address passes through exactly as
 * before and the roster is not read.
 */
import "server-only"

import { isCodexRosterAliasesEnabled } from "./flag"
import { loadRosterPeople } from "./rosterRead"
import { ambiguousAssigneeMessage, decideAssigneeWrite, type RosterPerson } from "./rosterResolve"

export type AssigneeWriteDeps = {
  enabled: () => Promise<boolean>
  loadRoster: () => Promise<RosterPerson[]>
}

const LIVE_DEPS: AssigneeWriteDeps = {
  enabled: isCodexRosterAliasesEnabled,
  loadRoster: () => loadRosterPeople(),
}

export type AssigneeWriteResult =
  | { ok: true; email: string; name: string | null | undefined; resolved: boolean }
  | {
      ok: false
      status: 409
      body: { error: "ambiguous_assignee"; message: string; holders: Array<{ email: string; name: string }> }
    }

/**
 * `email` is the non-empty address the client sent. With the switch off the
 * result is `{ email, name }` unchanged.
 */
export async function resolveAssigneeForWrite(
  email: string,
  name: string | null | undefined,
  deps: AssigneeWriteDeps = LIVE_DEPS,
): Promise<AssigneeWriteResult> {
  if (!(await deps.enabled())) return { ok: true, email, name, resolved: false }
  const decision = decideAssigneeWrite(email, name, await deps.loadRoster())
  if (decision.kind === "ambiguous") {
    return {
      ok: false,
      status: 409,
      body: { error: "ambiguous_assignee", message: ambiguousAssigneeMessage(decision), holders: decision.holders },
    }
  }
  return { ok: true, email: decision.email, name: decision.resolved ? decision.name : name, resolved: decision.resolved }
}
