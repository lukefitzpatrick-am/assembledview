/**
 * Xano workspace snapshot exporter (Metadata API).
 *
 * Writes:
 *   exports/xano/<YYYY-MM-DD>/<table>.jsonl
 *   exports/xano/<YYYY-MM-DD>/manifest.json
 *   exports/xano/<YYYY-MM-DD>/logic/functions/*.xs (or .json)
 *   exports/xano/<YYYY-MM-DD>/logic/tasks/*.xs (or .json)
 *
 * Env:
 *   XANO_METADATA_TOKEN  (required)
 *   XANO_INSTANCE_BASE   (optional, default https://xg4h-uyzs-dtex.a2.xano.io)
 *   XANO_WORKSPACE_ID    (optional; defaults to first accessible workspace)
 */
import fs from "fs"
import path from "path"
import axios, { type AxiosError, type AxiosRequestConfig } from "axios"

const DEFAULT_INSTANCE = "https://xg4h-uyzs-dtex.a2.xano.io"
const PER_PAGE = 100
const MAX_RETRIES = 8
const BASE_BACKOFF_MS = 500

type Paged<T> = {
  curPage?: number
  nextPage?: number | null
  prevPage?: number | null
  items?: T[]
  itemsReceived?: number
  itemsTotal?: number
  pageTotal?: number
  perPage?: number
}

type Workspace = { id: number; name?: string; branch?: string }

