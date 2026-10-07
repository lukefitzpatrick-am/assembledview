import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const pdfParse = require("pdf-parse") as (buf: Buffer) => Promise<{ text: string }>

/** Custom PDF fonts are not WinAnsi, so drawn strings are not visible in a latin1 scan. */
export async function pdfText(buf: Buffer): Promise<string> {
  const parsed = await pdfParse(buf)
  return parsed.text
}
