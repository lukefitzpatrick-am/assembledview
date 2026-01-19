import { NextResponse } from "next/server"
import { getGlobalMonthlyPublisherSpend } from "@/lib/api/dashboard"

export async function GET() {
  try {
    const result = await getGlobalMonthlyPublisherSpend()
    return NextResponse.json(result)
  } catch (error) {
    console.error("Failed to fetch global monthly publisher spend:", error)
    return NextResponse.json(
      { error: "Failed to fetch global monthly publisher spend" },
      { status: 500 }
    )
  }
}
