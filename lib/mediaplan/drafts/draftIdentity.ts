/**
 * Working-draft identity. Never invent an id — a missing email and sub
 * must fail closed so callers cannot share one "unknown" row per master.
 */

export type DraftIdentity = {
  id: string
  label: string
  source: "email" | "sub"
}

export function draftIdentity(gate: unknown): DraftIdentity | null {
  const g = gate as {
    session?: { user?: { email?: string; name?: string; sub?: string } }
  }
  const email = String(g.session?.user?.email ?? "").trim()
  const sub = String(g.session?.user?.sub ?? "").trim()
  const name = String(g.session?.user?.name ?? "").trim()

  if (email) {
    return { id: email, label: name || email, source: "email" }
  }
  if (sub) {
    console.warn(
      "[/api/plans/drafts] session has no email — keying draft on sub"
    )
    return { id: sub, label: name || sub, source: "sub" }
  }
  return null
}
