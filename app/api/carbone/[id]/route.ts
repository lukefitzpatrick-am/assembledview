import { NextResponse } from "next/server";
import { carboneAPI } from "@/lib/api";

export async function POST(req: Request) {
  try {
    const { templateId, jsonData } = await req.json();

    if (!templateId || !jsonData) {
      return NextResponse.json({ error: "Missing templateId or jsonData" }, { status: 400 });
    }

    console.log("🚀 Sending data to Carbone API:", { templateId, jsonData });

    const reportId = await carboneAPI.generateDocument(templateId, jsonData);

    if (!reportId) {
      throw new Error("Carbone API did not return a report ID.");
    }

    console.log("✅ Successfully generated report ID:", reportId);

    return NextResponse.json({ reportId });
  } catch (error) {
    console.error("❌ Error generating MBA document:", error);
    return NextResponse.json({ error: "Failed to generate document", details: error.message }, { status: 500 });
  }
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const reportId = params.id;
    if (!reportId) {
      return NextResponse.json({ error: "Missing report ID" }, { status: 400 });
    }

    console.log("📥 Downloading document with report ID:", reportId);

    const fileBlob = await carboneAPI.downloadDocument(reportId);

    return new Response(fileBlob, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="generated_MBA_document.pdf"`,
      },
    });
  } catch (error) {
    console.error("❌ Failed to retrieve document:", error);
    return NextResponse.json({ error: "Failed to fetch document", details: error.message }, { status: 500 });
  }
}

