/**
 * Pure billing revision planner (design 2026-10-26, section 3).
 *
 * Takes the published tip's billing-basis cells per line, the month locks
 * and a request. Returns before/after per line and month. Never touches the
 * DB or the clock.
 *
 * Laws (asserted at the end, a breach throws RevisionInvariantError):
 * - every line keeps its media, fee and ad serving totals to the cent;
 * - no cell outside the request's writable months changes;
 * - no cell goes negative;
 * - skipped lines are untouched;
 * - amount modes move exactly the amount asked for.
 *
 * Luke's answers (26 Oct 18:39) baked in:
 * - Q3 bill amount defaults to earliest months first (caller default).
 * - Q4 approved, not sent months open only when ticked (unlockApprovedMonths).
 * - Q5 underspend with no open month left needs a choice per line:
 *   the line's last month, or a credit (change-log note only, no cell change).
 * - Q7 ad serving stays on delivery timing (never moved).
 * - Q8 a month before the campaign start is a valid prebill target.
 */

import { createHash } from "node:crypto"

import { allocateCents } from "./allocateCents"
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
  type SkipReason,
  type UnderspendChoiceNeeded,
  type UnderspendCredit,
} from "./types"

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/

export function isMonthKey(value: unknown): value is MonthKey {
  return typeof value === "string" && MONTH_RE.test(value)
}

export function addMonthKeys(month: MonthKey, delta: number): MonthKey {
  const [ys, ms] = month.split("-")
  const idx = Number(ys) * 12 + (Number(ms) - 1) + delta
  const y = Math.floor(idx / 12)
  const m = (idx % 12) + 1
  return `${y}-${String(m).padStart(2, "0")}`
}

/** Inclusive month range. Empty when start > end. */
export function monthKeyRange(start: MonthKey, end: MonthKey): MonthKey[] {
  const out: MonthKey[] = []
  if (!isMonthKey(start) || !isMonthKey(end) || start > end) return out
  let m = start
  while (m <= end && out.length < 600) {
    out.push(m)
    m = addMonthKeys(m, 1)
  }
  return out
}

/**
 * Lock for a month with no finance evidence: past months carry the
 * past_month flag; months after the campaign end are hard.
 */
export function defaultMonthLock(
  month: MonthKey,
  currentMonth: MonthKey,
  lastCampaignMonth: MonthKey | null,
): MonthLock {
  const past = month < currentMonth
  const reasons: MonthLock["reasons"] = past ? ["past_month"] : []
  if (lastCampaignMonth && month > lastCampaignMonth) {
    return { month, level: "hard", reasons: [...reasons, "after_campaign"], past }
  }
  return { month, level: "open", reasons, past }
}

type Work = {
  line: RevisionLine
  index: number
  media: Record<MonthKey, Cents>
  fee: Record<MonthKey, Cents>
}

function sumValues(rec: Record<string, number>): number {
  let s = 0
  for (const v of Object.values(rec)) s += v
  return s
}

function cell(rec: Record<string, number>, m: MonthKey): number {
  return rec[m] ?? 0
}

function fmt(cents: number): string {
  const sign = cents < 0 ? "-" : ""
  const abs = Math.abs(cents)
  const dollars = Math.floor(abs / 100).toLocaleString("en-AU")
  return `${sign}$${dollars}.${String(abs % 100).padStart(2, "0")}`
}

function fail(
  code: RevisionFail["code"],
  message: string,
  extra: Partial<Omit<RevisionFail, "ok" | "code" | "message">> = {},
): RevisionFail {
  return { ok: false, code, message, ...extra }
}

function skipReasonFor(line: RevisionLine, input: RevisionInput): SkipReason | null {
  if (line.clientPaysForMedia) return "client_pays"
  if (line.isProduction && !input.options.includeProduction) return "production"
  const filter = input.options.lineFilter
  if (filter && filter.length > 0 && !filter.includes(line.lineItemId)) return "filtered"
  return null
}

function diffCells(
  before: Record<MonthKey, Cents>,
  after: Record<MonthKey, Cents>,
): CellDiff[] {
  const months = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()
  const out: CellDiff[] = []
  for (const m of months) {
    const b = cell(before, m)
    const a = cell(after, m)
    if (a !== b) out.push({ month: m, before: b, after: a })
  }
  return out
}

