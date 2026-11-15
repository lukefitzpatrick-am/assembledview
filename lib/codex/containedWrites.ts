/**
 * Codex containment (C-200, decision 3 B, B44): switch `codex_contained_writes`.
 *
 * Pure and client-safe. The root layout sends the switch to the browser
 * (`lib/features/client`); `foldContainedWritesRequires` turns it off there
 * when `codex_v2` is off, so browser code reads one value that already holds
 * its requirement (the server getter is `isCodexContainedWritesEnabled`).
 */
import { clientFeatureOn } from "@/lib/features/client"
import type { ClientFeatureKey } from "@/lib/features/registry"

/** Browser read: pages outside /tasks link into /tasks instead of writing, and /tasks reads the link. */
export function codexContainedWritesOn(): boolean {
  return clientFeatureOn("codex_contained_writes")
}

/** The browser snapshot with `codex_contained_writes` off unless Codex itself is on. */
export function foldContainedWritesRequires<S extends Partial<Record<ClientFeatureKey, boolean>>>(
  snapshot: S | null,
  codexEnabled: boolean,
): S | null {
  if (!snapshot || snapshot.codex_contained_writes !== true || codexEnabled) return snapshot
  return { ...snapshot, codex_contained_writes: false }
}
