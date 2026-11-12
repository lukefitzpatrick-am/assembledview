/**
 * In-memory LINE_ITEM_LABEL_MAP for the B34 tests. It answers only the SQL
 * constants in `labelMapActive.ts` (matched by identity) and models READ
 * COMMITTED with no lock waits: a transaction sees committed rows plus its
 * own changes, never another transaction's uncommitted insert. That is the
 * worst case for two applies at once, the case the count guard is for.
 */
import {
  LABEL_MAP_COUNT_ACTIVE_SQL,
  LABEL_MAP_DEACTIVATE_KEY_SQL,
  LABEL_MAP_DEACTIVATE_LINE_SQL,
  LABEL_MAP_INSERT_ACTIVE_SQL,
  type LabelMapSql,
} from "../labelMapActive.js"

export type SimRow = {
  id: number
  channel: string
  platformId: string
  lineItemId: string | null
  lineItemName: string | null
  mbaNumber: string | null
  notes: string | null
  active: boolean
}

const norm = (v: unknown) => String(v ?? "").toLowerCase().trim()

export class LabelMapSim {
  committed: SimRow[] = []
  private nextId = 1

  seed(row: Omit<SimRow, "id">): SimRow {
    const full = { ...row, id: this.nextId++ }
    this.committed.push(full)
    return full
  }

  activeFor(channel: string, platformId: string): SimRow[] {
    return this.committed.filter(
      (r) => r.active && norm(r.channel) === norm(channel) && norm(r.platformId) === norm(platformId),
    )
  }

  begin(): SimTx {
    return new SimTx(this, () => this.nextId++)
  }
}

export class SimTx {
  private overrides = new Map<number, boolean>()
  private inserts: SimRow[] = []
  done = false
  statements: string[] = []

  constructor(
    private sim: LabelMapSim,
    private newId: () => number,
  ) {}

  private visible(): SimRow[] {
    const base = this.sim.committed.map((r) =>
      this.overrides.has(r.id) ? { ...r, active: this.overrides.get(r.id)! } : r,
    )
    return [...base, ...this.inserts]
  }

  private setActive(row: SimRow, active: boolean) {
    const own = this.inserts.find((r) => r.id === row.id)
    if (own) own.active = active
    else this.overrides.set(row.id, active)
  }

  readonly sql: LabelMapSql = {
    rows: async <T,>(sqlText: string, binds: unknown[]): Promise<T[]> => {
      if (sqlText !== LABEL_MAP_COUNT_ACTIVE_SQL) throw new Error(`sim: unexpected rows SQL ${sqlText}`)
      this.statements.push("count")
      const [channel, pid] = binds
      const n = this.visible().filter(
        (r) => r.active && norm(r.channel) === norm(channel) && norm(r.platformId) === norm(pid),
      ).length
      return [{ ACTIVE_ROWS: n } as T]
    },
    exec: async (sqlText: string, binds: unknown[]): Promise<void> => {
      if (sqlText === LABEL_MAP_DEACTIVATE_KEY_SQL) {
        this.statements.push("deactivate_key")
        const [channel, pid] = binds
        for (const r of this.visible()) {
          if (r.active && norm(r.channel) === norm(channel) && norm(r.platformId) === norm(pid)) {
            this.setActive(r, false)
          }
        }
        return
      }
      if (sqlText === LABEL_MAP_DEACTIVATE_LINE_SQL) {
        this.statements.push("deactivate_line")
        const [channel, pid, line] = binds
        for (const r of this.visible()) {
          if (
            r.active &&
            norm(r.channel) === norm(channel) &&
            norm(r.platformId) === norm(pid) &&
            norm(r.lineItemId) === String(line)
          ) {
            this.setActive(r, false)
          }
        }
        return
      }
      if (sqlText === LABEL_MAP_INSERT_ACTIVE_SQL) {
        this.statements.push("insert")
        const [channel, pid, line, name, mba, notes] = binds
        this.inserts.push({
          id: this.newId(),
          channel: String(channel),
          platformId: String(pid),
          lineItemId: line == null ? null : String(line),
          lineItemName: name == null ? null : String(name),
          mbaNumber: mba == null ? null : String(mba),
          notes: notes == null ? null : String(notes),
          active: true,
        })
        return
      }
      throw new Error(`sim: unexpected exec SQL ${sqlText}`)
    },
  }

  commit() {
    if (this.done) throw new Error("sim: transaction already ended")
    for (const r of this.sim.committed) {
      if (this.overrides.has(r.id)) r.active = this.overrides.get(r.id)!
    }
    this.sim.committed.push(...this.inserts)
    this.done = true
  }

  rollback() {
    this.overrides.clear()
    this.inserts = []
    this.done = true
  }
}
