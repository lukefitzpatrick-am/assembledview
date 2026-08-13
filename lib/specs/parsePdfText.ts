import { createRequire } from "node:module"

export type SpecPdfText = {
  text: string
  numpages: number
}

export type SpecRunExtracted = SpecPdfText & {
  parser: "pdf-parse"
}

type PdfParseFn = (data: Uint8Array) => Promise<{ text?: string; numpages?: number }>

const requireFromHere = createRequire(import.meta.url)

function loadPdfParse(): PdfParseFn {
  const mod = requireFromHere("./pdfParse.cjs") as PdfParseFn
  if (typeof mod !== "function") {
    throw new Error("pdf-parse CJS wrapper did not export a function")
  }
  return mod
}

export function buildSpecRunExtracted(parsed: SpecPdfText): SpecRunExtracted {
  return { text: parsed.text, numpages: parsed.numpages, parser: "pdf-parse" }
}

/** Reuse the existing `pdf-parse` dependency for spec-upload text extract. */
export async function extractSpecPdfText(buffer: Buffer): Promise<SpecPdfText> {
  if (!buffer.length) {
    throw new Error("PDF buffer is empty")
  }
  // pdf.js v1.10 (bundled in pdf-parse) misreads Node Buffer's pooled ArrayBuffer
  // ("bad XRef" / "Command token too long"). Pass a tight Uint8Array, never Buffer.
  const bytes = Uint8Array.from(buffer)
  const parsed = await loadPdfParse()(bytes)
  return {
    text: typeof parsed.text === "string" ? parsed.text : "",
    numpages: typeof parsed.numpages === "number" ? parsed.numpages : 0,
  }
}