type TableMeta = {
  id: number
  name: string
  description?: string
  guid?: string
  schema?: unknown
  tag?: string[]
  auth?: boolean
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

type LogicItem = {
  id: number
  name: string
  description?: string
  guid?: string
  xanoscript?: { status?: string; value?: string; message?: string } | string
  [key: string]: unknown
}

function loadEnvLocal(): void {
  const envPath = path.resolve(process.cwd(), ".env.local")
  if (!fs.existsSync(envPath)) return
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (!m) continue
    let v = m[2]
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1)
    }
    if (!process.env[m[1]]) process.env[m[1]] = v
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function todayStamp(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

function safeFileStem(name: string): string {
  return name.replace(/[^\w.-]+/g, "_").replace(/^_+|_+$/g, "") || "unnamed"
}

function isRetryable(err: unknown): boolean {
  const ax = err as AxiosError
  const status = ax.response?.status
  if (status === 429) return true
  if (status != null && status >= 500) return true
  if (!ax.response && (ax.code === "ECONNRESET" || ax.code === "ETIMEDOUT")) {
    return true
  }
  return false
}

async function requestWithRetry<T>(
  config: AxiosRequestConfig,
): Promise<T> {
  let attempt = 0
  for (;;) {
    try {
      const res = await axios.request<T>({
        timeout: 120_000,
        ...config,
      })
      return res.data
    } catch (err) {
      attempt += 1
      if (!isRetryable(err) || attempt > MAX_RETRIES) throw err
      const retryAfter = Number(
        (err as AxiosError).response?.headers?.["retry-after"],
      )
      const backoff =
        Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : BASE_BACKOFF_MS * 2 ** (attempt - 1)
      const jitter = Math.floor(Math.random() * 250)
      console.warn(
        `[retry ${attempt}/${MAX_RETRIES}] ${config.method?.toUpperCase() ?? "GET"} ${config.url} — waiting ${backoff + jitter}ms`,
      )
      await sleep(backoff + jitter)
    }
  }
}

function extractItems<T>(data: Paged<T> | T[]): T[] {
  if (Array.isArray(data)) return data
  return data.items ?? []
}

async function paginateAll<T>(
  fetchPage: (page: number) => Promise<Paged<T> | T[]>,
): Promise<{ items: T[]; reportedTotal: number | null }> {
  const items: T[] = []
  let page = 1
  let reportedTotal: number | null = null

  for (;;) {
    const data = await fetchPage(page)
    if (!Array.isArray(data) && typeof data.itemsTotal === "number") {
      reportedTotal = data.itemsTotal
    }
    const batch = extractItems(data)
    items.push(...batch)

    if (Array.isArray(data)) break
    if (data.nextPage == null || data.nextPage === page) break
    if (batch.length === 0) break
    page = data.nextPage
  }

  return { items, reportedTotal }
}

function xanoscriptBody(item: LogicItem): { ext: string; body: string } {
  const xs = item.xanoscript
  if (typeof xs === "string" && xs.trim()) {
    return { ext: "xs", body: xs }
  }
  if (xs && typeof xs === "object" && typeof xs.value === "string" && xs.value) {
    return { ext: "xs", body: xs.value }
  }
  return {
    ext: "json",
    body: JSON.stringify(item, null, 2),
  }
}

async function exportLogicCollection(
  kind: "function" | "task",
  metaBase: string,
  headers: Record<string, string>,
  workspaceId: number,
  outDir: string,
): Promise<{ count: number; files: string[] }> {
  fs.mkdirSync(outDir, { recursive: true })
  const { items } = await paginateAll<LogicItem>((page) =>
    requestWithRetry<Paged<LogicItem>>({
      method: "GET",
      url: `${metaBase}/workspace/${workspaceId}/${kind}`,
      headers,
      params: {
        page,
        per_page: PER_PAGE,
        include_xanoscript: true,
      },
    }),
  )

  const files: string[] = []
  for (const item of items) {
    // Prefer detail endpoint for full XanoScript when list payload is thin.
    let detail = item
    try {
      detail = await requestWithRetry<LogicItem>({
        method: "GET",
        url: `${metaBase}/workspace/${workspaceId}/${kind}/${item.id}`,
        headers,
        params: { include_xanoscript: true },
      })
    } catch (err) {
      console.warn(
        `  warn: ${kind}/${item.id} detail fetch failed — using list payload (${(err as Error).message})`,
      )
    }

    const { ext, body } = xanoscriptBody(detail)
    const stem = `${item.id}_${safeFileStem(item.name)}`
    const fileName = `${stem}.${ext}`
    const filePath = path.join(outDir, fileName)
    fs.writeFileSync(filePath, body, "utf8")
    files.push(fileName)
  }

  const indexPath = path.join(outDir, "_index.json")
  fs.writeFileSync(
    indexPath,
    JSON.stringify(
      items.map((i) => ({
        id: i.id,
        name: i.name,
        description: i.description ?? "",
        guid: i.guid ?? null,
      })),
      null,
      2,
    ),
    "utf8",
  )

  return { count: items.length, files }
}

async function main(): Promise<void> {
  loadEnvLocal()

  const token = process.env.XANO_METADATA_TOKEN
  if (!token) {
    console.error("Missing XANO_METADATA_TOKEN")
    process.exit(1)
  }

  const instanceBase = (
    process.env.XANO_INSTANCE_BASE || DEFAULT_INSTANCE
  ).replace(/\/$/, "")
  const metaBase = `${instanceBase}/api:meta`
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  }

  const workspaces = await requestWithRetry<Workspace[] | Paged<Workspace>>({
    method: "GET",
    url: `${metaBase}/workspace`,
    headers,
  })
  const workspaceList = extractItems(
    Array.isArray(workspaces) ? workspaces : workspaces,
  )
  if (workspaceList.length === 0) {
    console.error("No accessible workspaces for this metadata token")
    process.exit(1)
  }

  const workspaceId = Number(
    process.env.XANO_WORKSPACE_ID || workspaceList[0].id,
  )
  const workspace =
    workspaceList.find((w) => w.id === workspaceId) ?? workspaceList[0]

  const stamp = todayStamp()
  const outRoot = path.resolve(process.cwd(), "exports", "xano", stamp)
  const logicRoot = path.join(outRoot, "logic")
  fs.mkdirSync(outRoot, { recursive: true })
  fs.mkdirSync(logicRoot, { recursive: true })

  console.log(
    `Exporting workspace ${workspaceId} (${workspace.name ?? "?"}) → ${outRoot}`,
  )

  const { items: tables } = await paginateAll<TableMeta>((page) =>
    requestWithRetry<Paged<TableMeta>>({
      method: "GET",
      url: `${metaBase}/workspace/${workspaceId}/table`,
      headers,
      params: { page, per_page: PER_PAGE, sort: "name", order: "asc" },
    }),
  )

  console.log(`Found ${tables.length} tables`)

  type ManifestTable = {
    id: number
    name: string
    guid?: string
    schema: unknown
    api_items_total: number | null
    fetched_count: number
    file: string
    ok: boolean
  }

  const manifestTables: ManifestTable[] = []
  let anyMismatch = false

  for (const table of tables) {
    const fileName = `${safeFileStem(table.name)}.jsonl`
    const filePath = path.join(outRoot, fileName)
    const writeStream = fs.createWriteStream(filePath, { encoding: "utf8" })

    let fetched = 0
    let apiTotal: number | null = null
    let page = 1

    console.log(`  table ${table.name} (id=${table.id}) …`)

    for (;;) {
      const data = await requestWithRetry<Paged<Record<string, unknown>>>({
        method: "GET",
        url: `${metaBase}/workspace/${workspaceId}/table/${table.id}/content`,
        headers,
        params: { page, per_page: PER_PAGE },
      })

      if (typeof data.itemsTotal === "number") apiTotal = data.itemsTotal
      const batch = extractItems(data)
      for (const row of batch) {
        writeStream.write(`${JSON.stringify(row)}\n`)
        fetched += 1
      }

      if (data.nextPage == null || data.nextPage === page || batch.length === 0) {
        break
      }
      page = data.nextPage
    }

    await new Promise<void>((resolve, reject) => {
      writeStream.end(() => resolve())
      writeStream.on("error", reject)
    })

    // Prefer schema from list; refresh via detail if missing.
    let schema: unknown = table.schema ?? null
    if (schema == null) {
      try {
        const detail = await requestWithRetry<TableMeta>({
          method: "GET",
          url: `${metaBase}/workspace/${workspaceId}/table/${table.id}`,
          headers,
        })
        schema = detail.schema ?? null
      } catch {
        schema = null
      }
    }

    const ok = apiTotal == null || apiTotal === fetched
    if (!ok) {
      anyMismatch = true
      console.error(
        `  MISMATCH ${table.name}: fetched=${fetched} api_items_total=${apiTotal}`,
      )
    } else {
      console.log(
        `  ok ${table.name}: ${fetched}${apiTotal != null ? ` / ${apiTotal}` : ""} rows`,
      )
    }

    manifestTables.push({
      id: table.id,
      name: table.name,
      guid: table.guid,
      schema,
      api_items_total: apiTotal,
      fetched_count: fetched,
      file: fileName,
      ok,
    })
  }

  console.log("Exporting functions + tasks (XanoScript)…")
  const functions = await exportLogicCollection(
    "function",
    metaBase,
    headers,
    workspaceId,
    path.join(logicRoot, "functions"),
  )
  const tasks = await exportLogicCollection(
    "task",
    metaBase,
    headers,
    workspaceId,
    path.join(logicRoot, "tasks"),
  )
  console.log(
    `  logic: ${functions.count} functions, ${tasks.count} tasks`,
  )

  const manifest = {
    exported_at: new Date().toISOString(),
    instance_base: instanceBase,
    workspace: {
      id: workspaceId,
      name: workspace.name ?? null,
      branch: workspace.branch ?? null,
    },
    table_count: tables.length,
    tables: manifestTables,
    logic: {
      functions: { count: functions.count, files: functions.files },
      tasks: { count: tasks.count, files: tasks.files },
    },
    ok: !anyMismatch,
  }

  fs.writeFileSync(
    path.join(outRoot, "manifest.json"),
    JSON.stringify(manifest, null, 2),
    "utf8",
  )

  if (anyMismatch) {
    console.error(
      "Export finished with row-count mismatches — see manifest.json. Exiting non-zero.",
    )
    process.exit(1)
  }

  console.log(`Done. Manifest: ${path.join(outRoot, "manifest.json")}`)
}

main().catch((err) => {
  console.error("export-xano failed:", err)
  process.exit(1)
})
