/**
 * Builds an Advertising Associates pack from the published versions that are
 * due. Each workbook is rendered fresh with buildMediaPlanWorkbook variant
 * "aa" (via renderPlanVersionDocuments). The stored plan file is not used.
 */
import "server-only"

import { put } from "@vercel/blob"
import JSZip from "jszip"

import {
  normalizeBillingMonth,
  packZipFileName,
} from "@/lib/finance/billingPartner/cycle"
import { listDueAaPlans, type DueAaPlan } from "@/lib/finance/billingPartner/duePlans"
import { BillingPartnerPackError } from "@/lib/finance/billingPartner/errors"
import {
  insertDraftPack,
  type DraftPackWrite,
} from "@/lib/finance/billingPartner/packStore"
import { buildAaPackSummaryWorkbook } from "@/lib/finance/billingPartner/summaryWorkbook"

const ZIP = "application/zip"

export type BuildPackDeps = {
  listDue: (billingMonth: string) => Promise<DueAaPlan[]>
  renderAa: (plan: DueAaPlan) => Promise<{ buffer: Buffer; fileName: string }>
  storeZip: (fileName: string, buffer: Buffer) => Promise<{ pathname: string }>
  insertDraft: (row: DraftPackWrite) => Promise<{ id: string }>
}

export async function buildBillingPartnerPack(
  input: {
    billingMonth: string
    versionIds?: number[]
    createdBy: string
    now?: Date
  },
  deps: BuildPackDeps = defaultBuildPackDeps(),
): Promise<{ packId: string; fileName: string; buffer: Buffer }> {
  const billingMonth = normalizeBillingMonth(input.billingMonth)
  const now = input.now ?? new Date()
  const due = await deps.listDue(billingMonth)
  const selected = selectPackPlans(due, input.versionIds)
  const fileName = packZipFileName(billingMonth, now)
  const buffer = await zipAaPack(billingMonth, selected, deps.renderAa)
  const stored = await deps.storeZip(fileName, buffer)
  const pack = await deps.insertDraft({
    billingMonth,
    status: "draft",
    createdBy: input.createdBy,
    blobPathname: stored.pathname,
    items: selected.map((plan) => ({
      mbaNumber: plan.mbaNumber,
      versionId: plan.versionId,
      versionNumber: plan.versionNumber,
      changeKind: plan.changeKind,
      monthsChanged: plan.monthsChanged,
      backDated: plan.backDated,
    })),
  })
  return { packId: pack.id, fileName, buffer }
}

export async function storeBillingPartnerZip(
  fileName: string,
  buffer: Buffer,
): Promise<{ pathname: string }> {
  const blob = await put(`exports/billing-partner/${fileName}`, buffer, {
    access: "private",
    contentType: ZIP,
    addRandomSuffix: true,
  })
  return { pathname: blob.pathname.replace(/^\//, "") }
}

function selectPackPlans(due: DueAaPlan[], versionIds: number[] | undefined): DueAaPlan[] {
  if (versionIds == null) {
    if (due.length === 0) {
      throw new BillingPartnerPackError("No plans are due for this month", 400)
    }
    return due
  }
  const wanted = new Set(versionIds)
  const selected = due.filter((plan) => wanted.has(plan.versionId))
  const found = new Set(selected.map((plan) => plan.versionId))
  const missing = versionIds.filter((id) => !found.has(id))
  if (missing.length > 0) {
    throw new BillingPartnerPackError(
      `Version ${missing.join(", ")} is not due for this month`,
      400,
    )
  }
  if (selected.length === 0) {
    throw new BillingPartnerPackError("No plans are due for this month", 400)
  }
  return selected
}

async function zipAaPack(
  billingMonth: string,
  plans: DueAaPlan[],
  renderAa: BuildPackDeps["renderAa"],
): Promise<Buffer> {
  const zip = new JSZip()
  const used = new Set<string>()
  for (const plan of plans) {
    const file = await renderAa(plan)
    zip.file(uniqueZipName(used, file.fileName), file.buffer)
  }
  const summary = await buildAaPackSummaryWorkbook({ billingMonth, plans })
  zip.file(uniqueZipName(used, summary.fileName), summary.buffer)
  return zip.generateAsync({ type: "nodebuffer" })
}

async function renderAaWorkbook(plan: DueAaPlan): Promise<{ buffer: Buffer; fileName: string }> {
  const { renderPlanVersionDocuments } = await import("@/lib/docs/renderPlanVersionDocuments")
  const rendered = await renderPlanVersionDocuments({
    mbaNumber: plan.mbaNumber,
    versionNumber: plan.versionNumber,
    kinds: ["aa_media_plan"],
  })
  if (rendered.status !== "ok" || !rendered.files.aa_media_plan) {
    throw new BillingPartnerPackError(
      `AA workbook was not built for ${plan.mbaNumber} v${plan.versionNumber}`,
      422,
    )
  }
  return {
    buffer: rendered.files.aa_media_plan.buffer,
    fileName: rendered.files.aa_media_plan.filename,
  }
}

function defaultBuildPackDeps(): BuildPackDeps {
  return {
    listDue: listDueAaPlans,
    renderAa: renderAaWorkbook,
    storeZip: storeBillingPartnerZip,
    insertDraft: insertDraftPack,
  }
}

function uniqueZipName(used: Set<string>, name: string): string {
  if (!used.has(name)) {
    used.add(name)
    return name
  }
  const dot = name.lastIndexOf(".")
  const stem = dot > 0 ? name.slice(0, dot) : name
  const ext = dot > 0 ? name.slice(dot) : ""
  let n = 2
  let next = `${stem} (${n})${ext}`
  while (used.has(next)) {
    n += 1
    next = `${stem} (${n})${ext}`
  }
  used.add(next)
  return next
}
