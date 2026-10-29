/**
 * Pure planner for the true-up billing revision kinds (design
 * DESIGN-AV-true-up-2026-10-29, section 4). No DB, no clock.
 *
 * `true_up` (Luke, 29 Oct 2026: decisions 1 and 5 of the first round, and
 * 1 to 4 of the second):
 * - Each month listed in `actuals` is set to what was invoiced for the MBA,
 *   per component (fee, ad serving, production, media). The month's
 *   difference is split across the plan's lines by room first (Luke, 29 Oct:
 *   "underspends and overspends should be rectified in the next month"):
 *   an increase goes to lines pro rata to what they can still give back from
 *   their open months, a decrease to lines that have an open month to take
 *   it into. Only what no line can hold is split pro rata to that month's
 *   schedule (falling back to each line's contract total), and that part
 *   becomes the residual.
 * - Every line keeps its contract total per component. What a line's past
 *   months gained or lost comes back out of, or goes into, its open months
 *   from the current month on: "carry" (default) into the next open month,
 *   rolling on to the following open months for what that month can't give
 *   back; "spread" pro rata to the line's remaining schedule.
 * - What a line can't absorb (no open month left, or not enough left to take
 *   back) is undone on that line, latest month first. It is the residual:
 *   + a credit to raise, - a charge to raise (decision 1: the schedule stops
 *   at the contract total). It only happens when no open month remains or
 *   the contract total is reached.
 * - Hard locks that stay hard on past months: a closed finance period, and a
 *   month in a sent AA pack on an AA line (decision 4). Every other past lock
 *   (sent to accounts, Xero matched, legacy billed) is the reason the month
 *   is being trued up, so it is writable, and only to the invoiced amount.
 * - Open months follow the same locks as every other revision (approved but
 *   not sent opens only when ticked).
 * - A month listed with zeros is a no-invoice month finance chose to carry
 *   (decision 2, mixed). Months not listed never change.
 * - No new version unless at least one cell moves by $1 or more.
 * - Client-pays media is never invoiced by the agency, so it is out of
 *   media (its fee and ad serving still count).
 *
 * `true_up_restore` puts the before cells back (undo). Every changed month
 * must still be writable under the same rules, or the line can't be undone.
 *
 * Laws (asserted, a breach throws RevisionInvariantError): line totals per
 * component unchanged; no negative cell; past cells change only in listed
 * months; future cells change only in open months; fixed cells never change.
 */

import { toBillingOverrideLineItemId } from "@/lib/finance/manualBillingOverridesUi"

import { allocateCents } from "./allocateCents"
import { defaultMonthLock, hashRevisionPlan, isMonthKey } from "./planBillingRevision"
import {
  RevisionInvariantError,
  type Cents,
  type CellDiff,
  type LineDiff,
  type LockLevel,
  type MonthDiff,
  type MonthKey,
  type MonthLock,
  type RevisionFail,
  type RevisionInput,
  type RevisionLine,
  type RevisionOk,
  type RevisionResult,
  type RevisionWarning,
  type TrueUpComponentKey,
  type TrueUpComponentSummaryPlan,
  type TrueUpRequest,
  type TrueUpRestoreRequest,
} from "./types"

export const TRUE_UP_COMPONENT_KEYS: readonly TrueUpComponentKey[] = ["fee", "adserving", "production", "media"]

/** A cell must move by at least this much for a fix to cut a version (Luke, 29 Oct). */
export const TRUE_UP_MIN_CELL_CHANGE_CENTS = 100

const PROD_ID_RE = /^[A-Za-z]+[0-9]+PROD[0-9]+$/

/** Same rule as the true-up report's schedule (LINE_PRODUCTION_SQL) plus the production channel. */
export function isProductionLikeLine(line: Pick<RevisionLine, "lineItemId" | "isProduction">): boolean {
  if (line.isProduction) return true
  const raw = String(line.lineItemId ?? "")
  const bare = toBillingOverrideLineItemId(raw)
  return PROD_ID_RE.test(bare) || /production/i.test(raw)
}

