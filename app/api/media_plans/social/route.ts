import { createChannelLineItemsGetHandler } from "@/lib/api/channelLineItemsGetHandler";
import { NextResponse } from 'next/server';
import axios from "axios";
import { xanoAuthHeaderRecord, xanoPostHeaderRecord, xanoUrl } from '@/lib/api/xano';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 60;

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
        ...xanoPostHeaderRecord(),
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

export const GET = createChannelLineItemsGetHandler(
  "media_plan_social",
  "SOCIAL"
);

