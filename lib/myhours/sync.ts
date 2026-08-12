/**
 * MyHours sync: ensure structure → pull activity (Users join) → map.
 * Entries are never invented — only mirrored from Reports/activity after human-logged time.
 */
import {
  MyHoursAuthError,
  MyHoursClient,
  type MyHoursActivityRow,
  type MyHoursClientDeps,
  type MyHoursProject,
  type MyHoursTask,
} from "./client.js"
import {
  buildUserEmailById,
  joinActivityRows,
  mbaFromTaskName,
  type JoinedActivityEntry,
} from "./joinActivity.js"

export type MappingSource = "name_match" | "manual" | "unmapped"

export type TimeEntryUpsert = JoinedActivityEntry & {
  clientId: number | null
  mbaNumber: string | null
  mappingSource: MappingSource
}

export type StructureLink = {
  kind: "client_project" | "campaign_task"
  clientId: number | null
  mbaNumber: string | null
  myhoursId: string
  myhoursName: string
}

export type AvClientAnchor = {
  clientId: number
  /** Display name used as MyHours project name. */
  projectName: string
}

export type AvCampaign = {
  mbaNumber: string
  campaignName: string
  clientId: number | null
  campaignStatus: string | null
}

export type ExistingLink = {
  kind: "client_project" | "campaign_task"
  clientId: number | null
  mbaNumber: string | null
  myhoursId: string
  myhoursName: string | null
}

export type ExistingEntry = {
  myhoursLogId: string
  mappingSource: MappingSource
  clientId: number | null
  mbaNumber: string | null
}

export type MyHoursSyncDeps = MyHoursClientDeps & {
  loadCursorDateFrom: () => Promise<string | null>
  /** Inclusive DateTo (usually today Sydney or UTC date). */
  todayYmd: () => string
  listClientAnchors: () => Promise<AvClientAnchor[]>
  listActiveCampaigns: () => Promise<AvCampaign[]>
  listLinks: () => Promise<ExistingLink[]>
  saveLink: (link: StructureLink) => Promise<void>
  listExistingEntriesByLogIds: (
    logIds: string[]
  ) => Promise<ExistingEntry[]>
  upsertEntries: (rows: TimeEntryUpsert[]) => Promise<number>
  saveRun: (row: {
    startedAt: string
    finishedAt: string
    entriesUpserted: number
    structuresCreated: number
    unmappedCount: number
    unknownUserCount: number
    status: "ok" | "error"
    error: string | null
  }) => Promise<void>
  /** Optional injectable client (tests). */
  client?: MyHoursClient
}

export type MyHoursSyncResult = {
  status: "ok" | "error"
  entriesUpserted: number
  structuresCreated: number
  unmappedCount: number
  unknownUserCount: number
  dateFrom: string
  dateTo: string
  error?: string
}

const TERMINAL_STATUSES = new Set(["completed", "cancelled"])

export function isActiveCampaignStatus(status: string | null | undefined): boolean {
  const s = (status ?? "").trim().toLowerCase()
  if (!s) return true
  return !TERMINAL_STATUSES.has(s)
}

export function campaignTaskName(mbaNumber: string, campaignName: string): string {
  const mba = mbaNumber.trim().toLowerCase()
  const name = campaignName.trim() || "Campaign"
  return `${mba} — ${name}`
}

export function clientProjectName(clientId: number, clientName: string): string {
  return clientName.trim() || `Client ${clientId}`
}

function addDaysYmd(ymd: string, delta: number): string {
  const [y, m, d] = ymd.split("-").map(Number)
  const dt = new Date(Date.UTC(y!, m! - 1, d!))
  dt.setUTCDate(dt.getUTCDate() + delta)
  const yy = dt.getUTCFullYear()
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0")
  const dd = String(dt.getUTCDate()).padStart(2, "0")
  return `${yy}-${mm}-${dd}`
}

export function resolvePullWindow(args: {
  cursorFrom: string | null
  todayYmd: string
  overlapDays?: number
}): { dateFrom: string; dateTo: string } {
  const overlap = args.overlapDays ?? 7
  const today = args.todayYmd
  if (!args.cursorFrom) {
    // First run: last 30 days + today
    return { dateFrom: addDaysYmd(today, -30), dateTo: today }
  }
  const from = addDaysYmd(args.cursorFrom, -overlap)
  return { dateFrom: from, dateTo: today }
}

