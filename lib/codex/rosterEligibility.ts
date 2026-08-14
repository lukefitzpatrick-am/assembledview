/**
 * Layer 2 (Management API) roster-eligibility only.
 * Does not write roles back to Auth0. Login upsert (Layer 1) stays claims-based.
 */
import { isFreeMailDomain } from "@/lib/fireflies/learnableDomains"
import { getUserRoles } from "@/lib/rbac"
import type { User } from "@auth0/nextjs-auth0/types"

/** Exact match only — not endsWith / contains. */
export const STAFF_ROSTER_EMAIL_DOMAIN = "assembledmedia.com.au"

export type RosterEligibility =
  | { eligible: true; via: "app_metadata" | "domain_rule" }
  | { eligible: false; reason: string }

function emailDomainExact(email: string): string | null {
  const at = email.lastIndexOf("@")
  if (at < 0 || at === email.length - 1) return null
  const domain = email.slice(at + 1).trim()
  return domain || null
}

export function listedUserRoles(appMetadata: Record<string, unknown> | undefined) {
  return getUserRoles({ app_metadata: appMetadata } as unknown as User)
}

export function rosterEligibilityForManagementUser(input: {
  email?: string | null
  app_metadata?: Record<string, unknown>
}): RosterEligibility {
  const email =
    typeof input.email === "string" ? input.email.trim().toLowerCase() : ""
  if (!email) return { eligible: false, reason: "no email" }

  const domain = emailDomainExact(email)
  if (domain && isFreeMailDomain(domain)) {
    return { eligible: false, reason: "free-mail" }
  }

  const roles = listedUserRoles(input.app_metadata)
  if (roles.includes("client")) {
    return { eligible: false, reason: "client role" }
  }

  if (roles.includes("admin")) {
    return { eligible: true, via: "app_metadata" }
  }

  if (domain === STAFF_ROSTER_EMAIL_DOMAIN) {
    return { eligible: true, via: "domain_rule" }
  }

  return { eligible: false, reason: "not roster-eligible" }
}
