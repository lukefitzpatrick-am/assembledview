import type { User } from "@auth0/nextjs-auth0/types"

import { userHasAdminAccess } from "@/lib/rbac"
import type { BuilderDraft } from "@/lib/webReport/builder/repo"

/** Same outcome as AdminGuard: unsigned users log in, everyone else who is not admin goes to /dashboard. */
export function adminWebReportsGate(user: User | null | undefined): "login" | "redirect" | "ok" {
  if (!user) return "login"
  if (!userHasAdminAccess(user)) return "redirect"
  return "ok"
}

/**
 * Opens the staff builder for any client slug. Does not read FEATURE_WEB_SEARCH
 * or FEATURE_WEB_SEARCH_CLIENTS — those still gate the client tab only.
 */
export async function resolveAdminWebReportEdit(input: {
  slug: string
  user: User | null | undefined
  load: (slug: string) => Promise<BuilderDraft | null>
}): Promise<
  | { kind: "login" }
  | { kind: "redirect" }
  | { kind: "missing" }
  | { kind: "builder"; draft: BuilderDraft }
> {
  const gate = adminWebReportsGate(input.user)
  if (gate !== "ok") return { kind: gate }
  const draft = await input.load(input.slug)
  if (!draft) return { kind: "missing" }
  return { kind: "builder", draft }
}
