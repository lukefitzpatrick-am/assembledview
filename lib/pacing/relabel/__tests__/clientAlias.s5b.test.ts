/**
 * S5b (C-388): the "Save as a client alias" tick through the relabel preview
 * and apply handlers. The warehouse and database are injected.
 */
import assert from "node:assert/strict"
import test from "node:test"

import { setFeatureRowReaderForTests } from "../../../features/server.js"
import { defaultRelabelHandlerDeps, runRelabelApply, runRelabelPreview, type RelabelHandlerDeps } from "../handlers.js"
import type { ClientAliasOffer, RelabelPreview } from "../shared/types.js"

const STAFF = "staff@assembledmedia.com.au"

const PREVIEW: RelabelPreview = {
  channel: "Social - Meta",
  platformEntityId: "120200001",
  entityName: "SA Awareness",
  lineItemId: "pgaaus015sm3",
  mbaNumber: "pgaaus015",
  dateFrom: null,
  dateTo: null,
  cardChannel: "social",
  targetCardChannel: "social",
  moves: [],
  rowsMoving: 3,
  spendMoving: 10,
  daysMoving: 3,
  warnings: [],
  blocks: [],
  state: "apply",
  duplicateOldNameDays: [],
  activeMap: null,
  publishedLine: null,
}

const OFFER: ClientAliasOffer = { campaignName: "PGA_AU_2026", clientId: 7, clientName: "PGA", refusal: null }

type Calls = { applied: number; saved: Array<[number, string]>; blocked: number; offers: number }

function deps(opts: {
  on?: boolean
  offer?: ClientAliasOffer | (() => Promise<ClientAliasOffer>)
  save?: () => Promise<boolean>
  preview?: Partial<RelabelPreview>
  withAlias?: boolean
} = {}): { deps: RelabelHandlerDeps; calls: Calls } {
  const calls: Calls = { applied: 0, saved: [], blocked: 0, offers: 0 }
  const preview = { ...PREVIEW, ...opts.preview }
  const d = {
    previewRelabel: async () => preview,
    applyRelabel: async () => {
      calls.applied += 1
      return { relabelId: 5, rowsUpdated: 3, rowsDeleted: 0, mapInserted: true, beforeState: {} }
    },
    insertLog: async () => {},
    insertBlocked: async () => {
      calls.blocked += 1
      return { id: 6 }
    },
    assertRelabelTablesAvailable: async () => {},
    lookupPublishedLine: async () => null,
    query: async () => [],
    notify: async () => {},
    notifyIo: { createTask: async () => ({ id: 1 }), sendHtmlEmail: async () => {} },
    ...(opts.withAlias === false
      ? {}
      : {
          clientAlias: {
            isOn: async () => opts.on ?? true,
            loadOffer: async () => {
              calls.offers += 1
              const o = opts.offer ?? OFFER
              return typeof o === "function" ? o() : o
            },
            save: async (clientId: number, alias: string) => {
              calls.saved.push([clientId, alias])
              return opts.save ? opts.save() : true
            },
          },
        }),
  } as unknown as RelabelHandlerDeps
  return { deps: d, calls }
}

const ARGS = { channel: "Social - Meta", platformEntityId: "120200001", lineItemId: "pgaaus015sm3", reason: "supplier code" }

test("preview: switch on carries the offer; switch off answers exactly as before", async () => {
  const on = await runRelabelPreview(ARGS, STAFF, deps().deps)
  assert.deepEqual(await on.json(), JSON.parse(JSON.stringify({ preview: PREVIEW, clientAlias: OFFER })))

  const off = deps({ on: false })
  const res = await runRelabelPreview(ARGS, STAFF, off.deps)
  assert.equal(await res.text(), JSON.stringify({ preview: PREVIEW }))
  assert.equal(off.calls.offers, 0)
})

test("preview: a failed offer read is a refused offer, never a failed preview", async () => {
  const res = await runRelabelPreview(
    ARGS,
    STAFF,
    deps({ offer: async () => Promise.reject(new Error("snowflake down")) }).deps,
  )
  assert.equal(res.status, 200)
  const body = (await res.json()) as { clientAlias: ClientAliasOffer }
  assert.equal(body.clientAlias.clientId, null)
  assert.match(body.clientAlias.refusal ?? "", /Could not check this name/)
})

