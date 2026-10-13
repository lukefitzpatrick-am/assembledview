import { NextRequest, NextResponse } from "next/server"

import { listPlatformAdvertisers } from "@/lib/clients/platformAdvertisers"
import { isAdvertiserNamePlatform, isMissingAdvertiserView } from "@/lib/clients/platformAccounts"
import { requireRole } from "@/lib/requireRole"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, ["admin"])
  if ("response" in auth) return auth.response

  const platform = req.nextUrl.searchParams.get("platform") ?? ""
  if (!isAdvertiserNamePlatform(platform)) {
    return NextResponse.json({ error: "Unknown platform" }, { status: 400 })
  }

  try {
    const advertisers = await listPlatformAdvertisers(platform)
    return NextResponse.json({ advertisers })
  } catch (err) {
    if (isMissingAdvertiserView(err)) {
      return NextResponse.json({ error: "Advertiser list not set up yet" }, { status: 503 })
    }
    console.error("[platform-advertisers]", err)
    return NextResponse.json({ error: "Failed to load advertisers" }, { status: 500 })
  }
}
