/**
 * Test helper: a minimal RFC 4180 parser for app-generated CSV (quoted
 * fields, doubled quotes, CRLF rows). Used to check exact column widths.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else quoted = false
      } else field += ch
      continue
    }
    if (ch === '"' && field === "") quoted = true
    else if (ch === ",") {
      row.push(field)
      field = ""
    } else if (ch === "\r" && text[i + 1] === "\n") {
      row.push(field)
      rows.push(row)
      row = []
      field = ""
      i++
    } else field += ch
  }
  if (quoted) throw new Error("unterminated quote")
  if (field !== "" || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows
}
