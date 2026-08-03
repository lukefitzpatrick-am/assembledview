import { NextResponse } from "next/server"

/**
 * Who may assign the Auth0 `admin` application role (create or promote).
 *
 * WHY this is not `requireRole(..., { allowEmails })`: that option is ADDITIVE
 * (`lib/requireRole.ts` — grant when role matches OR email is allowlisted). It can
 * only widen access for callers who lack the role; it cannot restrict an existing
 * `admin` from performing a privileged sub-action. Admin-granting needs a separate
 * fail-closed check.
 *
 * This is NOT a third application role. Roles remain `admin` | `client` only
 * (`lib/rbac.ts` / INVARIANTS). The allowlist is an operator gate on top of admin.
 */

const SUPERADMIN_EMAIL_ALLOWLIST_ENV = "SUPERADMIN_EMAIL_ALLOWLIST"

export function parseSuperadminEmailAllowlist(
  raw: string | undefined = process.env[SUPERADMIN_EMAIL_ALLOWLIST_ENV],
): string[] {
  if (typeof raw !== "string") return []
  return raw
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
}

/**
 * True when `sessionEmail` is on SUPERADMIN_EMAIL_ALLOWLIST (case-insensitive).
 * Empty/unset allowlist => DENY everyone (fail closed) and log loudly.
 */
export function canGrantAdminRole(sessionEmail: string | null | undefined): boolean {
  const allowlist = parseSuperadminEmailAllowlist()
  if (allowlist.length === 0) {
    console.error(
      `[canGrantAdminRole] ${SUPERADMIN_EMAIL_ALLOWLIST_ENV} is empty or unset — denying all admin-role grants (fail closed)`,
    )
    return false
  }

  const email =
    typeof sessionEmail === "string" ? sessionEmail.trim().toLowerCase() : ""
  if (!email) {
    console.error(
      "[canGrantAdminRole] session email missing — denying admin-role grant (fail closed)",
    )
    return false
  }

  return allowlist.includes(email)
}

/**
 * Call site for create/promote to `admin`. Non-admin target roles are always allowed
 * (caller must already be admin via requireAdmin). Returns a 403 response to send,
 * or null when permitted.
 *
 * // REVIEW: policy lands in USR-4 — allowlist fail-closed via SUPERADMIN_EMAIL_ALLOWLIST
 */
export function assertCanGrantAdminRole(
  session: { user?: { email?: string | null } | null } | null | undefined,
  targetRole: string,
): NextResponse | null {
  const normalized = String(targetRole ?? "")
    .trim()
    .toLowerCase()
  if (normalized !== "admin") return null

  const email =
    typeof session?.user?.email === "string" ? session.user.email : null
  if (canGrantAdminRole(email)) return null

  return NextResponse.json(
    {
      error:
        "Forbidden: only an allowlisted operator may create or promote users to the admin role",
    },
    { status: 403 },
  )
}
