"use server"

import { NextResponse } from "next/server";
import axios from "axios";
import { getVersionNumberForMBA, filterLineItemsByPlanNumber } from "@/lib/api/mediaPlanVersionHelper";

const XANO_PRODUCTION_BASE_URL = process.env.XANO_PRODUCTION_BASE_URL || "https://xg4h-uyzs-dtex.a2.xano.io/api:RaUx9FOa";

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

    const params = new URLSearchParams();
    params.append("mba_number", mbaNumber);

    const url = `${XANO_PRODUCTION_BASE_URL}/media_plan_production?${params.toString()}`;
    const headers = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    const response = await axios.get(url, { headers, timeout: 10000 });
    const data = Array.isArray(response.data) ? response.data : [];

    const filteredData = filterLineItemsByPlanNumber(data, mbaNumber, versionNumber, "PRODUCTION");

    return NextResponse.json(filteredData);
  } catch (error) {
    console.error("Error fetching production line items:", error);
    return NextResponse.json({ error: "Failed to fetch production line items" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const data = await request.json();

    const response = await axios.post(`${XANO_PRODUCTION_BASE_URL}/media_plan_production`, data, {
      headers: {
        "Content-Type": "application/json",
      },
    });

    return NextResponse.json(response.data);
  } catch (error) {
    console.error("Error creating production line item:", error);
    return NextResponse.json({ error: "Failed to create production line item" }, { status: 500 });
  }
}





