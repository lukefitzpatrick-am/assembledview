import "server-only"

import { NextResponse } from "next/server"

import { createTask } from "@/lib/codex/repo"
import { sendHtmlEmail } from "@/lib/email/sendHtmlEmail"
import { parseMbaNumberFromLineItemId } from "@/lib/mediaplan/lineItemIds"
import { querySnowflake } from "@/lib/snowflake/query"
import { RelabelApplyError } from "./applyGuard"
import { applyRelabel } from "./apply"
import { listRelabelDrift, type RelabelDriftFinding } from "./listRelabelDrift"
import {
  notifyRelabel,
  relabelNotifyFromPreview,
  relabelNotifyFromRow,
  type RelabelNotifyDeps,
} from "./notify"
import { previewRelabel, type PreviewRelabelArgs } from "./preview"
import { lookupPublishedPlanLine } from "./publishedLine"
import { canRevertRelabel } from "./shared/relabelPageUrl"
import {
  RelabelRepoError,
  assertRelabelTablesAvailable,
  getRelabel,
  insertBlocked,
  insertLog,
  listRelabels,
  type DeliveryRelabelRow,
  type ListRelabelsFilters,
} from "./repo"
import { queryActiveLabelMap } from "./entity"
import { RelabelRevertError, RELABEL_REVERT_EXPIRED_MESSAGE, revertRelabel } from "./revert"
import { buildApplyLogPayload } from "./applyGuard"
import { describeRelabelWrites } from "./shared/describeWrites"
import type { RelabelPreview, RelabelQueryFn } from "./shared/types"

export type RelabelHandlerDeps = {
  previewRelabel: typeof previewRelabel
  applyRelabel: typeof applyRelabel
  revertRelabel: typeof revertRelabel
  listRelabels: typeof listRelabels
  getRelabel: typeof getRelabel
  insertLog: typeof insertLog
  insertBlocked: typeof insertBlocked
  assertRelabelTablesAvailable: typeof assertRelabelTablesAvailable
  lookupPublishedLine: typeof lookupPublishedPlanLine
  query: RelabelQueryFn
  notify: typeof notifyRelabel
  notifyIo: RelabelNotifyDeps
  listRelabelDrift?: typeof listRelabelDrift
}

const defaultQuery: RelabelQueryFn = async (sql, binds) => {
  return querySnowflake<Record<string, unknown>>(sql, binds ?? [], { label: "pacing-relabel" })
}

export function defaultRelabelHandlerDeps(): RelabelHandlerDeps {
  return {
    previewRelabel,
    applyRelabel,
    revertRelabel,
    listRelabels,
    getRelabel,
    insertLog,
    insertBlocked,
    assertRelabelTablesAvailable,
    lookupPublishedLine: lookupPublishedPlanLine,
    query: defaultQuery,
    notify: notifyRelabel,
    notifyIo: {
      createTask: async (input) => createTask(input),
      sendHtmlEmail,
    },
    listRelabelDrift,
  }
}

function unavailable(err: unknown): NextResponse | null {
  if (err instanceof RelabelRepoError && err.code === "UNAVAILABLE") {
    return NextResponse.json({ error: "unavailable", message: err.message }, { status: 503 })
  }
  return null
}

function previewPayload(preview: RelabelPreview): Record<string, unknown> {
  return {
    channel: preview.channel,
    platformEntityId: preview.platformEntityId,
    entityName: preview.entityName,
    lineItemId: preview.lineItemId,
    mbaNumber: preview.mbaNumber,
    rowsMoving: preview.rowsMoving,
    spendMoving: preview.spendMoving,
    warnings: preview.warnings,
    blocks: preview.blocks,
  }
}

export async function runRelabelList(
  filters: ListRelabelsFilters,
  deps: RelabelHandlerDeps = defaultRelabelHandlerDeps(),
): Promise<NextResponse> {
  try {
    await deps.assertRelabelTablesAvailable()
    const relabels = await deps.listRelabels(filters)
    let drift: RelabelDriftFinding[] = []
    try {
      drift = (await (deps.listRelabelDrift ?? listRelabelDrift)()) ?? []
    } catch (err) {
      console.error("[api/pacing/relabels] drift list failed", err)
    }
    return NextResponse.json({ relabels, drift })
  } catch (err) {
    const soft = unavailable(err)
    if (soft) return soft
    console.error("[api/pacing/relabels] GET list failed", err)
    return NextResponse.json({ error: "internal_error" }, { status: 500 })
  }
}

export async function runRelabelGet(
  id: number,
  deps: RelabelHandlerDeps = defaultRelabelHandlerDeps(),
): Promise<NextResponse> {
  try {
    await deps.assertRelabelTablesAvailable()
    const relabel = await deps.getRelabel(id)
    if (!relabel) {
      return NextResponse.json({ error: "not_found" }, { status: 404 })
    }
    return NextResponse.json({ relabel })
  } catch (err) {
    const soft = unavailable(err)
    if (soft) return soft
    console.error("[api/pacing/relabels] GET id failed", err)
    return NextResponse.json({ error: "internal_error" }, { status: 500 })
  }
}