export function mapJoinedEntry(args: {
  entry: JoinedActivityEntry
  existing: ExistingEntry | null
  projectClientByMyhoursId: Map<string, number>
  clientIdByProjectName: Map<string, number>
}): TimeEntryUpsert {
  const { entry, existing } = args

  // Manual mappings are never overwritten by re-mapping.
  if (existing?.mappingSource === "manual") {
    return {
      ...entry,
      clientId: existing.clientId,
      mbaNumber: existing.mbaNumber,
      mappingSource: "manual",
    }
  }

  const mbaFromTask = mbaFromTaskName(entry.myhoursTaskName)
  let clientId: number | null = null
  let mappingSource: MappingSource = "unmapped"

  if (entry.myhoursProjectId) {
    const fromLink = args.projectClientByMyhoursId.get(entry.myhoursProjectId)
    if (fromLink != null) {
      clientId = fromLink
      mappingSource = "name_match"
    }
  }

  if (clientId == null && entry.myhoursProjectName) {
    const byName = args.clientIdByProjectName.get(
      entry.myhoursProjectName.trim().toLowerCase()
    )
    if (byName != null) {
      clientId = byName
      mappingSource = "name_match"
    }
  }

  return {
    ...entry,
    clientId,
    mbaNumber: mbaFromTask,
    mappingSource:
      clientId != null || mbaFromTask != null ? mappingSource : "unmapped",
  }
}

