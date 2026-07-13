/**
 * Pinned origin for server-side self-fetch. Never derive scheme/host from the incoming request.
 */
export function getInternalApiBaseUrl(): string {
  const envBase = process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, "")
  if (envBase) return envBase

  const authBase = process.env.AUTH0_BASE_URL?.replace(/\/$/, "")
  if (authBase) return authBase

  return "http://localhost:3000"
}

export function internalMediaPlanByMbaUrl(mbaNumber: string): string {
  return `${getInternalApiBaseUrl()}/api/mediaplans/mba/${encodeURIComponent(mbaNumber)}`
}