type Work = {
  line: RevisionLine
  productionLike: boolean
  media: Record<MonthKey, Cents>
  fee: Record<MonthKey, Cents>
  adserving: Record<MonthKey, Cents>
}

function cell(rec: Record<string, number> | undefined, m: MonthKey): number {
  return rec?.[m] ?? 0
}

function sumValues(rec: Record<string, number>): number {
  let s = 0
  for (const v of Object.values(rec)) s += v
  return s
}

function stripZeros(rec: Record<MonthKey, Cents>): Record<MonthKey, Cents> {
  const out: Record<MonthKey, Cents> = {}
  for (const k of Object.keys(rec).sort()) if (rec[k] !== 0) out[k] = rec[k]!
  return out
}

function diffCells(before: Record<MonthKey, Cents>, after: Record<MonthKey, Cents>): CellDiff[] {
  const months = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()
  const out: CellDiff[] = []
  for (const m of months) {
    const b = cell(before, m)
    const a = cell(after, m)
    if (a !== b) out.push({ month: m, before: b, after: a })
  }
  return out
}

function fail(code: RevisionFail["code"], message: string, extra: Partial<Omit<RevisionFail, "ok" | "code" | "message">> = {}): RevisionFail {
  return { ok: false, code, message, ...extra }
}

function fmt(cents: number): string {
  const sign = cents < 0 ? "-" : ""
  const abs = Math.abs(cents)
  return `${sign}$${Math.floor(abs / 100).toLocaleString("en-AU")}.${String(abs % 100).padStart(2, "0")}`
}

/** The record a component lives in on a line, or null when the line has none of it. */
function recFor(w: Work, c: TrueUpComponentKey): Record<MonthKey, Cents> | null {
  if (c === "fee") return w.fee
  if (c === "adserving") return w.adserving
  if (c === "production") return w.productionLike ? w.media : null
  return !w.productionLike && !w.line.clientPaysForMedia ? w.media : null
}

function origRecFor(line: RevisionLine, productionLike: boolean, c: TrueUpComponentKey): Record<MonthKey, Cents> | null {
  if (c === "fee") return line.fee
  if (c === "adserving") return line.adserving
  if (c === "production") return productionLike ? line.media : null
  return !productionLike && !line.clientPaysForMedia ? line.media : null
}

type Ctx = {
  input: RevisionInput
  currentMonth: MonthKey
  lastCampaign: MonthKey | null
  lockOf: (m: MonthKey) => MonthLock
  levelOf: (m: MonthKey, line?: RevisionLine) => LockLevel
  universe: Set<MonthKey>
}

function buildCtx(input: RevisionInput): Ctx {
  const campaignMonths = [...new Set(input.campaignMonths.filter(isMonthKey))].sort()
  const lastCampaign = campaignMonths[campaignMonths.length - 1] ?? null
  const lockMap = new Map<MonthKey, MonthLock>()
  for (const l of input.locks) lockMap.set(l.month, l)
  const lockOf = (m: MonthKey): MonthLock => lockMap.get(m) ?? defaultMonthLock(m, input.currentMonth, lastCampaign)
  const unlocked = new Set(input.options.unlockApprovedMonths ?? [])
  const aaLocked = new Set(input.aaLockedMonths ?? [])
  const levelOf = (m: MonthKey, line?: RevisionLine): LockLevel => {
    let level = lockOf(m).level
    if (level === "soft" && unlocked.has(m)) level = "open"
    if (line?.isAaLine && aaLocked.has(m)) level = "hard"
    return level
  }
  const universe = new Set<MonthKey>(campaignMonths)
  for (const l of input.locks) if (isMonthKey(l.month)) universe.add(l.month)
  for (const line of input.lines) {
    for (const rec of [line.media, line.fee, line.adserving]) {
      for (const m of Object.keys(rec)) if (isMonthKey(m)) universe.add(m)
    }
  }
  return { input, currentMonth: input.currentMonth, lastCampaign, lockOf, levelOf, universe }
}

/**
 * A past month the true-up may write on this line: anything except a closed
 * finance period and a sent AA pack month on an AA line.
 */
