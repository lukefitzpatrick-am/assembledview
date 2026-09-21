import { MS_GRAPH_SCOPE, MS_LOGIN_BASE_URL } from "@/lib/config/endpoints"
import type { GraphTransport } from "@/lib/m365/graphTransport"

export type PartnerGraphCredentials = {
  tenantId: string
  clientId: string
  clientSecret: string
}

const TOKEN_SKEW_MS = 60_000
const GRAPH_SCOPE = MS_GRAPH_SCOPE

type TokenCache = { accessToken: string; expiresAtMs: number } | null

export function partnerIngestGraphCredentialsFromEnv(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env
): PartnerGraphCredentials {
  const tenantId = env.PARTNER_INGEST_TENANT_ID?.trim() ?? ""
  const clientId = env.PARTNER_INGEST_CLIENT_ID?.trim() ?? ""
  const clientSecret = env.PARTNER_INGEST_CLIENT_SECRET?.trim() ?? ""
  if (!tenantId || !clientId || !clientSecret) {
    throw new Error(
      "partner ingest requires PARTNER_INGEST_TENANT_ID, PARTNER_INGEST_CLIENT_ID, and PARTNER_INGEST_CLIENT_SECRET"
    )
  }
  return { tenantId, clientId, clientSecret }
}

export function createPartnerGraphToken(input: {
  credentials: PartnerGraphCredentials
  transport: GraphTransport
  now?: () => number
}): () => Promise<string> {
  let cache: TokenCache = null
  const now = input.now ?? (() => Date.now())

  return async function fetchAccessToken(): Promise<string> {
    const t = now()
    if (cache && cache.expiresAtMs - TOKEN_SKEW_MS > t) {
      return cache.accessToken
    }

    const tokenUrl = `${MS_LOGIN_BASE_URL}/${encodeURIComponent(
      input.credentials.tenantId
    )}/oauth2/v2.0/token`
    const body = new URLSearchParams({
      client_id: input.credentials.clientId,
      client_secret: input.credentials.clientSecret,
      scope: GRAPH_SCOPE,
      grant_type: "client_credentials",
    }).toString()

    const res = await input.transport({
      method: "POST",
      url: tokenUrl,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    })
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`Entra token request failed (${res.status}): ${res.bodyText}`)
    }
    const json = JSON.parse(res.bodyText) as {
      access_token?: string
      expires_in?: number
    }
    const accessToken = json.access_token
    if (!accessToken) {
      throw new Error("Entra token response missing access_token")
    }
    const expiresInSec = Number(json.expires_in) || 3600
    cache = {
      accessToken,
      expiresAtMs: t + expiresInSec * 1000,
    }
    return accessToken
  }
}