export async function runRelabelPreview(
  args: PreviewRelabelArgs,
  actorEmail: string,
  deps: RelabelHandlerDeps = defaultRelabelHandlerDeps(),
): Promise<NextResponse> {
  try {
    await deps.assertRelabelTablesAvailable()
    const preview = await deps.previewRelabel(args, {
      query: deps.query,
      lookupPublishedLine: deps.lookupPublishedLine,
      lookupActiveLabelMap: (lookup) => queryActiveLabelMap(lookup, deps.query),
    })
    await deps.insertLog({
      relabelId: null,
      action: "preview",
      actorEmail,
      payload: previewPayload(preview),
    })
    return NextResponse.json({ preview })
  } catch (err) {
    const soft = unavailable(err)
    if (soft) return soft
    console.error("[api/pacing/relabels] POST preview failed", err)
    return NextResponse.json({ error: "internal_error" }, { status: 500 })
  }
}

export async function runRelabelApply(
  args: PreviewRelabelArgs & {
    reason: string
    acknowledgeWarnings?: boolean
    saveAsRequest?: boolean
  },
  actorEmail: string,
  deps: RelabelHandlerDeps = defaultRelabelHandlerDeps(),
): Promise<NextResponse> {
  const reason = String(args.reason ?? "").trim()
  if (!reason) {
    return NextResponse.json({ error: "reason is required" }, { status: 400 })
  }

  try {
    await deps.assertRelabelTablesAvailable()
    const preview = await deps.previewRelabel(args, {
      query: deps.query,
      lookupPublishedLine: deps.lookupPublishedLine,
      lookupActiveLabelMap: (lookup) => queryActiveLabelMap(lookup, deps.query),
    })

    const writes = describeRelabelWrites(preview)
    const requestOnly = args.saveAsRequest === true || preview.blocks.length > 0
    if (requestOnly) {
      const mbaNumber =
        preview.mbaNumber ??
        parseMbaNumberFromLineItemId(preview.lineItemId)?.toLowerCase() ??
        ""
      const blocked = await deps.insertBlocked({
        channel: preview.channel,
        platformEntityId: preview.platformEntityId,
        entityName: preview.entityName,
        fromLineItemId: preview.moves[0]?.previousLineItemId ?? null,
        toLineItemId: preview.lineItemId,
        mbaNumber,
        dateFrom: preview.dateFrom,
        dateTo: preview.dateTo,
        reason,
        actorEmail,
        beforeState: buildApplyLogPayload(preview),
        applyResult: {
          blocks: preview.blocks,
          spendMoving: preview.spendMoving,
          writes,
          requested: args.saveAsRequest === true,
          preview: previewPayload(preview),
        },
      })
      await deps.notify(
        relabelNotifyFromPreview("blocked", preview, {
          relabelId: blocked.id,
          actorEmail,
          reason,
          writes,
        }),
        deps.notifyIo,
      )
      if (preview.blocks.length > 0 && args.saveAsRequest !== true) {
        return NextResponse.json(
          { error: "blocked", message: "Relabel is blocked.", relabel: blocked, preview },
          { status: 409 },
        )
      }
      return NextResponse.json({ requested: true, relabel: blocked, preview })
    }

    const result = await deps.applyRelabel(preview, {
      reason,
      actorEmail,
      acknowledgeWarnings: args.acknowledgeWarnings,
    })
    if (preview.warnings.length > 0 && args.acknowledgeWarnings) {
      await deps.insertLog({
        relabelId: result.relabelId,
        action: "warn_ack",
        actorEmail,
        payload: { warnings: preview.warnings, reason },
      })
    }
    await deps.notify(
      relabelNotifyFromPreview("applied", preview, {
        relabelId: result.relabelId,
        actorEmail,
        reason,
        rowsMoved: result.rowsUpdated,
        spendMoved: preview.spendMoving,
        duplicatesRemoved: result.rowsDeleted,
      }),
      deps.notifyIo,
    )
    return NextResponse.json({ result, preview })
  } catch (err) {
    const soft = unavailable(err)
    if (soft) return soft
    if (err instanceof RelabelApplyError) {
      const status = err.code === "needs_ack" ? 400 : err.code === "blocked" ? 409 : 400
      return NextResponse.json({ error: err.code, message: err.message }, { status })
    }
    console.error("[api/pacing/relabels] POST apply failed", err)
    return NextResponse.json({ error: "internal_error" }, { status: 500 })
  }
}

export async function runRelabelRevert(
  id: number,
  actorEmail: string,
  deps: RelabelHandlerDeps = defaultRelabelHandlerDeps(),
  now: Date = new Date(),
): Promise<NextResponse> {
  try {
    await deps.assertRelabelTablesAvailable()
    const before = await deps.getRelabel(id)
    if (before && !canRevertRelabel(before.createdAt, now)) {
      return NextResponse.json(
        { error: "expired", message: RELABEL_REVERT_EXPIRED_MESSAGE },
        { status: 409 },
      )
    }
    const result = await deps.revertRelabel(id, actorEmail, now)
    const after: DeliveryRelabelRow | null = before
      ? {
          ...before,
          status: "reverted",
          revertedByEmail: actorEmail,
          revertedAt: new Date().toISOString(),
        }
      : await deps.getRelabel(id)
    if (after) {
      await deps.notify(relabelNotifyFromRow("reverted", after, actorEmail), deps.notifyIo)
    }
    return NextResponse.json({ result, relabel: after })
  } catch (err) {
    const soft = unavailable(err)
    if (soft) return soft
    if (err instanceof RelabelRevertError) {
      const status = err.code === "not_found" ? 404 : 409
      return NextResponse.json({ error: err.code, message: err.message }, { status })
    }
    console.error("[api/pacing/relabels] POST revert failed", err)
    return NextResponse.json({ error: "internal_error" }, { status: 500 })
  }
}