function pastWritable(ctx: Ctx, m: MonthKey, line: RevisionLine): boolean {
  if (m >= ctx.currentMonth) return false
  const lk = ctx.lockOf(m)
  if (lk.reasons.includes("finance_period_locked")) return false
  if (line.isAaLine && (ctx.input.aaLockedMonths ?? []).includes(m)) return false
  return true
}

/** An open month from the current month on, inside the campaign. */
function futureOpen(ctx: Ctx, m: MonthKey, line: RevisionLine): boolean {
  if (m < ctx.currentMonth) return false
  if (ctx.lastCampaign && m > ctx.lastCampaign) return false
  return ctx.levelOf(m, line) === "open"
}

function futureMonthsFor(ctx: Ctx, line: RevisionLine): MonthKey[] {
  const months = new Set<MonthKey>(ctx.universe)
  months.add(ctx.currentMonth)
  return [...months].filter((m) => futureOpen(ctx, m, line)).sort()
}

function finish(
  ctx: Ctx,
  work: Work[],
  extra: {
    warnings: RevisionWarning[]
    hashPayload: Record<string, unknown>
    trueUp?: RevisionOk["trueUp"]
    writableCheck: (w: Work, m: MonthKey) => boolean
    /** A fix needs one cell to move by this much (true_up $1, undo 1 cent). */
    minCellChange: number
  },
): RevisionOk | RevisionFail {
  const { input } = ctx
  // Laws.
  for (const w of work) {
    const o = w.line
    for (const [name, before, after] of [
      ["media", o.media, w.media],
      ["fee", o.fee, w.fee],
      ["adserving", o.adserving, w.adserving],
    ] as const) {
      if (sumValues(after) !== sumValues(before)) {
        throw new RevisionInvariantError(`${o.lineItemId}: ${name} total changed`)
      }
      for (const [m, v] of Object.entries(after)) {
        if (!Number.isInteger(v) || v < 0) throw new RevisionInvariantError(`${o.lineItemId} ${m}: bad ${name} cell ${v}`)
      }
      for (const d of diffCells(before, after)) {
        if (!extra.writableCheck(w, d.month)) {
          throw new RevisionInvariantError(`${o.lineItemId} ${d.month}: locked ${name} cell changed`)
        }
      }
    }
  }

  const afterCells: RevisionOk["afterCells"] = []
  let maxMove = 0
  let movedCents = 0
  for (const w of work) {
    const mediaD = diffCells(w.line.media, w.media)
    const feeD = diffCells(w.line.fee, w.fee)
    const adD = diffCells(w.line.adserving, w.adserving)
    for (const d of [...mediaD, ...feeD, ...adD]) {
      maxMove = Math.max(maxMove, Math.abs(d.after - d.before))
      if (d.after > d.before) movedCents += d.after - d.before
    }
    if (mediaD.length + feeD.length + adD.length === 0) continue
    afterCells.push({
      lineItemId: w.line.lineItemId,
      media: stripZeros(w.media),
      fee: stripZeros(w.fee),
      adserving: stripZeros(w.adserving),
      mediaChanged: mediaD.length > 0,
      feeChanged: feeD.length > 0,
      adservingChanged: adD.length > 0,
    })
  }

  if (afterCells.length === 0 || maxMove < extra.minCellChange) {
    return fail(
      "NO_CHANGE",
      afterCells.length === 0
        ? "The schedule already matches what can be trued up. Nothing changes."
        : "Every change is under $1. No new version is needed.",
    )
  }

  const byKey = new Map(work.map((w) => [toBillingOverrideLineItemId(w.line.lineItemId), w]))
  const lines: LineDiff[] = input.lines.map((line) => {
    const w = byKey.get(toBillingOverrideLineItemId(line.lineItemId))
    return {
      lineItemId: line.lineItemId,
      label: line.label,
      media: w ? diffCells(line.media, w.media) : [],
      fee: w ? diffCells(line.fee, w.fee) : [],
      adserving: w ? diffCells(line.adserving, w.adserving) : [],
    }
  })

  const fixed = input.fixedCells ?? {}
  const months = [...ctx.universe].sort()
  const monthDiffs: MonthDiff[] = months.map((m) => {
    let mb = 0
    let ma = 0
    let pb = 0
    let pa = 0
    let fb = 0
    let fa = 0
    let ab = 0
    let aa = 0
    for (const line of input.lines) {
      const w = byKey.get(toBillingOverrideLineItemId(line.lineItemId))
      const prod = w ? w.productionLike : isProductionLikeLine(line)
      const before = cell(line.media, m)
      const after = w ? cell(w.media, m) : before
      if (prod) {
        pb += before
        pa += after
      } else if (!line.clientPaysForMedia) {
        mb += before
        ma += after
      }
      fb += cell(line.fee, m)
      fa += w ? cell(w.fee, m) : cell(line.fee, m)
      ab += cell(line.adserving, m)
      aa += w ? cell(w.adserving, m) : cell(line.adserving, m)
    }
    const fxMedia = cell(fixed.media, m)
    const fxProd = cell(fixed.production, m)
    const fxFee = cell(fixed.fee, m)
    const fxAd = cell(fixed.adserving, m)
    mb += fxMedia
    ma += fxMedia
    pb += fxProd
    pa += fxProd
    fb += fxFee
    fa += fxFee
    ab += fxAd
    aa += fxAd
    return {
      month: m,
      lock: ctx.lockOf(m),
      effectiveLevel: ctx.levelOf(m),
      media: { month: m, before: mb, after: ma },
      fee: { month: m, before: fb, after: fa },
      adserving: { month: m, before: ab, after: aa },
      production: { month: m, before: pb, after: pa },
      total: { month: m, before: mb + fb + ab + pb, after: ma + fa + aa + pa },
    }
  })

  const hash = hashRevisionPlan({
    ...extra.hashPayload,
    locks: months.map((m) => [m, ctx.levelOf(m), [...ctx.lockOf(m).reasons].sort()]),
    aaLocked: [...(input.aaLockedMonths ?? [])].sort(),
    unlocked: [...(input.options.unlockApprovedMonths ?? [])].sort(),
    afterCells,
    trueUp: extra.trueUp ?? null,
  })

  return {
    ok: true,
    lines,
    months: monthDiffs,
    movedCents,
    credits: [],
    warnings: extra.warnings,
    cannotUndo: [],
    afterCells,
    hash,
    ...(extra.trueUp ? { trueUp: extra.trueUp } : {}),
  }
}

