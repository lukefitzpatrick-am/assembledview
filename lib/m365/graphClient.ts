/**
 * Microsoft Graph service layer (M5).
 * All network goes through an injectable transport — unit tests mock it.
 */

import { isM365ProvisioningEnabled } from "@/lib/m365/featureFlag"
import type {
  GraphTransport,
  GraphTransportResponse,
} from "@/lib/m365/graphTransport"
import type {
  M365ProvisioningLogRow,
  ProvisioningLogWriter,
} from "@/lib/m365/provisioningLog"

const GRAPH_BASE = "https://graph.microsoft.com/v1.0"
const DEFAULT_TOKEN_SKEW_MS = 60_000
const DEFAULT_MAX_RETRIES = 4
const BASE_BACKOFF_MS = 250
const MAX_BACKOFF_MS = 10_000

export class M365ProvisioningDisabledError extends Error {
  constructor(
    message = "M365 provisioning disabled (NEXT_PUBLIC_M365_PROVISIONING is off)"
  ) {
    super(message)
    this.name = "M365ProvisioningDisabledError"
  }
}

export class GraphHttpError extends Error {
  readonly status: number
  readonly bodyText: string
  readonly headers: Record<string, string>

  constructor(
    message: string,
    status: number,
    bodyText: string,
    headers: Record<string, string> = {}
  ) {
    super(message)
    this.name = "GraphHttpError"
    this.status = status
    this.bodyText = bodyText
    this.headers = headers
  }
}

export type GraphCredentials = {
  tenantId: string
  clientId: string
  /** Client secret (local/dev). Prod prefers certificate — see docs/brain/modules/m365.md. */
  clientSecret: string
  scope?: string
}

export type GraphClientDeps = {
  transport: GraphTransport
  writeLog: ProvisioningLogWriter
  credentials: GraphCredentials
  isEnabled?: () => boolean
  actor?: string | null
  now?: () => number
  sleep?: (ms: number) => Promise<void>
  random?: () => number
  maxRetries?: number
  tokenSkewMs?: number
  /** Override request-id generation (tests). */
  newRequestId?: () => string
}

type TokenCache = {
  accessToken: string
  expiresAtMs: number
}

export type GraphSite = {
  id: string
  webUrl?: string
  name?: string
  displayName?: string
}

export type GraphTeam = {
  id: string
  displayName?: string
  webUrl?: string
}

export type GraphChannel = {
  id: string
  displayName?: string
  webUrl?: string
}

export type GraphDriveItem = {
  id: string
  name?: string
  webUrl?: string
  folder?: Record<string, unknown>
}

export type GraphChatMessage = {
  id: string
}

export type EnsureSiteInput = {
  /** Absolute or server-relative site URL / path key used for resolve. */
  siteUrl: string
  displayName: string
  /** Hostname for GET /sites/{hostname}:/{path} resolve, e.g. contoso.sharepoint.com */
  hostname: string
  /** Server-relative path under hostname, e.g. sites/cli-penfold */
  serverRelativePath: string
}

export type EnsureFolderPathInput = {
  driveId: string
  /** Path under drive root, e.g. Campaigns/PENFOLD001 (no leading slash). */
  path: string
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `req-${Date.now()}-${Math.random()}`
}

function headerGet(
  headers: Record<string, string>,
  name: string
): string | undefined {
  const want = name.toLowerCase()
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === want) return v
  }
  return undefined
}

/** Exported for unit tests. */
export function parseRetryAfterMs(
  retryAfter: string | undefined,
  attempt: number,
  nowMs: number,
  random: () => number
): number {
  if (retryAfter != null && String(retryAfter).trim() !== "") {
    const raw = String(retryAfter).trim()
    const asInt = Number(raw)
    if (Number.isFinite(asInt) && asInt >= 0) {
      return Math.round(asInt * 1000)
    }
    const asDate = Date.parse(raw)
    if (Number.isFinite(asDate)) {
      return Math.max(0, asDate - nowMs)
    }
  }
  const exponential = BASE_BACKOFF_MS * Math.pow(2, attempt)
  const capped = Math.min(exponential, MAX_BACKOFF_MS)
  const jitter = 0.5 + random()
  return Math.round(capped * jitter)
}