function stripZeros(rec: Record<MonthKey, Cents>): Record<MonthKey, Cents> {
  const out: Record<MonthKey, Cents> = {}
  for (const k of Object.keys(rec).sort()) {
    if (rec[k] !== 0) out[k] = rec[k]!
  }
  return out
}

export function planBillingRevision(input: RevisionInput): RevisionResult {
  const { request, options, currentMonth } = input
  if (!isMonthKey(currentMonth)) return fail("BAD_MONTH", `Current month "${currentMonth}" is not YYYY-MM`)

  const campaignMonths = [...new Set(input.campaignMonths.filter(isMonthKey))].sort()
  const firstCampaign = campaignMonths[0] ?? null
  const lastCampaign = campaignMonths[campaignMonths.length - 1] ?? null

  const lockMap = new Map<MonthKey, MonthLock>()
  for (const l of input.locks) lockMap.set(l.month, l)
  const lockOf = (m: MonthKey): MonthLock =>
    lockMap.get(m) ?? defaultMonthLock(m, currentMonth, lastCampaign)
  const unlocked = new Set(options.unlockApprovedMonths ?? [])
  const aaLocked = new Set(input.aaLockedMonths ?? [])

  const levelOf = (m: MonthKey, line?: RevisionLine): LockLevel => {
    const lk = lockOf(m)
    let level = lk.level
    if (level === "soft" && unlocked.has(m)) level = "open"
    if (line?.isAaLine && aaLocked.has(m)) level = "hard"
    return level
  }
  const isPast = (m: MonthKey): boolean => m < currentMonth || lockOf(m).past
  /** A month bill-ahead may take from or put into. */
  const aheadOk = (m: MonthKey, line?: RevisionLine): boolean =>
    levelOf(m, line) === "open" && !isPast(m)

  const warnings: RevisionWarning[] = []
  const credits: UnderspendCredit[] = []
  const extraWritable = new Set<MonthKey>()

  const skipped = new Map<string, SkipReason>()
  const work: Work[] = []
  input.lines.forEach((line, index) => {
    const reason = skipReasonFor(line, input)
    if (reason) {
      skipped.set(line.lineItemId, reason)
      return
    }
    work.push({ line, index, media: { ...line.media }, fee: { ...line.fee } })
  })
  const byId = new Map(work.map((w) => [w.line.lineItemId, w]))

  const universe = new Set<MonthKey>(campaignMonths)
  for (const l of input.locks) if (isMonthKey(l.month)) universe.add(l.month)
  for (const line of input.lines) {
    for (const rec of [line.media, line.fee, line.adserving]) {
      for (const m of Object.keys(rec)) if (isMonthKey(m)) universe.add(m)
    }
  }

  const months = (): MonthKey[] => [...universe].sort()

  const checkTarget = (into: MonthKey): RevisionFail | null => {
    if (!isMonthKey(into)) return fail("BAD_MONTH", `Bill-into month "${into}" is not YYYY-MM`)
    universe.add(into)
    if (into < currentMonth) {
      return fail("TARGET_IN_PAST", `${into} is before the current month (${currentMonth}).`, {
        lockedMonths: [lockOf(into)],
      })
    }
    if (lastCampaign && into > lastCampaign) {
      return fail("TARGET_OUTSIDE_CAMPAIGN", `${into} is after the campaign ends (${lastCampaign}).`, {
        lockedMonths: [lockOf(into)],
      })
    }
    if (levelOf(into) !== "open") {
      const lk = lockOf(into)
      return fail(
        "TARGET_LOCKED",
        `${into} is locked (${lk.reasons.join(", ") || lk.level}).${
          lk.level === "soft" ? " Tick it open to change it. It will then need Re-approve." : ""
        }`,
        { lockedMonths: [lk] },
      )
    }
    if (firstCampaign && into < firstCampaign) {
      warnings.push({
        code: "PREBILL_BEFORE_START",
        month: into,
        message: `${into} is before the campaign starts (${firstCampaign}). This is a prebill.`,
      })
    }
    return null
  }

  const futureOpen = (into: MonthKey, line: RevisionLine): MonthKey[] =>
    months().filter((m) => m > into && aheadOk(m, line))

  const warnAaSkip = (w: Work, m: MonthKey) => {
    warnings.push({
      code: "AA_LINE_LOCKED",
      lineItemId: w.line.lineItemId,
      month: m,
      message: `${w.line.label || w.line.lineItemId}: ${m} is in a sent AA pack. Line left as is.`,
    })
  }

  let movedCents = 0
  let intoMonth: MonthKey | null = null
  const cannotUndo: Array<{ lineItemId: string; months: MonthKey[] }> = []

  switch (request.mode) {
    case "pull_month": {
      const { fromMonth, intoMonth: into } = request
      const bad = checkTarget(into)
      if (bad) return bad
      if (!isMonthKey(fromMonth)) return fail("BAD_MONTH", `Source month "${fromMonth}" is not YYYY-MM`)
      if (fromMonth === into) return fail("SAME_MONTH", "Pick two different months.")
      universe.add(fromMonth)
      if (!aheadOk(fromMonth)) {
        const lk = lockOf(fromMonth)
        return fail(
          "SOURCE_LOCKED",
          `${fromMonth} is locked (${lk.reasons.join(", ") || lk.level}).`,
          { lockedMonths: [lk] },
        )
      }
      intoMonth = into
      for (const w of work) {
        const x = cell(w.media, fromMonth)
        if (x === 0) continue
        if (!aheadOk(fromMonth, w.line) || !aheadOk(into, w.line)) {
          warnAaSkip(w, aheadOk(fromMonth, w.line) ? into : fromMonth)
          continue
        }
        w.media[fromMonth] = 0
        w.media[into] = cell(w.media, into) + x
        movedCents += x
      }
      if (movedCents === 0) return fail("SOURCE_EMPTY", `${fromMonth} has no media to move.`)
      break
    }

    case "bill_remainder": {
      const into = request.intoMonth
      const bad = checkTarget(into)
      if (bad) return bad
      intoMonth = into
      for (const w of work) {
        if (!aheadOk(into, w.line)) {
          if (Object.values(w.media).some((v) => v !== 0)) warnAaSkip(w, into)
          continue
        }
        for (const m of futureOpen(into, w.line)) {
          const x = cell(w.media, m)
          if (x === 0) continue
          w.media[m] = 0
          w.media[into] = cell(w.media, into) + x
          movedCents += x
        }
      }
      if (movedCents === 0) return fail("SOURCE_EMPTY", `No media left in open months after ${into}.`)
      break
    }

    case "bill_amount": {
      const into = request.intoMonth
      const bad = checkTarget(into)
      if (bad) return bad
      intoMonth = into
      const amount = request.amountCents
      if (!Number.isInteger(amount) || amount <= 0) {
        return fail("AMOUNT_NOT_POSITIVE", "Enter an amount above $0.00.")
      }
      const usable = work.filter((w) => aheadOk(into, w.line))
      let pool = 0
      for (const w of usable) for (const m of futureOpen(into, w.line)) pool += cell(w.media, m)
      if (amount > pool) {
        return fail(
          "AMOUNT_EXCEEDS_AVAILABLE",
          `Only ${fmt(pool)} is left in open months after ${into}. Nothing was moved.`,
          { availableCents: pool },
        )
      }
      if (request.strategy === "earliest_first") {
        let remaining = amount
        for (const m of months().filter((x) => x > into)) {
          if (remaining <= 0) break
          const weights = usable
            .filter((w) => aheadOk(m, w.line) && cell(w.media, m) > 0)
            .map((w) => [w.line.lineItemId, cell(w.media, m)] as const)
          const available = weights.reduce((s, [, v]) => s + v, 0)
          if (available === 0) continue
          const take = Math.min(remaining, available)
          const shares = allocateCents(take, weights)
          for (const [id, share] of shares) {
            const w = byId.get(id)!
            w.media[m] = cell(w.media, m) - share
            w.media[into] = cell(w.media, into) + share
          }
          remaining -= take
          movedCents += take
        }
      } else {
        const entries: Array<readonly [string, number]> = []
        for (const w of usable) {
          for (const m of futureOpen(into, w.line)) {
            const v = cell(w.media, m)
            if (v > 0) entries.push([`${w.line.lineItemId}\u0000${m}`, v] as const)
          }
        }
        const shares = allocateCents(amount, entries)
        for (const [key, share] of shares) {
          const [id, m] = key.split("\u0000") as [string, MonthKey]
          const w = byId.get(id)!
          w.media[m] = cell(w.media, m) - share
          w.media[into] = cell(w.media, into) + share
          movedCents += share
        }
      }
      break
    }

    case "underspend": {
      const month = request.month
      if (!isMonthKey(month)) return fail("BAD_MONTH", `Underspend month "${month}" is not YYYY-MM`)
      universe.add(month)
      const lk = lockOf(month)
      const level = levelOf(month)
      if (level === "hard") {
        return fail(
          "MONTH_HARD_LOCKED",
          `${month} is invoiced (${lk.reasons.join(", ")}). Underspend on invoiced months is not handled here.`,
          { lockedMonths: [lk] },
        )
      }
      if (level === "soft") {
        return fail(
          "SOURCE_LOCKED",
          `${month} is approved. Tick it open to record the underspend. It will then need Re-approve.`,
          { lockedMonths: [lk] },
        )
      }
      extraWritable.add(month)
      const choicesNeeded: UnderspendChoiceNeeded[] = []
      for (const [lineId, actual] of Object.entries(request.actualByLine)) {
        const w = byId.get(lineId)
        if (!w) {
          warnings.push({
            code: "UNDERSPEND_LINE_SKIPPED",
            lineItemId: lineId,
            message: `${lineId} is not billed through this tool (${skipped.get(lineId) ?? "unknown line"}).`,
          })
          continue
        }
        if (levelOf(month, w.line) !== "open") {
          warnAaSkip(w, month)
          continue
        }
        if (!Number.isInteger(actual)) return fail("BAD_MONTH", `Actual for ${lineId} is not whole cents.`)
        if (actual < 0) {
          return fail("UNDERSPEND_ACTUAL_NEGATIVE", `${w.line.label || lineId}: the actual cannot be below $0.00.`)
        }
        const plan = cell(w.media, month)
        if (actual > plan) {
          return fail(
            "UNDERSPEND_ACTUAL_ABOVE_PLAN",
            `${w.line.label || lineId}: actual ${fmt(actual)} is above the plan ${fmt(plan)}. Overspend is not handled here.`,
          )
        }
        const gap = plan - actual
        if (gap === 0) continue
        const targets = months().filter(
          (m) => m > month && m >= currentMonth && aheadOk(m, w.line) && cell(w.media, m) > 0,
        )
        if (targets.length > 0) {
          w.media[month] = actual
          const shares = allocateCents(
            gap,
            targets.map((m) => [m, cell(w.media, m)] as const),
          )
          for (const [m, share] of shares) w.media[m] = cell(w.media, m) + share
          movedCents += gap
          continue
        }
        const later = Object.keys(w.line.media)
          .filter((m) => m > month && cell(w.line.media, m) > 0)
          .sort()
        const last = later[later.length - 1] ?? null
        const lastOk = last != null && levelOf(last, w.line) === "open"
        const choice = request.noRemaining?.[lineId]
        if (!choice) {
          choicesNeeded.push({
            lineItemId: lineId,
            label: w.line.label,
            gapCents: gap,
            lastMonth: lastOk ? last : null,
          })
          continue
        }
        if (choice === "last_month") {
          if (!lastOk || last == null) {
            return fail(
              "LAST_MONTH_UNAVAILABLE",
              `${w.line.label || lineId}: the line has no later month that can take ${fmt(gap)}. Record a credit instead.`,
            )
          }
          w.media[month] = actual
          w.media[last] = cell(w.media, last) + gap
          extraWritable.add(last)
          movedCents += gap
          warnings.push({
            code: "UNDERSPEND_TO_LAST_MONTH",
            lineItemId: lineId,
            month: last,
            message: `${w.line.label || lineId}: ${fmt(gap)} moved to the line's last month, ${last}.`,
          })
        } else {
          credits.push({ lineItemId: lineId, month, cents: gap })
          warnings.push({
            code: "UNDERSPEND_CREDIT_NOTED",
            lineItemId: lineId,
            month,
            message: `${w.line.label || lineId}: credit of ${fmt(gap)} for ${month} noted in the change log. The schedule is not changed and nothing goes to Xero.`,
          })
        }
      }
      if (choicesNeeded.length > 0) {
        return fail(
          "UNDERSPEND_NEEDS_CHOICE",
          "Some lines have no open month left for the gap. Choose the line's last month or a credit for each.",
          { choicesNeeded },
        )
      }
      break
    }

    case "restore": {
      const target = request.target
      const ids = [...new Set([...Object.keys(target.media ?? {}), ...Object.keys(target.fee ?? {})])]
      for (const id of ids) {
        const w = byId.get(id)
        if (!w) continue
        const nextMedia = { ...w.media, ...(target.media?.[id] ?? {}) }
        const nextFee = { ...w.fee, ...(target.fee?.[id] ?? {}) }
        for (const m of [...Object.keys(nextMedia), ...Object.keys(nextFee)]) {
          if (isMonthKey(m)) universe.add(m)
        }
        const changed = [
          ...new Set([
            ...diffCells(w.media, nextMedia).map((d) => d.month),
            ...diffCells(w.fee, nextFee).map((d) => d.month),
          ]),
        ].sort()
        if (changed.length === 0) continue
        const blocked = changed.filter((m) => levelOf(m, w.line) !== "open")
        const sumsOk =
          sumValues(nextMedia) === sumValues(w.media) && sumValues(nextFee) === sumValues(w.fee)
        if (blocked.length > 0 || !sumsOk) {
          cannotUndo.push({ lineItemId: id, months: blocked })
          warnings.push({
            code: "RESTORE_LINE_NOT_UNDONE",
            lineItemId: id,
            message:
              blocked.length > 0
                ? `${w.line.label || id}: cannot undo, ${blocked.join(", ")} ${blocked.length === 1 ? "is" : "are"} locked since.`
                : `${w.line.label || id}: cannot undo, the line total has changed since.`,
          })
          continue
        }
        for (const m of changed) extraWritable.add(m)
        for (const d of diffCells(w.media, nextMedia)) {
          if (d.after > d.before) movedCents += d.after - d.before
        }
        w.media = nextMedia
        w.fee = nextFee
      }
      break
    }
  }

  const writable = (m: MonthKey, line: RevisionLine): boolean =>
    levelOf(m, line) === "open" && (!isPast(m) || extraWritable.has(m))

  // Fee follows media (D1, D2), restore sets fee directly.
  if (request.mode !== "restore" && options.feeMode === "follow") {
    for (const w of work) {
      const orig = w.line
      if (diffCells(orig.media, w.media).length === 0) continue
      if (!Object.values(orig.fee).some((v) => v !== 0)) continue
      const feeMonths = [...new Set([...months(), ...Object.keys(orig.fee)])].sort()
      const openMonths = feeMonths.filter((m) => writable(m, orig))
      let lockedFee = 0
      for (const m of feeMonths) if (!writable(m, orig)) lockedFee += cell(orig.fee, m)
      const pool = sumValues(orig.fee) - lockedFee
      const weights = openMonths
        .filter((m) => cell(w.media, m) > 0)
        .map((m) => [m, cell(w.media, m)] as const)
      if (weights.length === 0) {
        if (pool !== 0) {
          warnings.push({
            code: "FEE_NO_MEDIA",
            lineItemId: orig.lineItemId,
            message: `${orig.label || orig.lineItemId}: no open month has media, so the fee stays where it was.`,
          })
        }
        continue
      }
      const nextFee: Record<MonthKey, Cents> = {}
      for (const m of feeMonths) if (!writable(m, orig) && cell(orig.fee, m) !== 0) nextFee[m] = cell(orig.fee, m)
      for (const m of openMonths) nextFee[m] = 0
      for (const [m, share] of allocateCents(pool, weights)) nextFee[m] = share
      w.fee = nextFee
    }
  }

  // Laws.
  for (const w of work) {
    const orig = w.line
    if (sumValues(w.media) !== sumValues(orig.media)) {
      throw new RevisionInvariantError(`${orig.lineItemId}: media total changed`)
    }
    if (sumValues(w.fee) !== sumValues(orig.fee)) {
      throw new RevisionInvariantError(`${orig.lineItemId}: fee total changed`)
    }
    for (const rec of [w.media, w.fee]) {
      for (const [m, v] of Object.entries(rec)) {
        if (!Number.isInteger(v) || v < 0) throw new RevisionInvariantError(`${orig.lineItemId} ${m}: bad cell ${v}`)
      }
    }
    for (const d of [...diffCells(orig.media, w.media), ...diffCells(orig.fee, w.fee)]) {
      if (!writable(d.month, orig)) {
        throw new RevisionInvariantError(`${orig.lineItemId} ${d.month}: locked cell changed`)
      }
    }
  }
  if (request.mode === "bill_amount" && movedCents !== request.amountCents) {
    throw new RevisionInvariantError(`moved ${movedCents} but asked for ${request.amountCents}`)
  }
  if (intoMonth && (request.mode === "bill_amount" || request.mode === "bill_remainder" || request.mode === "pull_month")) {
    let landed = 0
    for (const w of work) landed += cell(w.media, intoMonth) - cell(w.line.media, intoMonth)
    if (landed !== movedCents) throw new RevisionInvariantError(`landed ${landed} != moved ${movedCents}`)
  }

  if (input.hasFixedHeaderFee) {
    warnings.push({
      code: "FIXED_FEE_NOT_MOVED",
      message: "The plan has a fixed fee on the month header. It is not moved.",
    })
  }

  const afterCells: RevisionOk["afterCells"] = []
  for (const w of work) {
    const mediaChanged = diffCells(w.line.media, w.media).length > 0
    const feeChanged = diffCells(w.line.fee, w.fee).length > 0
    if (!mediaChanged && !feeChanged) continue
    afterCells.push({
      lineItemId: w.line.lineItemId,
      media: stripZeros(w.media),
      fee: stripZeros(w.fee),
      mediaChanged,
      feeChanged,
    })
  }

  if (afterCells.length === 0 && credits.length === 0) {
    if (request.mode === "restore" && cannotUndo.length > 0) {
      return fail("NO_CHANGE", "Nothing can be undone. Every changed month is locked since.", { cannotUndo })
    }
    return fail("NO_CHANGE", "This change moves nothing.")
  }

  const workById = new Map(work.map((w) => [w.line.lineItemId, w]))
  const lines: LineDiff[] = input.lines.map((line) => {
    const reason = skipped.get(line.lineItemId)
    const w = workById.get(line.lineItemId)
    return {
      lineItemId: line.lineItemId,
      label: line.label,
      media: w ? diffCells(line.media, w.media) : [],
      fee: w ? diffCells(line.fee, w.fee) : [],
      adserving: [],
      ...(reason ? { skipped: reason } : {}),
    }
  })

  const monthDiffs: MonthDiff[] = months().map((m) => {
    let mb = 0
    let ma = 0
    let fb = 0
    let fa = 0
    let ab = 0
    let pb = 0
    let pa = 0
    for (const line of input.lines) {
      const w = workById.get(line.lineItemId)
      const before = cell(line.media, m)
      const after = w ? cell(w.media, m) : before
      if (line.isProduction) {
        pb += before
        pa += after
      } else if (!line.clientPaysForMedia) {
        mb += before
        ma += after
      }
      fb += cell(line.fee, m)
      fa += w ? cell(w.fee, m) : cell(line.fee, m)
      ab += cell(line.adserving, m)
    }
    return {
      month: m,
      lock: lockOf(m),
      effectiveLevel: levelOf(m),
      media: { month: m, before: mb, after: ma },
      fee: { month: m, before: fb, after: fa },
      adserving: { month: m, before: ab, after: ab },
      production: { month: m, before: pb, after: pa },
      total: { month: m, before: mb + fb + ab + pb, after: ma + fa + ab + pa },
    }
  })

  const hash = hashRevisionPlan({
    request,
    options: {
      unlockApprovedMonths: [...unlocked].sort(),
      includeProduction: options.includeProduction,
      feeMode: options.feeMode,
      adservingMode: options.adservingMode,
      lineFilter: options.lineFilter ? [...options.lineFilter].sort() : null,
    },
    locks: months().map((m) => [m, levelOf(m), [...lockOf(m).reasons].sort()]),
    aaLocked: [...aaLocked].sort(),
    afterCells,
    credits,
  })

  return {
    ok: true,
    lines,
    months: monthDiffs,
    movedCents,
    credits,
    warnings,
    cannotUndo,
    afterCells,
    hash,
  }
}

/** Stable JSON (sorted object keys) then sha256 hex. */
export function hashRevisionPlan(payload: unknown): string {
  return createHash("sha256").update(stableStringify(payload)).digest("hex")
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null"
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`
  const obj = value as Record<string, unknown>
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`
}
