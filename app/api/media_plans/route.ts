import { NextResponse } from 'next/server';
import { getCachedMediaPlanVersions } from '@/lib/api/mediaPlanVersionsCache';

// Define the type for a MediaPlan object to ensure type safety
// This should match the type definition in your page.tsx
type MediaPlan = {
  id: number;
  mp_client_name: string;
  mp_campaignname: string;
  mp_mba_number: string; // Added for new table requirement
  mp_version: number;     // Added for "latest version" logic
  mp_brand: string;
  mp_campaignstatus: string; // e.g., "Booked", "Approved", "Completed"
  mp_campaigndates_start: string;
  mp_campaigndates_end: string;
  mp_campaignbudget: number;
  // Keep your boolean media type fields as they are
  mp_television: boolean;
  mp_radio: boolean;
  mp_newspaper: boolean;
  mp_magazines: boolean;
  mp_ooh: boolean;
  mp_cinema: boolean;
  mp_digidisplay: boolean;
  mp_digiaudio: boolean;
  mp_digivideo: boolean;
  mp_bvod: boolean;
  mp_integration: boolean;
  mp_search: boolean;
  mp_socialmedia: boolean;
  mp_progdisplay: boolean;
  mp_progvideo: boolean;
  mp_progbvod: boolean;
  mp_progaudio: boolean;
  mp_progooh: boolean;
  mp_influencers: boolean;
};

export async function GET() {
  const t0 = Date.now()
  try {
    const { data, stale } = await getCachedMediaPlanVersions()

    // Idempotent safeguard: latest-endpoint already returns one row per MBA.
    // Keep the JS highest-version reduction so an env override to a full-history
    // endpoint still yields one card per MBA.
    const filteredData = Object.values(
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

    console.log(
      `[media_plans] served ${filteredData.length} rows in ${Date.now() - t0}ms stale=${stale}`
    )

    if (stale) {
      return NextResponse.json(filteredData, {
        status: 200,
        headers: { 'x-warning': 'served-stale-after-upstream-failure' },
      })
    }

    return NextResponse.json(filteredData)
  } catch {
    // No last-known-good has ever existed (or cache rejected with no entry)
    return NextResponse.json({ error: "upstream unavailable" }, { status: 502 })
  }
}
