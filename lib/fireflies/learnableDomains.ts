/**
 * Domains that may be learned into client_domains / publisher_domains on assign.
 * Free-mail and roster (assembled) domains are never persisted.
 */
import { isAssembledDomain } from "./attribution.js"

export const FREE_MAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "msn.com",
  "yahoo.com",
  "ymail.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "pm.me",
])

export function isFreeMailDomain(domain: string): boolean {
  return FREE_MAIL_DOMAINS.has(domain.trim().toLowerCase())
}

export function isLearnableExternalDomain(
  domain: string,
  opts: {
    assembledDomains: Set<string>
    clientDomains?: Set<string>
  }
): boolean {
  const d = domain.trim().toLowerCase()
  if (!d) return false
  if (isFreeMailDomain(d)) return false
  if (isAssembledDomain(d, opts.assembledDomains)) return false
  if (opts.clientDomains?.has(d)) return false
  return true
}
