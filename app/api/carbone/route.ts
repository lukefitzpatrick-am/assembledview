import { NextResponse } from "next/server";
import { carboneAPI } from "@/lib/api";

export async function POST(req: Request) {
  try {
    const { templateId, jsonData } = await req.json();

    if (!templateId || !jsonData) {
      return NextResponse.json(
        { error: "Missing templateId or jsonData" },
        { status: 400 }
      );
    }

    const reportId = await carboneAPI.generateDocument(templateId, jsonData);
    return NextResponse.json({ reportId });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to generate document", details: error },
      { status: 500 }
    );
  }
}


