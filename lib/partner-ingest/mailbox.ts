import { MS_GRAPH_BASE_URL } from "@/lib/config/endpoints"
import type { GraphTransport } from "@/lib/m365/graphTransport"

import { keepPartnerAttachment } from "./keepAttachment"
import type { PartnerMailAttachment, PartnerMailMessage, PartnerMailboxPort } from "./runPartnerIngest"

export const DEFAULT_PARTNER_INGEST_MAILBOX = "snowflake@assembledview.com.au"

const GRAPH = MS_GRAPH_BASE_URL
const MOVE_FOLDERS = ["Processed", "Failed", "Unrecognised"] as const

type GraphJson = Record<string, unknown>

function asRecord(v: unknown): GraphJson {
  return v && typeof v === "object" ? (v as GraphJson) : {}
}

async function graphJson(
  transport: GraphTransport,
  token: string,
  method: string,
  url: string,
  body?: unknown
): Promise<{ status: number; json: GraphJson }> {
  const res = await transport({
    method,
    url,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...(body != null ? { "Content-Type": "application/json" } : {}),
    },
    body: body == null ? null : JSON.stringify(body),
  })
  let json: GraphJson = {}
  if (res.bodyText) {
    try {
      json = JSON.parse(res.bodyText) as GraphJson
    } catch {
      json = { raw: res.bodyText }
    }
  }
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Graph ${method} ${url} failed (${res.status}): ${res.bodyText}`)
  }
  return { status: res.status, json }
}

function senderAddressFrom(from: unknown): string {
  const rec = asRecord(from)
  const email = asRecord(rec.emailAddress)
  return String(email.address ?? "")
}

/**
 * No `$orderby`: Graph rejects it alongside `$filter` on messages with
 * `InefficientFilter`, and runPartnerIngest sorts the page oldest-first anyway.
 */
function inboxMessagesUrl(user: string): string {
  const filter = encodeURIComponent("hasAttachments eq true")
  const select = encodeURIComponent("id,internetMessageId,receivedDateTime,from,subject")
  return `${GRAPH}/users/${encodeURIComponent(user)}/mailFolders/inbox/messages?$filter=${filter}&$top=50&$select=${select}`
}

export function createPartnerMailbox(input: {
  mailbox: string
  transport: GraphTransport
  getToken: () => Promise<string>
}): PartnerMailboxPort {
  const user = input.mailbox.trim() || DEFAULT_PARTNER_INGEST_MAILBOX
  const folderIdCache = new Map<string, string>()

  async function ensureFolderId(displayName: string): Promise<string> {
    const key = displayName.toLowerCase()
    const cached = folderIdCache.get(key)
    if (cached) return cached
    const token = await input.getToken()
    const listUrl = `${GRAPH}/users/${encodeURIComponent(user)}/mailFolders?$top=100&$select=id,displayName`
    const { json } = await graphJson(input.transport, token, "GET", listUrl)
    const values = Array.isArray(json.value) ? json.value : []
    for (const row of values) {
      const rec = asRecord(row)
      const name = String(rec.displayName ?? "")
      const id = String(rec.id ?? "")
      if (name && id) folderIdCache.set(name.toLowerCase(), id)
    }
    const hit = folderIdCache.get(key)
    if (hit) return hit
    const created = await graphJson(
      input.transport,
      token,
      "POST",
      `${GRAPH}/users/${encodeURIComponent(user)}/mailFolders`,
      { displayName }
    )
    const id = String(created.json.id ?? "")
    if (!id) throw new Error(`Graph did not return an id for folder ${displayName}`)
    folderIdCache.set(key, id)
    return id
  }

  return {
    async listInboxMessages() {
      const token = await input.getToken()
      const { json } = await graphJson(
        input.transport,
        token,
        "GET",
        inboxMessagesUrl(user)
      )
      const values = Array.isArray(json.value) ? json.value : []
      return values.map((row) => {
        const rec = asRecord(row)
        const id = String(rec.id ?? "")
        return {
          id,
          internetMessageId: String(rec.internetMessageId ?? `graph:${id}`),
          receivedDateTime: String(rec.receivedDateTime ?? ""),
          senderAddress: senderAddressFrom(rec.from),
          subject: String(rec.subject ?? ""),
        } satisfies PartnerMailMessage
      })
    },

    async getAttachments(messageId: string) {
      const token = await input.getToken()
      const url = `${GRAPH}/users/${encodeURIComponent(user)}/messages/${encodeURIComponent(messageId)}/attachments`
      const { json } = await graphJson(input.transport, token, "GET", url)
      const values = Array.isArray(json.value) ? json.value : []
      const out: PartnerMailAttachment[] = []
      for (const row of values) {
        const rec = asRecord(row)
        const name = String(rec.name ?? "")
        const contentType = String(rec.contentType ?? "")
        const isInline = rec.isInline === true
        if (!keepPartnerAttachment({ name, contentType, isInline })) continue
        const b64 = rec.contentBytes
        if (typeof b64 !== "string" || !b64) continue
        out.push({
          id: String(rec.id ?? name),
          name,
          contentType,
          isInline,
          bytes: Buffer.from(b64, "base64"),
        })
      }
      return out
    },

    async moveMessage(messageId, folder) {
      if (!MOVE_FOLDERS.includes(folder)) {
        throw new Error(`unknown mailbox folder ${folder}`)
      }
      const destinationId = await ensureFolderId(folder)
      const token = await input.getToken()
      await graphJson(
        input.transport,
        token,
        "POST",
        `${GRAPH}/users/${encodeURIComponent(user)}/messages/${encodeURIComponent(messageId)}/move`,
        { destinationId }
      )
    },
  }
}

export function partnerIngestMailboxFromEnv(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env
): string {
  return env.PARTNER_INGEST_MAILBOX?.trim() || DEFAULT_PARTNER_INGEST_MAILBOX
}
