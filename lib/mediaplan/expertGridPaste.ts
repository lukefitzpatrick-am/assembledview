/**
 * Shared helpers for Excel-style TSV paste into expert schedule grids.
 */

export type PasteCellResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: string }

/** Split clipboard TSV into rows/columns; empty cells become "". Uneven rows are OK. */
export function splitClipboardMatrix(text: string): string[][] {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n")
  if (normalized === "") return []
  const lines = normalized.split("\n")
  // Drop a single trailing empty line from Excel copies
  const rows =
    lines.length > 1 && lines[lines.length - 1] === ""
      ? lines.slice(0, -1)
      : lines
  return rows.map((line) => line.split("\t").map((c) => (c === "" ? "" : c)))
}

/**
 * Parse pasted numeric text: currency, thousands separators, accounting (1,234.56) → normalized string for parseFloat.
 */
export function normalizePastedNumericRaw(raw: string): string {
  let t = raw.trim()
  if (t === "") return ""
  let neg = false
  if (/^\(.*\)$/.test(t)) {
    neg = true
    t = t.slice(1, -1).trim()
  }
  t = t.replace(/[$€£\s]/g, "")
  // EU-style: 1.234,56 or 12,34
  const euCommaDecimal = /^\d{1,3}(\.\d{3})*,\d+$/.test(t) || /^\d+,\d+$/.test(t)
  if (euCommaDecimal) {
    t = t.replace(/\./g, "").replace(",", ".")
  } else {
    t = t.replace(/,/g, "")
  }
  if (neg) t = `-${t}`
  return t
}

export function parseNumericPasteString(raw: string): PasteCellResult<number> {
  const t = raw.trim()
  if (t === "") return { ok: false, reason: "Empty numeric cell." }
  const norm = normalizePastedNumericRaw(raw)
  if (norm === "" || norm === "-") {
    return { ok: false, reason: "Could not parse number." }
  }
  const n = Number.parseFloat(norm)
  if (!Number.isFinite(n)) {
    return { ok: false, reason: "Could not parse number." }
  }
  return { ok: true, value: n }
}

export function anchorPasteColumnFromKey(
  columnKey: string,
  descriptorKeys: readonly string[],
  weekKeys: readonly string[]
): number | null {
  const di = descriptorKeys.indexOf(columnKey)
  if (di >= 0) return di
  const wi = weekKeys.indexOf(columnKey)
  if (wi >= 0) return descriptorKeys.length + wi
  return null
}

export function resolvePasteColumn(
  pasteCol: number,
  descriptorKeys: readonly string[],
  weekKeys: readonly string[]
):
  | { kind: "descriptor"; field: string }
  | { kind: "week"; weekKey: string }
  | null {
  if (pasteCol < 0) return null
  if (pasteCol < descriptorKeys.length) {
    return { kind: "descriptor", field: descriptorKeys[pasteCol] }
  }
  const wi = pasteCol - descriptorKeys.length
  if (wi < weekKeys.length) {
    return { kind: "week", weekKey: weekKeys[wi] }
  }
  return null
}

export function parseWeeklyPasteValue(raw: string): PasteCellResult<number | ""> {
  const t = raw.trim()
  if (t === "") return { ok: true, value: "" }
  const num = parseNumericPasteString(raw)
  if (!num.ok) {
    return { ok: false, reason: "Weekly quantity cells must be numbers." }
  }
  return { ok: true, value: num.value }
}

export function parseRatePasteValue(raw: string): PasteCellResult<string> {
  const t = raw.trim()
  if (t === "") return { ok: true, value: "" }
  const norm = normalizePastedNumericRaw(raw)
  if (norm === "" || norm === "-") {
    return { ok: false, reason: "Unit rate must be a number." }
  }
  const n = Number.parseFloat(norm)
  if (!Number.isFinite(n)) {
    return { ok: false, reason: "Unit rate must be a number." }
  }
  return { ok: true, value: norm }
}

/** Normalize to yyyy-MM-dd for <input type="date">, or "". */
export function parseDatePasteValue(raw: string): PasteCellResult<string> {
  const t = raw.trim()
  if (t === "") return { ok: true, value: "" }
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return { ok: true, value: t }

  const parsed = Date.parse(t)
  if (!Number.isNaN(parsed)) {
    const d = new Date(parsed)
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, "0")
    const day = String(d.getDate()).padStart(2, "0")
    return { ok: true, value: `${y}-${m}-${day}` }
  }

  const serial = Number.parseFloat(t.replace(/,/g, "").trim())
  if (
    Number.isFinite(serial) &&
    Number.isInteger(serial) &&
    serial >= 25000 &&
    serial <= 80000
  ) {
    // Likely Excel serial date (UTC from 1899-12-30)
    const epoch = Date.UTC(1899, 11, 30)
    const ms = epoch + serial * 86400000
    const d = new Date(ms)
    if (!Number.isNaN(d.getTime())) {
      const y = d.getUTCFullYear()
      const m = String(d.getUTCMonth() + 1).padStart(2, "0")
      const day = String(d.getUTCDate()).padStart(2, "0")
      return { ok: true, value: `${y}-${m}-${day}` }
    }
  }

  return { ok: false, reason: "Could not parse date value." }
}

