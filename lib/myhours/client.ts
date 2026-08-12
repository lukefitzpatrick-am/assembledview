/**
 * Thin MyHours API client (v1.1).
 * Auth: Authorization: ApiKey {MYHOURS_API_KEY}
 * Injectable transport — tests never dial out.
 */
export const MYHOURS_API_BASE = "https://api2.myhours.com/api"
export const MYHOURS_AUTH_ERROR_MESSAGE = "API key invalid or rotated"

/** Live probe: page/pageSize ignored on Users/getAll + Reports/activity. */
export const ACTIVITY_CHUNK_DAYS = 14

export type MyHoursTransport = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>

export class MyHoursAuthError extends Error {
  readonly status = 401
  constructor(message = MYHOURS_AUTH_ERROR_MESSAGE) {
    super(message)
    this.name = "MyHoursAuthError"
  }
}

export class MyHoursHttpError extends Error {
  readonly status: number
  readonly bodyText: string
  constructor(message: string, status: number, bodyText: string) {
    super(message)
    this.name = "MyHoursHttpError"
    this.status = status
    this.bodyText = bodyText
  }
}

export type MyHoursUser = {
  id: number
  email: string | null
  name?: string | null
  active?: boolean | null
  archived?: boolean | null
}

export type MyHoursProject = {
  id: number
  name: string
  clientId?: number | null
  clientName?: string | null
  archived?: boolean | null
  customId?: string | null
}

export type MyHoursTask = {
  id: number
  name: string
  listName?: string | null
  description?: string | null
  completed?: boolean | null
  archived?: boolean | null
  customId?: string | null
}

export type MyHoursActivityRow = {
  logId: number
  userId: number
  date: string
  /** Duration in seconds. */
  logDuration?: number | null
  laborDuration?: number | null
  note?: string | null
  projectId?: number | null
  projectName?: string | null
  taskId?: number | null
  taskName?: string | null
  startTime?: string | null
  endTime?: string | null
  userName?: string | null
}

export type CreateMyHoursTimeLogInput = {
  date: string
  /** Duration in seconds. Do not combine with start/end timestamps. */
  duration: number
  note: string
  projectId: number
  taskId: number
  userId: number
}

export type MyHoursTimeLog = {
  id: number
  date?: string
  duration?: number
  note?: string | null
  projectId?: number | null
  taskId?: number | null
  userId?: number | null
}

export type MyHoursClientDeps = {
  getApiKey: () => string
  transport?: MyHoursTransport
  sleep?: (ms: number) => Promise<void>
  random?: () => number
  maxRetries?: number
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function asArray<T>(raw: unknown): T[] {
  if (Array.isArray(raw)) return raw as T[]
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>
    for (const key of ["items", "data", "results", "users", "projects"]) {
      if (Array.isArray(o[key])) return o[key] as T[]
    }
  }
  return []
}

export function buildAuthHeader(apiKey: string): string {
  const key = apiKey.trim()
  if (!key) throw new MyHoursAuthError("MYHOURS_API_KEY is empty")
  return `ApiKey ${key}`
}

/**
 * Inclusive civil-date chunks for Reports/activity.
 * Page params are ignored by the API; chunking is the only safe windowing.
 */
export function chunkDateRange(
  dateFrom: string,
  dateTo: string,
  chunkDays = ACTIVITY_CHUNK_DAYS
): Array<{ from: string; to: string }> {
  const start = parseYmd(dateFrom)
  const end = parseYmd(dateTo)
  if (!start || !end || start > end) return []
  const out: Array<{ from: string; to: string }> = []
  let cursor = start
  while (cursor <= end) {
    const chunkEnd = addDays(cursor, chunkDays - 1)
    const to = chunkEnd < end ? chunkEnd : end
    out.push({ from: formatYmd(cursor), to: formatYmd(to) })
    cursor = addDays(to, 1)
  }
  return out
}

function parseYmd(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s.trim())
  if (!m) return null
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
}

function formatYmd(d: Date): string {
  const y = d.getUTCFullYear()
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0")
  const day = String(d.getUTCDate()).padStart(2, "0")
  return `${y}-${mo}-${day}`
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d.getTime())
  x.setUTCDate(x.getUTCDate() + n)
  return x
}

