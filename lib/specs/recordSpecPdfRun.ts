import { getDb, schema } from "@/db"

import {
  buildSpecRunExtracted,
  extractSpecPdfText,
  type SpecRunExtracted,
} from "./parsePdfText"

export type RecordSpecPdfRunInput = {
  buffer: Buffer
  fileName?: string
  uploadedBy?: string
  publisherSlug?: string
  publisherId?: number
  publisherSpecsId?: number
  blobPath?: string
}

export type RecordSpecPdfRunResult = {
  id: number
  extracted: SpecRunExtracted | Record<string, never>
  outcome: "parsed" | "failed"
  outcomeReason?: string
}

/** Write path for spec_runs.extracted from a PDF buffer (pdf-parse reuse). */
export async function recordSpecPdfRun(
  input: RecordSpecPdfRunInput,
): Promise<RecordSpecPdfRunResult> {
  const db = getDb()
  try {
    const parsed = await extractSpecPdfText(input.buffer)
    const extracted = buildSpecRunExtracted(parsed)
    const inserted = await db
      .insert(schema.specRuns)
      .values({
        publisherSpecsId: input.publisherSpecsId,
        publisherId: input.publisherId,
        publisherSlug: input.publisherSlug,
        fileName: input.fileName,
        uploadedBy: input.uploadedBy,
        blobPath: input.blobPath,
        extracted,
        outcome: "parsed",
      })
      .returning({ id: schema.specRuns.id })
    const id = inserted[0]?.id
    if (id == null) throw new Error("spec_runs insert returned no id")
    return { id, extracted, outcome: "parsed" }
  } catch (error) {
    const outcomeReason = error instanceof Error ? error.message : String(error)
    const inserted = await db
      .insert(schema.specRuns)
      .values({
        publisherSpecsId: input.publisherSpecsId,
        publisherId: input.publisherId,
        publisherSlug: input.publisherSlug,
        fileName: input.fileName,
        uploadedBy: input.uploadedBy,
        blobPath: input.blobPath,
        extracted: {},
        outcome: "failed",
        outcomeReason,
      })
      .returning({ id: schema.specRuns.id })
    const id = inserted[0]?.id
    if (id == null) throw new Error("spec_runs failed insert returned no id")
    return { id, extracted: {}, outcome: "failed", outcomeReason }
  }
}
