"use client"

import { Download, Loader2, MoreHorizontal } from "lucide-react"

import { SplitActionButton } from "@/components/mediaplans/SplitActionButton"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  DRAFT_BLOCKS_DOWNLOAD_MESSAGE,
  wizardDownloadControls,
  wizardPublishMbaLabel,
} from "@/lib/mediaplan/planWizardSaveBar"
import { cn } from "@/lib/utils"

export type PlanWizardBottomBarProps = {
  savePublishesImmediately: boolean
  isPublished: boolean
  primaryLabel: string
  isSaving: boolean
  saveBarDisabled: boolean
  saveBarTitle?: string
  onPrimary: () => void
  onPublishAndExit: () => void
  onSaveAndExit: () => void
  showExplicitPublish: boolean
  onExplicitPublish: () => void
  onExplicitPublishAndExit: () => void
  showSaveDraft: boolean
  onSaveDraft: () => void
  onSaveDraftAndExit: () => void
  saveDraftDisabled: boolean
  saveDraftTitle?: string
  autosaveStatus?: string | null
  onPublishMba: () => void
  mbaBusy: boolean
  onDownloadMediaPlan: () => void
  onDownloadAa: () => void
  onDraftMba?: () => void
  onDraftMediaPlan?: () => void
  onDraftAa?: () => void
  isCreate?: boolean
  hasWorkingDraftOrDirty?: boolean
  publishedVersionNumber?: number | null
  onDownloadNaming: () => void
  onSaveAndDownloadAll: () => void
  isDownloading: boolean
  isDownloadingAa: boolean
  isNamingDownloading: boolean
  downloadsLocked: boolean
  hasAdvertisingAssociatesBilling: boolean
  /** Edit gates Media Plan / AA / zip on a published version; create does not. */
  gateDownloadsOnPublish: boolean
  draftBlocksDownloadMessage?: string
  failedLoadRetry?: {
    reason: string
    retryLabel: string
    onRetry: () => void
    retrying?: boolean
  } | null
}

