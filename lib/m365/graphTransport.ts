/**
 * Injectable HTTP transport for Microsoft Graph + Entra token calls.
 * Unit tests mock this — no real network in the suite.
 */

export type GraphTransportRequest = {
  method: string
  url: string
  headers?: Record<string, string>
  body?: string | null
}

export type GraphTransportResponse = {
  status: number
  headers: Record<string, string>
  bodyText: string
}

export type GraphTransport = (
  req: GraphTransportRequest
) => Promise<GraphTransportResponse>

function headersToRecord(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {}
  headers.forEach((value, key) => {
    out[key.toLowerCase()] = value
  })
  return out
}

/** Production transport. Do not use in unit tests. */
export function createFetchGraphTransport(
  fetchImpl: typeof fetch = fetch
): GraphTransport {
  return async (req) => {
    const res = await fetchImpl(req.url, {
      method: req.method,
      headers: req.headers,
      body: req.body ?? undefined,
    })
    return {
      status: res.status,
      headers: headersToRecord(res.headers),
      bodyText: await res.text(),
    }
  }
}
