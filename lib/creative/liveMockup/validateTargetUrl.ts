import "server-only"
import dns from "node:dns/promises"
import net from "node:net"

import { isPrivateOrReservedIp } from "@/lib/creative/privateIp"

export type LiveMockupUrlErrorCode =
  | "invalid_url"
  | "https_required"
  | "private_ip"
  | "dns_failed"

export class LiveMockupUrlError extends Error {
  constructor(
    message: string,
    readonly code: LiveMockupUrlErrorCode,
  ) {
    super(message)
    this.name = "LiveMockupUrlError"
  }
}

async function resolveAndAssertPublic(hostname: string): Promise<void> {
  let records: Array<{ address: string; family: number }>
  try {
    records = await dns.lookup(hostname, { all: true, verbatim: true })
  } catch {
    throw new LiveMockupUrlError("Could not resolve host", "dns_failed")
  }
  if (!records.length) {
    throw new LiveMockupUrlError("Could not resolve host", "dns_failed")
  }
  for (const record of records) {
    if (isPrivateOrReservedIp(record.address)) {
      throw new LiveMockupUrlError("URL resolves to a private or reserved address", "private_ip")
    }
  }
}

/** Validate a target URL before forwarding to a screenshot provider (no fetch). */
export async function validateLiveMockupTargetUrl(raw: string): Promise<URL> {
  let parsed: URL
  try {
    parsed = new URL(raw.trim())
  } catch {
    throw new LiveMockupUrlError("Invalid URL", "invalid_url")
  }
  if (parsed.protocol !== "https:") {
    throw new LiveMockupUrlError("Only https URLs are allowed", "https_required")
  }
  if (!parsed.hostname) {
    throw new LiveMockupUrlError("Invalid URL", "invalid_url")
  }
  if (net.isIP(parsed.hostname) && isPrivateOrReservedIp(parsed.hostname)) {
    throw new LiveMockupUrlError("URL resolves to a private or reserved address", "private_ip")
  }
  await resolveAndAssertPublic(parsed.hostname)
  return parsed
}
