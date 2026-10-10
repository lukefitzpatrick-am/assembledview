/**
 * One download name for a media plan workbook or an MBA PDF.
 * Draft files are stamped. Published files carry the version.
 * Characters Windows refuses in a file name are stripped.
 */

const WINDOWS_ILLEGAL = /[<>:"/\\|?*\u0000-\u001f]/g

export function planFileToken(raw: string | null | undefined, fallback: string): string {
  const cleaned = String(raw ?? "")
    .replace(WINDOWS_ILLEGAL, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "")
  return cleaned || fallback
}

export type PlanDocumentFileKind = "media_plan" | "aa_media_plan" | "mba"

function documentLabel(kind: PlanDocumentFileKind): string {
  if (kind === "mba") return "MBA"
  if (kind === "aa_media_plan") return "Media Plan (AA)"
  return "Media Plan"
}

function versionLabel(version: number | string | undefined): string {
  const raw = String(version ?? "").trim()
  const n = Number(raw)
  if (raw !== "" && Number.isFinite(n)) return String(n)
  return planFileToken(raw, "1")
}

export function planDocumentFileName(args: {
  clientName: string
  campaignName: string
  kind: PlanDocumentFileKind
  draft: boolean
  versionNumber?: number | string
  partial?: boolean
}): string {
  const client = planFileToken(args.clientName, "Client")
  const campaign = planFileToken(args.campaignName, "Campaign")
  const doc = documentLabel(args.kind)
  const ext = args.kind === "mba" ? "pdf" : "xlsx"
  if (args.draft) {
    return `DRAFT - ${client} - ${campaign} - ${doc} - not for client.${ext}`
  }
  const partial = args.partial ? " partial" : ""
  return `${client} - ${campaign} - ${doc} - v${versionLabel(args.versionNumber)}${partial}.${ext}`
}
