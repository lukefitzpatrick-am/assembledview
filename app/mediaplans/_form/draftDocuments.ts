/**
 * Draft document downloads on the plan form (both pages; B52): draft MBA,
 * draft media plan and draft AA plan. POST /api/mediaplans/draft-documents
 * (never persisted), click the file, toast. The page builds the body.
 */
import { toast } from "@/components/ui/use-toast"
import { clickBlobDownload } from "@/lib/docs/clickBlobDownload"
import { postDraftDocuments } from "@/lib/docs/postDraftDocuments"
import type { DraftDocumentKind } from "@/lib/mediaplan/mergeDraftDocumentsBody"
import { DRAFT_MBA_TOAST } from "@/lib/mediaplan/planWizardSaveBar"

const FAILED: Record<DraftDocumentKind, string> = {
  mba_pdf: "Failed to download draft MBA",
  media_plan: "Failed to download draft media plan",
  aa_media_plan: "Failed to download draft AA media plan",
}

/** True when the file was downloaded. `quiet` drops both toasts (zip and save-and-download runs). */
export async function downloadDraftDocument(args: {
  kind: DraftDocumentKind
  /** The request body; may wait for state to settle first. */
  body: (kind: DraftDocumentKind) => Promise<Record<string, unknown>> | Record<string, unknown>
  setBusy: (busy: boolean) => void
  quiet?: boolean
}): Promise<boolean> {
  args.setBusy(true)
  try {
    const { blob, filename } = await postDraftDocuments(await args.body(args.kind))
    clickBlobDownload(blob, filename)
    if (!args.quiet) toast({ title: DRAFT_MBA_TOAST })
    return true
  } catch (e: unknown) {
    if (!args.quiet) {
      toast({
        title: "Error",
        description: e instanceof Error ? e.message : FAILED[args.kind],
        variant: "destructive",
      })
    }
    return false
  } finally {
    args.setBusy(false)
  }
}
