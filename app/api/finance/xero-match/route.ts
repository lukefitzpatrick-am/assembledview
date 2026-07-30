/**
 * PC6 card actions on xero match notifications:
 * Accept / Dispute / Reassign / Write off (admin only, reason mandatory).
 */

import { NextRequest, NextResponse } from "next/server"

import { requireRole } from "@/lib/requireRole"
import { sql } from "drizzle-orm"
import { getDb } from "@/db"
import { normalizeContactKey } from "@/lib/xero/normalizeContact"
import { applyReviewAction } from "@/lib/finance/periods/reviewItem"
import {
  listRunItemsPg,
  updateRunItemPg,
  insertNotificationPg,
} from "@/lib/finance/periods/postgresStore"
import { writeStatusChangeEdit } from "@/lib/finance/writeFinanceAuditEdits"

export const dynamic = "force-dynamic"

function editorName(gate: unknown): string {
  const g = gate as { session?: { user?: { email?: string; name?: string } } }
  return g.session?.user?.email || g.session?.user?.name || "editor"
}

export async function POST(request: NextRequest) {
  const gate = await requireRole(request, ["admin", "manager"])
  if ("response" in gate) return gate.response

  const body = (await request.json()) as {
    action: "accept" | "dispute" | "reassign" | "write_off"
    notificationId?: number
    xeroInvoiceId: string
    runItemId?: number | null
    clientId?: number
    xeroContactKey?: string
    reason?: string
    expectedCreditNoteRef?: string
  }

  const editor = editorName(gate)
  const db = getDb()
  const invoiceId = String(body.xeroInvoiceId ?? "").trim()
  if (!invoiceId) {
    return NextResponse.json({ error: "xeroInvoiceId required" }, { status: 400 })
  }

  if (body.action === "write_off") {
    const adminGate = await requireRole(request, ["admin"])
    if ("response" in adminGate) return adminGate.response
    const reason = String(body.reason ?? "").trim()
    if (!reason) {
      return NextResponse.json(
        { error: "Write-off requires mandatory reason (admin only)" },
        { status: 400 }
      )
    }
    await db.execute(sql`
      INSERT INTO xero_invoice_matches (
        xero_invoice_id, run_item_id, method, confidence, delta_cents,
        status, decided_by, decided_at, detail, card_kind
      ) VALUES (
        ${invoiceId},
        ${body.runItemId ?? null},
        'manual'::xero_match_method,
        1,
        0,
        'written_off'::xero_match_status,
        ${editor},
        now(),
        ${reason},
        'orphan'
      )
      ON CONFLICT (xero_invoice_id) DO UPDATE SET
        status = 'written_off'::xero_match_status,
        decided_by = ${editor},
        decided_at = now(),
        detail = ${reason},
        updated_at = now()
    `)
    await writeStatusChangeEdit(
      {
        finance_billing_records_id: null,
        field_name: `xero_match_write_off:${invoiceId}`,
        old_value: "open",
        new_value: reason,
      },
      { editedBy: 0, editedByName: editor, recordType: "status_change" }
    )
    await markNotificationRead(body.notificationId)
    return NextResponse.json({ ok: true, status: "written_off" })
  }

  if (body.action === "accept") {
    if (body.runItemId == null) {
      return NextResponse.json({ error: "runItemId required" }, { status: 400 })
    }
    // Load match delta if present
    const matchRows = await db.execute(sql`
      SELECT delta_cents, run_item_id FROM xero_invoice_matches
      WHERE xero_invoice_id = ${invoiceId} LIMIT 1
    `)
    const list = (matchRows as { rows?: Record<string, unknown>[] }).rows ?? []
    const delta = Number((list[0] as { delta_cents?: number } | undefined)?.delta_cents ?? 0)

    // Adjustment entry on run item when delta ≠ 0
    if (delta !== 0) {
      try {
        const periodRows = await db.execute(sql`
          SELECT period_id FROM finance_run_items WHERE id = ${body.runItemId} LIMIT 1
        `)
        const prow = ((periodRows as { rows?: { period_id: number }[] }).rows ?? [])[0]
        if (prow) {
          const items = await listRunItemsPg(Number(prow.period_id))
          const item = items.find((i) => i.id === body.runItemId)
          if (item) {
            const next = applyReviewAction(item, {
              type: "adjust",
              adjustmentCents: delta,
              reason: `Xero match accept Δ ${delta}c for ${invoiceId}`,
            })
            await updateRunItemPg(next)
          }
        }
      } catch (err) {
        console.warn("[PC6] accept adjustment skipped", err)
      }
    }

    await db.execute(sql`
      INSERT INTO xero_invoice_matches (
        xero_invoice_id, run_item_id, method, confidence, delta_cents,
        status, decided_by, decided_at, card_kind
      ) VALUES (
        ${invoiceId},
        ${body.runItemId},
        'manual'::xero_match_method,
        1,
        ${delta},
        'matched'::xero_match_status,
        ${editor},
        now(),
        null
      )
      ON CONFLICT (xero_invoice_id) DO UPDATE SET
        run_item_id = ${body.runItemId},
        status = 'matched'::xero_match_status,
        method = 'manual'::xero_match_method,
        decided_by = ${editor},
        decided_at = now(),
        card_kind = null,
        updated_at = now()
    `)
    await markNotificationRead(body.notificationId)
    return NextResponse.json({ ok: true, status: "matched" })
  }

  if (body.action === "dispute") {
    const reason = String(body.reason ?? "").trim() || "disputed"
    await db.execute(sql`
      INSERT INTO xero_invoice_matches (
        xero_invoice_id, run_item_id, method, confidence, delta_cents,
        status, decided_by, decided_at, detail, card_kind
      ) VALUES (
        ${invoiceId},
        ${body.runItemId ?? null},
        'manual'::xero_match_method,
        0.5,
        0,
        'disputed'::xero_match_status,
        ${editor},
        now(),
        ${reason},
        'divergence'
      )
      ON CONFLICT (xero_invoice_id) DO UPDATE SET
        status = 'disputed'::xero_match_status,
        decided_by = ${editor},
        decided_at = now(),
        detail = ${reason},
        updated_at = now()
    `)
    await insertNotificationPg({
      audience: "finance",
      kind: "xero_match_expected_credit_note",
      payload: {
        xeroInvoiceId: invoiceId,
        expectedCreditNoteRef: body.expectedCreditNoteRef ?? null,
        reason,
        preCreated: true,
      },
    })
    await markNotificationRead(body.notificationId)
    return NextResponse.json({ ok: true, status: "disputed" })
  }

  if (body.action === "reassign") {
    if (body.runItemId == null || body.clientId == null) {
      return NextResponse.json(
        { error: "runItemId and clientId required for reassign" },
        { status: 400 }
      )
    }
    const contactKey = normalizeContactKey(
      String(body.xeroContactKey ?? "").trim() || String(body.clientId)
    )
    await db.execute(sql`
      INSERT INTO xero_contact_links (xero_contact_key, client_id, learned_from, updated_at)
      VALUES (${contactKey}, ${body.clientId}, ${`manual:${editor}`}, now())
      ON CONFLICT (xero_contact_key) DO UPDATE SET
        client_id = ${body.clientId},
        learned_from = ${`manual:${editor}`},
        updated_at = now()
    `)
    await db.execute(sql`
      INSERT INTO xero_invoice_matches (
        xero_invoice_id, run_item_id, method, confidence, delta_cents,
        status, decided_by, decided_at, card_kind
      ) VALUES (
        ${invoiceId},
        ${body.runItemId},
        'manual'::xero_match_method,
        1,
        0,
        'matched'::xero_match_status,
        ${editor},
        now(),
        null
      )
      ON CONFLICT (xero_invoice_id) DO UPDATE SET
        run_item_id = ${body.runItemId},
        method = 'manual'::xero_match_method,
        status = 'matched'::xero_match_status,
        decided_by = ${editor},
        decided_at = now(),
        card_kind = null,
        updated_at = now()
    `)
    await markNotificationRead(body.notificationId)
    return NextResponse.json({
      ok: true,
      status: "matched",
      learnedContactKey: contactKey,
    })
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 })
}

async function markNotificationRead(id?: number): Promise<void> {
  if (id == null) return
  try {
    const db = getDb()
    await db.execute(sql`
      UPDATE app_notifications SET read_at = now() WHERE id = ${id} AND read_at IS NULL
    `)
  } catch {
    /* ignore */
  }
}
