import { NextRequest, NextResponse } from "next/server"
import axios from "axios"
import { xanoAuthHeaderRecord, xanoUrl } from "@/lib/api/xano"
import { requireRole } from "@/lib/requireRole"

const PER_ATTEMPT_TIMEOUT_MS = 8_000
const MAX_ATTEMPTS = 2
const BACKOFF_BASE_MS = 500
const BACKOFF_FACTOR = 2
const OVERALL_BUDGET_MS = 15_000

const apiClient = axios.create({
  timeout: PER_ATTEMPT_TIMEOUT_MS,
  headers: {
    "Content-Type": "application/json",
    ...xanoAuthHeaderRecord(),
  },
})

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Exponential backoff with ±25% jitter. */
function backoffDelayMs(attemptIndex: number): number {
  const base = BACKOFF_BASE_MS * Math.pow(BACKOFF_FACTOR, attemptIndex)
  const jitter = base * (0.75 + Math.random() * 0.5)
  return Math.round(jitter)
}

async function retryApiCall<T>(apiCall: () => Promise<T>): Promise<T> {
  const deadline = Date.now() + OVERALL_BUDGET_MS
  let lastError: unknown

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const remaining = deadline - Date.now()
    if (remaining <= 0) break

    try {
      return await apiCall()
    } catch (error) {
      lastError = error
      console.error(`API call attempt ${attempt} failed:`, error)
      if (attempt >= MAX_ATTEMPTS) break
      const delay = Math.min(backoffDelayMs(attempt - 1), Math.max(0, deadline - Date.now()))
      if (delay <= 0) break
      console.log(`Retrying in ${delay}ms...`)
      await sleep(delay)
    }
  }

  throw lastError
}

export async function GET(req: NextRequest) {
  try {
    // AuthZ: SOWs are internal; client role must not list the book (403).
    const gate = await requireRole(req, ["admin", "manager"])
    if ("response" in gate) return gate.response

    const { searchParams } = new URL(req.url)
    const status = searchParams.get("status")

    let url = xanoUrl("scope_of_work", "XANO_SCOPES_BASE_URL")
    if (status) {
      url += `?project_status=${status}`
    }

    const response = await retryApiCall(() => apiClient.get(url))

    return NextResponse.json(response.data)
  } catch (error) {
    console.error("Failed to fetch scopes of work:", error)
    if (axios.isAxiosError(error)) {
      return NextResponse.json(
        { error: "Failed to fetch scopes of work", details: error.response?.data },
        { status: error.response?.status || 500 }
      )
    }
    return NextResponse.json(
      { error: "Failed to fetch scopes of work" },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    // AuthZ: SOW create is internal; client role must not create (403).
    const gate = await requireRole(req, ["admin", "manager"])
    if ("response" in gate) return gate.response

    const body = await req.json()
    console.log("Request body:", JSON.stringify(body, null, 2))

    // Validate required fields
    const requiredFields = [
      "client_name",
      "contact_name",
      "contact_email",
      "scope_date",
      "scope_version",
      "project_name",
      "project_status",
    ]

    const missingFields = requiredFields.filter((field) => !body[field])

    if (missingFields.length > 0) {
      console.error("Missing required fields:", missingFields)
      return NextResponse.json(
        { error: "Missing required fields", details: missingFields },
        { status: 400 }
      )
    }

    // Prepare the data for Xano
    const scopeData = {
      client_name: body.client_name,
      contact_name: body.contact_name,
      contact_email: body.contact_email,
      scope_date: body.scope_date,
      scope_version: body.scope_version,
      project_name: body.project_name,
      project_status: body.project_status,
      project_overview: body.project_overview || "",
      deliverables: body.deliverables || "",
      tasks_steps: body.tasks_steps || "",
      timelines: body.timelines || "",
      responsibilities: body.responsibilities || "",
      requirements: body.requirements || "",
      assumptions: body.assumptions || "",
      exclusions: body.exclusions || "",
      cost: body.cost || [],
      payment_terms_and_conditions: body.payment_terms_and_conditions || "",
      billing_schedule: body.billing_schedule ? JSON.stringify(body.billing_schedule) : null,
      scope_id: body.scope_id || "",
    }

    const response = await retryApiCall(() =>
      apiClient.post(xanoUrl("scope_of_work", "XANO_SCOPES_BASE_URL"), scopeData)
    )

    console.log("API response:", JSON.stringify(response.data, null, 2))
    return NextResponse.json(response.data, { status: 201 })
  } catch (error) {
    console.error("Failed to create scope of work:", error)
    if (axios.isAxiosError(error)) {
      console.error("Axios error details:", {
        status: error.response?.status,
        data: error.response?.data,
        message: error.message,
      })

      if (error.code === "ECONNABORTED") {
        return NextResponse.json(
          { error: "Request timed out", message: "The request to the API timed out. Please try again." },
          { status: 504 }
        )
      }

      return NextResponse.json(
        {
          error: "Failed to create scope of work",
          details: error.response?.data,
          status: error.response?.status,
          message: error.message,
        },
        { status: error.response?.status || 500 }
      )
    }
    return NextResponse.json(
      { error: "Failed to create scope of work", message: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}
