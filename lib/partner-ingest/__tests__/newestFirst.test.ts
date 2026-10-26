import assert from "node:assert/strict"
import test from "node:test"

import ExcelJS from "exceljs"

import type { GraphTransport } from "@/lib/m365/graphTransport"

import { CHANNEL_FACTORY_EXPECTED_HEADER } from "../columnNames"
import { createPartnerMailbox } from "../mailbox"
import { planPartnerIngest, runPartnerIngest } from "../runPartnerIngest"
import type {
  PartnerIngestLogRow,
  PartnerMailboxPort,
  PartnerMailMessage,
  PartnerSnowflakePort,
} from "../runPartnerIngest"
import type { PartnerSourceMapRow } from "../types"

const CF_MAP: PartnerSourceMapRow = {
  senderDomain: "datorama.com",
  subjectPattern: "%1248052%",
  sourceSlug: "channel-factory",
  sourceLabel: "Channel Factory",
  isActive: true,
  expectedHeader: CHANNEL_FACTORY_EXPECTED_HEADER,
  headerRowHint: 5,
  maxStaleDays: 3,
  loadMode: "range_replace",
}

const VISTAR_MAP: PartnerSourceMapRow = {
  senderDomain: "vistarmedia.com",
  subjectPattern: "%Vistar Scheduled Report%Snowflake Report%",
  sourceSlug: "vistar",
  sourceLabel: "Vistar",
  isActive: true,
  expectedHeader: null,
  headerRowHint: null,
  maxStaleDays: 2,
  loadMode: "range_replace",
}

function cf(day: number): PartnerMailMessage {
  return {
    id: `cf-${day}`,
    internetMessageId: `<cf-${day}@datorama.com>`,
    receivedDateTime: `2026-10-${day}T22:06:00Z`,
    senderAddress: "noreply@datorama.com",
    subject: "Datorama Report 1248052 Channel Factory",
  }
}

function vistar(day: number): PartnerMailMessage {
  return {
    id: `v-${day}`,
    internetMessageId: `<v-${day}@vistarmedia.com>`,
    receivedDateTime: `2026-10-${day}T22:01:00Z`,
    senderAddress: "reports@vistarmedia.com",
    subject: "Vistar Scheduled Report: Snowflake Report",
  }
}

