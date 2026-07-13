/**
 * Module-level in-flight dedupe for identical media-plan MBA fetches.
 * Survives React Strict Mode remounts in dev and prevents duplicate network
 * work when two effects race with the same URL.
 */

type BufferedResponse = {
  status: number
  statusText: string
  headers: [string, string][]
  body: ArrayBuffer
}

const inflight = new Map<string, Promise<BufferedResponse>>()

function canonicalMbaUrl(url: string): string {
  try {
    const u = new URL(
      url,
      typeof window !== "undefined" ? window.location.origin : "http://localhost"
    )
    return `${u.pathname}?${u.searchParams.toString()}`
  } catch {
    return url
  }
}

/**
 * fetch() with in-flight coalescing on the canonical MBA URL.
 * Each caller gets an independent Response so `.json()` is safe.
 */
export function fetchMediaPlanMbaCoalesced(
  url: string,
  init?: RequestInit
): Promise<Response> {
  const key = canonicalMbaUrl(url)
  let shared = inflight.get(key)
  if (!shared) {
    shared = fetch(url, init)
      .then(async (res) => {
        const body = await res.arrayBuffer()
        return {
          status: res.status,
          statusText: res.statusText,
          headers: Array.from(res.headers.entries()),
          body,
        }
      })
      .finally(() => {
        inflight.delete(key)
      })
    inflight.set(key, shared)
  }

  return shared.then(
    (payload) =>
      new Response(payload.body.slice(0), {
        status: payload.status,
        statusText: payload.statusText,
        headers: payload.headers,
      })
  )
}
