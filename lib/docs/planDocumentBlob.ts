import type { PlanDocumentKind } from "@/lib/docs/planVersionFiles"

export type PlanDocumentBlobSource = "vercel-blob" | "regenerated"

export type PlanDocumentBlobJson = {
  url: string
  pathname: string
  name: string
  size: number
  mime: string
  uploadedAt: string
  source: PlanDocumentBlobSource
  generatedFrom?: "persisted"
}

function basename(filename: string): string {
  const trimmed = filename.replace(/\\/g, "/").trim()
  const parts = trimmed.split("/")
  const last = parts[parts.length - 1]?.trim()
  return last && last !== "." && last !== ".." ? last : "file"
}

export function planDocumentBlobPathname(
  mbaNumber: string,
  versionNumber: number,
  kind: PlanDocumentKind,
  filename: string,
): string {
  return `plans/${mbaNumber.trim()}/v${versionNumber}/${kind}/${basename(filename)}`
}

export function planDocumentBlobJson(args: {
  url: string
  pathname: string
  name: string
  size: number
  mime: string
  uploadedAt?: string
  source?: PlanDocumentBlobSource
  generatedFrom?: "persisted"
}): PlanDocumentBlobJson {
  return {
    url: args.url,
    pathname: args.pathname,
    name: args.name,
    size: args.size,
    mime: args.mime,
    uploadedAt: args.uploadedAt ?? new Date().toISOString(),
    source: args.source ?? "vercel-blob",
    ...(args.generatedFrom ? { generatedFrom: args.generatedFrom } : {}),
  }
}