export class MyHoursClient {
  private readonly getApiKey: () => string
  private readonly transport: MyHoursTransport
  private readonly sleep: (ms: number) => Promise<void>
  private readonly random: () => number
  private readonly maxRetries: number

  constructor(deps: MyHoursClientDeps) {
    this.getApiKey = deps.getApiKey
    this.transport = deps.transport ?? fetch
    this.sleep = deps.sleep ?? sleepMs
    this.random = deps.random ?? Math.random
    this.maxRetries = deps.maxRetries ?? 4
  }

  async listUsers(): Promise<MyHoursUser[]> {
    const raw = await this.requestJson("GET", "/Users/getAll")
    return asArray<MyHoursUser>(raw)
  }

  async listProjects(): Promise<MyHoursProject[]> {
    const raw = await this.requestJson("GET", "/Projects/getAll")
    return asArray<MyHoursProject>(raw)
  }

  async createProject(name: string): Promise<MyHoursProject> {
    const raw = await this.requestJson("POST", "/Projects", { name })
    return raw as MyHoursProject
  }

  async listProjectTasks(projectId: number): Promise<MyHoursTask[]> {
    const raw = await this.requestJson(
      "GET",
      `/Projects/${projectId}/tasklist`
    )
    return asArray<MyHoursTask>(raw)
  }

  async createProjectTask(
    projectId: number,
    name: string
  ): Promise<MyHoursTask> {
    const raw = await this.requestJson(
      "POST",
      `/Projects/${projectId}/task`,
      { name }
    )
    return raw as MyHoursTask
  }

  async createTimeLog(
    input: CreateMyHoursTimeLogInput
  ): Promise<MyHoursTimeLog> {
    const raw = await this.requestJson("POST", "/TimeLogs", input)
    return raw as MyHoursTimeLog
  }

  /**
   * Pull activity across DateFrom..DateTo using civil-day chunks.
   * Dedupes by logId across chunk boundaries.
   */
  async listActivity(
    dateFrom: string,
    dateTo: string,
    chunkDays = ACTIVITY_CHUNK_DAYS
  ): Promise<MyHoursActivityRow[]> {
    const chunks = chunkDateRange(dateFrom, dateTo, chunkDays)
    const byId = new Map<number, MyHoursActivityRow>()
    for (const chunk of chunks) {
      const q = new URLSearchParams({
        DateFrom: chunk.from,
        DateTo: chunk.to,
      })
      const raw = await this.requestJson(
        "GET",
        `/Reports/activity?${q.toString()}`
      )
      for (const row of asArray<MyHoursActivityRow>(raw)) {
        if (row?.logId == null) continue
        byId.set(Number(row.logId), row)
      }
    }
    return [...byId.values()]
  }

  private async requestJson(
    method: string,
    path: string,
    body?: unknown
  ): Promise<unknown> {
    const url = path.startsWith("http")
      ? path
      : `${MYHOURS_API_BASE}${path.startsWith("/") ? path : `/${path}`}`

    let attempt = 0
    while (true) {
      attempt += 1
      const res = await this.transport(url, {
        method,
        headers: {
          Accept: "application/json",
          "api-version": "1.0",
          Authorization: buildAuthHeader(this.getApiKey()),
          ...(body !== undefined
            ? { "Content-Type": "application/json" }
            : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      })

      if (res.status === 401) {
        // Auth failures: fail loudly, never retry.
        throw new MyHoursAuthError()
      }

      if (res.ok) {
        if (res.status === 204) return null
        const text = await res.text()
        if (!text.trim()) return null
        return JSON.parse(text) as unknown
      }

      const bodyText = await res.text().catch(() => "")
      const retryable = res.status === 429 || res.status >= 500
      if (!retryable || attempt > this.maxRetries) {
        throw new MyHoursHttpError(
          `MyHours ${method} ${path} failed: ${res.status}`,
          res.status,
          bodyText
        )
      }

      const backoff = Math.min(
        10_000,
        250 * 2 ** (attempt - 1) + Math.floor(this.random() * 100)
      )
      await this.sleep(backoff)
    }
  }
}
