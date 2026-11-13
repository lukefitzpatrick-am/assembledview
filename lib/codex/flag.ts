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

/** Codex saved views (F8): codex_saved_views, which also needs codex_v2. */
export async function isCodexSavedViewsEnabled(): Promise<boolean> {
  const [codex, views] = await Promise.all([isFeatureOn("codex_v2"), isFeatureOn("codex_saved_views")])
  return codex && views
}

/**
 * Codex projects and sections (S1, B38): codex_projects, which also needs
 * codex_v2. Off: /api/codex/projects/** is 404 and nothing reads the 0118
 * tables or columns.
 */
export async function isCodexProjectsEnabled(): Promise<boolean> {
  const [codex, projects] = await Promise.all([isFeatureOn("codex_v2"), isFeatureOn("codex_projects")])
  return codex && projects
}

/**
 * Codex notifications (B41): codex_notifications, which needs codex_projects
 * and codex_v2. Off: no bell, no notifications written, the cron skips.
 */
export async function isCodexNotificationsEnabled(): Promise<boolean> {
  const [codex, projects, notifications] = await Promise.all([
    isFeatureOn("codex_v2"),
    isFeatureOn("codex_projects"),
    isFeatureOn("codex_notifications"),
  ])
  return codex && projects && notifications
}
