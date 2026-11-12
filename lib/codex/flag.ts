/**
 * Codex v2 (Postgres-native). The codex_v2 switch (lib/features/registry.ts);
 * with no switch row it reads CODEX_V2=on. Checked before auth so the module
 * is invisible when disabled.
 */
import "server-only"

import { isFeatureOn } from "@/lib/features/server"

export async function isCodexV2Enabled(): Promise<boolean> {
  return isFeatureOn("codex_v2")
}

/**
 * Codex people resolve by email alias (F16): codex_roster_aliases, which
 * also needs codex_v2.
 */
export async function isCodexRosterAliasesEnabled(): Promise<boolean> {
  const [codex, aliases] = await Promise.all([isFeatureOn("codex_v2"), isFeatureOn("codex_roster_aliases")])
  return codex && aliases
}

/** Codex search (F8): codex_search, which also needs codex_v2. */
export async function isCodexSearchEnabled(): Promise<boolean> {
  const [codex, search] = await Promise.all([isFeatureOn("codex_v2"), isFeatureOn("codex_search")])
  return codex && search
}
