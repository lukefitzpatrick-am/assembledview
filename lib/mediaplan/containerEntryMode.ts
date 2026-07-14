/** Per-session preference for media-container entry UI (not persisted to plan/Xano). */

export type ContainerEntryMode = "card" | "schedule"

const STORAGE_KEY = "av-builder-container-entry-mode"

export function readContainerEntryMode(): ContainerEntryMode {
  if (typeof window === "undefined") return "card"
  try {
    const v = sessionStorage.getItem(STORAGE_KEY)
    return v === "schedule" ? "schedule" : "card"
  } catch {
    return "card"
  }
}

export function writeContainerEntryMode(mode: ContainerEntryMode): void {
  if (typeof window === "undefined") return
  try {
    sessionStorage.setItem(STORAGE_KEY, mode)
  } catch {
    // ignore quota / private mode
  }
}
