/** B34: the app never leaves a second active LINE_ITEM_LABEL_MAP row for one key. */
import assert from "node:assert/strict"
import test from "node:test"

import {
  LABEL_MAP_COUNT_ACTIVE_SQL,
  LABEL_MAP_DEACTIVATE_KEY_SQL,
  LABEL_MAP_DUPLICATE_ACTIVE_KEYS_SQL,
  LabelMapSecondActiveRowError,
  labelMapDuplicateKeysFromRows,
  replaceActiveLabelMapRow,
  restorePriorLabelMapRow,
  type LabelMapRowValues,
} from "../labelMapActive.js"
import { LabelMapSim } from "./labelMapSim.js"

const CH = "Ad Serving - CM360"
const PID = "bic-7plus-bvod-1920x1080--30sec"

function values(lineItemId: string, partial: Partial<LabelMapRowValues> = {}): LabelMapRowValues {
  return {
    channel: CH,
    platformEntityId: PID,
    lineItemId,
    lineItemName: PID,
    mbaNumber: lineItemId.slice(0, 7),
    notes: `relabel to ${lineItemId}`,
    ...partial,
  }
}

function seedActive(sim: LabelMapSim, lineItemId: string, active = true) {
  return sim.seed({
    channel: CH,
    platformId: PID,
    lineItemId,
    lineItemName: PID,
    mbaNumber: lineItemId.slice(0, 7),
    notes: "seed",
    active,
  })
}

const QUIET = { warn: console.warn }
function silenceWarn(): string[] {
  const seen: string[] = []
  console.warn = (...args: unknown[]) => {
    seen.push(args.map(String).join(" "))
  }
  return seen
}
function restoreWarn() {
  console.warn = QUIET.warn
}

test("the key SQL matches the LM1 key: LOWER(TRIM) on channel and platform id", () => {
  for (const sqlText of [LABEL_MAP_DEACTIVATE_KEY_SQL, LABEL_MAP_COUNT_ACTIVE_SQL]) {
    assert.match(sqlText, /LOWER\(TRIM\(CHANNEL\)\) = LOWER\(TRIM\(\?\)\)/)
    assert.match(sqlText, /LOWER\(TRIM\(CAST\(PLATFORM_LINE_ITEM_ID AS VARCHAR\)\)\) = LOWER\(TRIM\(\?\)\)/)
    assert.match(sqlText, /IS_ACTIVE = TRUE/)
  }
  assert.match(LABEL_MAP_DUPLICATE_ACTIVE_KEYS_SQL, /GROUP BY 1, 2\s+HAVING COUNT\(\*\) > 1/)
  assert.match(LABEL_MAP_DUPLICATE_ACTIVE_KEYS_SQL, /WHERE IS_ACTIVE = TRUE/)
})

test("apply: deactivates every active row for the key (case and spaces too), inserts one", async () => {
  const sim = new LabelMapSim()
  seedActive(sim, "bicau002bv1")
  // A hand-loaded copy with a different case and padding is the same key.
  sim.seed({ channel: " ad serving - cm360 ", platformId: ` ${PID.toUpperCase()} `, lineItemId: "bicau002bv1", lineItemName: null, mbaNumber: null, notes: null, active: true })
  const tx = sim.begin()
  const out = await replaceActiveLabelMapRow(tx.sql, values("bicau002bv2"), { refuseSecondActive: true })
  tx.commit()
  assert.equal(out.activeRows, 1)
  const active = sim.activeFor(CH, PID)
  assert.deepEqual(active.map((r) => r.lineItemId), ["bicau002bv2"])
  assert.deepEqual(tx.statements, ["deactivate_key", "insert", "count"])
})

test("two applies at once: the second sees two active rows and is refused when the switch is on", async () => {
  const sim = new LabelMapSim()
  seedActive(sim, "bicau002bv1")
  const tx1 = sim.begin()
  const tx2 = sim.begin()

  // tx2 runs first but stalls before its count, holding an uncommitted insert.
  let release!: () => void
  const gate = new Promise<void>((r) => (release = r))
  const stalled = {
    rows: async <T,>(sqlText: string, binds: unknown[]) => {
      await gate
      return tx2.sql.rows<T>(sqlText, binds)
    },
    exec: tx2.sql.exec,
  }
  const second = replaceActiveLabelMapRow(stalled, values("bicau002bv3"), { refuseSecondActive: true })

  const first = await replaceActiveLabelMapRow(tx1.sql, values("bicau002bv2"), { refuseSecondActive: true })
  assert.equal(first.activeRows, 1, "tx1 cannot see tx2's uncommitted row")
  tx1.commit()
  release()

  await assert.rejects(second, (err: unknown) => {
    assert.ok(err instanceof LabelMapSecondActiveRowError)
    assert.equal(err.activeRows, 2)
    assert.match(err.message, /Nothing was written\. Reload and try again\./)
    return true
  })
  tx2.rollback()
  assert.deepEqual(sim.activeFor(CH, PID).map((r) => r.lineItemId), ["bicau002bv2"])
})

