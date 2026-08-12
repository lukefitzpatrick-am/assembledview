/**
 * Fireflies GraphQL API client.
 * Auth: Authorization Bearer {FIREFLIES_API_KEY}
 */
import type { FirefliesTranscript } from "./types.js"

export const FIREFLIES_GRAPHQL_URL = "https://api.fireflies.ai/graphql"

export type FirefliesTransport = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>

export type FirefliesClientOptions = {
  apiKey: string
  transport?: FirefliesTransport
  maxRetries?: number
  endpoint?: string
}

const TRANSCRIPTS_QUERY = `
query Transcripts($fromDate: DateTime, $limit: Int, $skip: Int) {
  transcripts(fromDate: $fromDate, limit: $limit, skip: $skip) {
    id
    title
    date
    duration
    participants
    organizer_email
    transcript_url
    summary {
      overview
      action_items
      short_summary
    }
  }
}
`

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

export class FirefliesClient {
  private readonly apiKey: string
  private readonly transport: FirefliesTransport
  private readonly maxRetries: number
  private readonly endpoint: string

  constructor(opts: FirefliesClientOptions) {
    this.apiKey = opts.apiKey
    this.transport = opts.transport ?? fetch
    this.maxRetries = opts.maxRetries ?? 3
    this.endpoint = opts.endpoint ?? FIREFLIES_GRAPHQL_URL
  }

  async graphql<T>(
    query: string,
    variables?: Record<string, unknown>
  ): Promise<T> {
    let lastErr: unknown
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const res = await this.transport(this.endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({ query, variables }),
        })
        if (res.status === 429 || res.status >= 500) {
          if (attempt < this.maxRetries) {
            await sleep(250 * 2 ** attempt)
            continue
          }
        }
        if (!res.ok) {
          throw new Error(`Fireflies HTTP ${res.status}`)
        }
        const json = (await res.json()) as {
          data?: T
          errors?: Array<{ message?: string }>
        }
        if (json.errors?.length) {
          throw new Error(
            json.errors.map((e) => e.message ?? "graphql_error").join("; ")
          )
        }
        if (!json.data) throw new Error("Fireflies empty data")
        return json.data
      } catch (err) {
        lastErr = err
        if (attempt < this.maxRetries) {
          await sleep(250 * 2 ** attempt)
          continue
        }
      }
    }
    throw lastErr instanceof Error
      ? lastErr
      : new Error(String(lastErr ?? "Fireflies request failed"))
  }

  /**
   * List transcripts newer than fromDate (ISO). Paginates by skip/limit (max 50).
   */
  async listTranscriptsSince(
    fromDate: string | null,
    opts: { pageSize?: number; maxPages?: number } = {}
  ): Promise<FirefliesTranscript[]> {
    const pageSize = Math.min(opts.pageSize ?? 50, 50)
    const maxPages = opts.maxPages ?? 40
    const all: FirefliesTranscript[] = []
    for (let page = 0; page < maxPages; page++) {
      const data = await this.graphql<{
        transcripts: FirefliesTranscript[] | null
      }>(TRANSCRIPTS_QUERY, {
        fromDate: fromDate ?? undefined,
        limit: pageSize,
        skip: page * pageSize,
      })
      const batch = data.transcripts ?? []
      all.push(...batch)
      if (batch.length < pageSize) break
    }
    return all
  }
}

export function firefliesClientFromEnv(
  transport?: FirefliesTransport
): FirefliesClient {
  const apiKey = process.env.FIREFLIES_API_KEY?.trim()
  if (!apiKey) throw new Error("FIREFLIES_API_KEY is not set")
  return new FirefliesClient({ apiKey, transport })
}