export async function runMyHoursSync(
  deps: MyHoursSyncDeps
): Promise<MyHoursSyncResult> {
  const startedAt = new Date().toISOString()
  const client =
    deps.client ??
    new MyHoursClient({
      getApiKey: deps.getApiKey,
      transport: deps.transport,
      sleep: deps.sleep,
      random: deps.random,
      maxRetries: deps.maxRetries,
    })

  const cursor = await deps.loadCursorDateFrom()
  const today = deps.todayYmd()
  const { dateFrom, dateTo } = resolvePullWindow({
    cursorFrom: cursor,
    todayYmd: today,
  })

  let structuresCreated = 0
  let entriesUpserted = 0
  let unmappedCount = 0
  let unknownUserCount = 0

  try {
    // ---- a) ENSURE STRUCTURE ----
    const links = await deps.listLinks()
    const projectLinkByClient = new Map<number, ExistingLink>()
    const taskLinkByMba = new Map<string, ExistingLink>()
    const projectClientByMyhoursId = new Map<string, number>()

    for (const link of links) {
      if (link.kind === "client_project" && link.clientId != null) {
        projectLinkByClient.set(link.clientId, link)
        projectClientByMyhoursId.set(link.myhoursId, link.clientId)
      }
      if (link.kind === "campaign_task" && link.mbaNumber) {
        taskLinkByMba.set(link.mbaNumber.toLowerCase(), link)
      }
    }

    const mhProjects = await client.listProjects()
    const projectByName = new Map<string, MyHoursProject>()
    for (const p of mhProjects) {
      if (!p?.name) continue
      projectByName.set(p.name.trim().toLowerCase(), p)
    }

    const anchors = await deps.listClientAnchors()
    const clientIdByProjectName = new Map<string, number>()
    for (const a of anchors) {
      clientIdByProjectName.set(a.projectName.trim().toLowerCase(), a.clientId)
    }

    for (const anchor of anchors) {
      const existing = projectLinkByClient.get(anchor.clientId)
      if (existing) {
        clientIdByProjectName.set(
          (existing.myhoursName ?? anchor.projectName).trim().toLowerCase(),
          anchor.clientId
        )
        continue
      }

      const byName = projectByName.get(anchor.projectName.trim().toLowerCase())
      let projectId: number
      let projectName: string
      if (byName?.id != null) {
        projectId = Number(byName.id)
        projectName = byName.name
      } else {
        const created = await client.createProject(anchor.projectName)
        projectId = Number(created.id)
        projectName = created.name ?? anchor.projectName
        structuresCreated += 1
      }

      const link: StructureLink = {
        kind: "client_project",
        clientId: anchor.clientId,
        mbaNumber: null,
        myhoursId: String(projectId),
        myhoursName: projectName,
      }
      await deps.saveLink(link)
      projectLinkByClient.set(anchor.clientId, {
        ...link,
        myhoursName: projectName,
      })
      projectClientByMyhoursId.set(String(projectId), anchor.clientId)
      clientIdByProjectName.set(projectName.trim().toLowerCase(), anchor.clientId)
    }

    const campaigns = (await deps.listActiveCampaigns()).filter((c) =>
      isActiveCampaignStatus(c.campaignStatus)
    )

    const tasksCache = new Map<number, MyHoursTask[]>()

    for (const camp of campaigns) {
      const mba = camp.mbaNumber.trim().toLowerCase()
      if (!mba) continue
      if (taskLinkByMba.has(mba)) continue
      if (camp.clientId == null) continue

      const projectLink = projectLinkByClient.get(camp.clientId)
      if (!projectLink) continue

      const projectId = Number(projectLink.myhoursId)
      if (!Number.isFinite(projectId)) continue

      let tasks = tasksCache.get(projectId)
      if (!tasks) {
        tasks = await client.listProjectTasks(projectId)
        tasksCache.set(projectId, tasks)
      }

      const desired = campaignTaskName(mba, camp.campaignName)
      const desiredLower = desired.toLowerCase()
      const byName = tasks.find(
        (t) => (t.name ?? "").trim().toLowerCase() === desiredLower
      )

      let taskId: number
      let taskName: string
      if (byName?.id != null) {
        taskId = Number(byName.id)
        taskName = byName.name
      } else {
        const created = await client.createProjectTask(projectId, desired)
        taskId = Number(created.id)
        taskName = created.name ?? desired
        structuresCreated += 1
        tasks.push(created)
      }

      const link: StructureLink = {
        kind: "campaign_task",
        clientId: camp.clientId,
        mbaNumber: mba,
        myhoursId: String(taskId),
        myhoursName: taskName,
      }
      await deps.saveLink(link)
      taskLinkByMba.set(mba, { ...link, myhoursName: taskName })
    }

    // ---- b) PULL ENTRIES + Users join ----
    const [users, activity] = await Promise.all([
      client.listUsers(),
      client.listActivity(dateFrom, dateTo),
    ])
    const usersById = buildUserEmailById(users)
    const joined = joinActivityRows(activity as MyHoursActivityRow[], usersById)
    unknownUserCount = joined.unknownUserCount

    const existing = await deps.listExistingEntriesByLogIds(
      joined.entries.map((e) => e.myhoursLogId)
    )
    const existingById = new Map(existing.map((e) => [e.myhoursLogId, e]))

    const upserts: TimeEntryUpsert[] = joined.entries.map((entry) =>
      mapJoinedEntry({
        entry,
        existing: existingById.get(entry.myhoursLogId) ?? null,
        projectClientByMyhoursId,
        clientIdByProjectName,
      })
    )

    unmappedCount = upserts.filter((u) => u.mappingSource === "unmapped").length
    entriesUpserted = await deps.upsertEntries(upserts)

    const finishedAt = new Date().toISOString()
    await deps.saveRun({
      startedAt,
      finishedAt,
      entriesUpserted,
      structuresCreated,
      unmappedCount,
      unknownUserCount,
      status: "ok",
      error: null,
    })

    return {
      status: "ok",
      entriesUpserted,
      structuresCreated,
      unmappedCount,
      unknownUserCount,
      dateFrom,
      dateTo,
    }
  } catch (err) {
    const message =
      err instanceof MyHoursAuthError
        ? err.message
        : err instanceof Error
          ? err.message
          : String(err)
    const finishedAt = new Date().toISOString()
    await deps.saveRun({
      startedAt,
      finishedAt,
      entriesUpserted,
      structuresCreated,
      unmappedCount,
      unknownUserCount,
      status: "error",
      error: message,
    })
    return {
      status: "error",
      entriesUpserted,
      structuresCreated,
      unmappedCount,
      unknownUserCount,
      dateFrom,
      dateTo,
      error: message,
    }
  }
}
