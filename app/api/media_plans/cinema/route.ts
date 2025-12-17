import { NextResponse } from "next/server";
import axios from "axios";
import { getVersionNumberForMBA, filterLineItemsByPlanNumber } from '@/lib/api/mediaPlanVersionHelper';

const XANO_CINEMA_BASE_URL = process.env.XANO_CINEMA_BASE_URL || "https://xg4h-uyzs-dtex.a2.xano.io/api:RaUx9FOa";

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
    
    // Query ONLY by mba_number to scan entire database
    // Then filter by mp_plannumber in JavaScript to ensure we get all matching records
    const params = new URLSearchParams();
    params.append('mba_number', mbaNumber);
    
    const url = `${XANO_CINEMA_BASE_URL}/media_plan_cinema?${params.toString()}`;
    
    console.log(`[CINEMA] Fetching from media_plan_cinema table`);
    console.log(`[CINEMA] Strategy: Query all records matching mba_number, then filter by mp_plannumber=${versionNumber} in JavaScript`);
    console.log(`[CINEMA] API URL: ${url}`);
    
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };
    
    const response = await axios.get(url, { 
      headers,
      timeout: 10000 
    });
    
    console.log(`[CINEMA] API response status: ${response.status}`);
    console.log(`[CINEMA] Raw response data count:`, Array.isArray(response.data) ? response.data.length : 'not an array');
    
    // Ensure we return an array
    const data = Array.isArray(response.data) ? response.data : [];
    
    // Strict client-side filtering to ensure exact matches
    const filteredData = filterLineItemsByPlanNumber(data, mbaNumber, versionNumber, 'CINEMA');
    
    console.log(`[CINEMA] Final filtered data count: ${filteredData.length} (from ${data.length} total items)`);
    
    return NextResponse.json(filteredData);
  } catch (error) {
    console.error("Error fetching cinema line items:", error);
    return NextResponse.json(
      { error: "Failed to fetch cinema line items" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const data = await request.json();
    
    const response = await axios.post(`${XANO_CINEMA_BASE_URL}/cinema_line_items`, data, {
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    return NextResponse.json(response.data);
  } catch (error) {
    console.error("Error creating cinema line item:", error);
    return NextResponse.json(
      { error: "Failed to create cinema line item" },
      { status: 500 }
    );
  }
}
