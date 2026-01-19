import { NextResponse } from 'next/server';
import axios from "axios";
import { fetchAllXanoPages } from '@/lib/api/xanoPagination';
import { filterLineItemsByPlanNumber } from '@/lib/api/mediaPlanVersionHelper';
import { xanoUrl } from '@/lib/api/xano';

// Interface matching the Xano database schema
interface SocialMediaData {
  id?: number;
  created_at?: number;
  media_plan_version: number;
  mba_number: string;
  mp_client_name: string;
  mp_plannumber: string;
  platform: string;
  bid_strategy: string;
  buy_type: string;
  creative_targeting: string;
  creative: string;
  buying_demo: string;
  market: string;
  fixed_cost_media: boolean;
  client_pays_for_media: boolean;
  budget_includes_fees: boolean;
  line_item_id: string;
  bursts_json: any; // JSON object containing bursts data
  line_item: number;
}

export async function POST(request: Request) {
  try {
    const data = await request.json();
    
    // Validate required fields
    if (!data.media_plan_version || !data.mba_number || !data.mp_client_name) {
      return NextResponse.json(
        { error: "Missing required fields: media_plan_version, mba_number, mp_client_name" },
        { status: 400 }
      );
    }

    // Format the data to match the Xano database schema
    const socialMediaData: SocialMediaData = {
      media_plan_version: data.media_plan_version,
      mba_number: data.mba_number,
      mp_client_name: data.mp_client_name,
      mp_plannumber: data.mp_plannumber || "",
      platform: data.platform || "",
      bid_strategy: data.bid_strategy || "",
      buy_type: data.buy_type || "",
      creative_targeting: data.creative_targeting || "",
      creative: data.creative || "",
      buying_demo: data.buying_demo || "",
      market: data.market || "",
      fixed_cost_media: data.fixed_cost_media !== undefined ? data.fixed_cost_media : false,
      client_pays_for_media: data.client_pays_for_media !== undefined ? data.client_pays_for_media : false,
      budget_includes_fees: data.budget_includes_fees !== undefined ? data.budget_includes_fees : false,
      line_item_id: data.line_item_id || "",
      bursts_json: Array.isArray(data.bursts_json) ? data.bursts_json : (data.bursts_json || []),
      line_item: data.line_item || 1,
    };

    // Send the data to Xano
    const response = await fetch(
      xanoUrl("media_plan_social", ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"]),
      {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(socialMediaData),
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || "Failed to save social media data");
    }

    const result = await response.json();
    return NextResponse.json(result);
  } catch (error) {
    console.error("Error saving social media data:", error);
    
    let errorMessage = "Failed to save social media data";
    let statusCode = 500;
    
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
    
    // mba_number is required
    if (!mbaNumber) {
      return NextResponse.json(
        { error: "mba_number is required" },
        { status: 400 }
      );
    }
    
    // Get the version_number from media_plan_versions table for this mba_number
    let versionNumber: string | null = null;
    
    if (mpPlanNumber) {
      // If mp_plannumber is provided directly, use it
      versionNumber = mpPlanNumber;
    } else if (mediaPlanVersion) {
      // If media_plan_version is provided, use it
      versionNumber = mediaPlanVersion;
    } else {
      // Need to fetch the latest version_number from media_plan_versions table
      try {
        // First get the master data to find the latest version number
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
          // Get the specific version data
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
    
    const baseUrl = xanoUrl("media_plan_social", ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"]);

    console.log(`[SOCIAL] Fetching from media_plan_social table with pagination`);
    console.log(`[SOCIAL] Strategy: Query all records matching mba_number, then filter by version in JavaScript`);

    const data = await fetchAllXanoPages(
      baseUrl,
      { mba_number: mbaNumber },
      "SOCIAL"
    );

    console.log(`[SOCIAL] Raw response data count:`, data.length);

    const filteredData = filterLineItemsByPlanNumber(data, mbaNumber, versionNumber, 'SOCIAL');

    console.log(`[SOCIAL] Final filtered data count: ${filteredData.length} (from ${data.length} total items)`);

    return NextResponse.json(filteredData);
  } catch (error: any) {
    console.error("Error fetching social media data:", error);
    
    // Handle 404 gracefully - just means no line items exist yet
    if (error.response?.status === 404) {
      console.log(`[API] No social media line items found (404)`);
      return NextResponse.json([]);
    }
    
    let errorMessage = "Failed to fetch social media data";
    let statusCode = 500;
    
    if (error.response) {
      statusCode = error.response.status;
      errorMessage = error.response.data?.message || error.response.data?.error || errorMessage;
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    // For other errors, return empty array instead of error to prevent crashes
    console.warn(`[API] Social media fetch error (${statusCode}): ${errorMessage}, returning empty array`);
    return NextResponse.json([]);
  }
}

