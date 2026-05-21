import { NextResponse } from "next/server";
import axios from "axios";
import { getVersionNumberForMBA, filterLineItemsByPlanNumber } from "@/lib/api/mediaPlanVersionHelper";
import { xanoUrl } from "@/lib/api/xano";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const mbaNumber = searchParams.get("mba_number");
    const mediaPlanVersion = searchParams.get("media_plan_version");
    const mpPlanNumber = searchParams.get("mp_plannumber");

    if (!mbaNumber) {
      return NextResponse.json({ error: "mba_number is required" }, { status: 400 });
    }

    let versionNumber: string | null = null;

    try {
      versionNumber = await getVersionNumberForMBA(mbaNumber, mpPlanNumber, mediaPlanVersion);
    } catch (versionError) {
      console.error("Error fetching version number from media_plan_versions:", versionError);
      return NextResponse.json(
        { error: "Failed to determine version number. Please provide mp_plannumber or media_plan_version." },
        { status: 400 }
      );
    }

    if (!versionNumber) {
      return NextResponse.json(
        { error: "Could not determine version number. Please provide mp_plannumber or media_plan_version." },
        { status: 400 }
      );
    }

    // NOTE: production's Xano endpoint filters by mba_number only — version_number
    // is sent here for forward-compatibility but Xano ignores it. Production line
    // items render across all versions of a campaign until the schema gains an
    // mp_plannumber column (tracked as Domain 4 deferred work). See
    // AUDIT_DOMAIN_4_KNOWN_ISSUES.md.
    const params = new URLSearchParams();
    params.append("mba_number", mbaNumber);
    if (versionNumber !== undefined && versionNumber !== null && String(versionNumber).trim() !== '') {
      params.append("version_number", String(versionNumber));
      params.append("mp_plannumber", String(versionNumber));
      params.append("media_plan_version", String(versionNumber));
    }

    const url = `${xanoUrl("media_plan_production", ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"])}?${params.toString()}`;
    const headers = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    console.log(`[PRODUCTION] Fetching from media_plan_production table`);
    console.log(`[PRODUCTION] Strategy: MBA-wide at Xano (version_number sent for forward-compat; JS filter + MBA fallback)`);
    console.log(`[PRODUCTION] API URL: ${url}`);

    const response = await axios.get(url, { headers, timeout: 10000 });
    const data = Array.isArray(response.data) ? response.data : [];

    console.log(`[PRODUCTION] Raw response data count:`, data.length);

    const filteredData = filterLineItemsByPlanNumber(data, mbaNumber, versionNumber, "PRODUCTION");

    console.log(`[PRODUCTION] Final filtered data count: ${filteredData.length} (from ${data.length} total items)`);

    // If version metadata is missing in Xano, fall back to returning all rows for the MBA
    if (filteredData.length === 0) {
      const mbaMatches = data.filter((item: any) => String(item?.mba_number || "").trim() === mbaNumber);
      return NextResponse.json(mbaMatches);
    }

    return NextResponse.json(filteredData);
  } catch (error) {
    console.error("Error fetching production line items:", error);
    return NextResponse.json({ error: "Failed to fetch production line items" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const data = await request.json();

    const response = await axios.post(
      xanoUrl("media_plan_production", ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"]),
      data,
      {
      headers: {
        "Content-Type": "application/json",
      },
      }
    );

    return NextResponse.json(response.data);
  } catch (error) {
    console.error("Error creating production line item:", error);
    return NextResponse.json({ error: "Failed to create production line item" }, { status: 500 });
  }
}












