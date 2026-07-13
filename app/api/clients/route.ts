import { NextResponse } from "next/server"
import axios from "axios"
import {
  getCachedClientsList,
  invalidateClientsCache,
} from "@/lib/cache/clientsCache"
import { getXanoClientsCollectionUrl } from "@/lib/api/xanoClients"
import { xanoAuthHeaderRecord } from "@/lib/api/xano"

export const runtime = "nodejs"

const clientsUrl = getXanoClientsCollectionUrl()

const API_TIMEOUT = Number(process.env.XANO_TIMEOUT_MS ?? 5000)
/** Default 2 so the retry loop can actually retry once (was 1 = dead loop). */
const MAX_RETRIES = Number(process.env.XANO_MAX_RETRIES ?? 2)
const OVERALL_TIMEOUT_MS = Number(process.env.XANO_OVERALL_TIMEOUT_MS ?? 6000)
const BACKOFF_BASE_MS = 500
const BACKOFF_FACTOR = 2

// Create an axios instance with default config; auth only when XANO_API_KEY is set
const apiClient = axios.create({
  timeout: API_TIMEOUT,
  headers: {
    "Content-Type": "application/json",
    ...xanoAuthHeaderRecord(),
  },
})

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function backoffDelayMs(attemptIndex: number): number {
  const base = BACKOFF_BASE_MS * Math.pow(BACKOFF_FACTOR, attemptIndex)
  const jitter = base * (0.75 + Math.random() * 0.5)
  return Math.round(jitter)
}

// Retry with exponential backoff + ±25% jitter (default maxRetries=2 → one real retry)
async function retryApiCall<T>(
  apiCall: () => Promise<T>,
  maxRetries = MAX_RETRIES
): Promise<T> {
  let lastError: any

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await apiCall()
    } catch (error) {
      lastError = error
      console.error(`API call attempt ${attempt} failed:`, error)

      if (attempt < maxRetries) {
        const delayMs = backoffDelayMs(attempt - 1)
        console.log(`Retrying in ${delayMs}ms...`)
        await sleep(delayMs)
      }
    }
  }

  throw lastError
}

async function withOverallTimeout<T>(promise: Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("clients upstream timed out")), OVERALL_TIMEOUT_MS)
      }),
    ])
  } finally {
    if (timer) {
      clearTimeout(timer)
    }
  }
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const refreshRaw = url.searchParams.get("refresh")
    const bypassCache = refreshRaw === "1" || refreshRaw === "true" || refreshRaw === "yes"

    const { data, stale } = await getCachedClientsList({ bypassCache })
    const headers: Record<string, string> = {}
    if (stale) headers["x-warning"] = "served-stale-after-upstream-failure"
    return NextResponse.json(data, { headers })
  } catch (error) {
    console.error("Failed to fetch clients:", error)
    // Fail soft with empty list so the sidebar doesn't break admin UI.
    return NextResponse.json([], { status: 200, headers: { "x-warning": "clients-unavailable" } })
  }
}

export async function POST(req: Request) {
  try {
    // For now, allow access for development
    // In production, you would validate the Auth0 session here
    const body = await req.json()
    console.log("Request body:", JSON.stringify(body, null, 2))

    // Normalize name field to mp_client_name (Xano expects this field)
    const { clientname_input, mp_client_name, client_name, ...rest } = body
    const clientName = mp_client_name || client_name || clientname_input

    // Validate required fields (only client name and MBA identifier)
    const missingFields: string[] = []
    if (!clientName) missingFields.push("mp_client_name")
    if (!body.mbaidentifier) missingFields.push("mbaidentifier")

    if (missingFields.length > 0) {
      console.error("Missing required fields:", missingFields)
      return NextResponse.json(
        { error: "Missing required fields", details: missingFields },
        { status: 400 }
      )
    }

    // Map to Xano expected field name and drop empty values
    const payload = Object.fromEntries(
      Object.entries({
        ...rest,
        mp_client_name: clientName,
        client_name: clientName, // compatibility with Xano input field naming
        clientname_input: clientName, // legacy Xano scripts expecting old field name
      }).filter(([, value]) => value !== undefined && value !== null && value !== "")
    )

    // Log the API URL being used
    console.log("Using API URL:", clientsUrl)
    console.log("Outgoing client payload keys:", Object.keys(payload))

    const response = await withOverallTimeout(
      retryApiCall(() => apiClient.post(clientsUrl, payload))
    )

    console.log("API response:", JSON.stringify(response.data, null, 2))
    // Invalidate the GET cache so new clients appear immediately in dropdowns.
    invalidateClientsCache()
    return NextResponse.json(response.data, { status: 201 })
  } catch (error) {
    console.error("Failed to create client:", error)
    if (axios.isAxiosError(error)) {
      console.error("Axios error details:", {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        headers: error.response?.headers,
        code: error.code,
        message: error.message,
      })

      // Handle timeout errors specifically
      if (error.code === "ECONNABORTED") {
        return NextResponse.json(
          { error: "Request timed out", message: "The request to the API timed out. Please try again." },
          { status: 504 }
        )
      }

      return NextResponse.json(
        {
          error: "Failed to create client",
          details: error.response?.data,
          status: error.response?.status,
          message: error.message,
        },
        { status: error.response?.status || 500 }
      )
    }
    return NextResponse.json(
      { error: "Failed to create client", message: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}
