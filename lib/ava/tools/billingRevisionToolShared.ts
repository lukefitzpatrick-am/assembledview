/**
 * Shared bits for preview_billing_revision and apply_billing_revision.
 * Admin only, BILLING_REVISIONS on, 0106 applied.
 */
import { isBillingRevisionsEnabled } from "@/lib/finance/revisions/flag"
import type { PreviewOk } from "@/lib/finance/revisions/revisionService"

import type { AvaToolContext, AvaToolResult } from "./types"

export async function billingRevisionToolGate(context: AvaToolContext, name: string): Promise<AvaToolResult | null> {
  if (!context.roles.includes("admin")) return { content: `${name} is admin-only.`, isError: true }
  if (!(await isBillingRevisionsEnabled())) return { content: "Billing revisions are turned off (Admin > Features).", isError: true }
  if (!context.userSub) return { content: "Could not resolve the signed-in user.", isError: true }
  const { isBillingRevisionsMigrationApplied } = await import("@/lib/finance/revisions/marker")
  if (!(await isBillingRevisionsMigrationApplied())) {
    return { content: "Billing revisions need migration 0106.", isError: true }
  }
  return null
}

function dollars(cents: number): string {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(cents / 100)
}

/** Model-facing preview: changed months and lines only, cents plus dollars. */
export function previewForModel(p: PreviewOk) {
  return {
    ok: true,
    mba: p.mbaNumber,
    baseVersion: p.baseVersionNumber,
    newVersion: p.newVersionNumber,
    movedCents: p.plan.movedCents,
    moved: dollars(p.plan.movedCents),
    months: p.plan.months
      .filter((m) => m.total.before !== m.total.after)
      .map((m) => ({
        month: m.month,
        lock: `${m.lock.level}${m.lock.reasons.length ? `:${m.lock.reasons.join(",")}` : ""}${
          m.lock.level === "soft" && m.effectiveLevel === "open" ? " (unlocked)" : ""
        }`,
        mediaBefore: m.media.before,
        mediaAfter: m.media.after,
        feeBefore: m.fee.before,
        feeAfter: m.fee.after,
        adservingBefore: m.adserving.before,
        adservingAfter: m.adserving.after,
        productionBefore: m.production.before,
        productionAfter: m.production.after,
        totalBefore: m.total.before,
        totalAfter: m.total.after,
        total: `${dollars(m.total.before)} -> ${dollars(m.total.after)}`,
      })),
    lines: p.plan.lines
      .filter((l) => l.media.length > 0 || l.fee.length > 0)
      .slice(0, 40)
      .map((l) => ({ lineItemId: l.lineItemId, label: l.label, media: l.media, fee: l.fee })),
    skipped: p.plan.lines.filter((l) => l.skipped).map((l) => ({ lineItemId: l.lineItemId, reason: l.skipped })),
    credits: p.plan.credits,
    impacts: p.impacts,
    warnings: p.plan.warnings.map((w) => w.message),
    previewToken: p.previewToken,
    expiresAt: p.expiresAt,
    next: "Show the months table (before -> after) and the impacts to the user. Ask them to confirm. Only after an explicit yes, call apply_billing_revision with confirm true and this previewToken.",
  }
}
