import "server-only"

import { getAsOfDate } from "@/lib/pacing/maths"
import type { RelabelPreview } from "./shared/types"
import type { DeliveryRelabelRow } from "./repo"

export const DEFAULT_RELABEL_NOTIFY_EMAIL = "luke.fitzpatrick@assembledmedia.com.au"
export const RELABEL_APPLIED_AUTO_CLOSE_DAYS = 7

export type RelabelNotifyKind = "applied" | "blocked" | "reverted"

export type RelabelNotifyInput = {
  kind: RelabelNotifyKind
  relabelId: number
  mbaNumber: string
  entityName: string
  lineItemId: string
  actorEmail: string
  reason: string
  rowsMoved: number
  spendMoved: number
  duplicatesRemoved: number
  beforeLineItemId: string | null
  afterLineItemId: string
  writes?: string[]
}

export type RelabelNotifyDeps = {
  createTask: (input: {
    title: string
    clientId: number
    description: string
    status: string
    priority: string
    assigneeEmail: string
    dueDate: string | null
    mbaNumber: string
    category: string
    source: string
    autoCreated: boolean
    avaAutoKey: string
    createdByEmail: string
    actorKind: "system"
  }) => Promise<{ id: number | string }>
  sendHtmlEmail: (params: { to: string | string[]; subject: string; html: string; text?: string }) => Promise<void>
  now?: Date
  clientId?: number
}

export function getRelabelNotifyEmail(): string {
  const raw = process.env.RELABEL_NOTIFY_EMAIL?.trim()
  return raw || DEFAULT_RELABEL_NOTIFY_EMAIL
}

export function relabelAdminUrl(relabelId: number): string {
  return `/pacing/admin/relabels?id=${relabelId}`
}

export function relabelNotifyTitle(input: RelabelNotifyInput): string {
  const mba = input.mbaNumber || "—"
  const entity = input.entityName || "entity"
  const line = input.lineItemId || "—"
  if (input.kind === "blocked") return `Relabel blocked: ${mba} ${entity} → ${line}`
  if (input.kind === "reverted") return `Relabel reverted: ${mba} ${entity} → ${line}`
  return `Relabel applied: ${mba} ${entity} → ${line}`
}

export function relabelNotifyBody(input: RelabelNotifyInput): string {
  const link = relabelAdminUrl(input.relabelId)
  const lines = [
    `Actor: ${input.actorEmail}`,
    `Reason: ${input.reason || "—"}`,
    `Rows moved: ${input.rowsMoved}`,
    `Spend moved: ${input.spendMoved}`,
    `Duplicates removed: ${input.duplicatesRemoved}`,
    `Before: ${input.beforeLineItemId ?? "—"}`,
    `After: ${input.afterLineItemId}`,
    `Link: ${link}`,
  ]
  if (input.writes?.length) {
    lines.push("What gets written:")
    lines.push(...input.writes)
  }
  return lines.join("\n")
}

export function relabelNotifyFromPreview(
  kind: RelabelNotifyKind,
  preview: RelabelPreview,
  extras: {
    relabelId: number
    actorEmail: string
    reason: string
    rowsMoved?: number
    spendMoved?: number
    duplicatesRemoved?: number
    writes?: string[]
  },
): RelabelNotifyInput {
  return {
    kind,
    relabelId: extras.relabelId,
    mbaNumber: preview.mbaNumber ?? "",
    entityName: preview.entityName,
    lineItemId: preview.lineItemId,
    actorEmail: extras.actorEmail,
    reason: extras.reason,
    rowsMoved: extras.rowsMoved ?? preview.rowsMoving,
    spendMoved: extras.spendMoved ?? preview.spendMoving,
    duplicatesRemoved: extras.duplicatesRemoved ?? preview.duplicateOldNameDays.length,
    beforeLineItemId: preview.moves[0]?.previousLineItemId ?? null,
    afterLineItemId: preview.lineItemId,
    writes: extras.writes,
  }
}

export function relabelNotifyFromRow(
  kind: RelabelNotifyKind,
  row: DeliveryRelabelRow,
  actorEmail: string,
): RelabelNotifyInput {
  const applyResult = row.applyResult ?? {}
  return {
    kind,
    relabelId: row.id,
    mbaNumber: row.mbaNumber,
    entityName: row.entityName ?? "",
    lineItemId: row.toLineItemId,
    actorEmail,
    reason: row.reason,
    rowsMoved: Number(applyResult.rowsUpdated) || 0,
    spendMoved: Number(applyResult.spendMoving) || 0,
    duplicatesRemoved: Number(applyResult.rowsDeleted) || 0,
    beforeLineItemId: row.fromLineItemId,
    afterLineItemId: row.toLineItemId,
  }
}

export function addMelbourneDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number)
  const utc = new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1))
  utc.setUTCDate(utc.getUTCDate() + days)
  return utc.toISOString().slice(0, 10)
}

export function relabelAvaAutoKey(kind: RelabelNotifyKind, relabelId: number): string {
  return `relabel:${kind}:${relabelId}`
}

export async function notifyRelabel(input: RelabelNotifyInput, deps: RelabelNotifyDeps): Promise<void> {
  const to = getRelabelNotifyEmail()
  const title = relabelNotifyTitle(input)
  const body = relabelNotifyBody(input)
  const now = deps.now ?? new Date()
  const dueDate =
    input.kind === "applied"
      ? addMelbourneDays(getAsOfDate(now), RELABEL_APPLIED_AUTO_CLOSE_DAYS)
      : null

  await deps.createTask({
    title,
    clientId: deps.clientId ?? 0,
    description: body,
    status: "todo",
    priority: input.kind === "blocked" ? "high" : "normal",
    assigneeEmail: to,
    dueDate,
    mbaNumber: input.mbaNumber,
    category: "pacing",
    source: "ava",
    autoCreated: true,
    avaAutoKey: relabelAvaAutoKey(input.kind, input.relabelId),
    createdByEmail: input.actorEmail,
    actorKind: "system",
  })

  await deps.sendHtmlEmail({
    to,
    subject: title,
    html: `<pre style="font-family:Arial,Helvetica,sans-serif;font-size:13px;white-space:pre-wrap;">${escapeHtml(body)}</pre>`,
    text: body,
  })
}

export function isUntouchedRelabelTask(row: {
  avaAutoKey?: string | null
  status?: string | null
  createdAt?: string | null
  updatedAt?: string | null
}): boolean {
  const key = String(row.avaAutoKey ?? "")
  if (!key.startsWith("relabel:applied:")) return false
  if (row.status === "done") return false
  return String(row.createdAt ?? "") === String(row.updatedAt ?? "")
}

export function shouldAutoCloseAppliedTask(
  row: { avaAutoKey?: string | null; status?: string | null; createdAt?: string | null; updatedAt?: string | null },
  asOfYmd: string,
): boolean {
  if (!isUntouchedRelabelTask(row)) return false
  const created = String(row.createdAt ?? "").slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}/.test(created)) return false
  return created <= addMelbourneDays(asOfYmd, -RELABEL_APPLIED_AUTO_CLOSE_DAYS)
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}
