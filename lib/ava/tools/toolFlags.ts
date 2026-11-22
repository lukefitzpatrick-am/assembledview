/**
 * Live switch values for Ava's gated tools (billing revisions, true-up, query_data, SharePoint),
 * read once per chat turn from lib/features/server.
 */
import "server-only"

import { isBillingRevisionsEnabled } from "@/lib/finance/revisions/flag"
import { isFeatureOn } from "@/lib/features/server"

import type { AvaToolFlags } from "./pageToolOffer"

export async function readAvaToolFlags(): Promise<AvaToolFlags> {
  const [billingRevisions, trueUp, dataQuery, sharepoint] = await Promise.all([
    isBillingRevisionsEnabled(),
    isFeatureOn("true_up"),
    isFeatureOn("ava_data_query"),
    isFeatureOn("ava_sharepoint"),
  ])
  return { billingRevisions, trueUp, dataQuery, sharepoint }
}
