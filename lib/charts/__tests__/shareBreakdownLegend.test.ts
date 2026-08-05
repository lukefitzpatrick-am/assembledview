import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  allocateSharePercents,
  buildShareBreakdownRows,
  type ShareBreakdownItem,
} from '../shareBreakdown'

function sumShares(rows: { sharePct: number }[]): number {
  return Math.round(rows.reduce((s, r) => s + r.sharePct, 0) * 10) / 10
}

describe('buildShareBreakdownRows', () => {
  it('returns null when total <= 0', () => {
    const items: ShareBreakdownItem[] = [
      { label: 'A', value: 10, color: 'var(--av-chart-1)' },
    ]
    assert.equal(buildShareBreakdownRows(items, 0), null)
    assert.equal(buildShareBreakdownRows(items, -1), null)
  })

  it('shares sum to 100.0 ± 0.1', () => {
    const items: ShareBreakdownItem[] = [
      { label: 'A', value: 12400, color: 'c1' },
      { label: 'B', value: 8300, color: 'c2' },
      { label: 'C', value: 3100, color: 'c3' },
      { label: 'D', value: 1100, color: 'c4' },
    ]
    const total = items.reduce((s, i) => s + i.value, 0)
    const rows = buildShareBreakdownRows(items, total)!
    assert.ok(rows)
    const sum = sumShares(rows)
    assert.ok(Math.abs(sum - 100) <= 0.1, `share sum ${sum}`)
    assert.equal(sum, 100)
  })

  it('collapses into Other at maxRows+1; Other value equals collapsed sum', () => {
    const items: ShareBreakdownItem[] = Array.from({ length: 10 }, (_, i) => ({
      label: `Ch${i + 1}`,
      value: 1000 - i * 50,
      color: `c${i}`,
    }))
    const total = items.reduce((s, i) => s + i.value, 0)
    const maxRows = 8
    const rows = buildShareBreakdownRows(items, total, maxRows)!
    assert.equal(rows.length, maxRows)
    const other = rows[rows.length - 1]!
    assert.ok(other.isOther)
    assert.match(other.label, /^Other \(3\)$/)
    const sorted = [...items].sort((a, b) => b.value - a.value)
    const collapsedSum = sorted.slice(maxRows - 1).reduce((s, r) => s + r.value, 0)
    assert.equal(other.value, collapsedSum)
    assert.equal(sumShares(rows), 100)
  })
})

describe('allocateSharePercents', () => {
  it('always returns tenths that sum to 100', () => {
    const values = [1, 1, 1]
    const pcts = allocateSharePercents(values, 3)
    assert.equal(Math.round(pcts.reduce((s, n) => s + n, 0) * 10) / 10, 100)
  })
})
