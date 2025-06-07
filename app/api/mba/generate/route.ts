import { NextResponse } from "next/server";
import carboneSDK from 'carbone-sdk';
import { format } from "date-fns";

const CARBONE_API_KEY = process.env.CARBONE_API_KEY;
const TEMPLATE_ID = process.env.CARBONE_TEMPLATE_ID;

if (!CARBONE_API_KEY) {
  throw new Error('CARBONE_API_KEY is not defined');
}

if (!TEMPLATE_ID) {
  throw new Error('CARBONE_TEMPLATE_ID is not defined');
}

// Validate API key format
if (CARBONE_API_KEY.length < 100) {
  console.error('API key appears to be too short. Expected a JWT token.');
  throw new Error('Invalid API key format');
}

// Check if it's a JWT token (should have 3 parts separated by dots)
const jwtParts = CARBONE_API_KEY.split('.');
if (jwtParts.length !== 3) {
  console.error('API key does not appear to be a valid JWT token');
  throw new Error('Invalid API key format');
}

// Initialize Carbone SDK with explicit error handling
let carbone;
try {
  carbone = carboneSDK(CARBONE_API_KEY);
  console.log('Carbone SDK initialized successfully');
} catch (error) {
  console.error('Failed to initialize Carbone SDK:', error);
  throw new Error(`Failed to initialize Carbone SDK: ${error.message}`);
}

export async function POST(request: Request) {
  try {
    const fv = await request.json();

    // Build the payload
    const payload = {
      date: format(new Date(), "dd-MM-yyyy"),
      mba_number: fv.mbanumber,
      campaign_name: fv.mp_campaignname,
      campaign_brand: fv.mp_brand,
      po_number: fv.mp_ponumber,
      media_plan_version: fv.mp_plannumber,
      client: {
        name: fv.mp_clientname,
        address: fv.clientAddress,
        suburb: fv.clientSuburb,
        state: fv.clientState,
        postcode: fv.clientPostcode,
      },
      campaign: {
        date_start: format(new Date(fv.mp_campaigndates_start), "dd-MM-yyyy"),
        date_end: format(new Date(fv.mp_campaigndates_end), "dd-MM-yyyy"),
      },
      gross_media: fv.gross_media.map(item => ({
        media_type: item.media_type,
        gross_amount: Number(item.gross_amount).toLocaleString('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 2 }),
      })),      
      totals: {
        media: Number(fv.grossMediaTotal).toLocaleString('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 2 }),
        assembled_fee: Number(fv.calculateAssembledFee).toLocaleString('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 2 }),
        production: Number(fv.calculateProductionCosts).toLocaleString('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 2 }),
        adserving: Number(fv.calculateAdServingFees).toLocaleString('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 2 }),
        totals_ex_gst: Number(fv.totalInvestment).toLocaleString('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 2 }),
        total_inc_gst: (Number(fv.totalInvestment) * 1.1).toLocaleString('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 2 }),
      },
    };

    // Render and convert to PDF with explicit error handling
    let result;
    try {
      result = await carbone.renderPromise(TEMPLATE_ID, {
        data: payload,
        convertTo: "pdf"
      });
    } catch (error) {
      console.error('Carbone render error:', error);
      throw new Error(`Failed to render PDF: ${error.message}`);
    }

    return new NextResponse(result.content, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename=${result.filename}`,
      },
    });
  } catch (error) {
    console.error("MBA Generation Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to generate MBA" },
      { status: 500 }
    );
  }
} 