export function PlanWizardBottomBar({
  savePublishesImmediately,
  isPublished,
  primaryLabel,
  isSaving,
  saveBarDisabled,
  saveBarTitle,
  onPrimary,
  onPublishAndExit,
  onSaveAndExit,
  showExplicitPublish,
  onExplicitPublish,
  onExplicitPublishAndExit,
  showSaveDraft,
  onSaveDraft,
  onSaveDraftAndExit,
  saveDraftDisabled,
  saveDraftTitle,
  autosaveStatus = null,
  onPublishMba,
  mbaBusy,
  onDownloadMediaPlan,
  onDownloadAa,
  onDraftMba,
  onDraftMediaPlan,
  onDraftAa,
  isCreate = false,
  hasWorkingDraftOrDirty = false,
  publishedVersionNumber = null,
  onDownloadNaming,
  onSaveAndDownloadAll,
  isDownloading,
  isDownloadingAa,
  isNamingDownloading,
  downloadsLocked,
  hasAdvertisingAssociatesBilling,
  gateDownloadsOnPublish,
  draftBlocksDownloadMessage = DRAFT_BLOCKS_DOWNLOAD_MESSAGE,
  failedLoadRetry = null,
}: PlanWizardBottomBarProps) {
  const controls = wizardDownloadControls({
    isCreate,
    isPublished,
    hasWorkingDraftOrDirty,
    publishedVersionNumber,
  })
  const draftHint = controls.draftHint
  const unpublishedTitle = !isPublished ? draftBlocksDownloadMessage : undefined
  const downloadBlocked = gateDownloadsOnPublish && !isPublished
  const downloadsBusy =
    isDownloading || isDownloadingAa || isNamingDownloading || downloadsLocked
  const mediaPlanDisabled = downloadBlocked || downloadsBusy
  const aaDisabled =
    downloadBlocked || !hasAdvertisingAssociatesBilling || downloadsBusy
  const draftAaHidden =
    !controls.showDraftAa || !hasAdvertisingAssociatesBilling
  const zipDisabled = downloadsLocked || isDownloading || isDownloadingAa
  const publishAndDownloadAllItem = {
    label: "Publish & download all",
    hint: "Publishes, then downloads the MBA, media plan and naming as one zip",
    onSelect: onSaveAndDownloadAll,
    disabled: zipDisabled,
  }
  const draftMba = onDraftMba ?? onPublishMba
  const draftMediaPlan = onDraftMediaPlan ?? onDownloadMediaPlan
  const draftAa = onDraftAa ?? onDownloadAa
  const draftBtnClass =
    "hidden h-9 shrink-0 rounded-pill border border-border bg-background px-4 py-2 text-foreground hover:bg-muted md:inline-flex focus-visible:ring-2 focus-visible:ring-ring"

  return (
    <>
      <SplitActionButton
        label={primaryLabel}
        busyLabel={savePublishesImmediately ? "Publishing…" : "Saving…"}
        isBusy={isSaving}
        disabled={saveBarDisabled}
        title={saveBarTitle}
        onPrimary={onPrimary}
        menu={
          savePublishesImmediately
            ? [
                {
                  label: "Publish and exit",
                  hint: "Publishes, then returns to Campaigns",
                  onSelect: onPublishAndExit,
                },
                publishAndDownloadAllItem,
              ]
            : [
                {
                  label: isPublished ? "Save draft and exit" : "Save and exit",
                  hint: isPublished
                    ? "Keeps your working draft, then returns to Campaigns"
                    : "Saves, then returns to Campaigns",
                  onSelect: onSaveAndExit,
                },
              ]
        }
      />
      {failedLoadRetry ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={failedLoadRetry.onRetry}
          disabled={failedLoadRetry.retrying}
          title={failedLoadRetry.reason}
        >
          {failedLoadRetry.retrying ? "Retrying…" : failedLoadRetry.retryLabel}
        </Button>
      ) : null}
      {showExplicitPublish ? (
        <SplitActionButton
          label="Publish"
          busyLabel="Publishing…"
          isBusy={isSaving}
          disabled={saveBarDisabled}
          onPrimary={onExplicitPublish}
          menu={[
            {
              label: "Publish and exit",
              hint: "Publishes, then returns to Campaigns",
              onSelect: onExplicitPublishAndExit,
            },
            publishAndDownloadAllItem,
          ]}
        />
      ) : null}
      {showSaveDraft ? (
        <>
          <SplitActionButton
            variant="outline"
            label="Save draft"
            onPrimary={onSaveDraft}
            disabled={saveDraftDisabled}
            title={saveDraftTitle}
            menu={[
              {
                label: "Save draft and exit",
                hint: "Keeps your working draft, then returns to Campaigns",
                onSelect: onSaveDraftAndExit,
                disabled: saveDraftDisabled,
              },
            ]}
          />
          {autosaveStatus ? (
            <span className="hidden max-w-[14rem] text-[11px] leading-snug text-muted-foreground md:inline">
              {autosaveStatus}
            </span>
          ) : null}
        </>
      ) : null}
      <div className="flex items-center gap-2 md:hidden">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              className="h-9 rounded-pill px-4 focus-visible:ring-2 focus-visible:ring-ring"
              disabled={downloadsBusy}
            >
              <MoreHorizontal className="mr-1.5 h-4 w-4" />
              Downloads
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {controls.showDraftGroup ? (
              <>
                <DropdownMenuItem
                  onClick={draftMba}
                  disabled={mbaBusy || downloadsLocked}
                  title={draftHint}
                >
                  {wizardPublishMbaLabel({ isBusy: mbaBusy, label: controls.draftMbaLabel })}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={draftMediaPlan}
                  disabled={downloadsBusy}
                  title={draftHint}
                >
                  {controls.draftMediaPlanLabel}
                </DropdownMenuItem>
                {draftAaHidden ? null : (
                  <DropdownMenuItem
                    onClick={draftAa}
                    disabled={aaDisabled}
                    title={draftHint}
                    className="text-brand-dark focus:bg-highlight/25 focus:text-brand-dark"
                  >
                    {controls.draftAaLabel}
                  </DropdownMenuItem>
                )}
              </>
            ) : null}
            {controls.showPublishedGroup ? (
              <>
                <DropdownMenuItem
                  onClick={onPublishMba}
                  disabled={mbaBusy || downloadsLocked || !isPublished}
                  title={unpublishedTitle}
                >
                  {wizardPublishMbaLabel({ isBusy: mbaBusy, label: controls.publishedMbaLabel })}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={onDownloadMediaPlan}
                  disabled={mediaPlanDisabled}
                  title={gateDownloadsOnPublish ? unpublishedTitle : undefined}
                >
                  {controls.publishedMediaPlanLabel}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={onDownloadAa}
                  disabled={aaDisabled}
                  title={gateDownloadsOnPublish ? unpublishedTitle : undefined}
                  className={cn(
                    "text-brand-dark focus:bg-highlight/25 focus:text-brand-dark",
                    (!hasAdvertisingAssociatesBilling || downloadBlocked) && "opacity-50",
                  )}
                >
                  {controls.publishedAaLabel}
                </DropdownMenuItem>
              </>
            ) : null}
            <DropdownMenuItem onClick={onDownloadNaming} disabled={downloadsBusy}>
              Generate Naming (Ava)
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {controls.showDraftGroup ? (
        <Button
          type="button"
          onClick={draftMba}
          disabled={mbaBusy || downloadsLocked}
          title={draftHint}
          className={draftBtnClass}
        >
          {mbaBusy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          <span className="ml-2">
            {wizardPublishMbaLabel({ isBusy: mbaBusy, label: controls.draftMbaLabel })}
          </span>
        </Button>
      ) : null}
      {controls.showDraftGroup ? (
        <Button
          type="button"
          onClick={draftMediaPlan}
          disabled={downloadsBusy}
          title={draftHint}
          className={draftBtnClass}
        >
          {isDownloading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          <span className="ml-2">{controls.draftMediaPlanLabel}</span>
        </Button>
      ) : null}
      {controls.showDraftGroup && !draftAaHidden ? (
        <Button
          type="button"
          onClick={draftAa}
          disabled={aaDisabled}
          title={draftHint}
          className={cn(draftBtnClass, "text-foreground")}
        >
          {isDownloadingAa ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          <span className="ml-2">{controls.draftAaLabel}</span>
        </Button>
      ) : null}
      {controls.showPublishedGroup ? (
      <Button
        type="button"
        onClick={onPublishMba}
        disabled={mbaBusy || downloadsLocked || !isPublished}
        title={unpublishedTitle}
        className="hidden h-9 shrink-0 rounded-pill bg-primary px-4 py-2 text-primary-foreground hover:bg-primary/90 md:inline-flex focus-visible:ring-2 focus-visible:ring-ring"
      >
        {mbaBusy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Download className="h-4 w-4" />
        )}
        <span className="ml-2">
          {wizardPublishMbaLabel({ isBusy: mbaBusy, label: controls.publishedMbaLabel })}
        </span>
      </Button>
      ) : null}
      {controls.showPublishedGroup ? (
      <Button
        type="button"
        onClick={onDownloadMediaPlan}
        disabled={mediaPlanDisabled}
        title={gateDownloadsOnPublish ? unpublishedTitle : undefined}
        className="hidden h-9 shrink-0 rounded-pill bg-accent px-4 py-2 text-foreground hover:bg-accent/90 md:inline-flex focus-visible:ring-2 focus-visible:ring-ring"
      >
        {isDownloading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Download className="h-4 w-4" />
        )}
        <span className="ml-2">
          {isDownloading ? "Downloading..." : controls.publishedMediaPlanLabel}
        </span>
      </Button>
      ) : null}
      {controls.showPublishedGroup ? (
      <Button
        type="button"
        onClick={onDownloadAa}
        disabled={aaDisabled}
        title={gateDownloadsOnPublish ? unpublishedTitle : undefined}
        className={cn(
          "hidden h-9 shrink-0 rounded-pill bg-brand-dark px-4 py-2 text-primary-foreground hover:bg-brand-dark/90 md:inline-flex focus-visible:ring-2 focus-visible:ring-ring",
          (!hasAdvertisingAssociatesBilling || downloadBlocked) && "opacity-50 grayscale",
        )}
      >
        {isDownloadingAa ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Download className="h-4 w-4" />
        )}
        <span className="ml-2">
          {isDownloadingAa ? "Creating AA Plan..." : controls.publishedAaLabel}
        </span>
      </Button>
      ) : null}
      <div className="hidden items-center gap-2 md:flex">
        <Button
          type="button"
          onClick={onDownloadNaming}
          disabled={downloadsBusy}
          className="h-9 shrink-0 rounded-pill border-border px-4 py-2 focus-visible:ring-2 focus-visible:ring-ring"
        >
          {isNamingDownloading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          <span className="ml-2">
            {isNamingDownloading ? "Generating Names..." : "Generate Naming (Ava)"}
          </span>
        </Button>
      </div>
    </>
  )
}
