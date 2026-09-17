import { useCallback, useSyncExternalStore } from "react"
import type { ChannelTabKey } from "./lineCardTypes"

export type ChannelLayout = "cards" | "table"

const listeners = new Set<() => void>()
const cached = new Map<ChannelTabKey, ChannelLayout>()

export function channelLayoutStorageKey(channel: ChannelTabKey): string {
  return `pacing.${channel}Layout`
}

export function parseChannelLayout(raw: string | null | undefined): ChannelLayout {
  return raw === "table" ? "table" : "cards"
}

export function readChannelLayout(channel: ChannelTabKey): ChannelLayout {
  try {
    if (typeof localStorage === "undefined") return "cards"
    return parseChannelLayout(localStorage.getItem(channelLayoutStorageKey(channel)))
  } catch {
    return "cards"
  }
}

export function writeChannelLayout(channel: ChannelTabKey, next: ChannelLayout): void {
  cached.set(channel, next)
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(channelLayoutStorageKey(channel), next)
    }
  } catch {
    // Preference is a convenience — quota / private mode must not throw.
  }
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getSnapshot(channel: ChannelTabKey): ChannelLayout {
  const hit = cached.get(channel)
  if (hit) return hit
  const next = readChannelLayout(channel)
  cached.set(channel, next)
  return next
}

function getServerSnapshot(): ChannelLayout {
  return "cards"
}

/** Test-only: drop the in-memory cache so the next read hits storage. */
export function resetChannelLayoutCacheForTests(): void {
  cached.clear()
}

export function useChannelLayout(channel: ChannelTabKey): {
  layout: ChannelLayout
  setLayout: (next: ChannelLayout) => void
} {
  const layout = useSyncExternalStore(
    subscribe,
    () => getSnapshot(channel),
    getServerSnapshot,
  )
  const setLayout = useCallback(
    (next: ChannelLayout) => {
      writeChannelLayout(channel, next)
    },
    [channel],
  )
  return { layout, setLayout }
}
