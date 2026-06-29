import { NextResponse } from "next/server"

export function pacingJsonError(message: string, status: number, extra?: Record<string, unknown>) {
  const res = NextResponse.json({ error: message, ...extra }, { status })
  res.headers.set("Cache-Control", "no-store, max-age=0")
  return res
}
