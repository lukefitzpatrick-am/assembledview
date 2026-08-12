import type { MyHoursClient } from "./client.js"
import {
  campaignTaskName,
  clientProjectName,
  type StructureLink,
} from "./sync.js"

type EnsureStructureResult =
  | { ok: true; projectId: string; taskId: string | null }
  | { ok: false; reason: string }

type UniqueViolation = {
  code?: string
  message?: string
  cause?: UniqueViolation
}

function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false
  const candidate = error as UniqueViolation
  return (
    candidate.code === "23505" ||
    candidate.cause?.code === "23505" ||
    /unique|duplicate key/i.test(candidate.message ?? "")
  )
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function findProjectLink(
  links: StructureLink[],
  clientId: number
): StructureLink | undefined {
  return links.find(
    (link) => link.kind === "client_project" && link.clientId === clientId
  )
}

function findTaskLink(
  links: StructureLink[],
  mbaNumber: string
): StructureLink | undefined {
  return links.find(
    (link) =>
      link.kind === "campaign_task" &&
      link.mbaNumber?.trim().toLowerCase() === mbaNumber
  )
}

async function saveOrReloadLink(args: {
  link: StructureLink
  loadLinks: () => Promise<StructureLink[]>
  saveLink: (link: StructureLink) => Promise<void>
  findLink: (links: StructureLink[]) => StructureLink | undefined
}): Promise<StructureLink> {
  try {
    await args.saveLink(args.link)
    return args.link
  } catch (error) {
    if (!isUniqueViolation(error)) throw error
    const existing = args.findLink(await args.loadLinks())
    if (existing) return existing
    throw new Error("MyHours link conflict did not resolve after re-read")
  }
}

export async function ensureClientCampaignStructure(args: {
  clientId: number
  clientName: string
  mbaNumber: string | null
  campaignName: string | null
  client: MyHoursClient
  loadLinks: () => Promise<StructureLink[]>
  saveLink: (link: StructureLink) => Promise<void>
}): Promise<EnsureStructureResult> {
  try {
    let links = await args.loadLinks()
    let projectLink = findProjectLink(links, args.clientId)

    if (!projectLink) {
      const desiredProjectName = clientProjectName(
        args.clientId,
        args.clientName
      )
      const projects = await args.client.listProjects()
      const existingProject = projects.find(
        (project) =>
          project.name.trim().toLowerCase() ===
          desiredProjectName.toLowerCase()
      )
      const project =
        existingProject ?? (await args.client.createProject(desiredProjectName))

      projectLink = await saveOrReloadLink({
        link: {
          kind: "client_project",
          clientId: args.clientId,
          mbaNumber: null,
          myhoursId: String(project.id),
          myhoursName: project.name || desiredProjectName,
        },
        loadLinks: args.loadLinks,
        saveLink: args.saveLink,
        findLink: (reloaded) => findProjectLink(reloaded, args.clientId),
      })
      links = [...links, projectLink]
    }

    const projectId = Number(projectLink.myhoursId)
    if (!Number.isFinite(projectId)) {
      return {
        ok: false,
        reason: `invalid MyHours project id for client ${args.clientId}`,
      }
    }

    const mbaNumber = args.mbaNumber?.trim().toLowerCase() ?? ""
    if (!mbaNumber) {
      return { ok: true, projectId: projectLink.myhoursId, taskId: null }
    }

    let taskLink = findTaskLink(links, mbaNumber)
    if (!taskLink) {
      const desiredTaskName = campaignTaskName(
        mbaNumber,
        args.campaignName ?? ""
      )
      const tasks = await args.client.listProjectTasks(projectId)
      const existingTask = tasks.find(
        (task) =>
          task.name.trim().toLowerCase() === desiredTaskName.toLowerCase()
      )
      const task =
        existingTask ??
        (await args.client.createProjectTask(projectId, desiredTaskName))

      taskLink = await saveOrReloadLink({
        link: {
          kind: "campaign_task",
          clientId: args.clientId,
          mbaNumber,
          myhoursId: String(task.id),
          myhoursName: task.name || desiredTaskName,
        },
        loadLinks: args.loadLinks,
        saveLink: args.saveLink,
        findLink: (reloaded) => findTaskLink(reloaded, mbaNumber),
      })
    }

    return {
      ok: true,
      projectId: projectLink.myhoursId,
      taskId: taskLink.myhoursId,
    }
  } catch (error) {
    return { ok: false, reason: errorMessage(error) }
  }
}
