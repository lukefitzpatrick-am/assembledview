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
