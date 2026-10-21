import { userHasCodexShadowAccess } from "@/lib/codex/shadowRoles"

type NavGroup<T extends { path: string }> = { items: T[] }

/**
 * Codex (/tasks) shows in the sidebar only when the server flag CODEX_V2 is on
 * (the module is meant to be invisible when off) and the user has shadow
 * access (so the link never 403s the wider admin team). Groups left empty
 * are dropped.
 */
export function withCodexNav<T extends { path: string }, G extends NavGroup<T>>(
  groups: G[],
  options: { codexEnabled: boolean; roles: readonly string[] | null | undefined },
): G[] {
  if (options.codexEnabled && userHasCodexShadowAccess(options.roles)) return groups
  return groups
    .map((group) => ({ ...group, items: group.items.filter((item) => item.path !== "/tasks") }))
    .filter((group) => group.items.length > 0)
}