function newWork(input: RevisionInput): Work[] {
  return input.lines.map((line) => ({
    line,
    productionLike: isProductionLikeLine(line),
    media: { ...line.media },
    fee: { ...line.fee },
    adserving: { ...line.adserving },
  }))
}

export function planTrueUpRevision(input: RevisionInput): RevisionResult {
  const request = input.request
  if (!isMonthKey(input.currentMonth)) return fail("BAD_MONTH", `Current month "${input.currentMonth}" is not YYYY-MM`)
  if (request.mode === "true_up_restore") return planTrueUpRestore(input, request)
  if (request.mode !== "true_up") return fail("TRUE_UP_BAD_REQUEST", "Not a true-up request.")
  return planTrueUp(input, request)
}

function planTrueUp(input: RevisionInput, request: TrueUpRequest): RevisionResult {
  const ctx = buildCtx(input)
  if (!isMonthKey(request.asOfMonth)) return fail("BAD_MONTH", `As-of month "${request.asOfMonth}" is not YYYY-MM`)
  if (request.strategy !== "spread" && request.strategy !== "carry") {
    return fail("TRUE_UP_BAD_REQUEST", "Strategy is spread or carry.")
  }
  const components = [...new Set(request.components)].filter((c) => TRUE_UP_COMPONENT_KEYS.includes(c))
  if (components.length === 0) return fail("TRUE_UP_BAD_REQUEST", "Pick at least one component.")
  const trueMonths = Object.keys(request.actuals ?? {}).sort()
  if (trueMonths.length === 0) return fail("TRUE_UP_BAD_REQUEST", "No invoiced months to true up.")
  for (const m of trueMonths) {
    if (!isMonthKey(m)) return fail("BAD_MONTH", `Month "${m}" is not YYYY-MM`)
    if (m > request.asOfMonth) return fail("TRUE_UP_BAD_REQUEST", `${m} is after the as-of month ${request.asOfMonth}.`)
    if (m >= ctx.currentMonth) {
      return fail("TRUE_UP_BAD_REQUEST", `${m} is not a past month (current month ${ctx.currentMonth}).`)
    }
    for (const c of components) {
      const v = request.actuals[m]?.[c] ?? 0
      if (!Number.isInteger(v) || v < 0) {
        return fail("TRUE_UP_BAD_REQUEST", `${m} ${c}: invoiced ${v} is not whole, non-negative cents. Credit notes above the month's invoices need a credit-note action.`)
      }
    }
    ctx.universe.add(m)
  }

  const work = newWork(input)
  const fixed = input.fixedCells ?? {}
  const warnings: RevisionWarning[] = []
  const summaries: TrueUpComponentSummaryPlan[] = []

  for (const c of components) {
    const lines = work.filter((w) => recFor(w, c) != null)
    // Signed change per line and month for this component (for the undo of what can't be absorbed).
    const changes = new Map<Work, Map<MonthKey, number>>()
    const note = (w: Work, m: MonthKey, d: number) => {
      const byMonth = changes.get(w) ?? new Map<MonthKey, number>()
      byMonth.set(m, (byMonth.get(m) ?? 0) + d)
      changes.set(w, byMonth)
    }

    // Room per line: what its open months hold for this component (what it can
    // give back), and its running net past change.
    const futureOf = new Map<Work, MonthKey[]>()
    const futureOpenOf = (w: Work) => {
      let f = futureOf.get(w)
      if (!f) {
        f = futureMonthsFor(ctx, w.line)
        futureOf.set(w, f)
      }
      return f
    }
    const roomOf = (w: Work) => futureOpenOf(w).reduce((s2, fm) => s2 + cell(origRecFor(w.line, w.productionLike, c)!, fm), 0)
    const netOf = (w: Work) => {
      let n = 0
      for (const v of changes.get(w)?.values() ?? []) n += v
      return n
    }

    let gapBefore = 0
    for (const m of trueMonths) {
      const target = request.actuals[m]?.[c] ?? 0
      let scheduled = cell(fixed[c], m)
      for (const w of lines) scheduled += cell(recFor(w, c)!, m)
      const delta = target - scheduled
      gapBefore += delta
      if (delta === 0) continue

      const writable = lines.filter((w) => pastWritable(ctx, m, w.line))
      if (writable.length < lines.length && lines.some((w) => cell(recFor(w, c)!, m) !== 0 && !writable.includes(w))) {
        warnings.push({
          code: "TRUE_UP_MONTH_LOCKED",
          month: m,
          message: `${m} ${c}: some lines are locked (closed period or a sent AA pack) and keep their amounts.`,
        })
      }
      // Luke, 29 Oct ("rectified in the next month"): split by room first so
      // as little as possible is left over. Room for an increase is what the
      // line can give back from its open months; a decrease goes first to
      // lines that can take it back into an open month. Only what no line
      // can hold is split pro rata to the month and ends up as the residual.
      const idOf = (w: Work) => toBillingOverrideLineItemId(w.line.lineItemId)
      const apply = (shares: Map<string, number>, sign: 1 | -1) => {
        for (const [id, share] of shares) {
          if (share === 0) continue
          const w = writable.find((x) => idOf(x) === id)!
          const rec = recFor(w, c)!
          rec[m] = cell(rec, m) + sign * share
          note(w, m, sign * share)
        }
      }
      if (delta < 0) {
        let left = -delta
        const reabsorb = writable
          .map((w) => {
            const have = cell(recFor(w, c)!, m)
            const cap = futureOpenOf(w).length > 0 ? have : Math.min(have, Math.max(0, netOf(w)))
            return [idOf(w), cap] as const
          })
          .filter(([, v]) => v > 0)
        const first = Math.min(left, reabsorb.reduce((s2, [, v]) => s2 + v, 0))
        if (first > 0) {
          apply(allocateCents(first, reabsorb), -1)
          left -= first
        }
        if (left > 0) {
          const rest = writable
            .map((w) => [idOf(w), cell(recFor(w, c)!, m)] as const)
            .filter(([, v]) => v > 0)
          const take = Math.min(left, rest.reduce((s2, [, v]) => s2 + v, 0))
          if (take > 0) apply(allocateCents(take, rest), -1)
        }
      } else {
        let left = delta
        const room = writable
          .map((w) => [idOf(w), Math.max(0, roomOf(w) - netOf(w))] as const)
          .filter(([, v]) => v > 0)
        const first = Math.min(left, room.reduce((s2, [, v]) => s2 + v, 0))
        if (first > 0) {
          apply(allocateCents(first, room), 1)
          left -= first
        }
        if (left > 0) {
          let weights = writable
            .map((w) => [idOf(w), cell(recFor(w, c)!, m)] as const)
            .filter(([, v]) => v > 0)
          if (weights.length === 0) {
            weights = writable
              .map((w) => [idOf(w), sumValues(recFor(w, c)!)] as const)
              .filter(([, v]) => v > 0)
          }
          if (weights.length > 0) apply(allocateCents(left, weights), 1)
        }
      }
    }

    // Rebalance each changed line in its open months; undo what can't be absorbed.
    let rebalanced = 0
    for (const [w, byMonth] of changes) {
      const rec = recFor(w, c)!
      let pastDelta = 0
      for (const v of byMonth.values()) pastDelta += v
      if (pastDelta === 0) continue
      const future = futureMonthsFor(ctx, w.line)
      let unabsorbed = 0
      if (pastDelta < 0) {
        // Past went down: the open months take the difference.
        const add = -pastDelta
        if (future.length === 0) {
          unabsorbed = add
        } else {
          const withCells = future.filter((m) => cell(rec, m) > 0)
          if (request.strategy === "carry" || withCells.length === 0) {
            const into = request.strategy === "carry" ? future[0]! : withCells[0] ?? future[0]!
            rec[into] = cell(rec, into) + add
          } else {
            for (const [m, share] of allocateCents(add, withCells.map((m) => [m, cell(rec, m)] as const))) {
              rec[m] = cell(rec, m) + share
            }
          }
          rebalanced += add
        }
      } else {
        // Past went up: the open months give it back, as far as they hold it.
        const need = pastDelta
        const room = future.reduce((s, m) => s + cell(rec, m), 0)
        const take = Math.min(need, room)
        if (take > 0) {
          if (request.strategy === "carry") {
            let left = take
            for (const m of future) {
              if (left === 0) break
              const x = Math.min(left, cell(rec, m))
              rec[m] = cell(rec, m) - x
              left -= x
            }
          } else {
            const weights = future.filter((m) => cell(rec, m) > 0).map((m) => [m, cell(rec, m)] as const)
            for (const [m, share] of allocateCents(take, weights)) rec[m] = cell(rec, m) - share
          }
          rebalanced += take
        }
        unabsorbed = need - take
      }
      if (unabsorbed > 0) {
        // Undo that much of the line's past change, latest month first.
        const sign = pastDelta < 0 ? -1 : 1
        let left = unabsorbed
        const months = [...byMonth.keys()].sort().reverse()
        for (const m of months) {
          if (left === 0) break
          const d = byMonth.get(m)!
          if (Math.sign(d) !== sign) continue
          const back = Math.min(left, Math.abs(d))
          rec[m] = cell(rec, m) - sign * back
          byMonth.set(m, d - sign * back)
          left -= back
        }
        if (left !== 0) throw new RevisionInvariantError(`${w.line.lineItemId} ${c}: could not undo ${left} cents`)
      }
    }

    let residual = 0
    for (const m of trueMonths) {
      let scheduled = cell(fixed[c], m)
      for (const w of lines) scheduled += cell(recFor(w, c)!, m)
      residual += (request.actuals[m]?.[c] ?? 0) - scheduled
    }
    if (lines.length === 0 && gapBefore !== 0) {
      warnings.push({
        code: "TRUE_UP_NO_LINES",
        message: `No plan line carries ${c}. The gap of ${fmt(gapBefore)} can't go into the schedule.`,
      })
    }
    if (residual !== 0) {
      warnings.push({
        code: "TRUE_UP_RESIDUAL",
        message:
          residual > 0
            ? `${c}: ${fmt(residual)} invoiced above what the schedule can hold. Record it as a credit to raise.`
            : `${c}: ${fmt(-residual)} the schedule can't move into an open month. Record it as a charge to raise.`,
      })
    }
    summaries.push({ component: c, gapBefore, residual, rebalanced })
  }

  const trueSet = new Set(trueMonths)
  return finish(ctx, work, {
    warnings,
    hashPayload: { request: { ...request, components } },
    trueUp: { asOfMonth: request.asOfMonth, strategy: request.strategy, months: trueMonths, components: summaries },
    writableCheck: (w, m) => (m < ctx.currentMonth ? trueSet.has(m) && pastWritable(ctx, m, w.line) : futureOpen(ctx, m, w.line)),
    minCellChange: TRUE_UP_MIN_CELL_CHANGE_CENTS,
  })
}

