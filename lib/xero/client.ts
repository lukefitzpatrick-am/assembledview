/**
 * Xero client-credentials token helper.
 * POST identity.xero.com/connect/token; cache per process/run.
 */

export type XeroTokenProvider = () => Promise<string>

let cachedToken: { token: string; expiresAtMs: number } | null = null

export function clearXeroTokenCache(): void {
  cachedToken = null
}

export async function getXeroAccessToken(
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const now = Date.now()
  if (cachedToken && cachedToken.expiresAtMs > now + 30_000) {
    return cachedToken.token
  }

  const clientId = process.env.XERO_CLIENT_ID?.trim()
  const clientSecret = process.env.XERO_CLIENT_SECRET?.trim()
  if (!clientId || !clientSecret) {
    throw new Error("XERO_CLIENT_ID and XERO_CLIENT_SECRET are required")
  }

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64")
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    scope: "accounting.invoices.read accounting.contacts",
  })

  const res = await fetchImpl("https://identity.xero.com/connect/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  })

  const json = (await res.json()) as {
    access_token?: string
    expires_in?: number
    error?: string
  }

  if (!res.ok || !json.access_token) {
    throw new Error(
      `Failed to get Xero token: ${JSON.stringify(json).slice(0, 400)}`,
    )
  }

  const expiresInSec = json.expires_in ?? 1800
  cachedToken = {
    token: json.access_token,
    expiresAtMs: now + expiresInSec * 1000,
  }
  return json.access_token
}

export type XeroApiOptions = {
  accessToken: string
  path: string
  method?: "GET" | "POST"
  ifModifiedSince?: string
  accept?: string
  fetchImpl?: typeof fetch
}

export async function xeroApiRequest(
  opts: XeroApiOptions,
): Promise<{ status: number; headers: Headers; body: ArrayBuffer | unknown }> {
  const fetchImpl = opts.fetchImpl ?? fetch
  const headers: Record<string, string> = {
    Authorization: `Bearer ${opts.accessToken}`,
    Accept: opts.accept ?? "application/json",
  }
  if (opts.ifModifiedSince) {
    headers["If-Modified-Since"] = opts.ifModifiedSince
  }

  const res = await fetchImpl(`https://api.xero.com/api.xro/2.0${opts.path}`, {
    method: opts.method ?? "GET",
    headers,
  })

  const accept = opts.accept ?? "application/json"
  if (accept.includes("pdf")) {
    const buf = await res.arrayBuffer()
    return { status: res.status, headers: res.headers, body: buf }
  }
  const json = await res.json()
  return { status: res.status, headers: res.headers, body: json }
}
