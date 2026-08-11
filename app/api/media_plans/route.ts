import { NextRequest, NextResponse } from 'next/server';
import { getCachedMediaPlanVersions } from '@/lib/api/mediaPlanVersionsCache';
import { resolveClientMbaScope } from '@/lib/auth/checkClientMbaAccess';
import { requireRole } from '@/lib/requireRole';

function planMbaNumber(plan: unknown): string {
  if (!plan || typeof plan !== 'object') return '';
  const raw =
    (plan as { mba_number?: unknown; mp_mba_number?: unknown }).mba_number ??
    (plan as { mp_mba_number?: unknown }).mp_mba_number;
  return typeof raw === 'string' ? raw.trim() : String(raw ?? '').trim();
}

export async function GET(request: NextRequest) {
  const t0 = Date.now()
  try {
    // Twin of GET /api/mediaplans (SEC-2): staff full list; client MBA-scoped.
    const scope = await resolveClientMbaScope(request)
    if (!scope.ok) return scope.response
    if (!scope.isClient) {
      const gate = await requireRole(request, ["admin"])
      if ("response" in gate) return gate.response
    }

    const { data, stale, fetchedAt } = await getCachedMediaPlanVersions()

    // Idempotent safeguard: latest-endpoint already returns one row per MBA.
    // Keep the JS highest-version reduction so an env override to a full-history
    // endpoint still yields one card per MBA.
    const latestPerMba = Object.values(
      data.reduce((acc: Record<string, any>, plan: any) => {
        const mbaNumber = plan.mba_number;
        if (!mbaNumber) {
          // Skip plans without an MBA number
          return acc;
        }
        // Use version_number field from media_plan_versions
        const versionNumber = plan.version_number || 0;
        if (!acc[mbaNumber] || (acc[mbaNumber].version_number || 0) < versionNumber) {
          acc[mbaNumber] = plan;
        }
        return acc;
      }, {} as Record<string, any>)
    );

    const filteredData = scope.isClient
      ? latestPerMba.filter((plan) => scope.allows(planMbaNumber(plan)))
      : latestPerMba

    console.log(
      `[media_plans] served ${filteredData.length} rows in ${Date.now() - t0}ms stale=${stale}` +
        (scope.isClient ? ` (client-filtered from ${latestPerMba.length})` : "")
    )

    const headers: Record<string, string> = {}
    if (fetchedAt != null) {
      headers["x-cache-fetched-at"] = String(fetchedAt)
    }
    if (stale) {
      headers["x-warning"] = "served-stale-after-upstream-failure"
    }

    return NextResponse.json(filteredData, {
      status: 200,
      headers: Object.keys(headers).length > 0 ? headers : undefined,
    })
  } catch {
    // No last-known-good has ever existed (or cache rejected with no entry)
    return NextResponse.json({ error: "upstream unavailable" }, { status: 502 })
  }
}
