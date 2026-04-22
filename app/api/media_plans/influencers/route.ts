import { NextResponse } from 'next/server';
import axios from "axios";
import { fetchAllXanoPages } from '@/lib/api/xanoPagination';
import { filterLineItemsByPlanNumber } from '@/lib/api/mediaPlanVersionHelper';
import { xanoUrl } from '@/lib/api/xano';

// Interface matching the Xano database schema for media_plan_influencers
interface InfluencersData {
  id?: number;
  created_at?: number;
  media_plan_version: number;
  mba_number: string;
  mp_client_name: string;
  mp_plannumber: string;
  platform: string;
  objective: string;
  campaign: string;
  buy_type: string;
  targeting_attribute: string;
  fixed_cost_media: boolean;
  client_pays_for_media: boolean;
  budget_includes_fees: boolean;
  no_adserving: boolean;
  line_item_id: string;
  bursts_json: any; // JSON field
  line_item: number;
}

export async function POST(request: Request) {
  try {
    const data = await request.json();

    if (!data.media_plan_version || !data.mba_number || !data.mp_client_name) {
      return NextResponse.json(
        { error: "Missing required fields: media_plan_version, mba_number, mp_client_name" },
        { status: 400 }
      );
    }

    const bursts = typeof data.bursts_json === "string"
      ? (() => {
          try {
            return JSON.parse(data.bursts_json);
          } catch {
            return [];
          }
        })()
      : (Array.isArray(data.bursts_json) ? data.bursts_json : (data.bursts_json || []));

    const influencersData: InfluencersData = {
      media_plan_version: data.media_plan_version,
      mba_number: data.mba_number,
      mp_client_name: data.mp_client_name,
      mp_plannumber: data.mp_plannumber || "",
      platform: data.platform || "",
      objective: data.objective || "",
      campaign: data.campaign || "",
      buy_type: data.buy_type || "",
      targeting_attribute: data.targeting_attribute || "",
      fixed_cost_media: data.fixed_cost_media !== undefined ? data.fixed_cost_media : false,
      client_pays_for_media: data.client_pays_for_media !== undefined ? data.client_pays_for_media : false,
      budget_includes_fees: data.budget_includes_fees !== undefined ? data.budget_includes_fees : false,
      no_adserving: data.no_adserving !== undefined ? data.no_adserving : false,
      line_item_id: data.line_item_id || "",
      bursts_json: bursts,
      line_item: data.line_item || 1,
    };

    const response = await fetch(
      xanoUrl("media_plan_influencers", ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"]),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(influencersData),
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(errorData.message || "Failed to save influencers data");
    }

    const result = await response.json();
    return NextResponse.json(result);
  } catch (error) {
    console.error("Error saving influencers data:", error);

    let errorMessage = "Failed to save influencers data";
    const statusCode = 500;

    if (error instanceof Error) {
      errorMessage = error.message;
    }

    return NextResponse.json(
      { error: errorMessage },
      { status: statusCode }
    );
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const mbaNumber = searchParams.get('mba_number');
    const mediaPlanVersion = searchParams.get('media_plan_version');
    const mpPlanNumber = searchParams.get('mp_plannumber');

    if (!mbaNumber) {
      return NextResponse.json(
        { error: "mba_number is required" },
        { status: 400 }
      );
    }

    let versionNumber: string | null = null;

    if (mpPlanNumber) {
      versionNumber = mpPlanNumber;
    } else if (mediaPlanVersion) {
      versionNumber = mediaPlanVersion;
    } else {
      try {
        const masterResponse = await axios.get(
          `${xanoUrl("media_plan_master", ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"])}?mba_number=${encodeURIComponent(mbaNumber)}`
        );
        let masterData: any = null;

        if (Array.isArray(masterResponse.data)) {
          masterData = masterResponse.data.find((item: any) => item.mba_number === mbaNumber) || masterResponse.data[0];
        } else {
          masterData = masterResponse.data;
        }

        if (masterData && masterData.version_number) {
          const versionResponse = await axios.get(
            `${xanoUrl("media_plan_versions", ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"])}?media_plan_master_id=${masterData.id}&version_number=${masterData.version_number}`
          );

          let versionData: any = null;
          if (Array.isArray(versionResponse.data)) {
            versionData = versionResponse.data.find((item: any) =>
              item.media_plan_master_id === masterData.id &&
              item.version_number === masterData.version_number
            );
          } else {
            versionData = versionResponse.data;
          }

          if (versionData && versionData.version_number) {
            versionNumber = String(versionData.version_number);
          }
        }
      } catch (versionError) {
        console.error("Error fetching version number from media_plan_versions:", versionError);
        return NextResponse.json(
          { error: "Failed to determine version number. Please provide mp_plannumber or media_plan_version." },
          { status: 400 }
        );
      }
    }

    if (!versionNumber) {
      return NextResponse.json(
        { error: "Could not determine version number. Please provide mp_plannumber or media_plan_version." },
        { status: 400 }
      );
    }

    const baseUrl = xanoUrl("media_plan_influencers", ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"]);

    console.log(`[INFLUENCERS] Fetching from media_plan_influencers table with pagination`);

    const data = await fetchAllXanoPages(
      baseUrl,
      { mba_number: mbaNumber },
      "INFLUENCERS"
    );

    console.log(`[INFLUENCERS] Raw response data count:`, data.length);

    const filteredData = filterLineItemsByPlanNumber(data, mbaNumber, versionNumber, 'INFLUENCERS');

    console.log(`[INFLUENCERS] Final filtered data count: ${filteredData.length} (from ${data.length} total items)`);

    return NextResponse.json(filteredData);
  } catch (error: any) {
    console.error("Error fetching influencers data:", error);

    if (error.response?.status === 404) {
      console.log(`[API] No influencers line items found (404)`);
      return NextResponse.json([]);
    }

    let errorMessage = "Failed to fetch influencers data";
    let statusCode = 500;

    if (error.response) {
      statusCode = error.response.status;
      errorMessage = error.response.data?.message || error.response.data?.error || errorMessage;
    } else if (error.message) {
      errorMessage = error.message;
    }

    console.warn(`[API] Influencers fetch error (${statusCode}): ${errorMessage}, returning empty array`);
    return NextResponse.json([]);
  }
}
