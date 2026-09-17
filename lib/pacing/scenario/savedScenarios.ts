import type { ScenarioLevers, ScenarioResult } from "./types.js"

export type SavedScenario = {
  id: number
  mbaNumber: string
  versionNumber: number
  name: string
  levers: ScenarioLevers
  result: ScenarioResult
  createdByEmail: string
  createdAt: string
}

export type SavedScenarioInsert = Omit<SavedScenario, "id" | "createdAt"> & {
  createdAt?: string
}

export type SavedScenarioStore = {
  insert: (row: SavedScenarioInsert) => Promise<SavedScenario>
  list: (mbaNumber: string) => Promise<SavedScenario[]>
}

export function memorySavedScenarioStore(seed: SavedScenario[] = []): SavedScenarioStore {
  const rows = [...seed]
  let nextId = rows.reduce((max, row) => Math.max(max, row.id), 0) + 1
  return {
    async insert(row) {
      const saved: SavedScenario = {
        ...row,
        id: nextId++,
        createdAt: row.createdAt ?? new Date().toISOString(),
      }
      rows.unshift(saved)
      return saved
    },
    async list(mbaNumber) {
      return rows
        .filter((row) => row.mbaNumber.toLowerCase() === mbaNumber.trim().toLowerCase())
        .toSorted((a, b) => b.createdAt.localeCompare(a.createdAt))
    },
  }
}

export type SavedVsLive = {
  savedFinish: number
  liveFinish: number
  savedBudget: number
  liveBudget: number
  delta: number
}

export function compareSavedToLive(saved: ScenarioResult, live: ScenarioResult): SavedVsLive {
  return {
    savedFinish: saved.campaign.projectedFinish,
    liveFinish: live.campaign.projectedFinish,
    savedBudget: saved.campaign.budget,
    liveBudget: live.campaign.budget,
    delta: saved.campaign.projectedFinish - live.campaign.projectedFinish,
  }
}
