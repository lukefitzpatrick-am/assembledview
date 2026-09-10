"use client"

import { useCallback, useSyncExternalStore } from "react"
import type { WeekStartsOn } from "@/lib/utils/weeklyGanttColumns"

export const WEEK_STARTS_ON_STORAGE_KEY = "av:week-starts-on"
export const DEFAULT_WEEK_STARTS_ON: WeekStartsOn = 0

const listeners = new Set<() => void>()
let cached: WeekStartsOn | undefined

function isWeekStartsOn(n: number): n is WeekStartsOn {
  return n === 0 || n === 1 || n === 2 || n === 3 || n === 4 || n === 5 || n === 6
}

function emit() {
  for (const listener of listeners) listener()
}

export function readStoredWeekStartsOn(): WeekStartsOn {
  if (typeof window === "undefined") return DEFAULT_WEEK_STARTS_ON
  try {
    const raw = localStorage.getItem(WEEK_STARTS_ON_STORAGE_KEY)
    if (raw == null) return DEFAULT_WEEK_STARTS_ON
    const n = Number(raw)
    return isWeekStartsOn(n) ? n : DEFAULT_WEEK_STARTS_ON
  } catch {
    return DEFAULT_WEEK_STARTS_ON
  }
}

export function persistWeekStartsOn(value: WeekStartsOn): void {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(WEEK_STARTS_ON_STORAGE_KEY, String(value))
  } catch {
    // ignore quota / private mode
  }
}

export function subscribeWeekStartsOn(onChange: () => void): () => void {
  listeners.add(onChange)
  return () => {
    listeners.delete(onChange)
  }
}

export function getWeekStartsOnSnapshot(): WeekStartsOn {
  if (cached !== undefined) return cached
  cached = readStoredWeekStartsOn()
  return cached
}

export function setWeekStartsOnStore(next: WeekStartsOn): void {
  if (cached === next) {
    persistWeekStartsOn(next)
    return
  }
  cached = next
  persistWeekStartsOn(next)
  emit()
}

export function resetWeekStartsOnStore(): void {
  cached = undefined
}

export function useWeekStartsOn(): [WeekStartsOn, (next: WeekStartsOn) => void] {
  const weekStartsOn = useSyncExternalStore(
    subscribeWeekStartsOn,
    getWeekStartsOnSnapshot,
    () => DEFAULT_WEEK_STARTS_ON
  )
  const setWeekStartsOn = useCallback((next: WeekStartsOn) => {
    setWeekStartsOnStore(next)
  }, [])
  return [weekStartsOn, setWeekStartsOn]
}
