import "server-only"

import { pickMetaPageId } from "@/lib/clients/platformAccounts"
import { listActivePlatformAccounts } from "@/lib/clients/platformAccountsRepo"

/**
 * Server-side Meta page id for a client: the active meta_page platform account,
 * else the legacy clients.idmeta value. A missing table or a failed read falls
 * back to the legacy value, so the creative page never breaks on this lookup.
 */
export async function resolveMetaPageIdForClient(
  clientId: number | null | undefined,
  legacyIdmeta: unknown,
  listAccounts: typeof listActivePlatformAccounts = listActivePlatformAccounts,
): Promise<string> {
  if (typeof clientId !== "number" || !Number.isInteger(clientId) || clientId <= 0) {
    return pickMetaPageId(null, legacyIdmeta)
  }
  try {
    return pickMetaPageId(await listAccounts(clientId), legacyIdmeta)
  } catch (err) {
    console.warn("[creative] meta page id lookup failed; using clients.idmeta", err)
    return pickMetaPageId(null, legacyIdmeta)
  }
}