function planTrueUpRestore(input: RevisionInput, request: TrueUpRestoreRequest): RevisionResult {
  const ctx = buildCtx(input)
  const work = newWork(input)
  const target = request.target ?? { media: {} }
  const ids = new Set([
    ...Object.keys(target.media ?? {}),
    ...Object.keys(target.fee ?? {}),
    ...Object.keys(target.adserving ?? {}),
  ])
  if (!isMonthKey(request.fixedAtMonth)) return fail("BAD_MONTH", "The true-up's month is missing. It can't be undone.")
  const fixedAt = request.fixedAtMonth
  // Months that were open months when the fix ran must still be open now.
  const canWrite = (w: Work, m: MonthKey) =>
    m < fixedAt ? m < ctx.currentMonth && pastWritable(ctx, m, w.line) : futureOpen(ctx, m, w.line)
  const cannotUndo: Array<{ lineItemId: string; months: MonthKey[] }> = []
  const warnings: RevisionWarning[] = []
  for (const id of ids) {
    const w = work.find((x) => toBillingOverrideLineItemId(x.line.lineItemId) === toBillingOverrideLineItemId(id))
    if (!w) continue
    const next = {
      media: { ...w.media, ...(target.media?.[id] ?? {}) },
      fee: { ...w.fee, ...(target.fee?.[id] ?? {}) },
      adserving: { ...w.adserving, ...(target.adserving?.[id] ?? {}) },
    }
    const changed = [
      ...new Set([
        ...diffCells(w.media, next.media).map((d) => d.month),
        ...diffCells(w.fee, next.fee).map((d) => d.month),
        ...diffCells(w.adserving, next.adserving).map((d) => d.month),
      ]),
    ].sort()
    if (changed.length === 0) continue
    for (const m of changed) ctx.universe.add(m)
    const blocked = changed.filter((m) => !canWrite(w, m))
    const sumsOk =
      sumValues(next.media) === sumValues(w.media) &&
      sumValues(next.fee) === sumValues(w.fee) &&
      sumValues(next.adserving) === sumValues(w.adserving)
    if (blocked.length > 0 || !sumsOk) {
      cannotUndo.push({ lineItemId: w.line.lineItemId, months: blocked })
      warnings.push({
        code: "RESTORE_LINE_NOT_UNDONE",
        lineItemId: w.line.lineItemId,
        message:
          blocked.length > 0
            ? `${w.line.label || id}: cannot undo, ${blocked.join(", ")} ${blocked.length === 1 ? "is" : "are"} locked since.`
            : `${w.line.label || id}: cannot undo, the line total has changed since.`,
      })
      continue
    }
    w.media = next.media
    w.fee = next.fee
    w.adserving = next.adserving
  }
  if (cannotUndo.length > 0) {
    // A true-up is undone whole or not at all: a half undo would leave the
    // schedule matching neither the invoices nor the plan before.
    return fail("NO_CHANGE", "This true-up can't be undone. Months it changed are locked since.", { cannotUndo })
  }
  return finish(ctx, work, {
    warnings,
    hashPayload: { request },
    writableCheck: canWrite,
    minCellChange: 1,
  })
}
