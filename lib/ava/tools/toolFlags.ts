/**
 * Live switch values for Ava's gated tools (billing revisions, true-up),
 * read once per chat turn from lib/features/server.
 */
import "server-only"

import { isBillingRevisionsEnabled } from "@/lib/finance/revisions/flag"
import { isTrueUpEnabled } from "@/lib/finance/trueUp/flag"

import type { AvaToolFlags } from "./pageToolOffer"

export async function readAvaToolFlags(): Promise<AvaToolFlags> {
  const [billingRevisions, trueUp] = await Promise.all([isBillingRevisionsEnabled(), isTrueUpEnabled()])
  return { billingRevisions, trueUp }
}
