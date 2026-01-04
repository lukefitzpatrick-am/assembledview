import { parse as parseCsv } from "csv-parse/sync"
import ExcelJS from "exceljs"
import { callOpenAIChat } from "@/lib/openai"

export type MediaContainer = {
  name: string
  channel?: string
  publisher?: string
  flightStart?: string
  flightEnd?: string
  budget?: number | string
  specs?: string
  deadlines?: string
  kpis?: string
  notes?: string
  sourceFile?: string
}

export type PlanParseResult = {
  items: MediaContainer[]
  combinedSpecs: MediaContainer[]
  sources: Array<{
    fileName: string
    itemCount: number
    preview: string
  }>
}

type ParsedFile = {
  items: MediaContainer[]
  rawText: string
  fileName: string
}

export async function processPlanFiles(files: { buffer: Buffer; fileName: string }[]): Promise<PlanParseResult> {
  const parsed: ParsedFile[] = []

  for (const file of files) {
    const { buffer, fileName } = file
    const lower = fileName.toLowerCase()

    if (lower.endsWith(".pdf")) {
      parsed.push(await parsePdfBuffer(buffer, fileName))
    } else if (lower.endsWith(".csv")) {
      parsed.push(parseCsvBuffer(buffer, fileName))
    } else if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
      parsed.push(await parseXlsxBuffer(buffer, fileName))
    } else if (lower.endsWith(".docx") || lower.endsWith(".doc")) {
      parsed.push(await parseDocxBuffer(buffer, fileName))
    } else if (lower.match(/\.(png|jpg|jpeg|gif|webp)$/)) {
      // Image files: we cannot OCR here; surface a stub so the assistant can ask for clarification or future OCR
      parsed.push({
        fileName,
        rawText: `[Image file: ${fileName}. OCR not available in this environment.]`,
        items: [],
      })
    } else {
      // Unknown format: attempt to treat as text and let the LLM structure it
      const text = buffer.toString("utf-8")
      parsed.push({
        fileName,
        rawText: text,
        items: (await extractPlanFromText(text, fileName)).items,
      })
    }
  }

  const combinedSpecs = parsed.flatMap((p) => p.items)
  const sources = parsed.map((p) => ({
    fileName: p.fileName,
    itemCount: p.items.length,
    preview: p.rawText.slice(0, 800),
  }))

  return {
    items: combinedSpecs,
    combinedSpecs,
    sources,
  }
}

async function parsePdfBuffer(buffer: Buffer, fileName: string): Promise<ParsedFile> {
  const pdfParse = (await import("pdf-parse")).default as (data: Buffer) => Promise<{ text: string }>
  const pdfData = await pdfParse(buffer)
  const rawText = pdfData.text || buffer.toString("utf-8")
  const { items } = await extractPlanFromText(rawText, fileName)

  return { fileName, rawText, items }
}

