import { NextResponse } from "next/server";

const CARBONE_API_KEY = process.env.CARBONE_API_KEY;
const CARBONE_GET_URL = "https://api.carbone.io/render/";
const CARBONE_RENDER_URL = "https://api.carbone.io/render";

export async function GET(req: Request, { params }: { params: { ID: string } }) {
  try {
    if (!CARBONE_API_KEY) {
      return NextResponse.json({ error: "Missing API Key" }, { status: 500 });
    }

    const { ID } = params;
    if (!ID) {
      return NextResponse.json({ error: "Missing file ID" }, { status: 400 });
    }

    const carboneResponse = await fetch(`${CARBONE_GET_URL}${ID}`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${CARBONE_API_KEY}`,
      },
    });

    if (!carboneResponse.ok) {
      const errorText = await carboneResponse.text();
      console.error("Carbone API Fetch Error:", errorText);
      return NextResponse.json({ error: "Failed to fetch file" }, { status: carboneResponse.status });
    }

    // Return the file as a response
    return new Response(await carboneResponse.blob(), {
      status: 200,
      headers: {
        "Content-Disposition": `attachment; filename="report_${ID}.pdf"`,
        "Content-Type": carboneResponse.headers.get("Content-Type") || "application/pdf",
      },
    });

  } catch (error) {
    console.error("Server Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    if (!CARBONE_API_KEY) {
      return NextResponse.json({ error: "Missing API Key" }, { status: 500 });
    }

    const { templateId, jsonData } = await req.json();

    if (!templateId || !jsonData) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    console.log("Sending request to Carbone API with templateId:", templateId);
    
    const response = await fetch(CARBONE_RENDER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${CARBONE_API_KEY}`,
      },
      body: JSON.stringify({
        templateId,
        data: jsonData,
        convertTo: "pdf",
      }),
    });

    const responseData = await response.json();
    console.log("Carbone API response:", responseData);

    if (!response.ok) {
      throw new Error(`Carbone API error: ${responseData.error || "Unknown error"}`);
    }

    return NextResponse.json({ reportId: responseData.data.reportId });
  } catch (error) {
    console.error("Carbone API Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
