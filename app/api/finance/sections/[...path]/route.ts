import { NextRequest, NextResponse } from "next/server"
import { requireFinanceAdmin } from "@/lib/requireRole"

async function notImplemented(request: NextRequest) {
  const gate = await requireFinanceAdmin(request)
  if ("response" in gate) return gate.response
  return NextResponse.json(
    { error: "not_implemented", message: "Finance sections API has no endpoints yet." },
    { status: 404 }
  )
}

export async function GET(request: NextRequest) {
  return notImplemented(request)
}

export async function POST(request: NextRequest) {
  return notImplemented(request)
}

export async function PATCH(request: NextRequest) {
  return notImplemented(request)
}

export async function PUT(request: NextRequest) {
  return notImplemented(request)
}

export async function DELETE(request: NextRequest) {
  return notImplemented(request)
}
