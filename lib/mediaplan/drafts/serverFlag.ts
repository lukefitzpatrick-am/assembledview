/** Server read of the plan_drafts switch (lib/features/registry.ts). */
import "server-only"

import { isFeatureOn } from "@/lib/features/server"

export async function isPlanDraftsEnabledServer(): Promise<boolean> {
  return isFeatureOn("plan_drafts")
}
