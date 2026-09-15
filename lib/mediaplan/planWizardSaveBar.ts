export type HandleSaveAllOpts = {
  intent?: "save" | "publish"
  exitAfter?: boolean
  download?: boolean
  /** After a successful publish, zip the published MBA / Media Plan / naming. */
  zipAfter?: boolean
}

export type SaveSuccessSideEffects = {
  shouldNavigate: boolean
  shouldDownload: boolean
}

/** Side effects after a fully successful save. Defaults are both false. */
export function resolveSaveSuccessSideEffects(
  opts?: HandleSaveAllOpts
): SaveSuccessSideEffects {
  return {
    shouldNavigate: opts?.exitAfter === true,
    shouldDownload: opts?.download === true,
  }
}

export async function runSaveSuccessSideEffects(args: {
  succeeded: boolean
  opts?: HandleSaveAllOpts
  navigate: () => void
  downloadPlan: () => Promise<boolean>
}): Promise<{ downloaded: boolean | null; navigated: boolean }> {
  if (!args.succeeded) {
    return { downloaded: null, navigated: false }
  }
  const { shouldNavigate, shouldDownload } = resolveSaveSuccessSideEffects(
    args.opts
  )
  let downloaded: boolean | null = null
  if (shouldDownload) {
    downloaded = await args.downloadPlan()
  }
  if (shouldNavigate) {
    args.navigate()
  }
  return { downloaded, navigated: shouldNavigate }
}

export function describePublishSuccessToast(args: {
  versionNumber: number | string
  downloadOk: boolean
}): { title: string; description: string } {
  const n = args.versionNumber
  if (args.downloadOk) {
    return {
      title: "Published",
      description: `v${n} published · media plan downloaded`,
    }
  }
  return {
    title: "Published",
    description: `v${n} published. The media plan download failed — try again from Downloads.`,
  }
}

export function wizardPrimarySaveLabel(args: {
  savePublishesImmediately: boolean
  isPublished: boolean
  isSaving: boolean
  isPublishAction: boolean
  saveBlockedByClientsError?: boolean
  saveHeldForHydration?: boolean
  saveBlockedByFailedChannelLoad?: boolean
  clientsError?: string | null
  saveHydrationHoldReason?: string | null
  saveFailedChannelLoadReason?: string | null
}): string {
  if (args.isSaving) {
    return args.isPublishAction ? "Publishing…" : "Saving…"
  }
  if (args.saveBlockedByClientsError) {
    return args.clientsError ?? "Client list unavailable"
  }
  if (args.saveBlockedByFailedChannelLoad) {
    return args.saveFailedChannelLoadReason ?? "Channel failed to load"
  }
  if (args.saveHeldForHydration) {
    return args.saveHydrationHoldReason ?? "Waiting for channels…"
  }
  if (args.savePublishesImmediately) return "Publish"
  if (args.isPublished) return "Save draft"
  return "Save"
}

/**
 * Soft Save draft on the edit bar. Flag-on keeps it after publish (primary
 * Save already publishes). Flag-off hides it on a published tip so it does
 * not duplicate the working-draft primary.
 */
export function showPlanDraftSaveButton(args: {
  enabled: boolean
  savePublishesImmediately: boolean
  isPublished: boolean
}): boolean {
  return args.enabled && (args.savePublishesImmediately || !args.isPublished)
}

/** Create cannot mint `plan_working_drafts` (unique on master_id + user_id, C-118). */
export const CREATE_SAVE_DRAFT_DISABLED_REASON =
  "Drafts save to this browser until the plan is published"

/** @deprecated Draft downloads are allowed; published zip still uses the published path. */
export const DRAFT_BLOCKS_DOWNLOAD_MESSAGE =
  "Publish this version to download and send to client"

export function catchPlanDraftAction(
  action: Promise<unknown>,
  toastFn: (opts: {
    variant: "destructive"
    title: string
    description: string
  }) => void,
  title = "Draft action failed"
): void {
  void action.catch((err: unknown) => {
    const description = err instanceof Error ? err.message : String(err)
    console.error("[plan-draft]", title, err)
    toastFn({
      variant: "destructive",
      title,
      description,
    })
  })
}

export const DRAFT_DOWNLOAD_HINT =
  "Watermarked DRAFT. Clients still have vN."

export const DRAFT_MBA_TOAST =
  "Draft MBA downloaded - not for the client. Publish to issue vN."

export const CREATE_DRAFT_DOWNLOAD_RAIL =
  "Downloads are drafts. Publish creates v1 for clients."

export const EDIT_DRAFT_DOWNLOAD_RAIL =
  "Draft downloads are not that file."

export function wizardPublishMbaLabel(args: { isBusy: boolean; label?: string }): string {
  if (args.isBusy) return "Generating MBA…"
  return args.label ?? "MBA"
}

export type WizardDownloadControls = {
  showDraftGroup: boolean
  showPublishedGroup: boolean
  showDraftAa: boolean
  draftMbaLabel: string
  draftMediaPlanLabel: string
  draftAaLabel: string
  publishedMbaLabel: string
  publishedMediaPlanLabel: string
  publishedAaLabel: string
  draftHint: string | undefined
}

export function wizardDownloadControls(args: {
  isCreate: boolean
  isPublished: boolean
  hasWorkingDraftOrDirty: boolean
  publishedVersionNumber: number | null
}): WizardDownloadControls {
  const n = args.publishedVersionNumber
  const v = n != null && Number.isFinite(n) && n > 0 ? ` (v${n})` : ""
  if (args.isCreate || !args.isPublished) {
    return {
      showDraftGroup: true,
      showPublishedGroup: false,
      showDraftAa: !args.isCreate,
      draftMbaLabel: "Download draft MBA",
      draftMediaPlanLabel: "Download draft Media Plan",
      draftAaLabel: "Download draft Media Plan (AA)",
      publishedMbaLabel: "MBA",
      publishedMediaPlanLabel: "Media Plan",
      publishedAaLabel: "Media Plan (AA)",
      draftHint: DRAFT_DOWNLOAD_HINT,
    }
  }
  if (args.hasWorkingDraftOrDirty) {
    return {
      showDraftGroup: true,
      showPublishedGroup: true,
      showDraftAa: true,
      draftMbaLabel: "Draft MBA",
      draftMediaPlanLabel: "Draft Media Plan",
      draftAaLabel: "Draft Media Plan (AA)",
      publishedMbaLabel: `Published MBA${v}`,
      publishedMediaPlanLabel: `Published Media Plan${v}`,
      publishedAaLabel: `Published Media Plan (AA)${v}`,
      draftHint: DRAFT_DOWNLOAD_HINT,
    }
  }
  return {
    showDraftGroup: false,
    showPublishedGroup: true,
    showDraftAa: false,
    draftMbaLabel: "Download draft MBA",
    draftMediaPlanLabel: "Download draft Media Plan",
    draftAaLabel: "Download draft Media Plan (AA)",
    publishedMbaLabel: "MBA",
    publishedMediaPlanLabel: "Media Plan",
    publishedAaLabel: "Media Plan (AA)",
    draftHint: undefined,
  }
}
