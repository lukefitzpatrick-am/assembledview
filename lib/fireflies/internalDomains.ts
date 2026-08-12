import { DEFAULT_ASSEMBLED_DOMAINS } from "./attribution.js"

export { DEFAULT_ASSEMBLED_DOMAINS }

type InternalDomainEnv = {
  INTERNAL_EMAIL_DOMAINS?: string
  FIREFLIES_ASSEMBLED_DOMAINS?: string
}

function processDomainEnv(): InternalDomainEnv {
  return {
    INTERNAL_EMAIL_DOMAINS: process.env.INTERNAL_EMAIL_DOMAINS,
    FIREFLIES_ASSEMBLED_DOMAINS: process.env.FIREFLIES_ASSEMBLED_DOMAINS,
  }
}

function parseCsv(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
}

/** Prefer INTERNAL_EMAIL_DOMAINS; legacy FIREFLIES_ASSEMBLED_DOMAINS if unset. */
export function resolveInternalEmailDomains(
  env: InternalDomainEnv = processDomainEnv()
): { domains: Set<string>; warned: boolean } {
  const raw =
    env.INTERNAL_EMAIL_DOMAINS !== undefined
      ? env.INTERNAL_EMAIL_DOMAINS
      : env.FIREFLIES_ASSEMBLED_DOMAINS

  if (raw === undefined) {
    return { domains: new Set(DEFAULT_ASSEMBLED_DOMAINS), warned: false }
  }

  const parsed = parseCsv(raw)
  if (parsed.length === 0) {
    return { domains: new Set(DEFAULT_ASSEMBLED_DOMAINS), warned: true }
  }
  return { domains: new Set(parsed), warned: false }
}

export function defaultAssembledDomainSet(
  env: InternalDomainEnv = processDomainEnv()
): Set<string> {
  const { domains, warned } = resolveInternalEmailDomains(env)
  if (warned) {
    console.warn(
      "[fireflies] INTERNAL_EMAIL_DOMAINS/FIREFLIES_ASSEMBLED_DOMAINS empty — falling back to DEFAULT_ASSEMBLED_DOMAINS"
    )
  }
  return domains
}
