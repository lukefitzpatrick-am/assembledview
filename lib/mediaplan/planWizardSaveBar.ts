export type HandleSaveAllOpts = {
  intent?: "save" | "publish"
  exitAfter?: boolean
  download?: boolean
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
  clientsError?: string | null
  saveHydrationHoldReason?: string | null
}): string {
  if (args.isSaving) {
    return args.isPublishAction ? "Publishing…" : "Saving…"
  }
  if (args.saveBlockedByClientsError) {
    return args.clientsError ?? "Client list unavailable"
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
