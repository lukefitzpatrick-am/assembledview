import type { TeamMember } from "@/lib/codex/types"

export class CodexHelpError extends Error {
  readonly status: number
  /** The route's error code when it is not the default for the status (P3: `task_changed`). */
  readonly code: string | undefined
  constructor(message: string, status = 400, code?: string) {
    super(message)
    this.name = "CodexHelpError"
    this.status = status
    this.code = code
  }
}

/** Active roster minus the caller — Ask-for-help picker. */
export function helpRosterOptions(
  members: TeamMember[],
  meEmail: string | null | undefined
): TeamMember[] {
  const me = (meEmail ?? "").trim().toLowerCase()
  return members.filter((m) => {
    if (!m.active) return false
    const email = m.email.trim().toLowerCase()
    if (!email) return false
    return email !== me
  })
}

export function isOpenHelpChildStatus(status: string | null | undefined): boolean {
  return (status ?? "").trim() !== "" && status !== "done"
}
