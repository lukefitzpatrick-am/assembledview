import { NextResponse } from "next/server";

const CARBONE_API_KEY = "test_eyJhbGciOiJFUzUxMiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiIxMDc3ODE4NDc5OTkwODY3NDA0IiwiYXVkIjoiY2FyYm9uZSIsImV4cCI6MjQwMDIwMTE3NiwiZGF0YSI6eyJ0eXBlIjoidGVzdCJ9fQ.APibiN9Cnwxx7NnO7BhxQvwroiv8M2NGoETOws7XHLuSLemaqvY-gyiORMbhDbRhO_BiOUU30PfWS__ZrgpbNlveAF03yoaLYDHmyMenGLLpjXQ5rfWTek0nPPETctY1YUn5qh7pMcZmlwjSm46UFpk5oy_jVlA9Xz2T-OE9KIIbk9TS" // Use a real API key
const CARBONE_RENDER_URL = "https://api.carbone.io/render";

export async function POST(req: Request) {
  try {
    const { templateId, jsonData } = await req.json();

    if (!templateId || !jsonData) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const response = await fetch(CARBONE_RENDER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${CARBONE_API_KEY}`,
      },
      body: JSON.stringify({
        templateId,
        data: jsonData,
        convertTo: "pdf", // You can change format if needed
      }),
    });

    const responseData = await response.json();

    if (!response.ok) {
      throw new Error(`Carbone API error: ${responseData.error || "Unknown error"}`);
    }

    return NextResponse.json({ reportId: responseData.data.reportId });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
