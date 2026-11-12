/**
 * B34: applyRelabel and revertRelabel run their label map writes through
 * labelMapActive, in the Snowflake transaction, and turn a second active row
 * into a 409-style "conflict" (rolled back) when the switch is on.
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"

import { mockModuleSkip, supportsMockModule } from "../../../test/mockModuleHarness.js"
import type { DeliveryRelabelRow, RelabelPreview } from "../shared/types.js"
import { LabelMapSim, type SimTx } from "./labelMapSim.js"

const skip = mockModuleSkip()

const CH = "Social - Meta"
const PID = "120250169080330224"

let sim = new LabelMapSim()
let tx: SimTx | null = null
let txLog: string[] = []
/** Runs right after the map INSERT, inside the open transaction. */
let afterInsert: (() => void) | null = null
let switchOn = false
/** The switch read throws (feature_switches unreadable). */
let switchThrows = false
let relabelRow: DeliveryRelabelRow | null = null
const reverted: number[] = []

function isMapSql(sqlText: string) {
  return sqlText.includes("LINE_ITEM_LABEL_MAP") && !/^\s*SELECT\s+CHANNEL,/m.test(sqlText)
}

if (supportsMockModule()) {
  await mock.module!("@/lib/snowflake/snowflakeSession", {
    namedExports: {
      withSnowflakeSession: async (fn: (c: unknown) => Promise<unknown>) => fn({}),
      sessionExecuteVoid: async (_c: unknown, sqlText: string, binds: unknown[] = []) => {
        const s = sqlText.trim()
        if (s === "BEGIN") {
          tx = sim.begin()
          txLog.push("BEGIN")
          return
        }
        if (s === "COMMIT") {
          tx!.commit()
          txLog.push("COMMIT")
          return
        }
        if (s === "ROLLBACK") {
          tx!.rollback()
          txLog.push("ROLLBACK")
          return
        }
        if (isMapSql(sqlText)) {
          await tx!.sql.exec(sqlText, binds)
          if (/INSERT INTO/.test(sqlText) && afterInsert) afterInsert()
        }
      },
      sessionExecuteRows: async (_c: unknown, sqlText: string, binds: unknown[] = []) => {
        if (/COUNT\(\*\) AS ACTIVE_ROWS/.test(sqlText)) return tx!.sql.rows(sqlText, binds)
        if (/ROWS_UPDATED/.test(sqlText)) return [{ ROWS_UPDATED: 3 }]
        return []
      },
    },
  })
  await mock.module!("@/lib/pacing/relabel/repo", {
    namedExports: {
      assertRelabelTablesAvailable: async () => {},
      insertRelabelApply: async () => ({ id: 41 }),
      getRelabel: async () => relabelRow,
      markRelabelReverted: async (id: number) => {
        reverted.push(id)
      },
    },
  })
  await mock.module!("@/lib/features/server", {
    namedExports: {
      isFeatureOn: async (key: string) => {
        assert.equal(key, "relabel_map_one_active_guard")
        if (switchThrows) throw new Error("feature_switches unreadable")
        return switchOn
      },
    },
  })
}

function reset() {
  sim = new LabelMapSim()
  tx = null
  txLog = []
  afterInsert = null
  switchOn = false
  switchThrows = false
  relabelRow = null
  reverted.length = 0
}

function preview(): RelabelPreview {
  return {
    channel: CH,
    platformEntityId: PID,
    entityName: "INTEREST-TAS-P35+-jayco017SM4",
    lineItemId: "jayco017sm6",
    mbaNumber: "jayco017",
    dateFrom: null,
    dateTo: null,
    cardChannel: "social",
    targetCardChannel: "social",
    moves: [{ previousLineItemId: "jayco017sm4", dateFrom: "2026-10-01", dateTo: "2026-10-09", dayCount: 9, spend: 10, impressions: 100, rows: 3 }],
    rowsMoving: 3,
    spendMoving: 10,
    daysMoving: 9,
    warnings: [],
    blocks: [],
    state: "apply",
    duplicateOldNameDays: [],
    activeMap: null,
    publishedLine: null,
  } as unknown as RelabelPreview
}

function seed(lineItemId: string, active: boolean) {
  return sim.seed({ channel: CH, platformId: PID, lineItemId, lineItemName: "x", mbaNumber: "jayco017", notes: "seed", active })
}

