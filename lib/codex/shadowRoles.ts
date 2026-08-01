/**
 * Codex shadow-phase role allowlist (client + server safe).
 * API gate and sidebar visibility both key off this list.
 * Managers join at team launch — widen here (and keep API `_shared` in sync via re-export).
 */
export const CODEX_SHADOW_ROLES = ["admin"] as const

export type CodexShadowRole = (typeof CODEX_SHADOW_ROLES)[number]

/** True when any of the user's roles is in the Codex shadow allowlist. */
export function userHasCodexShadowAccess(
  roles: readonly string[] | null | undefined
): boolean {
  if (!roles?.length) return false
  return CODEX_SHADOW_ROLES.some((r) => roles.includes(r))
}
