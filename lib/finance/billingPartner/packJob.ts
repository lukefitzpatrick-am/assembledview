/**
 * S15 A: the Advertising Associates cycle as a scheduled job (switch
 * `billing_partner_pack_job`). On the Melbourne 17th it builds the month's
 * draft pack of every plan still due, through the same builder as Build pack.
 *
 * It never sends anything outside the app: staff download the draft, email
 * AA and press Mark sent, which is the sent record (`billing_partner_packs`).
 *
 * Idempotency is one `report_digest_sends` row, kind
 * `billing_partner_pack_job`, period_start = the billing month. It is
 * claimed before the build (insert, do nothing on conflict), so a second or
 * concurrent run for the same month builds nothing. A failed build releases
 * the claim so a re-run can try again. A run killed mid-build (timeout,
 * crash) cannot release it, so a claim older than 10 minutes is taken over
 * when the job has no pack for that month. A draft already waiting for the
 * month (built by hand) also stops the job.
 */
import "server-only"

import { and, eq, lt, sql } from "drizzle-orm"

import { getDb } from "@/db"
import { reportDigestSends } from "@/db/schema"
import { melbourneParts } from "@/lib/dates/melbourne"
import { isFeatureOn } from "@/lib/features/server"
import { buildBillingPartnerPack } from "@/lib/finance/billingPartner/buildPack"
import { listDueAaPlans } from "@/lib/finance/billingPartner/duePlans"
import { listPacksForMonth } from "@/lib/finance/billingPartner/packStore"
import { reminderBillingMonth } from "@/lib/finance/billingPartner/reminders"

const PACK_JOB_KIND = "billing_partner_pack_job"
const PACK_JOB_ACTOR = "billing-partner-pack-job"
const STALE_CLAIM_MINUTES = 10

export type PackJobResult =
  | {
      skipped:
        | "switch off"
        | "not the 17th"
        | "a draft is waiting"
        | "nothing due"
        | "already built"
    }
  | { status: "built"; billingMonth: string; packId: string; planCount: number }

type PackJobIo = {
  now?: Date
  switchOn?: () => Promise<boolean>
  listDue?: (billingMonth: string) => Promise<{ versionId: number }[]>
  listPacks?: (billingMonth: string) => Promise<{ status: "draft" | "sent"; createdBy: string }[]>
  claim?: (billingMonth: string, planCount: number) => Promise<boolean>
  takeOver?: (billingMonth: string, planCount: number) => Promise<boolean>
  release?: (billingMonth: string) => Promise<void>
  build?: (input: { billingMonth: string; createdBy: string; now: Date }) => Promise<{ packId: string }>
}

export async function runBillingPartnerPackJob(io: PackJobIo = {}): Promise<PackJobResult> {
  const switchOn = io.switchOn ?? (() => isFeatureOn("billing_partner_pack_job"))
  if (!(await switchOn())) return { skipped: "switch off" }

  const now = io.now ?? new Date()
  if (melbourneParts(now).day !== 17) return { skipped: "not the 17th" }
  const billingMonth = reminderBillingMonth(now)

  const packs = await (io.listPacks ?? listPacksForMonth)(billingMonth)
  if (packs.some((pack) => pack.status === "draft")) return { skipped: "a draft is waiting" }

  const due = await (io.listDue ?? listDueAaPlans)(billingMonth)
  if (due.length === 0) return { skipped: "nothing due" }

  const claimed =
    (await (io.claim ?? claimMonth)(billingMonth, due.length)) ||
    // A stale claim with no job pack: an earlier run died mid-build.
    (!packs.some((pack) => pack.createdBy === PACK_JOB_ACTOR) &&
      (await (io.takeOver ?? takeOverStaleMonth)(billingMonth, due.length)))
  if (!claimed) return { skipped: "already built" }
  try {
    const build = io.build ?? buildBillingPartnerPack
    const pack = await build({ billingMonth, createdBy: PACK_JOB_ACTOR, now })
    return { status: "built", billingMonth, packId: pack.packId, planCount: due.length }
  } catch (err) {
    try {
      await (io.release ?? releaseMonth)(billingMonth)
    } catch (releaseErr) {
      console.error("[billing-partner-pack] the build failed and the claim was not released", releaseErr)
    }
    throw err
  }
}

async function claimMonth(billingMonth: string, planCount: number): Promise<boolean> {
  const rows = await getDb()
    .insert(reportDigestSends)
    .values({ kind: PACK_JOB_KIND, periodStart: billingMonth, recipients: [], runCount: planCount })
    .onConflictDoNothing()
    .returning({ kind: reportDigestSends.kind })
  return rows.length > 0
}

async function takeOverStaleMonth(billingMonth: string, planCount: number): Promise<boolean> {
  const rows = await getDb()
    .update(reportDigestSends)
    .set({ sentAt: sql`now()`, runCount: planCount })
    .where(
      and(
        eq(reportDigestSends.kind, PACK_JOB_KIND),
        eq(reportDigestSends.periodStart, billingMonth),
        lt(reportDigestSends.sentAt, sql`now() - make_interval(mins => ${STALE_CLAIM_MINUTES})`),
      ),
    )
    .returning({ kind: reportDigestSends.kind })
  return rows.length > 0
}

async function releaseMonth(billingMonth: string): Promise<void> {
  await getDb()
    .delete(reportDigestSends)
    .where(and(eq(reportDigestSends.kind, PACK_JOB_KIND), eq(reportDigestSends.periodStart, billingMonth)))
}