/** First HTML table in clipboard → matrix of cell text (row-major). */
export function matrixFromHtmlTable(html: string): string[][] | null {
  if (!html.trim()) return null
  try {
    const doc = new DOMParser().parseFromString(html, "text/html")
    const table = doc.querySelector("table")
    if (!table) return null
    const trs = [...table.querySelectorAll("tr")]
    if (trs.length === 0) return null
    return trs.map((tr) =>
      [...tr.querySelectorAll("th,td")].map(
        (cell) => cell.textContent?.replace(/\u00a0/g, " ").trim() ?? ""
      )
    )
  } catch {
    return null
  }
}

/** Prefer TSV plain text; fall back to first HTML table from Excel. */
export function clipboardMatrixFromDataTransfer(
  data: DataTransfer | null
): string[][] | null {
  if (!data) return null
  const plain = data.getData("text/plain")
  const html = data.getData("text/html")
  return clipboardMatrixFromStrings(plain, html)
}

/**
 * Build a paste matrix from raw strings (e.g. `navigator.clipboard.read()`).
 * Prefer plain TSV; if plain is empty, parse HTML table (Excel often provides both).
 */
export function clipboardMatrixFromStrings(
  textPlain: string,
  textHtml?: string
): string[][] | null {
  const plain = textPlain ?? ""
  if (plain.trim()) {
    const m = splitClipboardMatrix(plain)
    return m.length > 0 ? m : null
  }
  const html = textHtml ?? ""
  if (html.trim()) {
    const m = matrixFromHtmlTable(html)
    return m && m.length > 0 ? m : null
  }
  return null
}

/**
 * Read clipboard as TSV/matrix via Async Clipboard API (plain + HTML when available).
 * Returns null if permission denied, unsupported, or empty.
 */
export async function readClipboardMatrixAsync(): Promise<string[][] | null> {
  if (typeof navigator === "undefined" || !navigator.clipboard) {
    return null
  }
  try {
    if (typeof navigator.clipboard.read === "function") {
      const items = await navigator.clipboard.read()
      for (const item of items) {
        let plain = ""
        let html = ""
        const types = item.types
        if (types.includes("text/plain")) {
          const blob = await item.getType("text/plain")
          plain = await blob.text()
        }
        if (types.includes("text/html")) {
          const blob = await item.getType("text/html")
          html = await blob.text()
        }
        const m = clipboardMatrixFromStrings(plain, html)
        if (m && m.length > 0) return m
      }
    }
  } catch {
    /* fall through to readText */
  }
  try {
    if (typeof navigator.clipboard.readText === "function") {
      const plain = await navigator.clipboard.readText()
      return clipboardMatrixFromStrings(plain)
    }
  } catch {
    /* ignore */
  }
  return null
}

/** Remove leading/trailing columns that are empty in every row (Excel edge padding). */
export function trimEmptyEdgeColumns(matrix: string[][]): string[][] {
  if (matrix.length === 0) return matrix
  const colCount = Math.max(0, ...matrix.map((r) => r.length))
  if (colCount === 0) return matrix
  let c0 = 0
  let c1 = colCount
  while (
    c0 < c1 &&
    matrix.every((row) => (row[c0] ?? "").trim() === "")
  ) {
    c0++
  }
  while (
    c1 > c0 &&
    matrix.every((row) => (row[c1 - 1] ?? "").trim() === "")
  ) {
    c1--
  }
  if (c0 === 0 && c1 === colCount) return matrix
  return matrix.map((row) => row.slice(c0, c1))
}

/** True if any cell in the row looks like a pasted weekly quantity (number). */
export function rowHasNumericWeekPasteCell(row: string[] | undefined): boolean {
  if (!row) return false
  for (const cell of row) {
    const r = parseWeeklyPasteValue(cell)
    if (r.ok && r.value !== "" && typeof r.value === "number") return true
  }
  return false
}

/**
 * When pasting into week columns, Excel often includes a header row of week labels/dates.
 * Drop the first row if it has no numeric week quantities but the second row does.
 */
export function dropLeadingNonNumericWeekHeaderRow(
  matrix: string[][]
): string[][] {
  if (matrix.length < 2) return matrix
  const first = matrix[0]
  if (rowHasNumericWeekPasteCell(first)) return matrix
  if (!rowHasNumericWeekPasteCell(matrix[1])) return matrix
  return matrix.slice(1)
}
