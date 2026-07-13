import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import axios from "axios"
import { auth0 } from "@/lib/auth0"
import { getUserRoles, type UserRole } from "@/lib/rbac"
import { xanoAuthHeaderRecord } from "@/lib/api/xano"

const API_TIMEOUT = Number(process.env.XANO_TIMEOUT_MS ?? 5000)
/** Default 2 so the retry loop can actually retry once (was 1 = dead loop). */
const MAX_RETRIES = Number(process.env.XANO_MAX_RETRIES ?? 2)
const OVERALL_TIMEOUT_MS = Number(process.env.XANO_OVERALL_TIMEOUT_MS ?? 6000)
const BACKOFF_BASE_MS = 500
const BACKOFF_FACTOR = 2

export const codexApiClient = axios.create({
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

export async function retryApiCall<T>(
  apiCall: () => Promise<T>,
  maxRetries = MAX_RETRIES
): Promise<T> {
  let lastError: unknown

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await apiCall()
    } catch (error) {
      lastError = error
      console.error(`Codex API call attempt ${attempt} failed:`, error)

      if (attempt < maxRetries) {
        const delayMs = backoffDelayMs(attempt - 1)
        console.log(`Retrying in ${delayMs}ms...`)
        await sleep(delayMs)
      }
    }
  }

  throw lastError
}

export async function withOverallTimeout<T>(promise: Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("codex upstream timed out")),
          OVERALL_TIMEOUT_MS
        )
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export type CodexAuthOk = {
  session: NonNullable<Awaited<ReturnType<typeof auth0.getSession>>>
  roles: UserRole[]
}

export type CodexAuthResult =
  | CodexAuthOk
  | { error: NextResponse }

/**
 * Auth gate for codex proxy routes: require session; allow admin/manager only.
 * Client-only roles get 403 (client-visible tasks are a later phase).
 */
export async function requireCodexInternalAccess(
  request: Request
): Promise<CodexAuthResult> {
  const session = await auth0.getSession(request as NextRequest)
  if (!session?.user) {
    return {
      error: NextResponse.json({ error: "unauthorised" }, { status: 401 }),
    }
  }

  const roles = getUserRoles(session.user)
  const isClientOnly =
    roles.length > 0 && roles.every((role) => role === "client")
  const isInternal = roles.includes("admin") || roles.includes("manager")

  if (isClientOnly || !isInternal) {
    return {
      error: NextResponse.json({ error: "forbidden" }, { status: 403 }),
    }
  }

  return { session, roles }
}

export function axiosErrorResponse(error: unknown, fallbackMessage: string) {
  if (axios.isAxiosError(error)) {
    if (error.code === "ECONNABORTED") {
      return NextResponse.json(
        {
          error: "Request timed out",
          message: "The request to the API timed out. Please try again.",
        },
        { status: 504 }
      )
    }
    return NextResponse.json(
      {
        error: fallbackMessage,
        details: error.response?.data,
        status: error.response?.status,
        message: error.message,
      },
      { status: error.response?.status || 500 }
    )
  }
  return NextResponse.json(
    {
      error: fallbackMessage,
      message: error instanceof Error ? error.message : String(error),
    },
    { status: 500 }
  )
}
