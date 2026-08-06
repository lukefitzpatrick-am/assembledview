/**
 * VC1-5 — tip pick vs commercial filter split.
 *
 * Proves: for fixtures where the live tip is booked|approved|completed,
 * dashboard client media totals are identical to the cent under the pre-VC1-5
 * “prefer BAC then highest” tip picker and the new tip→then-BAC path.
 * Commercial set (booked|approved|completed) is unchanged.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  isBookedApprovedCompleted,
  normalizeSchedule,
  resolveDashboardCommercialLiveVersionRow,
  resolveDashboardLiveVersionRow,
  sumLineItems,
} from '../shared'

type VersionRow = {
  mba_number: string
  mp_client_name: string
  version_number: number
  campaign_status: string
  published_at: string | null
  delivery_schedule: unknown
}

/** Pre-VC1-5 global/finance tip picker: prefer BAC by version desc, else highest. */
function legacyPreferCommercialThenHighest(versions: VersionRow[]): VersionRow | null {
  if (!versions.length) return null
  const sorted = versions
    .slice()
    .sort((a, b) => (b.version_number || 0) - (a.version_number || 0))
  const bookedApproved = sorted.find((v) => isBookedApprovedCompleted(v.campaign_status))
  if (bookedApproved) return bookedApproved
  return sorted[0] ?? null
}

function versionMediaCents(version: VersionRow | null): number {
  if (!version) return 0
  const schedule = normalizeSchedule(version.delivery_schedule)
  const dollars = schedule.reduce((sum, entry) => sum + sumLineItems(entry), 0)
  return Math.round(dollars * 100)
}

function costsShapeMonth(monthYear: string, television: string, feeTotal = '$0.00') {
  return {
    monthYear,
    mediaCosts: { television },
    mediaTotal: television,
    feeTotal,
    totalAmount: television,
  }
}

/**
 * Sample clients with fractional cents. Every MBA's live tip is BAC + published,
 * so tip-rule change cannot move dollars — only a commercial-set change would.
 */
const FIXTURE_VERSIONS: VersionRow[] = [
  // Client Acme — MBA-1001 tip v2 booked $2,500.25
  {
    mba_number: 'MBA-1001',
    mp_client_name: 'Acme Foods',
    version_number: 1,
    campaign_status: 'approved',
    published_at: '2025-01-01T00:00:00.000Z',
    delivery_schedule: [costsShapeMonth('July 2025', '$1,000.50')],
  },
  {
    mba_number: 'MBA-1001',
    mp_client_name: 'Acme Foods',
    version_number: 2,
    campaign_status: 'booked',
    published_at: '2025-03-01T00:00:00.000Z',
    delivery_schedule: [costsShapeMonth('August 2025', '$2,500.25')],
  },
  // Client Acme — MBA-1002 tip v1 booked $99.99
  {
    mba_number: 'MBA-1002',
    mp_client_name: 'Acme Foods',
    version_number: 1,
    campaign_status: 'booked',
    published_at: '2025-02-01T00:00:00.000Z',
    delivery_schedule: [costsShapeMonth('September 2025', '$99.99')],
  },
  // Client Birch — MBA-2001 tip = master v1 completed $10.11 (v2 draft unpublished)
  {
    mba_number: 'MBA-2001',
    mp_client_name: 'Birch Retail',
    version_number: 1,
    campaign_status: 'completed',
    published_at: '2025-01-15T00:00:00.000Z',
    delivery_schedule: [costsShapeMonth('October 2025', '$10.11')],
  },
  {
    mba_number: 'MBA-2001',
    mp_client_name: 'Birch Retail',
    version_number: 2,
    campaign_status: 'draft',
    published_at: null,
    delivery_schedule: [costsShapeMonth('November 2025', '$9,999.00')],
  },
  // Client Birch — MBA-2002 tip v3 approved $0.01
  {
    mba_number: 'MBA-2002',
    mp_client_name: 'Birch Retail',
    version_number: 3,
    campaign_status: 'approved',
    published_at: '2025-04-01T00:00:00.000Z',
    delivery_schedule: [costsShapeMonth('December 2025', '$0.01')],
  },
]

/** Master tip when present — Birch MBA-2001 stays on published commercial v1. */
const PUBLISHED_BY_MBA = new Map<string, number>([
  ['MBA-1001', 2],
  ['MBA-1002', 1],
  ['MBA-2001', 1],
  ['MBA-2002', 3],
])

function groupByMba(versions: VersionRow[]): Record<string, VersionRow[]> {
  return versions.reduce(
    (acc, v) => {
      acc[v.mba_number] = acc[v.mba_number] || []
      acc[v.mba_number].push(v)
      return acc
    },
    {} as Record<string, VersionRow[]>,
  )
}

function clientTotalsCents(
  versions: VersionRow[],
  pick: (mbaVersions: VersionRow[], published: number | undefined) => VersionRow | null,
): Record<string, number> {
  const byMba = groupByMba(versions)
  const totals: Record<string, number> = {}
  for (const [mba, mbaVersions] of Object.entries(byMba)) {
    const published = PUBLISHED_BY_MBA.get(mba)
    const chosen = pick(mbaVersions, published)
    if (!chosen) continue
    const client = chosen.mp_client_name
    totals[client] = (totals[client] ?? 0) + versionMediaCents(chosen)
  }
  return totals
}

describe('VC1-5 dashboard tip vs commercial split', () => {
  it('keeps commercial predicate exactly booked | approved | completed', () => {
    assert.equal(isBookedApprovedCompleted('booked'), true)
    assert.equal(isBookedApprovedCompleted('Approved'), true)
    assert.equal(isBookedApprovedCompleted('COMPLETED'), true)
    assert.equal(isBookedApprovedCompleted('planned'), false)
    assert.equal(isBookedApprovedCompleted('draft'), false)
    assert.equal(isBookedApprovedCompleted('cancelled'), false)
  })

  it('resolveDashboardLiveVersionRow never reads campaign_status', () => {
    const rows: VersionRow[] = [
      {
        mba_number: 'MBA-X',
        mp_client_name: 'X',
        version_number: 1,
        campaign_status: 'booked',
        published_at: '2025-01-01T00:00:00.000Z',
        delivery_schedule: [],
      },
      {
        mba_number: 'MBA-X',
        mp_client_name: 'X',
        version_number: 2,
        campaign_status: 'draft',
        published_at: '2025-06-01T00:00:00.000Z',
        delivery_schedule: [],
      },
    ]
    const live = resolveDashboardLiveVersionRow(rows)
    assert.equal(live?.version_number, 2)
    assert.equal(live?.campaign_status, 'draft')
  })

  it('client media totals are identical to the cent before vs after tip split', () => {
    const before = clientTotalsCents(FIXTURE_VERSIONS, (mbaVersions, published) => {
      // Old finance-style: BAC prefer within tip-capped pool, else highest ≤ tip.
      const pool =
        published != null && published > 0
          ? mbaVersions.filter((v) => v.version_number > 0 && v.version_number <= published)
          : mbaVersions
      return legacyPreferCommercialThenHighest(pool.length ? pool : mbaVersions)
    })

    const after = clientTotalsCents(FIXTURE_VERSIONS, (mbaVersions, published) =>
      resolveDashboardCommercialLiveVersionRow(mbaVersions, published),
    )

    assert.deepEqual(before, after)
    // Sanity: real money, not empty / compile-only.
    assert.equal(before['Acme Foods'], 250025 + 9999) // $2,500.25 + $99.99
    assert.equal(before['Birch Retail'], 1011 + 1) // $10.11 + $0.01
  })
})
