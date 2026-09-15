import { keepPartnerAttachment } from "./keepAttachment"
import { matchPartnerSource } from "./matchSource"
import { runPartnerFileParseTests } from "./parseTests"
import { parserForSource, rawLinesFromMatrix, readPartnerFileMatrix } from "./parsers"
import { sha256Hex } from "./sha256"
import { partnerSourceFile } from "./sourceFile"
import { resolveLoadMode } from "./sql"
import type {
  ParsedPartnerFile,
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
   * The replace is BEGIN → DELETE → INSERT → COMMIT on one held session, with the
   * DELETE shaped by `loadMode`. Never UPDATE. Daily rows are omitted when `load` is null.
   */
  writeLoadAndLog(input: {
    load: {
      source: string
      minDate: string
      maxDate: string
      loadMode?: string | null
      rows: PartnerDeliveryRow[]
      sourceFile: string
    } | null
    log: PartnerIngestLogRow
  }): Promise<void>
  /** Latest REPORT_DATE per SOURCE label, for the staleness sweep. */
  loadMaxReportDates?(sourceLabels: string[]): Promise<Record<string, string | null>>
}

export type PartnerIngestDeps = {
  mailbox: PartnerMailboxPort
  snowflake: PartnerSnowflakePort
  /** `YYYY-MM-DD`. Defaults to today in Melbourne, the agency's business day. */
  today?: string
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
    staleSources: [],
  }
}

function melbourneToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Melbourne",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date())
}

function daysBetween(fromYmd: string, toYmd: string): number {
  const from = Date.parse(`${fromYmd}T00:00:00Z`)
  const to = Date.parse(`${toYmd}T00:00:00Z`)
  if (Number.isNaN(from) || Number.isNaN(to)) return 0
  return Math.round((to - from) / 86400000)
}

async function collectStaleSources(
  deps: PartnerIngestDeps,
  maps: PartnerSourceMapRow[]
): Promise<PartnerIngestRunSummary["staleSources"]> {
  if (!deps.snowflake.loadMaxReportDates) return []
  const watched = maps.filter((m) => m.isActive && m.maxStaleDays != null)
  if (watched.length === 0) return []
  const labels = [...new Set(watched.map((m) => m.sourceLabel))]
  const maxes = await deps.snowflake.loadMaxReportDates(labels)
  const today = deps.today ?? melbourneToday()
  const stale: PartnerIngestRunSummary["staleSources"] = []
  const seen = new Set<string>()
  for (const map of watched) {
    if (seen.has(map.sourceSlug)) continue
    const max = maxes[map.sourceLabel]
    if (!max) continue
    const staleDays = daysBetween(max, today)
    if (staleDays > (map.maxStaleDays ?? 0)) {
      seen.add(map.sourceSlug)
      stale.push({ sourceSlug: map.sourceSlug, staleDays })
    }
  }
  return stale
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

  async function writeUnrecognised(
    message: PartnerMailMessage,
    sourceSlug: string,
    errorText: string
  ): Promise<void> {
    summary.unrecognised += 1
    const sourceFile = partnerSourceFile({
      sourceSlug,
      receivedAt: message.receivedDateTime,
      internetMessageId: message.internetMessageId,
      attachmentName: "(none)",
    })
    await deps.snowflake.writeLoadAndLog({
      load: null,
      log: {
        sourceSlug,
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
        errorText,
      },
    })
    summary.files.push({
      attachmentName: "(none)",
      sourceFile,
      status: "unrecognised",
      rowsParsed: 0,
      nullCodeRows: 0,
      errorText,
    })
    await deps.mailbox.moveMessage(message.id, "Unrecognised")
  }

  for (const message of oldestFirst) {
    const source = matchPartnerSource(message, maps)
    if (!source) {
      await writeUnrecognised(
        message,
        "unrecognised",
        "sender domain or subject did not match PARTNER_SOURCE_MAP"
      )
      continue
    }

    let parseMatrix
    try {
      parseMatrix = parserForSource(source.sourceSlug)
    } catch (err) {
      await writeUnrecognised(
        message,
        source.sourceSlug,
        err instanceof Error ? err.message : String(err)
      )
      continue
    }

    const loadMode = resolveLoadMode(source.loadMode)
    const loadModeError = loadMode
      ? null
      : `unknown LOAD_MODE ${JSON.stringify(source.loadMode ?? "")}`

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

      let parsed: ParsedPartnerFile = {
        headerRow: 0,
        preambleRowCount: 0,
        detectedHeader: "",
        rawLines,
        rows: [],
      }
      if (!parseError) {
        try {
          parsed = parseMatrix(matrix)
        } catch (err) {
          parseError = err instanceof Error ? err.message : String(err)
        }
      }
      const tests: PartnerFileParseTests | undefined = parseError
        ? undefined
        : runPartnerFileParseTests(parsed, source.expectedHeader, matrix)
      const failed =
        Boolean(parseError) ||
        Boolean(loadModeError) ||
        Boolean(tests?.failed) ||
        parsed.rows.length === 0

      const nullCodeRows = parsed.rows.filter((r) => r.avLineItemId == null).length
      const range = parsed.rows.length > 0 ? minMaxDates(parsed.rows) : null
      const t5Drift = tests?.t5.value ?? null
      if (t5Drift != null) summary.t5Drift = t5Drift
      const errorText = parseError
        ? parseError
        : loadModeError
          ? loadModeError
          : tests?.failed
            ? [tests.t1, tests.t4, tests.t5, tests.t6]
                .filter((t): t is NonNullable<typeof t> => t != null && !t.ok)
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
                loadMode: source.loadMode,
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

  summary.staleSources = await collectStaleSources(deps, maps)

  return summary
}
