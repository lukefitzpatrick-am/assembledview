import { NextResponse } from "next/server"
import {
  generateMediaPlan,
  MediaPlanHeader,
  addKPISheet,
  type MediaItems,
  type LineItem,
} from "@/lib/generateMediaPlan"
import { fetchPublishersFromXano } from "@/lib/api/publishers"
import {
  planHasAdvertisingAssociatesLineItem,
  shouldIncludeMediaPlanLineItem,
} from "@/lib/mediaplan/advertisingAssociatesExcel"

function safeFilePart(value: unknown): string {
  return String(value ?? "")
    .replace(/[^a-zA-Z0-9-_ ]/g, "_")
    .trim()
    .slice(0, 80)
}

function mediaItemsFromBody(rest: Record<string, unknown>): MediaItems {
  const list = (key: string): LineItem[] =>
    Array.isArray(rest[key]) ? (rest[key] as LineItem[]) : []
  return {
    search: list("search"),
    socialMedia: list("socialMedia"),
    digiAudio: list("digiAudio"),
    digiDisplay: list("digiDisplay"),
    digiVideo: list("digiVideo"),
    bvod: list("bvod"),
    progDisplay: list("progDisplay"),
    progVideo: list("progVideo"),
    progBvod: list("progBvod"),
    progOoh: list("progOoh"),
    progAudio: list("progAudio"),
    newspaper: list("newspaper"),
    magazines: list("magazines"),
    television: list("television"),
    radio: list("radio"),
    ooh: list("ooh"),
    cinema: list("cinema"),
    integration: list("integration"),
    production: list("production"),
  }
}

function filteredForEligibility(items: MediaItems): MediaItems {
  return {
    search: items.search.filter(shouldIncludeMediaPlanLineItem),
    socialMedia: items.socialMedia.filter(shouldIncludeMediaPlanLineItem),
    digiAudio: items.digiAudio.filter(shouldIncludeMediaPlanLineItem),
    digiDisplay: items.digiDisplay.filter(shouldIncludeMediaPlanLineItem),
    digiVideo: items.digiVideo.filter(shouldIncludeMediaPlanLineItem),
    bvod: items.bvod.filter(shouldIncludeMediaPlanLineItem),
    progDisplay: items.progDisplay.filter(shouldIncludeMediaPlanLineItem),
    progVideo: items.progVideo.filter(shouldIncludeMediaPlanLineItem),
    progBvod: items.progBvod.filter(shouldIncludeMediaPlanLineItem),
    progOoh: items.progOoh.filter(shouldIncludeMediaPlanLineItem),
    progAudio: items.progAudio.filter(shouldIncludeMediaPlanLineItem),
    newspaper: items.newspaper.filter(shouldIncludeMediaPlanLineItem),
    magazines: items.magazines.filter(shouldIncludeMediaPlanLineItem),
    television: items.television.filter(shouldIncludeMediaPlanLineItem),
    radio: items.radio.filter(shouldIncludeMediaPlanLineItem),
    ooh: items.ooh.filter(shouldIncludeMediaPlanLineItem),
    cinema: items.cinema.filter(shouldIncludeMediaPlanLineItem),
    integration: items.integration.filter(shouldIncludeMediaPlanLineItem),
    production: items.production.filter(shouldIncludeMediaPlanLineItem),
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown> & {
      kpiRows?: unknown
      excelVariant?: string
      mbaData?: unknown
    }
    const kpiRows = Array.isArray(body.kpiRows) ? body.kpiRows : []
    const excelVariant = body.excelVariant
    const mbaData = body.mbaData
    const rest = { ...body }
    delete rest.kpiRows
    delete rest.excelVariant
    delete rest.mbaData

    const isAa = excelVariant === "advertisingAssociates"

    const mediaItems = mediaItemsFromBody(rest)

    if (isAa) {
      const publishers = await fetchPublishersFromXano()
      const eligible = planHasAdvertisingAssociatesLineItem(
        filteredForEligibility(mediaItems),
        publishers,
        () => true,
      )
      if (!eligible) {
        return NextResponse.json(
          { error: "No Advertising Associates publisher found for line items in this plan" },
          { status: 400 },
        )
      }
    }

    const header: MediaPlanHeader = {
      logoBase64: String(rest.logoBase64 || ""),
      logoWidth: Number(rest.logoWidth) || 457,
      logoHeight: Number(rest.logoHeight) || 71,
      client: String(rest.mp_client_name || rest.mp_clientname || ""),
      brand: String(rest.mp_brand || ""),
      campaignName: String(rest.mp_campaignname || ""),
      mbaNumber: String(rest.mbanumber || ""),
      clientContact: String(rest.mp_clientcontact || ""),
      planVersion: String(rest.version_number || "1"),
      poNumber: String(rest.mp_ponumber || ""),
      campaignBudget: String(rest.mp_campaignbudget ?? "0"),
      campaignStatus: String(rest.mp_campaignstatus || ""),
      campaignStart: String(rest.mp_campaigndates_start || ""),
      campaignEnd: String(rest.mp_campaigndates_end || ""),
    }

    const workbook = await generateMediaPlan(
      header,
      mediaItems,
      mbaData as Parameters<typeof generateMediaPlan>[2],
      { mbaTotalsLayout: isAa ? "aa" : "standard" },
    )

    if (!isAa && kpiRows.length > 0) {
      addKPISheet(workbook, kpiRows as Parameters<typeof addKPISheet>[1])
    }

    const buffer = await workbook.xlsx.writeBuffer()

    const clientPart = safeFilePart(rest.mp_client_name || rest.mp_clientname)
    const campPart = safeFilePart(rest.mp_campaignname)
    const baseName = `MediaPlan_${clientPart}_${campPart}.xlsx`
    const filename = isAa ? `AA - ${baseName}` : baseName

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    })
  } catch (error) {
    console.error("Failed to generate media plan Excel:", error)
    return NextResponse.json(
      { error: "Failed to generate media plan Excel" },
      { status: 500 },
    )
  }
}
