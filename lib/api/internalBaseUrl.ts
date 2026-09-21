/**
 * Pinned origin for server-side self-fetch. Never derive scheme/host from the incoming request.
 */
import { resolvePublicOrigin } from "@/lib/config/endpoints"

export function getInternalApiBaseUrl(): string {
  return resolvePublicOrigin()
}

export function internalMediaPlanByMbaUrl(mbaNumber: string): string {
  return `${getInternalApiBaseUrl()}/api/mediaplans/mba/${encodeURIComponent(mbaNumber)}`
}