const OPTS = { reason: "fix", actorEmail: "staff@example.com", now: new Date("2026-11-13T00:00:00Z") }

test("apply: one active row afterwards, committed", { skip }, async () => {
  reset()
  seed("jayco017sm4", true)
  const { applyRelabel } = await import("../apply.js")
  const out = await applyRelabel(preview(), OPTS)
  assert.equal(out.relabelId, 41)
  assert.deepEqual(txLog, ["BEGIN", "COMMIT"])
  assert.deepEqual(sim.activeFor(CH, PID).map((r) => r.lineItemId), ["jayco017sm6"])
})

test("apply: a row committed by another write mid-transaction is refused with the switch on", { skip }, async () => {
  reset()
  seed("jayco017sm4", true)
  switchOn = true
  afterInsert = () => {
    seed("jayco017sm7", true)
  }
  const { applyRelabel } = await import("../apply.js")
  const { RelabelApplyError } = await import("../applyGuard.js")
  await assert.rejects(applyRelabel(preview(), OPTS), (err: unknown) => {
    assert.ok(err instanceof RelabelApplyError)
    assert.equal(err.code, "conflict")
    assert.match(err.message, /Reload and try again/)
    return true
  })
  assert.deepEqual(txLog, ["BEGIN", "ROLLBACK"])
  assert.deepEqual(sim.activeFor(CH, PID).map((r) => r.lineItemId).sort(), ["jayco017sm4", "jayco017sm7"])
})

test("apply: same race with the switch off commits and logs (unchanged behaviour)", { skip }, async () => {
  reset()
  seed("jayco017sm4", true)
  afterInsert = () => {
    seed("jayco017sm7", true)
  }
  const warn = console.warn
  const seen: string[] = []
  console.warn = (...a: unknown[]) => void seen.push(a.map(String).join(" "))
  try {
    const { applyRelabel } = await import("../apply.js")
    await applyRelabel(preview(), OPTS)
  } finally {
    console.warn = warn
  }
  assert.deepEqual(txLog, ["BEGIN", "COMMIT"])
  assert.ok(seen.some((s) => s.includes("relabel_label_map_second_active_row")))
})

function appliedRow(priorLine: string | null): DeliveryRelabelRow {
  return {
    id: 7,
    channel: CH,
    platformEntityId: PID,
    entityName: "x",
    fromLineItemId: "jayco017sm4",
    toLineItemId: "jayco017sm6",
    mbaNumber: "jayco017",
    dateFrom: null,
    dateTo: null,
    reason: "fix",
    actorEmail: "staff@example.com",
    status: "applied",
    beforeState: {
      channel: CH,
      platformEntityId: PID,
      entityName: "x",
      lineItemId: "jayco017sm6",
      dateFrom: null,
      dateTo: null,
      previousByRange: [],
      priorActiveMap: priorLine
        ? { channel: CH, platformLineItemId: PID, lineItemId: priorLine, lineItemName: "x", mbaNumber: "jayco017", notes: "old" }
        : null,
      deletedDuplicateRows: [],
    },
    applyResult: null,
    createdAt: "2026-11-12T00:00:00.000Z",
    revertedAt: null,
    revertedByEmail: null,
  }
}

test("revert: restores the prior line as one new row; history copies stay inactive", { skip }, async () => {
  reset()
  const h1 = seed("jayco017sm4", false)
  const h2 = seed("jayco017sm4", false)
  seed("jayco017sm6", true)
  relabelRow = appliedRow("jayco017sm4")
  const { revertRelabel } = await import("../revert.js")
  const out = await revertRelabel(7, "staff@example.com", new Date("2026-11-13T00:00:00Z"))
  assert.equal(out.mapRestored, true)
  assert.deepEqual(txLog, ["BEGIN", "COMMIT"])
  const active = sim.activeFor(CH, PID)
  assert.deepEqual(active.map((r) => r.lineItemId), ["jayco017sm4"])
  assert.match(active[0]!.notes ?? "", /^old \| restored by revert of relabel 7 \| staff@example\.com \| 2026-11-13T00:00:00\.000Z$/)
  assert.equal(h1.active, false)
  assert.equal(h2.active, false)
  assert.deepEqual(reverted, [7])
})