test("apply: an offer that cannot be checked (warehouse down) refuses the alias before any write", async () => {
  const { deps: d, calls } = deps({ offer: async () => Promise.reject(new Error("snowflake down")) })
  const res = await runRelabelApply({ ...ARGS, saveClientAlias: true }, STAFF, d)
  assert.equal(res.status, 400)
  assert.equal(((await res.json()) as { error: string }).error, "alias_refused")
  assert.equal(calls.applied, 0)
  assert.deepEqual(calls.saved, [])
})

test("apply with the tick: relabel applied, then the warehouse campaign name saved for the plan's client", async () => {
  const { deps: d, calls } = deps()
  const res = await runRelabelApply({ ...ARGS, saveClientAlias: true }, STAFF, d)
  assert.equal(res.status, 200)
  assert.equal(calls.applied, 1)
  assert.deepEqual(calls.saved, [[7, "PGA_AU_2026"]])
  const body = (await res.json()) as { clientAlias: unknown }
  assert.deepEqual(body.clientAlias, { saved: true, alias: "PGA_AU_2026", clientName: "PGA" })
})

test("apply with a refused alias: 400 on the field, nothing applied or saved", async () => {
  for (const offer of [
    { ...OFFER, refusal: '"Prospecting" has no digit or separator.' },
    { ...OFFER, refusal: '"PGA_AU_2026" is already another client\'s alias.' },
    { ...OFFER, clientId: null, refusal: null },
  ]) {
    const { deps: d, calls } = deps({ offer })
    const res = await runRelabelApply({ ...ARGS, saveClientAlias: true }, STAFF, d)
    assert.equal(res.status, 400)
    const body = (await res.json()) as { error: string; field: string; message: string }
    assert.equal(body.error, "alias_refused")
    assert.equal(body.field, "saveClientAlias")
    assert.ok(body.message.length > 0)
    assert.equal(calls.applied, 0)
    assert.deepEqual(calls.saved, [])
  }
})

test("apply: a save that loses a race or throws leaves the relabel applied and says so", async () => {
  const lost = deps({ save: async () => false })
  const a = await runRelabelApply({ ...ARGS, saveClientAlias: true }, STAFF, lost.deps)
  assert.equal(a.status, 200)
  assert.equal(lost.calls.applied, 1)
  assert.equal(((await a.json()) as { clientAlias: { saved: boolean } }).clientAlias.saved, false)

  const threw = deps({ save: async () => Promise.reject(new Error("db down")) })
  const b = await runRelabelApply({ ...ARGS, saveClientAlias: true }, STAFF, threw.deps)
  assert.equal(b.status, 200)
  assert.equal(threw.calls.applied, 1)
  assert.equal(((await b.json()) as { clientAlias: { saved: boolean } }).clientAlias.saved, false)
})

test("apply: switch off, no tick, or a save-as-request ignores the alias and answers as before", async () => {
  for (const [args, opts] of [
    [{ ...ARGS, saveClientAlias: true }, { on: false }],
    [{ ...ARGS, saveClientAlias: true }, { withAlias: false }],
    [ARGS, {}],
  ] as const) {
    const { deps: d, calls } = deps(opts)
    const res = await runRelabelApply(args, STAFF, d)
    const body = (await res.json()) as Record<string, unknown>
    assert.deepEqual(Object.keys(body).sort(), ["preview", "result"])
    assert.equal(calls.offers, 0)
    assert.deepEqual(calls.saved, [])
  }
  const req = deps()
  const res = await runRelabelApply({ ...ARGS, saveClientAlias: true, saveAsRequest: true }, STAFF, req.deps)
  assert.equal(res.status, 200)
  assert.equal(req.calls.blocked, 1)
  assert.equal(req.calls.applied, 0)
  assert.equal(req.calls.offers, 0)
  assert.deepEqual(req.calls.saved, [])
})

test("S5c: the live tick needs client_alias_on_relabel on top of the unmatched delivery queue", async () => {
  const on = async (keys: string[]) => {
    setFeatureRowReaderForTests(
      async () => new Map(keys.map((key) => [key, { key, enabled: true, updatedAt: null, updatedBy: null, updatedByName: null, note: null }])),
    )
    return defaultRelabelHandlerDeps().clientAlias!.isOn()
  }
  try {
    assert.equal(await on(["unmapped_delivery", "unmatched_delivery_queue"]), false)
    assert.equal(await on(["unmapped_delivery", "client_alias_on_relabel"]), false)
    assert.equal(await on(["unmapped_delivery", "unmatched_delivery_queue", "client_alias_on_relabel"]), true)
  } finally {
    setFeatureRowReaderForTests(null)
  }
})