async function cfWorkbook(days: string[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet("Report")
  ws.addRow(["Datorama"])
  ws.addRow(["Report 1248052"])
  ws.addRow(["Channel Factory"])
  ws.addRow(["Generated"])
  ws.addRow(CHANNEL_FACTORY_EXPECTED_HEADER.split("|"))
  for (const day of days) {
    ws.addRow([day, "adv-1", "Camp", "CF12_AT1_P18-99_Hero_BICAU002PV4", 1000, 1, 600, 0.9, 0.8, 0.7, 0.6])
  }
  return Buffer.from(await wb.xlsx.writeBuffer())
}

function stubStore(map: PartnerSourceMapRow[] = [CF_MAP]): PartnerSnowflakePort & {
  logs: PartnerIngestLogRow[]
  loads: { source: string; minDate: string; maxDate: string; sourceFile: string }[]
} {
  const logs: PartnerIngestLogRow[] = []
  const loads: { source: string; minDate: string; maxDate: string; sourceFile: string }[] = []
  return {
    logs,
    loads,
    async loadSourceMap() {
      return map
    },
    async hasLoadedDuplicate() {
      return false
    },
    async insertRawLines() {},
    async writeLoadAndLog(input) {
      if (input.load) {
        loads.push({
          source: input.load.source,
          minDate: input.load.minDate,
          maxDate: input.load.maxDate,
          sourceFile: input.load.sourceFile,
        })
      }
      logs.push(input.log)
    },
  }
}

function stubInbox(
  messages: PartnerMailMessage[],
  files: Record<string, Buffer>
): PartnerMailboxPort & { fetched: string[]; moves: Array<[string, string]> } {
  const fetched: string[] = []
  const moves: Array<[string, string]> = []
  return {
    fetched,
    moves,
    async listInboxMessages() {
      return messages
    },
    async getAttachments(id) {
      fetched.push(id)
      const bytes = files[id]
      if (!bytes) return []
      return [
        {
          id: `${id}-att`,
          name: "Automated Client Report  Assembled Media VIC Campaigns.xlsx",
          contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          isInline: false,
          bytes,
        },
      ]
    },
    async moveMessage(id, folder) {
      moves.push([id, folder])
    },
  }
}

test("plan: pending mail is grouped per source, newest first", () => {
  const plan = planPartnerIngest(
    [cf(22), vistar(24), cf(25), vistar(23), cf(23), cf(24)],
    [CF_MAP, VISTAR_MAP]
  )
  assert.deepEqual(
    plan.groups.map((g) => [g.source.sourceSlug, g.messages.map((m) => m.id)]),
    [
      ["channel-factory", ["cf-25", "cf-24", "cf-23", "cf-22"]],
      ["vistar", ["v-24", "v-23"]],
    ]
  )
  assert.equal(plan.unrecognised.length, 0)
})

test("only the newest file per source is parsed and loaded; older ones are superseded", async () => {
  const files = {
    "cf-22": await cfWorkbook(["2026-10-01", "2026-10-21"]),
    "cf-23": await cfWorkbook(["2026-10-01", "2026-10-22"]),
    "cf-24": await cfWorkbook(["2026-10-01", "2026-10-23"]),
  }
  const box = stubInbox([cf(22), cf(24), cf(23)], files)
  const sf = stubStore()
  const summary = await runPartnerIngest({ mailbox: box, snowflake: sf })

  assert.deepEqual(box.fetched, ["cf-24"])
  assert.equal(sf.loads.length, 1)
  assert.equal(sf.loads[0]?.maxDate, "2026-10-23")
  assert.equal(summary.loaded, 1)
  assert.equal(summary.superseded, 2)
  assert.equal(summary.deferred, 0)

  const superseded = sf.logs.filter((l) => l.status === "superseded")
  assert.deepEqual(
    superseded.map((l) => l.internetMessageId),
    ["<cf-23@datorama.com>", "<cf-22@datorama.com>"]
  )
  for (const row of superseded) {
    assert.equal(row.sourceSlug, "channel-factory")
    assert.equal(row.parsedRowCount, 0)
    assert.match(row.errorText ?? "", /^superseded by <cf-24@datorama\.com> received 2026-10-24T22:06:00Z$/)
  }
  assert.deepEqual(box.moves, [
    ["cf-24", "Processed"],
    ["cf-23", "Superseded"],
    ["cf-22", "Superseded"],
  ])
})

test("if the newest file fails, the next newest loads and the rest are superseded", async () => {
  const files = {
    "cf-22": await cfWorkbook(["2026-10-21"]),
    "cf-23": await cfWorkbook(["2026-10-22"]),
    "cf-24": Buffer.from("not a workbook"),
  }
  const box = stubInbox([cf(22), cf(23), cf(24)], files)
  const sf = stubStore()
  const summary = await runPartnerIngest({ mailbox: box, snowflake: sf })

  assert.deepEqual(box.fetched, ["cf-24", "cf-23"])
  assert.equal(summary.failed, 1)
  assert.equal(summary.loaded, 1)
  assert.equal(summary.superseded, 1)
  assert.equal(sf.loads[0]?.maxDate, "2026-10-22")
  assert.deepEqual(box.moves, [
    ["cf-24", "Failed"],
    ["cf-23", "Processed"],
    ["cf-22", "Superseded"],
  ])
})

test("superseding is not cut off by the budget once the newest has loaded", async () => {
  const files = { "cf-24": await cfWorkbook(["2026-10-23"]) }
  const box = stubInbox([cf(22), cf(23), cf(24)], files)
  const sf = stubStore()
  let clock = 0
  const summary = await runPartnerIngest({
    mailbox: box,
    snowflake: sf,
    deadlineAt: 100,
    // The first check passes, then the load uses the whole budget.
    now: () => {
      const at = clock
      clock += 200
      return at
    },
  })
  assert.equal(summary.loaded, 1)
  assert.equal(summary.superseded, 2)
  assert.equal(summary.deferred, 0)
  assert.deepEqual(box.fetched, ["cf-24"])
})

test("each source keeps its own newest file", async () => {
  const files = {
    "cf-23": await cfWorkbook(["2026-10-22"]),
    "cf-24": await cfWorkbook(["2026-10-23"]),
  }
  // Vistar messages have no attachment here, so nothing lands for Vistar and
  // none of its mail is superseded.
  const box = stubInbox([cf(23), vistar(23), cf(24), vistar(24)], files)
  const sf = stubStore([CF_MAP, VISTAR_MAP])
  const summary = await runPartnerIngest({ mailbox: box, snowflake: sf })
  assert.equal(summary.superseded, 1)
  assert.deepEqual(box.fetched, ["cf-24", "v-24", "v-23"])
  assert.equal(sf.logs.filter((l) => l.status === "superseded" && l.sourceSlug === "vistar").length, 0)
})

test("a full run over Graph moves mail and never deletes it, across inbox pages", async () => {
  const calls: { method: string; url: string; body: string | null }[] = []
  const workbook = (await cfWorkbook(["2026-10-23"])).toString("base64")
  const graphMessage = (m: PartnerMailMessage) => ({
    id: m.id,
    internetMessageId: m.internetMessageId,
    receivedDateTime: m.receivedDateTime,
    from: { emailAddress: { address: m.senderAddress } },
    subject: m.subject,
  })
  const transport: GraphTransport = async (req) => {
    calls.push({ method: req.method, url: req.url, body: req.body ?? null })
    const ok = (json: unknown) => ({ status: 200, headers: {}, bodyText: JSON.stringify(json) })
    if (req.url.includes("/mailFolders/inbox/messages") && !req.url.includes("page=2")) {
      return ok({
        value: [graphMessage(cf(22)), graphMessage(cf(24))],
        "@odata.nextLink": "https://graph.example/users/x/mailFolders/inbox/messages?page=2",
      })
    }
    if (req.url.includes("page=2")) {
      return ok({ value: [graphMessage(cf(23))] })
    }
    if (req.url.endsWith("/attachments")) {
      return ok({
        value: [
          {
            id: "a1",
            name: "cf.xlsx",
            contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            isInline: false,
            contentBytes: workbook,
          },
        ],
      })
    }
    if (req.url.includes("/mailFolders?") && req.method === "GET") {
      return ok({ value: [{ id: "folder-processed", displayName: "Processed" }] })
    }
    if (req.url.endsWith("/mailFolders") && req.method === "POST") {
      return ok({ id: "folder-superseded" })
    }
    if (req.url.endsWith("/move")) return ok({ id: "moved" })
    return { status: 404, headers: {}, bodyText: "no" }
  }
  const box = createPartnerMailbox({
    mailbox: "snowflake@assembledview.com.au",
    transport,
    getToken: async () => "tok",
  })
  const sf = stubStore()
  const summary = await runPartnerIngest({ mailbox: box, snowflake: sf })

  assert.equal(summary.loaded, 1)
  assert.equal(summary.superseded, 2)
  assert.equal(calls.some((c) => c.method === "DELETE"), false)
  assert.equal(calls.some((c) => /\/delete$|permanentDelete/i.test(c.url)), false)
  const attachmentFetches = calls.filter((c) => c.url.endsWith("/attachments"))
  assert.equal(attachmentFetches.length, 1)
  assert.match(attachmentFetches[0]?.url ?? "", /cf-24/)
  const moves = calls.filter((c) => c.url.endsWith("/move"))
  assert.equal(moves.length, 3)
  assert.ok(moves.every((c) => c.method === "POST"))
  assert.equal(moves.filter((c) => (c.body ?? "").includes("folder-superseded")).length, 2)
})