test("revert: a later relabel's active row is kept and nothing is restored", { skip }, async () => {
  reset()
  seed("jayco017sm4", false)
  seed("jayco017sm6", false)
  seed("jayco017sm7", true)
  relabelRow = appliedRow("jayco017sm4")
  const { revertRelabel } = await import("../revert.js")
  const warn = console.warn
  console.warn = () => {}
  let out
  try {
    out = await revertRelabel(7, "staff@example.com", new Date("2026-11-13T00:00:00Z"))
  } finally {
    console.warn = warn
  }
  assert.equal(out.mapRestored, false)
  assert.deepEqual(sim.activeFor(CH, PID).map((r) => r.lineItemId), ["jayco017sm7"])
})

test("revert: a racing write is refused as conflict with the switch on", { skip }, async () => {
  reset()
  seed("jayco017sm4", false)
  seed("jayco017sm6", true)
  relabelRow = appliedRow("jayco017sm4")
  switchOn = true
  afterInsert = () => {
    seed("jayco017sm9", true)
  }
  const { revertRelabel, RelabelRevertError } = await import("../revert.js")
  await assert.rejects(revertRelabel(7, "staff@example.com", new Date("2026-11-13T00:00:00Z")), (err: unknown) => {
    assert.ok(err instanceof RelabelRevertError)
    assert.equal(err.code, "conflict")
    return true
  })
  assert.deepEqual(txLog, ["BEGIN", "ROLLBACK"])
  assert.deepEqual(reverted, [], "the log row is not marked reverted")
})

// --- B34fix: the review's surviving mutants R7 and R8 -----------------------

async function captureWarnings<T>(fn: () => Promise<T>): Promise<{ out: T; seen: string[] }> {
  const warn = console.warn
  const seen: string[] = []
  console.warn = (...a: unknown[]) => void seen.push(a.map(String).join(" "))
  try {
    return { out: await fn(), seen }
  } finally {
    console.warn = warn
  }
}

test("switch reader: a failed read is off, logged; a row on is on", { skip }, async () => {
  reset()
  const { readRelabelMapOneActiveGuard } = await import("../labelMapSession.js")
  switchThrows = true
  const { out, seen } = await captureWarnings(() => readRelabelMapOneActiveGuard())
  assert.equal(out, false)
  assert.ok(seen.some((s) => s.includes("relabel_map_one_active_guard read failed; treating as off")))
  switchThrows = false
  switchOn = true
  assert.equal(await readRelabelMapOneActiveGuard(), true)
  switchOn = false
  assert.equal(await readRelabelMapOneActiveGuard(), false)
})

test("apply: a race with a failed switch read commits and logs (off), not refused", { skip }, async () => {
  reset()
  seed("jayco017sm4", true)
  switchThrows = true
  afterInsert = () => {
    seed("jayco017sm7", true)
  }
  const { applyRelabel } = await import("../apply.js")
  const { out, seen } = await captureWarnings(() => applyRelabel(preview(), OPTS))
  assert.equal(out.relabelId, 41)
  assert.deepEqual(txLog, ["BEGIN", "COMMIT"])
  assert.ok(seen.some((s) => s.includes("relabel_label_map_second_active_row")))
})

test("revert: a racing write with the switch off commits, logs and marks the relabel reverted", { skip }, async () => {
  reset()
  seed("jayco017sm4", false)
  seed("jayco017sm6", true)
  relabelRow = appliedRow("jayco017sm4")
  afterInsert = () => {
    seed("jayco017sm9", true)
  }
  const { revertRelabel } = await import("../revert.js")
  const { out, seen } = await captureWarnings(() =>
    revertRelabel(7, "staff@example.com", new Date("2026-11-13T00:00:00Z")),
  )
  assert.equal(out.mapRestored, true)
  assert.deepEqual(txLog, ["BEGIN", "COMMIT"])
  assert.deepEqual(reverted, [7])
  const second = seen.find((s) => s.includes("relabel_label_map_second_active_row"))
  assert.ok(second, "the second active row is logged")
  assert.equal(JSON.parse(second!).activeRows, 2)
  assert.deepEqual(sim.activeFor(CH, PID).map((r) => r.lineItemId).sort(), ["jayco017sm4", "jayco017sm9"])
})