function isRetriableStatus(status: number): boolean {
  return status === 429 || status === 503 || status === 504
}

function parseJsonBody(bodyText: string): unknown {
  if (!bodyText || !bodyText.trim()) return null
  try {
    return JSON.parse(bodyText) as unknown
  } catch {
    return null
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function normalizeFolderPath(path: string): string {
  return String(path ?? "")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "")
    .replace(/\/+/g, "/")
}

function encodePathSegments(path: string): string {
  return normalizeFolderPath(path)
    .split("/")
    .filter(Boolean)
    .map((seg) => encodeURIComponent(seg))
    .join("/")
}

export type GraphClient = ReturnType<typeof createGraphClient>

export function createGraphClient(deps: GraphClientDeps) {
  const transport = deps.transport
  const writeLog = deps.writeLog
  const credentials = deps.credentials
  const isEnabled = deps.isEnabled ?? isM365ProvisioningEnabled
  const actor = deps.actor ?? null
  const now = deps.now ?? Date.now
  const sleep = deps.sleep ?? defaultSleep
  const random = deps.random ?? Math.random
  const maxRetries = deps.maxRetries ?? DEFAULT_MAX_RETRIES
  const tokenSkewMs = deps.tokenSkewMs ?? DEFAULT_TOKEN_SKEW_MS
  const newRequestId = deps.newRequestId ?? newId

  let tokenCache: TokenCache | null = null

  async function logAttempt(
    partial: Omit<M365ProvisioningLogRow, "actor"> & { actor?: string | null }
  ): Promise<void> {
    await writeLog({
      entityType: partial.entityType,
      entityId: partial.entityId,
      action: partial.action,
      requestId: partial.requestId,
      actor: partial.actor ?? actor,
      outcome: partial.outcome,
      error: partial.error,
    })
  }

  async function assertEnabled(action: string, entityType: string): Promise<void> {
    if (isEnabled()) return
    const requestId = newRequestId()
    await logAttempt({
      entityType,
      entityId: null,
      action,
      requestId,
      outcome: "failure",
      error: "provisioning disabled",
    })
    throw new M365ProvisioningDisabledError()
  }

  async function fetchAccessToken(forceRefresh = false): Promise<string> {
    const t = now()
    if (
      !forceRefresh &&
      tokenCache &&
      tokenCache.expiresAtMs - tokenSkewMs > t
    ) {
      return tokenCache.accessToken
    }

    const tokenUrl = `https://login.microsoftonline.com/${encodeURIComponent(
      credentials.tenantId
    )}/oauth2/v2.0/token`
    const scope =
      credentials.scope?.trim() || "https://graph.microsoft.com/.default"
    const body = new URLSearchParams({
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      scope,
      grant_type: "client_credentials",
    }).toString()

    const res = await transport({
      method: "POST",
      url: tokenUrl,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    })
    if (res.status < 200 || res.status >= 300) {
      throw new GraphHttpError(
        `Entra token request failed (${res.status})`,
        res.status,
        res.bodyText,
        res.headers
      )
    }
    const json = asRecord(parseJsonBody(res.bodyText))
    const accessToken = String(json?.access_token ?? "").trim()
    const expiresIn = Number(json?.expires_in ?? 3600)
    if (!accessToken) {
      throw new Error("Entra token response missing access_token")
    }
    tokenCache = {
      accessToken,
      expiresAtMs: t + (Number.isFinite(expiresIn) ? expiresIn : 3600) * 1000,
    }
    return accessToken
  }

  async function graphRequest(input: {
    method: string
    path: string
    body?: unknown
    headers?: Record<string, string>
    action: string
    entityType: string
    entityId?: string | null
    requestId: string
    /** HTTP statuses that return without throwing (e.g. 404 on resolve). */
    acceptStatuses?: number[]
  }): Promise<GraphTransportResponse> {
    const accept = new Set(input.acceptStatuses ?? [])
    let lastError: unknown
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const token = await fetchAccessToken(attempt > 0 && attempt % 2 === 0)
        const res = await transport({
          method: input.method,
          url: input.path.startsWith("http")
            ? input.path
            : `${GRAPH_BASE}${input.path}`,
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
            ...(input.body !== undefined
              ? { "Content-Type": "application/json" }
              : {}),
            ...input.headers,
          },
          body:
            input.body === undefined
              ? null
              : typeof input.body === "string"
                ? input.body
                : JSON.stringify(input.body),
        })

        if (accept.has(res.status)) {
          await logAttempt({
            entityType: input.entityType,
            entityId: input.entityId ?? null,
            action: input.action,
            requestId: input.requestId,
            outcome: res.status >= 200 && res.status < 300 ? "success" : "skipped",
            error: res.status >= 200 && res.status < 300 ? null : `HTTP ${res.status}`,
          })
          return res
        }

        if (isRetriableStatus(res.status) && attempt < maxRetries) {
          await logAttempt({
            entityType: input.entityType,
            entityId: input.entityId ?? null,
            action: input.action,
            requestId: input.requestId,
            outcome: "failure",
            error: `HTTP ${res.status}`,
          })
          const retryAfter = headerGet(res.headers, "retry-after")
          const delayMs = parseRetryAfterMs(retryAfter, attempt, now(), random)
          await sleep(delayMs)
          continue
        }

        if (res.status < 200 || res.status >= 300) {
          await logAttempt({
            entityType: input.entityType,
            entityId: input.entityId ?? null,
            action: input.action,
            requestId: input.requestId,
            outcome: "failure",
            error: `HTTP ${res.status}`,
          })
          throw new GraphHttpError(
            `Graph ${input.action} failed (${res.status})`,
            res.status,
            res.bodyText,
            res.headers
          )
        }

        await logAttempt({
          entityType: input.entityType,
          entityId: input.entityId ?? null,
          action: input.action,
          requestId: input.requestId,
          outcome: "success",
          error: null,
        })
        return res
      } catch (err) {
        lastError = err
        if (err instanceof GraphHttpError) throw err
        await logAttempt({
          entityType: input.entityType,
          entityId: input.entityId ?? null,
          action: input.action,
          requestId: input.requestId,
          outcome: "failure",
          error: err instanceof Error ? err.message : String(err),
        })
        if (attempt >= maxRetries) throw err
        const delayMs = parseRetryAfterMs(undefined, attempt, now(), random)
        await sleep(delayMs)
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new Error("Graph request failed")
  }

  async function resolveSiteByUrl(input: {
    hostname: string
    serverRelativePath: string
  }): Promise<GraphSite | null> {
    await assertEnabled("resolve_site", "site")
    const requestId = newRequestId()
    const path = `/sites/${encodeURIComponent(input.hostname)}:/${normalizeFolderPath(
      input.serverRelativePath
    )}`
    const res = await graphRequest({
      method: "GET",
      path,
      action: "resolve_site",
      entityType: "site",
      entityId: input.serverRelativePath,
      requestId,
      acceptStatuses: [200, 404],
    })
    if (res.status === 404) return null
    const json = asRecord(parseJsonBody(res.bodyText))
    const id = String(json?.id ?? "").trim()
    if (!id) return null
    return {
      id,
      webUrl: json?.webUrl != null ? String(json.webUrl) : undefined,
      name: json?.name != null ? String(json.name) : undefined,
      displayName:
        json?.displayName != null ? String(json.displayName) : undefined,
    }
  }

  async function createSite(input: {
    displayName: string
    hostname: string
    serverRelativePath: string
  }): Promise<GraphSite> {
    await assertEnabled("create_site", "site")
    const requestId = newRequestId()
    const res = await graphRequest({
      method: "POST",
      path: "/sites",
      body: {
        displayName: input.displayName,
        name: normalizeFolderPath(input.serverRelativePath).split("/").pop(),
        webUrl: `https://${input.hostname}/${normalizeFolderPath(
          input.serverRelativePath
        )}`,
      },
      action: "create_site",
      entityType: "site",
      entityId: input.serverRelativePath,
      requestId,
    })
    const json = asRecord(parseJsonBody(res.bodyText))
    const id = String(json?.id ?? "").trim()
    if (!id) throw new Error("create_site response missing id")
    return {
      id,
      webUrl: json?.webUrl != null ? String(json.webUrl) : undefined,
      name: json?.name != null ? String(json.name) : undefined,
      displayName:
        json?.displayName != null ? String(json.displayName) : undefined,
    }
  }

  async function ensureSite(input: EnsureSiteInput): Promise<GraphSite> {
    await assertEnabled("ensure_site", "site")
    const existing = await resolveSiteByUrl({
      hostname: input.hostname,
      serverRelativePath: input.serverRelativePath,
    })
    if (existing) {
      const requestId = newRequestId()
      await logAttempt({
        entityType: "site",
        entityId: existing.id,
        action: "ensure_site",
        requestId,
        outcome: "skipped",
        error: null,
      })
      return existing
    }
    return createSite({
      displayName: input.displayName,
      hostname: input.hostname,
      serverRelativePath: input.serverRelativePath,
    })
  }

  async function createTeam(input: {
    displayName: string
    description?: string
  }): Promise<GraphTeam> {
    await assertEnabled("create_team", "team")
    const requestId = newRequestId()
    const res = await graphRequest({
      method: "POST",
      path: "/teams",
      body: {
        "rachel.c@example.org":
          "https://graph.microsoft.com/v1.0/teamsTemplates('standard')",
        displayName: input.displayName,
        description: input.description ?? "",
      },
      action: "create_team",
      entityType: "team",
      entityId: input.displayName,
      requestId,
    })
    // Graph often returns 202 + Location; mock may return id in body.
    const json = asRecord(parseJsonBody(res.bodyText))
    const id =
      String(json?.id ?? "").trim() ||
      headerGet(res.headers, "content-location") ||
      headerGet(res.headers, "location") ||
      ""
    if (!id) throw new Error("create_team response missing id")
    return {
      id: id.replace(/^.*\//, ""),
      displayName: input.displayName,
      webUrl: json?.webUrl != null ? String(json.webUrl) : undefined,
    }
  }

  async function createChannel(input: {
    teamId: string
    displayName: string
    description?: string
  }): Promise<GraphChannel> {
    await assertEnabled("create_channel", "channel")
    const requestId = newRequestId()
    const res = await graphRequest({
      method: "POST",
      path: `/teams/${encodeURIComponent(input.teamId)}/channels`,
      body: {
        displayName: input.displayName,
        description: input.description ?? "",
      },
      action: "create_channel",
      entityType: "channel",
      entityId: input.teamId,
      requestId,
    })
    const json = asRecord(parseJsonBody(res.bodyText))
    const id = String(json?.id ?? "").trim()
    if (!id) throw new Error("create_channel response missing id")
    return {
      id,
      displayName:
        json?.displayName != null
          ? String(json.displayName)
          : input.displayName,
      webUrl: json?.webUrl != null ? String(json.webUrl) : undefined,
    }
  }

  async function getDriveItem(
    driveId: string,
    path: string,
    requestId: string
  ): Promise<GraphDriveItem | null> {
    const encoded = encodePathSegments(path)
    const graphPath = encoded
      ? `/drives/${encodeURIComponent(driveId)}/root:/${encoded}`
      : `/drives/${encodeURIComponent(driveId)}/root`
    const res = await graphRequest({
      method: "GET",
      path: graphPath,
      action: "resolve_folder",
      entityType: "folder",
      entityId: `${driveId}:${normalizeFolderPath(path)}`,
      requestId,
      acceptStatuses: [200, 404],
    })
    if (res.status === 404) return null
    const json = asRecord(parseJsonBody(res.bodyText))
    const id = String(json?.id ?? "").trim()
    if (!id) return null
    return {
      id,
      name: json?.name != null ? String(json.name) : undefined,
      webUrl: json?.webUrl != null ? String(json.webUrl) : undefined,
      folder: asRecord(json?.folder) ?? undefined,
    }
  }

  async function createFolderChild(input: {
    driveId: string
    parentPath: string
    name: string
    requestId: string
  }): Promise<GraphDriveItem> {
    const parentEncoded = encodePathSegments(input.parentPath)
    const path = parentEncoded
      ? `/drives/${encodeURIComponent(input.driveId)}/root:/${parentEncoded}:/children`
      : `/drives/${encodeURIComponent(input.driveId)}/root/children`
    const res = await graphRequest({
      method: "POST",
      path,
      body: {
        name: input.name,
        folder: {},
        "@microsoft.graph.conflictBehavior": "fail",
      },
      action: "create_folder",
      entityType: "folder",
      entityId: `${input.driveId}:${normalizeFolderPath(
        [input.parentPath, input.name].filter(Boolean).join("/")
      )}`,
      requestId: input.requestId,
    })
    const json = asRecord(parseJsonBody(res.bodyText))
    const id = String(json?.id ?? "").trim()
    if (!id) throw new Error("create_folder response missing id")
    return {
      id,
      name: json?.name != null ? String(json.name) : input.name,
      webUrl: json?.webUrl != null ? String(json.webUrl) : undefined,
      folder: asRecord(json?.folder) ?? {},
    }
  }

  async function createFolderPath(input: {
    driveId: string
    path: string
  }): Promise<GraphDriveItem> {
    await assertEnabled("create_folder_path", "folder")
    const requestId = newRequestId()
    const segments = normalizeFolderPath(input.path).split("/").filter(Boolean)
    let current = ""
    let last: GraphDriveItem | null = null
    for (const seg of segments) {
      const next = current ? `${current}/${seg}` : seg
      const existing = await getDriveItem(input.driveId, next, requestId)
      if (existing) {
        last = existing
        current = next
        continue
      }
      last = await createFolderChild({
        driveId: input.driveId,
        parentPath: current,
        name: seg,
        requestId,
      })
      current = next
    }
    if (!last) throw new Error("createFolderPath requires a non-empty path")
    return last
  }

  async function ensureFolderPath(
    input: EnsureFolderPathInput
  ): Promise<GraphDriveItem> {
    await assertEnabled("ensure_folder_path", "folder")
    const requestId = newRequestId()
    const path = normalizeFolderPath(input.path)
    const existing = await getDriveItem(input.driveId, path, requestId)
    if (existing) {
      await logAttempt({
        entityType: "folder",
        entityId: existing.id,
        action: "ensure_folder_path",
        requestId: newRequestId(),
        outcome: "skipped",
        error: null,
      })
      return existing
    }
    return createFolderPath({ driveId: input.driveId, path })
  }

  async function uploadFile(input: {
    driveId: string
    path: string
    content: string
    contentType?: string
  }): Promise<GraphDriveItem> {
    await assertEnabled("upload_file", "file")
    const requestId = newRequestId()
    const encoded = encodePathSegments(input.path)
    const res = await graphRequest({
      method: "PUT",
      path: `/drives/${encodeURIComponent(input.driveId)}/root:/${encoded}:/content`,
      body: input.content,
      headers: {
        "Content-Type": input.contentType ?? "application/octet-stream",
      },
      action: "upload_file",
      entityType: "file",
      entityId: `${input.driveId}:${normalizeFolderPath(input.path)}`,
      requestId,
    })
    const json = asRecord(parseJsonBody(res.bodyText))
    const id = String(json?.id ?? "").trim()
    if (!id) throw new Error("upload_file response missing id")
    return {
      id,
      name: json?.name != null ? String(json.name) : undefined,
      webUrl: json?.webUrl != null ? String(json.webUrl) : undefined,
    }
  }

  async function postChannelMessage(input: {
    teamId: string
    channelId: string
    text: string
  }): Promise<GraphChatMessage> {
    await assertEnabled("post_channel_message", "message")
    const requestId = newRequestId()
    const res = await graphRequest({
      method: "POST",
      path: `/teams/${encodeURIComponent(input.teamId)}/channels/${encodeURIComponent(
        input.channelId
      )}/messages`,
      body: {
        body: {
          contentType: "text",
          content: input.text,
        },
      },
      action: "post_channel_message",
      entityType: "message",
      entityId: input.channelId,
      requestId,
    })
    const json = asRecord(parseJsonBody(res.bodyText))
    const id = String(json?.id ?? "").trim()
    if (!id) throw new Error("post_channel_message response missing id")
    return { id }
  }

  return {
    fetchAccessToken,
    resolveSiteByUrl,
    createSite,
    ensureSite,
    createTeam,
    createChannel,
    createFolderPath,
    ensureFolderPath,
    uploadFile,
    postChannelMessage,
  }
}
