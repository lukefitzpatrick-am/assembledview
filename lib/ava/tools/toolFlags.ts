/**
 * Live switch values for Ava's gated tools (billing revisions, true-up),
 * read once per chat turn from lib/features/server.
 */
import "server-only"

import { isBillingRevisionsEnabled } from "@/lib/finance/revisions/flag"
import { isFeatureOn } from "@/lib/features/server"

import type { AvaToolFlags } from "./pageToolOffer"

export async function readAvaToolFlags(): Promise<AvaToolFlags> {
  const [billingRevisions, trueUp] = await Promise.all([isBillingRevisionsEnabled(), isFeatureOn("true_up")])
  return { billingRevisions, trueUp }
}
