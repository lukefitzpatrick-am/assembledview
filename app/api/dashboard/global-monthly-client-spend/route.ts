import { NextResponse } from "next/server"
import { getGlobalMonthlyClientSpend } from "@/lib/api/dashboard"

export async function GET() {
  try {
    const result = await getGlobalMonthlyClientSpend()
    return NextResponse.json(result)
  } catch (error) {
    console.error("Failed to fetch global monthly client spend:", error)
    return NextResponse.json(
      { error: "Failed to fetch global monthly client spend" },
      { status: 500 }
    )
  }
}
