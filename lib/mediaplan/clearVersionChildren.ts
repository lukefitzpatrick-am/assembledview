const VERSION_ONE = 1
const MAX_CLEAR_ITERATIONS = 50

const SLUGS = [
  "media_plan_television",
  "media_plan_newspaper",
  "media_plan_social",
  "media_plan_radio",
  "media_plan_magazines",
  "media_plan_ooh",
  "media_plan_cinema",
  "media_plan_digi_display",
  "media_plan_digi_audio",
  "media_plan_digi_video",
  "media_plan_digi_bvod",
  "media_plan_integrations",
  "media_plan_search",
  "media_plan_prog_display",
  "media_plan_prog_video",
  "media_plan_prog_bvod",
  "media_plan_prog_audio",
  "media_plan_prog_ooh",
  "media_plan_influencers",
  "media_plan_production",
] as const

type Fetcher = typeof fetch
type VersionOneSlug = (typeof SLUGS)[number]

export type ClearVersionChildrenResult = Record<
  VersionOneSlug,
  {
    deleted: number
    skipped: number
    iterations: number
  }
>

export type ClearVersionKpisResult = {
  deleted: number
  skipped: number
}

type ClearOptions = {
  fetcher?: Fetcher
}

function normalise(value: unknown): string {
  return String(value ?? "").trim().toLowerCase()
}

function parseVersion(value: unknown): number {
  const parsed = parseInt(String(value ?? "").trim(), 10)
  return Number.isFinite(parsed) ? parsed : 0
}

function toRows(payload: unknown): any[] {
  if (Array.isArray(payload)) return payload
  if (payload && typeof payload === "object" && Array.isArray((payload as any).items)) {
    return (payload as any).items
  }
  return []
}

function rowMatchesVersionOne(row: any, v1VersionId: string): boolean {
  const mediaPlanVersion = String(row?.media_plan_version ?? "").trim()
  return (
    (!!mediaPlanVersion && mediaPlanVersion === v1VersionId) ||
    parseVersion(row?.version_number) === VERSION_ONE ||
    parseVersion(row?.mp_plannumber) === VERSION_ONE
  )
}

function rowPassesClearGuard(row: any, mbaNumber: string, v1VersionId: string): boolean {
  return normalise(row?.mba_number) === mbaNumber && rowMatchesVersionOne(row, v1VersionId)
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return null
  }
}

async function deleteOrThrow(fetcher: Fetcher, url: string, label: string): Promise<void> {
  const response = await fetcher(url, { method: "DELETE" })
  if (!response.ok) {
    const details = await response.text().catch(() => "")
    throw new Error(
      `Failed to delete ${label} (${response.status}${response.statusText ? ` ${response.statusText}` : ""})${
        details ? `: ${details}` : ""
      }`,
    )
  }
}

export async function clearVersionChildren(
  mbaNumber: string,
  v1VersionId: number | string,
  options: ClearOptions = {},
): Promise<ClearVersionChildrenResult> {
  const fetcher = options.fetcher ?? fetch
  const guardedMba = normalise(mbaNumber)
  const guardedVersionId = String(v1VersionId ?? "").trim()
  const result = Object.fromEntries(
    SLUGS.map((slug) => [slug, { deleted: 0, skipped: 0, iterations: 0 }]),
  ) as ClearVersionChildrenResult

  if (!guardedMba || !guardedVersionId) {
    throw new Error("MBA number and version 1 id are required before clearing version 1 children")
  }

  for (const slug of SLUGS) {
    for (let iteration = 0; iteration < MAX_CLEAR_ITERATIONS; iteration++) {
      result[slug].iterations = iteration + 1

      const params = new URLSearchParams({
        mba_number: mbaNumber,
        version_number: String(VERSION_ONE),
      })
      const response = await fetcher(`/api/media_plans/${slug}?${params.toString()}`, {
        headers: { Accept: "application/json" },
      })

      if (!response.ok) {
        const details = await response.text().catch(() => "")
        throw new Error(
          `Failed to fetch ${slug} version 1 rows (${response.status}${
            response.statusText ? ` ${response.statusText}` : ""
          })${details ? `: ${details}` : ""}`,
        )
      }

      const rows = toRows(await readJson(response))
      const rowsToDelete = rows.filter((row) => row?.id != null && rowPassesClearGuard(row, guardedMba, guardedVersionId))
      result[slug].skipped += rows.length - rowsToDelete.length

      if (rowsToDelete.length === 0) break

      await Promise.all(
        rowsToDelete.map((row) =>
          deleteOrThrow(fetcher, `/api/media_plans/${slug}/${row.id}`, `${slug} row ${row.id}`),
        ),
      )
      result[slug].deleted += rowsToDelete.length
    }
  }

  return result
}

export async function clearVersionKpis(
  mbaNumber: string,
  v1VersionId: number | string,
  options: ClearOptions = {},
): Promise<ClearVersionKpisResult> {
  const fetcher = options.fetcher ?? fetch
  const guardedMba = normalise(mbaNumber)
  const guardedVersionId = String(v1VersionId ?? "").trim()

  if (!guardedMba || !guardedVersionId) {
    throw new Error("MBA number and version 1 id are required before clearing version 1 KPIs")
  }

  const params = new URLSearchParams({
    mbaNumber,
    versionNumber: String(VERSION_ONE),
  })
  const response = await fetcher(`/api/kpis/campaign?${params.toString()}`, {
    headers: { Accept: "application/json" },
  })

  if (!response.ok) {
    const details = await response.text().catch(() => "")
    throw new Error(
      `Failed to fetch campaign KPI version 1 rows (${response.status}${
        response.statusText ? ` ${response.statusText}` : ""
      })${details ? `: ${details}` : ""}`,
    )
  }

  const rows = toRows(await readJson(response))
  const rowsToDelete = rows.filter((row) => row?.id != null && rowPassesClearGuard(row, guardedMba, guardedVersionId))

  await Promise.all(
    rowsToDelete.map((row) =>
      deleteOrThrow(fetcher, `/api/kpis/campaign?id=${encodeURIComponent(String(row.id))}`, `campaign KPI row ${row.id}`),
    ),
  )

  return {
    deleted: rowsToDelete.length,
    skipped: rows.length - rowsToDelete.length,
  }
}