function parseCsvBuffer(buffer: Buffer, fileName: string): ParsedFile {
  const rawText = buffer.toString("utf-8")
  const records = parseCsv(rawText, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as Array<Record<string, string>>

  const items = records.map((row) => normalizeCsvRow(row, fileName))
  return { fileName, rawText, items }
}

function normalizeCsvRow(row: Record<string, string>, fileName: string): MediaContainer {
  const lowerKey = (key: string) => key.toLowerCase().replace(/\s+/g, "")

  const safe = (keyOptions: string[]) => {
    for (const key of keyOptions) {
      const found = Object.entries(row).find(([k]) => lowerKey(k) === lowerKey(key))
      if (found) return found[1]
    }
    return undefined
  }

  const budgetRaw = safe(["budget", "cost", "spend"])
  const budget = budgetRaw ? Number(budgetRaw) || budgetRaw : undefined

  return {
    name: safe(["name", "placement", "line_item_id", "lineitem", "campaign"]) || "Unnamed item",
    channel: safe(["channel", "media_type", "type"]),
    publisher: safe(["publisher", "vendor", "site", "network"]),
    flightStart: safe(["start", "start_date", "flight_start"]),
    flightEnd: safe(["end", "end_date", "flight_end"]),
    specs: safe(["spec", "specs", "requirements"]),
    deadlines: safe(["deadline", "due", "material_deadline"]),
    budget,
    notes: safe(["notes", "comments"]),
    sourceFile: fileName,
  }
}

export async function extractPlanFromText(text: string, fileName?: string) {
  const prompt = [
    "You are extracting media plan or publisher specs into JSON.",
    "Return JSON only. Use this shape:",
    `{"items":[{"name":"","channel":"","publisher":"","flightStart":"","flightEnd":"","budget":"","specs":"","deadlines":"","kpis":"","notes":"","sourceFile":""}]}`,
    "Only include fields that are present. Keep dates as strings. Preserve publisher/spec details so they can be merged into a schedule.",
  ].join("\n")

  const { reply } = await callOpenAIChat([
    { role: "system", content: prompt },
    { role: "user", content: `File: ${fileName || "uploaded"}\nContent:\n${text.slice(0, 12000)}` },
  ])

  const parsed = coerceJson(reply)
  const items = Array.isArray(parsed?.items) ? parsed.items : Array.isArray(parsed) ? parsed : []

  return {
    items: items.map((item) => ({
      ...item,
      sourceFile: item.sourceFile || fileName,
    })),
    raw: reply,
  }
}

async function parseXlsxBuffer(buffer: Buffer, fileName: string): Promise<ParsedFile> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer)

  const allRows: string[][] = []
  let items: MediaContainer[] = []

  workbook.eachSheet((sheet) => {
    sheet.eachRow((row) => {
      // row.values is 1-indexed; normalize to 0-indexed array of strings
      const values = row.values
      const normalized = Array.isArray(values)
        ? values.slice(1).map((v) => (v === null || v === undefined ? "" : String(v)))
        : []
      allRows.push(normalized)
    })
  })

  const rawText = allRows.map((r) => r.join(",")).join("\n")

  if (allRows.length > 1) {
    const header = allRows[0]
    const records = allRows.slice(1).map((row) => {
      const obj: Record<string, string> = {}
      header.forEach((h, idx) => {
        const key = h || `col_${idx + 1}`
        obj[key] = row[idx] || ""
      })
      return obj
    })
    items = records.map((r) => normalizeCsvRow(r, fileName))
  } else {
    const { items: extracted } = await extractPlanFromText(rawText, fileName)
    items = extracted
  }

  return { fileName, rawText, items }
}

async function parseDocxBuffer(buffer: Buffer, fileName: string): Promise<ParsedFile> {
  try {
    const mammoth = await import("mammoth")
    const result = await mammoth.extractRawText({ buffer })
    const rawText = result.value || buffer.toString("utf-8")
    const { items } = await extractPlanFromText(rawText, fileName)
    return { fileName, rawText, items }
  } catch (error) {
    console.warn("Failed to parse DOC/DOCX with mammoth; falling back to raw text", error)
    const rawText = buffer.toString("utf-8")
    const { items } = await extractPlanFromText(rawText, fileName)
    return { fileName, rawText, items }
  }
}

function coerceJson(raw: string): any {
  if (!raw) return null
  const cleaned = raw.trim()

  const jsonBlock = extractJsonBlock(cleaned)
  if (jsonBlock) {
    try {
      return JSON.parse(jsonBlock)
    } catch (error) {
      console.error("Failed to parse JSON block from model output", error)
    }
  }

  try {
    return JSON.parse(cleaned)
  } catch (error) {
    console.error("Failed to parse model output as JSON", error)
    return null
  }
}

function extractJsonBlock(text: string): string | null {
  const match = text.match(/```(?:json)?\\s*([\\s\\S]*?)\\s*```/i)
  if (match?.[1]) {
    return match[1]
  }
  return null
}











