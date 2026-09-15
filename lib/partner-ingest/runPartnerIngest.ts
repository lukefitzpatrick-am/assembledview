import {
  parsePartnerFileMatrix,
  rawLinesFromMatrix,
  readPartnerFileMatrix,
} from "./parseChannelFactory"
import { keepPartnerAttachment } from "./keepAttachment"
import { matchPartnerSource } from "./matchSource"
import { runPartnerFileParseTests } from "./parseTests"
import { sha256Hex } from "./sha256"
import { partnerSourceFile } from "./sourceFile"
import type {
  PartnerDeliveryRow,
  PartnerFileParseTests,
  PartnerIngestFileSummary,
  PartnerIngestRunSummary,
  PartnerRawLine,
  PartnerSourceMapRow,
} from "./types"

export type PartnerMailMessage = {
  id: string
  internetMessageId: string
  receivedDateTime: string
  senderAddress: string
  subject: string
}

export type PartnerMailAttachment = {
  id: string
  name: string
  contentType: string
  isInline: boolean
  bytes: Buffer
}

export type PartnerMailboxPort = {
  listInboxMessages(): Promise<PartnerMailMessage[]>
  getAttachments(messageId: string): Promise<PartnerMailAttachment[]>
  moveMessage(
    messageId: string,
    folder: "Processed" | "Failed" | "Unrecognised"
  ): Promise<void>
}

export type PartnerIngestLogRow = {
  sourceSlug: string
  internetMessageId: string
  attachmentName: string
  attachmentSha256: string
  sourceFile: string
  senderAddress: string | null
  receivedAt: string | null
  bytes: number | null
  lineCount: number | null
  parsedRowCount: number | null
  status: PartnerIngestFileSummary["status"]
  errorText: string | null
}

export type PartnerSnowflakePort = {
  loadSourceMap(): Promise<PartnerSourceMapRow[]>
  hasLoadedDuplicate(input: {
    internetMessageId: string
    attachmentName: string
    attachmentSha256: string
  }): Promise<boolean>
  /** Committed before parse. Never conditional on parse success. */
  insertRawLines(input: {
    sourceFile: string
    lines: PartnerRawLine[]
  }): Promise<void>
  /**
   * Range replace is BEGIN → DELETE → INSERT → COMMIT on one held session.
   * Never UPDATE. Daily rows are omitted when `load` is null.
   */
  writeLoadAndLog(input: {
    load: {
      source: string
      minDate: string
      maxDate: string
      rows: PartnerDeliveryRow[]
      sourceFile: string
    } | null
    log: PartnerIngestLogRow
  }): Promise<void>
}

export type PartnerIngestDeps = {
  mailbox: PartnerMailboxPort
  snowflake: PartnerSnowflakePort
}

const EMPTY_SHA = sha256Hex(Buffer.alloc(0))

function minMaxDates(rows: PartnerDeliveryRow[]): { minDate: string; maxDate: string } {
  let minDate = rows[0]!.reportDate
  let maxDate = rows[0]!.reportDate
  for (const row of rows) {
    if (row.reportDate < minDate) minDate = row.reportDate
    if (row.reportDate > maxDate) maxDate = row.reportDate
  }
  return { minDate, maxDate }
}

function emptySummary(): PartnerIngestRunSummary {
  return {
    filesSeen: 0,
    loaded: 0,
    skipped: 0,
    failed: 0,
    unrecognised: 0,
    rowsParsed: 0,
    rowsWithNullCode: 0,
    t5Drift: null,
    files: [],
    tests: [],
  }
}

