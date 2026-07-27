import { createChannelLineItemsGetHandler } from "@/lib/api/channelLineItemsGetHandler";
import { NextResponse } from 'next/server';
import axios from "axios";
import { xanoAuthHeaderRecord, xanoPostHeaderRecord, xanoUrl } from '@/lib/api/xano';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 60;

// Interface matching the Xano database schema for media_plan_integrations
interface IntegrationData {
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
  bid_strategy: string;
  creative_targeting: string;
  creative: string;
  buying_demo: string;
  market: string;
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

    const integrationData: IntegrationData = {
      media_plan_version: data.media_plan_version,
      mba_number: data.mba_number,
      mp_client_name: data.mp_client_name,
      mp_plannumber: data.mp_plannumber || "",
      platform: data.platform || "",
      objective: data.objective || "",
      campaign: data.campaign || "",
      buy_type: data.buy_type || "",
      targeting_attribute: data.targeting_attribute || "",
      bid_strategy: data.bid_strategy || "",
      creative_targeting: data.creative_targeting || "",
      creative: data.creative || "",
      buying_demo: data.buying_demo || "",
      market: data.market || "",
      fixed_cost_media: data.fixed_cost_media !== undefined ? data.fixed_cost_media : false,
      client_pays_for_media: data.client_pays_for_media !== undefined ? data.client_pays_for_media : false,
      budget_includes_fees: data.budget_includes_fees !== undefined ? data.budget_includes_fees : false,
      no_adserving: data.no_adserving !== undefined ? data.no_adserving : false,
      line_item_id: data.line_item_id || "",
      bursts_json: bursts,
      line_item: data.line_item || 1,
    };

    const response = await fetch(
      xanoUrl("media_plan_integrations", ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"]),
      {
        method: 'POST',
        headers: {
        ...xanoPostHeaderRecord(),
      },
        body: JSON.stringify(integrationData),
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(errorData.message || "Failed to save integration data");
    }

    const result = await response.json();
    return NextResponse.json(result);
  } catch (error) {
    console.error("Error saving integration data:", error);

    let errorMessage = "Failed to save integration data";
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

export const GET = createChannelLineItemsGetHandler(
  "media_plan_integrations",
  "INTEGRATION"
);

