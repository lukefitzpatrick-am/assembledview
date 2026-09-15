import type { PartnerSourceMapRow } from "./types"

function senderDomainOf(address: string): string {
  const trimmed = address.trim()
  const angle = trimmed.match(/<([^>]+)>/)
  const email = (angle?.[1] ?? trimmed).trim()
  const at = email.lastIndexOf("@")
  if (at < 0) return email.toLowerCase()
  return email.slice(at + 1).toLowerCase()
}

/** SQL LIKE: % → .*, _ → single char. Case-insensitive. */
export function likeMatch(value: string, pattern: string): boolean {
  let body = ""
  for (const ch of pattern) {
    if (ch === "%") body += ".*"
    else if (ch === "_") body += "."
    else body += ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  }
  return new RegExp(`^${body}$`, "i").test(value)
}

export function matchPartnerSource(
  message: { senderAddress: string; subject: string },
  maps: PartnerSourceMapRow[]
): PartnerSourceMapRow | null {
  const domain = senderDomainOf(message.senderAddress)
  const subject = message.subject ?? ""
  for (const row of maps) {
    if (!row.isActive) continue
    if (row.senderDomain.trim().toLowerCase() !== domain) continue
    const pattern = row.subjectPattern
    if (pattern != null && pattern !== "" && !likeMatch(subject, pattern)) {
      continue
    }
    return row
  }
  return null
}