export async function runPartnerIngest(
  deps: PartnerIngestDeps
): Promise<PartnerIngestRunSummary> {
  const summary = emptySummary()
  const maps = await deps.snowflake.loadSourceMap()
  const messages = await deps.mailbox.listInboxMessages()
  const oldestFirst = [...messages].sort((a, b) =>
    String(a.receivedDateTime).localeCompare(String(b.receivedDateTime))
  )

  for (const message of oldestFirst) {
    const source = matchPartnerSource(message, maps)
    if (!source) {
      summary.unrecognised += 1
      const sourceFile = partnerSourceFile({
        sourceSlug: "unrecognised",
        receivedAt: message.receivedDateTime,
        internetMessageId: message.internetMessageId,
        attachmentName: "(none)",
      })
      await deps.snowflake.writeLoadAndLog({
        load: null,
        log: {
          sourceSlug: "unrecognised",
          internetMessageId: message.internetMessageId,
          attachmentName: "(none)",
          attachmentSha256: EMPTY_SHA,
          sourceFile,
          senderAddress: message.senderAddress,
          receivedAt: message.receivedDateTime,
          bytes: null,
          lineCount: 0,
          parsedRowCount: 0,
          status: "unrecognised",
          errorText: "sender domain or subject did not match PARTNER_SOURCE_MAP",
        },
      })
      summary.files.push({
        attachmentName: "(none)",
        sourceFile,
        status: "unrecognised",
        rowsParsed: 0,
        nullCodeRows: 0,
        errorText: "sender domain or subject did not match PARTNER_SOURCE_MAP",
      })
      await deps.mailbox.moveMessage(message.id, "Unrecognised")
      continue
    }

    const attachments = (await deps.mailbox.getAttachments(message.id)).filter(
      keepPartnerAttachment
    )
    let anyFailed = false

    for (const att of attachments) {
      summary.filesSeen += 1
      const hash = sha256Hex(att.bytes)
      const sourceFile = partnerSourceFile({
        sourceSlug: source.sourceSlug,
        receivedAt: message.receivedDateTime,
        internetMessageId: message.internetMessageId,
        attachmentName: att.name,
      })
      const duplicate = await deps.snowflake.hasLoadedDuplicate({
        internetMessageId: message.internetMessageId,
        attachmentName: att.name,
        attachmentSha256: hash,
      })
      if (duplicate) {
        summary.skipped += 1
        await deps.snowflake.writeLoadAndLog({
          load: null,
          log: {
            sourceSlug: source.sourceSlug,
            internetMessageId: message.internetMessageId,
            attachmentName: att.name,
            attachmentSha256: hash,
            sourceFile,
            senderAddress: message.senderAddress,
            receivedAt: message.receivedDateTime,
            bytes: att.bytes.length,
            lineCount: 0,
            parsedRowCount: 0,
            status: "skipped_duplicate",
            errorText: null,
          },
        })
        summary.files.push({
          attachmentName: att.name,
          sourceFile,
          status: "skipped_duplicate",
          rowsParsed: 0,
          nullCodeRows: 0,
        })
        continue
      }

      let matrix: unknown[][] = []
      let parseError: string | null = null
      try {
        matrix = await readPartnerFileMatrix(att.bytes, att.name)
      } catch (err) {
        parseError = err instanceof Error ? err.message : String(err)
      }

      const rawLines = rawLinesFromMatrix(matrix)
      await deps.snowflake.insertRawLines({ sourceFile, lines: rawLines })

      const parsed = parsePartnerFileMatrix(matrix)
      const tests: PartnerFileParseTests | undefined = parseError
        ? undefined
        : runPartnerFileParseTests(parsed, source.expectedHeader)
      const failed =
        Boolean(parseError) ||
        Boolean(tests?.failed) ||
        parsed.rows.length === 0

      const nullCodeRows = parsed.rows.filter((r) => r.avLineItemId == null).length
      const range = parsed.rows.length > 0 ? minMaxDates(parsed.rows) : null
      const t5Drift = tests?.t5.value ?? null
      if (t5Drift != null) summary.t5Drift = t5Drift
      const errorText = parseError
        ? parseError
        : tests?.failed
          ? [tests.t1, tests.t4, tests.t5]
              .filter((t) => !t.ok)
              .map((t) => `${t.name}: ${t.detail}`)
              .join("; ") || "parse_failed"
          : parsed.rows.length === 0
            ? "no data rows"
            : null

      await deps.snowflake.writeLoadAndLog({
        load:
          failed || !range
            ? null
            : {
                source: source.sourceLabel,
                minDate: range.minDate,
                maxDate: range.maxDate,
                rows: parsed.rows,
                sourceFile,
              },
        log: {
          sourceSlug: source.sourceSlug,
          internetMessageId: message.internetMessageId,
          attachmentName: att.name,
          attachmentSha256: hash,
          sourceFile,
          senderAddress: message.senderAddress,
          receivedAt: message.receivedDateTime,
          bytes: att.bytes.length,
          lineCount: parsed.rawLines.length,
          parsedRowCount: parsed.rows.length,
          status: failed ? "parse_failed" : "loaded",
          errorText,
        },
      })

      if (tests) {
        summary.tests.push({ attachmentName: att.name, tests })
      }

      summary.rowsParsed += parsed.rows.length
      summary.rowsWithNullCode += nullCodeRows
      summary.files.push({
        attachmentName: att.name,
        sourceFile,
        status: failed ? "parse_failed" : "loaded",
        rowsParsed: parsed.rows.length,
        nullCodeRows,
        t5Drift,
        tests,
        errorText: errorText ?? undefined,
      })
      if (failed) {
        summary.failed += 1
        anyFailed = true
      } else {
        summary.loaded += 1
      }
    }

    await deps.mailbox.moveMessage(message.id, anyFailed ? "Failed" : "Processed")
  }

  return summary
}
