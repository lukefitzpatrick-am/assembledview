import assert from "node:assert/strict"
import test from "node:test"

import { keepPartnerAttachment } from "../keepAttachment"
import { partnerSourceFile } from "../sourceFile"
import {
  createPartnerGraphToken,
  partnerIngestGraphCredentialsFromEnv,
} from "../graphToken"
import { createPartnerMailbox } from "../mailbox"
import type { GraphTransport } from "@/lib/m365/graphTransport"

test("keeps workbook attachments and skips inline images", () => {
  assert.equal(keepPartnerAttachment({ name: "a.xlsx", isInline: false }), true)
  assert.equal(keepPartnerAttachment({ name: "a.csv", isInline: false }), true)
  assert.equal(keepPartnerAttachment({ name: "a.zip", isInline: false }), true)
  assert.equal(keepPartnerAttachment({ name: "logo.png", contentType: "image/png" }), false)
  assert.equal(keepPartnerAttachment({ name: "a.xlsx", isInline: true }), false)
})

test("SOURCE_FILE uses slug/date/id_name", () => {
  assert.equal(
    partnerSourceFile({
      sourceSlug: "channel-factory",
      receivedAt: "2026-09-14T08:06:00Z",
      internetMessageId: "<abc@datorama.com>",
      attachmentName: "Report.xlsx",
    }),
    "channel-factory/2026-09-14/abc@datorama.com_Report.xlsx"
  )
})

test("graph credentials come from PARTNER_INGEST_* and not M365_*", () => {
  const creds = partnerIngestGraphCredentialsFromEnv({
    PARTNER_INGEST_TENANT_ID: "tenant-a",
    PARTNER_INGEST_CLIENT_ID: "client-a",
    PARTNER_INGEST_CLIENT_SECRET: "secret-a",
    M365_TENANT_ID: "wrong-tenant",
    M365_CLIENT_ID: "wrong-client",
    M365_CLIENT_SECRET: "wrong-secret",
  })
  assert.deepEqual(creds, {
    tenantId: "tenant-a",
    clientId: "client-a",
    clientSecret: "secret-a",
  })
  assert.throws(
    () => partnerIngestGraphCredentialsFromEnv({}),
    /PARTNER_INGEST_TENANT_ID/
  )
})

test("graph token caches with 60s skew and does not use the provisioning flag", async () => {
  let posts = 0
  const transport: GraphTransport = async () => {
    posts += 1
    return {
      status: 200,
      headers: {},
      bodyText: JSON.stringify({ access_token: "tok", expires_in: 90 }),
    }
  }
  let now = 0
  const getToken = createPartnerGraphToken({
    credentials: { tenantId: "t", clientId: "c", clientSecret: "s" },
    transport,
    now: () => now,
  })
  assert.equal(await getToken(), "tok")
  now = 20_000
  assert.equal(await getToken(), "tok")
  assert.equal(posts, 1)
  now = 31_000
  assert.equal(await getToken(), "tok")
  assert.equal(posts, 2)
})

test("mailbox lists oldest-first inbox mail and moves with POST, never DELETE", async () => {
  const calls: { method: string; url: string }[] = []
  const transport: GraphTransport = async (req) => {
    calls.push({ method: req.method, url: req.url })
    if (req.url.includes("/oauth2/")) {
      return { status: 200, headers: {}, bodyText: "{}" }
    }
    if (req.url.includes("/mailFolders/inbox/messages")) {
      return {
        status: 200,
        headers: {},
        bodyText: JSON.stringify({
          value: [
            {
              id: "m1",
              internetMessageId: "<id>",
              receivedDateTime: "2026-09-14T08:00:00Z",
              from: { emailAddress: { address: "noreply@datorama.com" } },
              subject: "Datorama Report 1248052",
            },
          ],
        }),
      }
    }
    if (req.url.endsWith("/attachments")) {
      return {
        status: 200,
        headers: {},
        bodyText: JSON.stringify({
          value: [
            {
              id: "a1",
              name: "logo.png",
              contentType: "image/png",
              isInline: false,
              contentBytes: "aaaa",
            },
            {
              id: "a2",
              name: "cf.xlsx",
              contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
              isInline: false,
              contentBytes: Buffer.from("xlsx").toString("base64"),
            },
          ],
        }),
      }
    }
    if (req.url.includes("/mailFolders?") && req.method === "GET") {
      return {
        status: 200,
        headers: {},
        bodyText: JSON.stringify({
          value: [{ id: "folder-processed", displayName: "Processed" }],
        }),
      }
    }
    if (req.url.endsWith("/move")) {
      return { status: 200, headers: {}, bodyText: JSON.stringify({ id: "m1" }) }
    }
    return { status: 404, headers: {}, bodyText: "no" }
  }

  const box = createPartnerMailbox({
    mailbox: "snowflake@assembledview.com.au",
    transport,
    getToken: async () => "tok",
  })
  const messages = await box.listInboxMessages()
  assert.equal(messages[0]?.subject.includes("1248052"), true)
  assert.match(calls[0]?.url ?? "", /receivedDateTime%20asc/)
  const atts = await box.getAttachments("m1")
  assert.equal(atts.length, 1)
  assert.equal(atts[0]?.name, "cf.xlsx")
  await box.moveMessage("m1", "Processed")
  assert.equal(calls.some((c) => c.method === "DELETE"), false)
  assert.equal(calls.some((c) => c.method === "POST" && c.url.endsWith("/move")), true)
})
