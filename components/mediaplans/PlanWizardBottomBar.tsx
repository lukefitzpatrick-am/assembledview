"use client"

import { Download, Loader2 } from "lucide-react"

import { heroBandSecondaryClassName } from "@/components/brand/HeroBand"
import { SplitActionButton } from "@/components/mediaplans/SplitActionButton"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { END_BEFORE_START_MESSAGE } from "@/lib/mediaplan/dateOrder"
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
  /**
   * Same flag that disables Publish (`datesOutOfOrder` on create and edit).
   * Draft MBA / Media Plan / AA only. Published downloads and Export draft stay available.
   */
  draftDownloadsBlocked?: boolean
  /** Create only. Downloads the current form as a draft JSON file. */
  onExportDraft?: () => void
  /**
   * Draft-summary figures already formatted by the page.
   * Unallocated is lime at zero and amber when the remaining figure is negative.
   */
  totals?: {
    budget: string
    allocated: string
    unallocated: string
    unallocatedTone?: "lime" | "amber" | "default"
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
  draftDownloadsBlocked = false,
  onExportDraft,
  totals = null,
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
  const draftDownloadTitle = draftDownloadsBlocked ? END_BEFORE_START_MESSAGE : draftHint
  const inkOutline = cn(
    heroBandSecondaryClassName,
    "border-am-forest-light bg-transparent shadow-none",
  )
  const unallocatedClass =
    totals?.unallocatedTone === "lime"
      ? "text-am-lime"
      : totals?.unallocatedTone === "amber"
        ? "text-pacing-behind"
        : "text-am-white"

  type FileItem = {
    key: string
    label: string
    onClick: () => void
    disabled?: boolean
    title?: string
    busy?: boolean
  }
  const fileItems: FileItem[] = []
  if (controls.showDraftGroup) {
    fileItems.push({
      key: "draft-mba",
      label: wizardPublishMbaLabel({ isBusy: mbaBusy, label: controls.draftMbaLabel }),
      onClick: draftMba,
      disabled: mbaBusy || downloadsLocked || draftDownloadsBlocked,
      title: draftDownloadTitle,
      busy: mbaBusy,
    })
    fileItems.push({
      key: "draft-media-plan",
      label: controls.draftMediaPlanLabel,
      onClick: draftMediaPlan,
      disabled: downloadsBusy || draftDownloadsBlocked,
      title: draftDownloadTitle,
      busy: isDownloading,
    })
    if (!draftAaHidden) {
      fileItems.push({
        key: "draft-aa",
        label: controls.draftAaLabel,
        onClick: draftAa,
        disabled: aaDisabled || draftDownloadsBlocked,
        title: draftDownloadTitle,
        busy: isDownloadingAa,
      })
    }
  }
  if (controls.showPublishedGroup) {
    fileItems.push({
      key: "published-mba",
      label: wizardPublishMbaLabel({ isBusy: mbaBusy, label: controls.publishedMbaLabel }),
      onClick: onPublishMba,
      disabled: mbaBusy || downloadsLocked || !isPublished,
      title: unpublishedTitle,
      busy: mbaBusy,
    })
    fileItems.push({
      key: "published-media-plan",
      label: isDownloading ? "Downloading..." : controls.publishedMediaPlanLabel,
      onClick: onDownloadMediaPlan,
      disabled: mediaPlanDisabled,
      title: gateDownloadsOnPublish ? unpublishedTitle : undefined,
      busy: isDownloading,
    })
    fileItems.push({
      key: "published-aa",
      label: isDownloadingAa ? "Creating AA Plan..." : controls.publishedAaLabel,
      onClick: onDownloadAa,
      disabled: aaDisabled,
      title: gateDownloadsOnPublish ? unpublishedTitle : undefined,
      busy: isDownloadingAa,
    })
  }
  fileItems.push({
    key: "naming",
    label: isNamingDownloading ? "Generating Names..." : "Generate Naming (Ava)",
    onClick: onDownloadNaming,
    disabled: downloadsBusy,
    busy: isNamingDownloading,
  })
  if (onExportDraft) {
    fileItems.push({
      key: "export-draft",
      label: "Export draft",
      onClick: onExportDraft,
    })
  }

  const primaryMenu = savePublishesImmediately
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

  return (
    <div className="flex w-full min-w-0 items-center gap-3 overflow-x-hidden">
      {totals ? (
        <div className="flex shrink-0 items-end gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-am-muted-on-black">
              Budget
            </p>
            <p className="num text-sm font-semibold text-am-white">{totals.budget}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-am-muted-on-black">
              Allocated
            </p>
            <p className="num text-sm font-semibold text-am-white">{totals.allocated}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-am-muted-on-black">
              Unallocated
            </p>
            <p className={cn("num text-sm font-semibold", unallocatedClass)}>{totals.unallocated}</p>
          </div>
        </div>
      ) : null}
      <p className="min-w-0 flex-1 truncate text-center text-[11px] leading-snug text-am-muted-on-black">
        {autosaveStatus}
      </p>
      <div className="flex shrink-0 items-center gap-2">
      {failedLoadRetry ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={failedLoadRetry.onRetry}
          disabled={failedLoadRetry.retrying}
          title={failedLoadRetry.reason}
          className={cn("h-9 rounded-pill", inkOutline)}
        >
          {failedLoadRetry.retrying ? "Retrying…" : failedLoadRetry.retryLabel}
        </Button>
      ) : null}
      {showSaveDraft ? (
          <SplitActionButton
            variant="outline"
            label="Save draft"
            onPrimary={onSaveDraft}
            disabled={saveDraftDisabled}
            title={saveDraftTitle}
            className="border-am-forest-light shadow-none"
            buttonClassName={inkOutline}
            menu={[
              {
                label: "Save draft and exit",
                hint: "Keeps your working draft, then returns to Campaigns",
                onSelect: onSaveDraftAndExit,
                disabled: saveDraftDisabled,
              },
            ]}
          />
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className={cn("h-9 rounded-pill px-4", inkOutline)}
          >
            Files
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="max-h-[70vh] overflow-y-auto">
          {fileItems.map((item) => (
            <DropdownMenuItem key={item.key} asChild disabled={item.disabled}>
              <button
                type="button"
                onClick={item.onClick}
                disabled={item.disabled}
                title={item.title}
                className="flex w-full items-center"
              >
                {item.busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                <span className="ml-2">{item.label}</span>
              </button>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {showExplicitPublish ? (
        <SplitActionButton
          label="Publish"
          busyLabel="Publishing…"
          isBusy={isSaving}
          disabled={saveBarDisabled}
          onPrimary={onExplicitPublish}
          className="shadow-none"
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
      <SplitActionButton
        label={primaryLabel}
        busyLabel={savePublishesImmediately ? "Publishing…" : "Saving…"}
        isBusy={isSaving}
        disabled={saveBarDisabled}
        title={saveBarTitle}
        onPrimary={onPrimary}
        className="shadow-none"
        menu={primaryMenu}
      />
      </div>
    </div>
  )
}
