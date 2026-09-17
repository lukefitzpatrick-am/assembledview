import { fmtMoney } from "./format.js"
import type { ScenarioLevers, ScenarioLine, ScenarioResult } from "./types.js"

export type DraftChangeRow = {
  lineItemId: string
  platform: string
  currentDaily: number
  newDaily: number
  endDate: string
  paused: boolean
}

export type DraftChangeNotePayload = {
  message: string
  scenario: {
    mba: string
    campaignName: string
    levers: ScenarioLevers
    result: ScenarioResult
  }
  changes: DraftChangeRow[]
}

export type CodexTaskDraft = {
  title: string
  description: string
  mba_number: string
  assignee_email: string | null
  category: "pacing"
}

function currentDaily(line: ScenarioLine): number {
  return line.yesterday
}

function newDaily(line: ScenarioLine, levers: ScenarioLevers, result: ScenarioResult): number {
  const row = result.lines.find((item) => item.lineItemId === line.lineItemId)
  if (levers.pauses.includes(line.lineItemId)) return 0
  return row?.perDayNeeded ?? currentDaily(line)
}

export function buildChangeRows(
  lines: ScenarioLine[],
  levers: ScenarioLevers,
  result: ScenarioResult,
): DraftChangeRow[] {
  return lines.map((line) => ({
    lineItemId: line.lineItemId,
    platform: line.platform,
    currentDaily: currentDaily(line),
    newDaily: newDaily(line, levers, result),
    endDate: line.endDate,
    paused: levers.pauses.includes(line.lineItemId),
  }))
}

export function buildDraftChangeNote(input: {
  mba: string
  campaignName: string
  lines: ScenarioLine[]
  levers: ScenarioLevers
  result: ScenarioResult
}): DraftChangeNotePayload {
  const changes = buildChangeRows(input.lines, input.levers, input.result)
  const json = JSON.stringify(
    {
      mba: input.mba,
      campaignName: input.campaignName,
      levers: input.levers,
      result: input.result,
      changes,
    },
    null,
    2,
  )
  const message =
    `Draft a platform-ready change list for ${input.campaignName} (${input.mba}). ` +
    `For each line include: line, platform, current daily, new daily, dates, pause/resume. ` +
    `Then a two-line rationale. Do not invent a rate.\n\n${json}`
  return {
    message,
    scenario: {
      mba: input.mba,
      campaignName: input.campaignName,
      levers: input.levers,
      result: input.result,
    },
    changes,
  }
}

export function buildCodexTaskDraft(input: {
  mba: string
  campaignName: string
  lines: ScenarioLine[]
  levers: ScenarioLevers
  result: ScenarioResult
  assigneeEmail?: string | null
}): CodexTaskDraft {
  const changes = buildChangeRows(input.lines, input.levers, input.result)
  const lines = changes
    .map((row) => {
      const verb = row.paused ? "pause" : "set"
      return `- ${row.lineItemId} (${row.platform}): ${verb} daily ${fmtMoney(row.currentDaily)} → ${fmtMoney(row.newDaily)}; end ${row.endDate}`
    })
    .join("\n")
  return {
    title: `Apply scenario: ${input.campaignName}`,
    description:
      `Apply the planned scenario on ${input.campaignName} (${input.mba}).\n\n${lines}\n\n` +
      `Campaign projected finish ${fmtMoney(input.result.campaign.projectedFinish)} vs budget ${fmtMoney(input.result.campaign.budget)}.`,
    mba_number: input.mba,
    assignee_email: input.assigneeEmail ?? null,
    category: "pacing",
  }
}
