import type { User } from "@auth0/nextjs-auth0/types"

import { userHasAdminAccess } from "@/lib/rbac"

/** Admin (staff) may open the builder. A client, or anyone else, is a 404. */
export function builderGate(user: User | null | undefined): "login" | "not_found" | "ok" {
  if (!user) return "login"
  if (userHasAdminAccess(user)) return "ok"
  return "not_found"
}
