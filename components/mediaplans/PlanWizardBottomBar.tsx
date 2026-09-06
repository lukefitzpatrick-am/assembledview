"use client"

import { Download, FileText, Loader2, MoreHorizontal } from "lucide-react"

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
  onPublishMba: () => void
  mbaBusy: boolean
  onDownloadMediaPlan: () => void
  onDownloadAa: () => void
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
  onPublishMba,
  mbaBusy,
  onDownloadMediaPlan,
  onDownloadAa,
  onDownloadNaming,
  onSaveAndDownloadAll,
  isDownloading,
  isDownloadingAa,
  isNamingDownloading,
  downloadsLocked,
  hasAdvertisingAssociatesBilling,
  gateDownloadsOnPublish,
  draftBlocksDownloadMessage = DRAFT_BLOCKS_DOWNLOAD_MESSAGE,
}: PlanWizardBottomBarProps) {
  const unpublishedTitle = !isPublished ? draftBlocksDownloadMessage : undefined
  const downloadBlocked = gateDownloadsOnPublish && !isPublished
  const downloadsBusy =
    isDownloading || isDownloadingAa || isNamingDownloading || downloadsLocked
  const mediaPlanDisabled = downloadBlocked || downloadsBusy
  const aaDisabled =
    downloadBlocked || !hasAdvertisingAssociatesBilling || downloadsBusy
  const zipDisabled = downloadsLocked || isDownloading || isDownloadingAa

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
          ]}
        />
      ) : null}
      {showSaveDraft ? (
        <SplitActionButton
          variant="outline"
          label="Save draft"
          onPrimary={onSaveDraft}
          disabled={saveDraftDisabled}
          menu={[
            {
              label: "Save draft and exit",
              hint: "Keeps your working draft, then returns to Campaigns",
              onSelect: onSaveDraftAndExit,
            },
          ]}
        />
      ) : null}
      <Button
        type="button"
        variant="outline"
        onClick={onPublishMba}
        disabled={mbaBusy || !isPublished}
        title={unpublishedTitle}
        className="h-9 shrink-0 rounded-pill border-border px-4 focus-visible:ring-2 focus-visible:ring-ring"
      >
        {wizardPublishMbaLabel({ isBusy: mbaBusy })}
      </Button>
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
            <DropdownMenuItem
              onClick={onDownloadMediaPlan}
              disabled={mediaPlanDisabled}
              title={gateDownloadsOnPublish ? unpublishedTitle : undefined}
            >
              Media Plan
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
              Media Plan (AA)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onDownloadNaming} disabled={downloadsBusy}>
              Generate Naming (Ava)
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={onSaveAndDownloadAll}
              disabled={zipDisabled}
              title={gateDownloadsOnPublish ? unpublishedTitle : undefined}
            >
              Save &amp; Download All
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
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
        <span className="ml-2">{isDownloading ? "Downloading..." : "Media Plan"}</span>
      </Button>
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
          {isDownloadingAa ? "Creating AA Plan..." : "Media Plan (AA)"}
        </span>
      </Button>
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
      <Button
        type="button"
        variant="action"
        onClick={onSaveAndDownloadAll}
        disabled={zipDisabled}
        title={gateDownloadsOnPublish ? unpublishedTitle : undefined}
        className="hidden h-9 shrink-0 rounded-pill px-4 py-2 md:inline-flex focus-visible:ring-2 focus-visible:ring-ring"
      >
        {downloadsLocked ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <FileText className="h-4 w-4" />
        )}
        <span className="ml-2">
          {downloadsLocked || isDownloading || isDownloadingAa
            ? "Processing..."
            : "Save & Download All"}
        </span>
      </Button>
    </>
  )
}