test("two applies at once with the switch off: logged, committed (today's behaviour)", async () => {
  const sim = new LabelMapSim()
  seedActive(sim, "bicau002bv1")
  const tx1 = sim.begin()
  const tx2 = sim.begin()
  let release!: () => void
  const gate = new Promise<void>((r) => (release = r))
  const stalled = {
    rows: async <T,>(sqlText: string, binds: unknown[]) => {
      await gate
      return tx2.sql.rows<T>(sqlText, binds)
    },
    exec: tx2.sql.exec,
  }
  const second = replaceActiveLabelMapRow(stalled, values("bicau002bv3"), { refuseSecondActive: false })
  await replaceActiveLabelMapRow(tx1.sql, values("bicau002bv2"), { refuseSecondActive: false })
  tx1.commit()
  const seen = silenceWarn()
  try {
    release()
    const out = await second
    assert.equal(out.activeRows, 2)
  } finally {
    restoreWarn()
  }
  tx2.commit()
  assert.equal(seen.length, 1)
  assert.match(seen[0]!, /relabel_label_map_second_active_row/)
  assert.equal(sim.activeFor(CH, PID).length, 2)
})

test("revert: restores the prior line as ONE row even when history holds two copies of it", async () => {
  const sim = new LabelMapSim()
  const h1 = seedActive(sim, "bicau002bv1", false)
  const h2 = seedActive(sim, "bicau002bv1", false)
  seedActive(sim, "bicau002bv2")
  const tx = sim.begin()
  const out = await restorePriorLabelMapRow(
    tx.sql,
    {
      deactivate: { channel: CH, platformEntityId: PID, lineItemId: "bicau002bv2" },
      prior: values("bicau002bv1", { notes: "restored by revert of relabel 7" }),
    },
    { refuseSecondActive: true },
  )
  tx.commit()
  assert.deepEqual(out, { restored: true, skipped: null, activeRows: 1 })
  const active = sim.activeFor(CH, PID)
  assert.equal(active.length, 1)
  assert.equal(active[0]!.lineItemId, "bicau002bv1")
  assert.equal(active[0]!.notes, "restored by revert of relabel 7")
  assert.equal(h1.active, false, "old history rows are not flipped back")
  assert.equal(h2.active, false)
})

test("revert after a later relabel on the same key keeps the later row and adds none", async () => {
  const sim = new LabelMapSim()
  seedActive(sim, "bicau002bv1", false) // prior of relabel A
  seedActive(sim, "bicau002bv2", false) // relabel A's row, replaced by B
  seedActive(sim, "bicau002bv3") // relabel B
  const tx = sim.begin()
  const out = await restorePriorLabelMapRow(
    tx.sql,
    {
      deactivate: { channel: CH, platformEntityId: PID, lineItemId: "bicau002bv2" },
      prior: values("bicau002bv1"),
    },
    { refuseSecondActive: true },
  )
  tx.commit()
  assert.deepEqual(out, { restored: false, skipped: "another_active_row", activeRows: 1 })
  assert.deepEqual(sim.activeFor(CH, PID).map((r) => r.lineItemId), ["bicau002bv3"])
})

test("revert with no prior row (or a prior with no line id) only deactivates", async () => {
  for (const prior of [null, values("", { lineItemId: "" })]) {
    const sim = new LabelMapSim()
    seedActive(sim, "bicau002bv2")
    const tx = sim.begin()
    const out = await restorePriorLabelMapRow(
      tx.sql,
      { deactivate: { channel: CH, platformEntityId: PID, lineItemId: "bicau002bv2" }, prior },
      { refuseSecondActive: true },
    )
    tx.commit()
    assert.deepEqual(out, { restored: false, skipped: "no_prior", activeRows: 0 })
    assert.equal(sim.activeFor(CH, PID).length, 0)
    assert.deepEqual(tx.statements, ["deactivate_line", "count"])
  }
})

test("revert racing an apply on the same key: the revert's count sees two rows and is refused", async () => {
  const sim = new LabelMapSim()
  seedActive(sim, "bicau002bv1", false)
  seedActive(sim, "bicau002bv2")
  const revertTx = sim.begin()
  const applyTx = sim.begin()
  // Revert deactivates its row and sees nothing else active...
  let release!: () => void
  const gate = new Promise<void>((r) => (release = r))
  let counts = 0
  const stalled = {
    rows: async <T,>(sqlText: string, binds: unknown[]) => {
      counts += 1
      if (counts === 2) await gate // the after-insert count
      return revertTx.sql.rows<T>(sqlText, binds)
    },
    exec: revertTx.sql.exec,
  }
  const revert = restorePriorLabelMapRow(
    stalled,
    {
      deactivate: { channel: CH, platformEntityId: PID, lineItemId: "bicau002bv2" },
      prior: values("bicau002bv1"),
    },
    { refuseSecondActive: true },
  )
  // ...while an apply to bv3 commits before the revert counts again.
  await new Promise((r) => setImmediate(r))
  await replaceActiveLabelMapRow(applyTx.sql, values("bicau002bv3"), { refuseSecondActive: true })
  applyTx.commit()
  release()
  await assert.rejects(revert, LabelMapSecondActiveRowError)
  revertTx.rollback()
  assert.deepEqual(sim.activeFor(CH, PID).map((r) => r.lineItemId), ["bicau002bv3"])
})

test("duplicate key rows map to numbers", () => {
  assert.deepEqual(
    labelMapDuplicateKeysFromRows([{ CHANNEL_KEY: "ad serving - cm360", PLATFORM_KEY: "x", ACTIVE_ROWS: "4" }]),
    [{ channelKey: "ad serving - cm360", platformKey: "x", activeRows: 4 }],
  )
})
