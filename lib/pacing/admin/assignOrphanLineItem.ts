import "server-only";

import { getLiveSearchLineItemIds } from "@/lib/pacing/campaigns/liveSearchLineItems";
import {
  sessionExecuteRows,
  sessionExecuteVoid,
  withSnowflakeSession,
} from "@/lib/snowflake/snowflakeSession";
import { createPacingOrphanFix } from "@/lib/xano/pacingOrphanFixes";
import { SEARCH_PACING_CHANNELS } from "./orphanDetection";

export type AssignOrphanLineItemArgs = {
  adminEmail: string;
  channel: string;
  platformLineItemId: string;
  newLineItemId: string;
  note?: string | null;
  adGroupName?: string | null;
  campaignName?: string | null;
};

export type AssignOrphanLineItemResult = {
  rowsAffected: number;
  previousLineItemId: string | null;
  newLineItemId: string;
  appliedAt: string;
  auditId: number;
};

export class OrphanAssignValidationError extends Error {
  constructor(
    public code: string,
    message: string
  ) {
    super(message);
    this.name = "OrphanAssignValidationError";
  }
}

/**
 * Assigns a corrected LINE_ITEM_ID to an orphan ad group in
 * SEARCH_PACING_FACT for all DATE_DAY values matching the
 * (CHANNEL, PLATFORM_LINE_ITEM_ID) tuple.
 */
export async function assignOrphanLineItem(
  args: AssignOrphanLineItemArgs
): Promise<AssignOrphanLineItemResult> {
  if (!(SEARCH_PACING_CHANNELS as readonly string[]).includes(args.channel)) {
    throw new OrphanAssignValidationError(
      "invalid_channel",
      `Channel '${args.channel}' is not one of the supported values.`
    );
  }

  const normalizedNew = args.newLineItemId.toLowerCase().trim();
  if (!normalizedNew) {
    throw new OrphanAssignValidationError("empty_line_item_id", "newLineItemId is required.");
  }

  const liveIds = await getLiveSearchLineItemIds({
    asOfDate: new Date().toISOString().slice(0, 10),
    allowedClientSlugs: null,
  });
  if (!liveIds.has(normalizedNew)) {
    throw new OrphanAssignValidationError(
      "line_item_not_live",
      `LINE_ITEM_ID '${args.newLineItemId}' is not a live line item.`
    );
  }

  const platformId = String(args.platformLineItemId).trim();
  if (!platformId) {
    throw new OrphanAssignValidationError(
      "empty_platform_line_item_id",
      "platformLineItemId is required."
    );
  }

  const result = await withSnowflakeSession(async (session) => {
    await sessionExecuteVoid(session, "BEGIN");
    try {
      const previousRows = await sessionExecuteRows<{ LINE_ITEM_ID: string | null }>(
        session,
        `
        SELECT ANY_VALUE(LINE_ITEM_ID) AS LINE_ITEM_ID
        FROM ASSEMBLEDVIEW.MART.SEARCH_PACING_FACT
        WHERE CHANNEL = ?
          AND CAST(PLATFORM_LINE_ITEM_ID AS VARCHAR) = ?
      `,
        [args.channel, platformId]
      );

      const previousLineItemId = previousRows[0]?.LINE_ITEM_ID ?? null;

      await sessionExecuteVoid(
        session,
        `
        UPDATE ASSEMBLEDVIEW.MART.SEARCH_PACING_FACT
        SET LINE_ITEM_ID = ?
        WHERE CHANNEL = ?
          AND CAST(PLATFORM_LINE_ITEM_ID AS VARCHAR) = ?
      `,
        [normalizedNew, args.channel, platformId]
      );

      const countRows = await sessionExecuteRows<{ ROWS_AFFECTED: number }>(
        session,
        `
        SELECT COUNT(*) AS ROWS_AFFECTED
        FROM ASSEMBLEDVIEW.MART.SEARCH_PACING_FACT
        WHERE CHANNEL = ?
          AND CAST(PLATFORM_LINE_ITEM_ID AS VARCHAR) = ?
          AND LOWER(TRIM(CAST(LINE_ITEM_ID AS VARCHAR))) = ?
      `,
        [args.channel, platformId, normalizedNew]
      );
      const rowsAffected = Number(countRows[0]?.ROWS_AFFECTED) || 0;

      await sessionExecuteVoid(session, "COMMIT");

      return { rowsAffected, previousLineItemId };
    } catch (err) {
      await sessionExecuteVoid(session, "ROLLBACK").catch(() => {});
      throw err;
    }
  });

  const audit = await createPacingOrphanFix({
    adminUserEmail: args.adminEmail,
    channel: args.channel,
    platformLineItemId: platformId,
    previousLineItemId: result.previousLineItemId,
    newLineItemId: normalizedNew,
    adGroupName: args.adGroupName ?? null,
    campaignName: args.campaignName ?? null,
    note: args.note ?? null,
  });

  return {
    rowsAffected: result.rowsAffected,
    previousLineItemId: result.previousLineItemId,
    newLineItemId: normalizedNew,
    appliedAt: new Date().toISOString(),
    auditId: audit.id,
  };
}
