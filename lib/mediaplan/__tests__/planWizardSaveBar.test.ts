/**
 * SF-1 — stay-on-page publish: navigation/download only on full success.
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import {
  describePublishSuccessToast,
  resolveSaveSuccessSideEffects,
  runSaveSuccessSideEffects,
  showPlanDraftSaveButton,
  wizardPrimarySaveLabel,
} from "../planWizardSaveBar"

const EDIT_PAGE = join(
  process.cwd(),
  "app/mediaplans/mba/[mba_number]/edit/page.tsx"
)

function sliceBottomBar(src: string) {
  const start = src.indexOf("const wizardBottomBar =")
  assert.ok(start >= 0, "missing wizardBottomBar")
  const ret = src.indexOf("\n  return (", start)
  const boot = src.indexOf('if (loadPhase === "bootstrapping")', start)
  const end = [ret, boot].filter((n) => n > start).sort((a, b) => a - b)[0]
  assert.ok(end > start, "could not bound wizardBottomBar")
  return src.slice(start, end)
}

describe("resolveSaveSuccessSideEffects", () => {
  it("defaults to no navigation and no download", () => {
    assert.deepEqual(resolveSaveSuccessSideEffects(), {
      shouldNavigate: false,
      shouldDownload: false,
    })
    assert.deepEqual(resolveSaveSuccessSideEffects({ intent: "publish" }), {
      shouldNavigate: false,
      shouldDownload: false,
    })
  })

  it("publish-and-exit navigates and does not download (D2)", () => {
    assert.deepEqual(
      resolveSaveSuccessSideEffects({ intent: "publish", exitAfter: true }),
      { shouldNavigate: true, shouldDownload: false }
    )
  })

  it("primary publish downloads and stays", () => {
    assert.deepEqual(
      resolveSaveSuccessSideEffects({ intent: "publish", download: true }),
      { shouldNavigate: false, shouldDownload: true }
    )
  })
})

describe("runSaveSuccessSideEffects", () => {
  it("successful publish → no navigation, download called once", async () => {
    let nav = 0
    let downloads = 0
    const result = await runSaveSuccessSideEffects({
      succeeded: true,
      opts: { intent: "publish", download: true },
      navigate: () => {
        nav += 1
      },
      downloadPlan: async () => {
        downloads += 1
        return true
      },
    })
    assert.equal(nav, 0)
    assert.equal(downloads, 1)
    assert.equal(result.downloaded, true)
    assert.equal(result.navigated, false)
  })

  it("save error → no navigation, no download", async () => {
    let nav = 0
    let downloads = 0
    const result = await runSaveSuccessSideEffects({
      succeeded: false,
      opts: { intent: "publish", download: true, exitAfter: true },
      navigate: () => {
        nav += 1
      },
      downloadPlan: async () => {
        downloads += 1
        return true
      },
    })
    assert.equal(nav, 0)
    assert.equal(downloads, 0)
    assert.equal(result.downloaded, null)
    assert.equal(result.navigated, false)
  })

  it("publish-and-exit → navigation called, download NOT called", async () => {
    let nav = 0
    let downloads = 0
    const result = await runSaveSuccessSideEffects({
      succeeded: true,
      opts: { intent: "publish", exitAfter: true },
      navigate: () => {
        nav += 1
      },
      downloadPlan: async () => {
        downloads += 1
        return true
      },
    })
    assert.equal(nav, 1)
    assert.equal(downloads, 0)
    assert.equal(result.downloaded, null)
    assert.equal(result.navigated, true)
  })
})

describe("showPlanDraftSaveButton", () => {
  it("flag on + published tip → Save draft rendered", () => {
    assert.equal(
      showPlanDraftSaveButton({
        enabled: true,
        savePublishesImmediately: true,
        isPublished: true,
      }),
      true
    )
  })

  it("flag off + published → not rendered", () => {
    assert.equal(
      showPlanDraftSaveButton({
        enabled: true,
        savePublishesImmediately: false,
        isPublished: true,
      }),
      false
    )
  })

  it("flag off + unpublished → rendered", () => {
    assert.equal(
      showPlanDraftSaveButton({
        enabled: true,
        savePublishesImmediately: false,
        isPublished: false,
      }),
      true
    )
  })

  it("drafts chrome off → never rendered", () => {
    assert.equal(
      showPlanDraftSaveButton({
        enabled: false,
        savePublishesImmediately: true,
        isPublished: true,
      }),
      false
    )
  })
})

describe("wizardPrimarySaveLabel", () => {
  it("flag OFF → the primary reads Save / Save draft, never Publish", () => {
    assert.equal(
      wizardPrimarySaveLabel({
        savePublishesImmediately: false,
        isPublished: false,
        isSaving: false,
        isPublishAction: false,
      }),
      "Save"
    )
    assert.equal(
      wizardPrimarySaveLabel({
        savePublishesImmediately: false,
        isPublished: true,
        isSaving: false,
        isPublishAction: false,
      }),
      "Save draft"
    )
    const unpublished = wizardPrimarySaveLabel({
      savePublishesImmediately: false,
      isPublished: false,
      isSaving: false,
      isPublishAction: false,
    })
    const published = wizardPrimarySaveLabel({
      savePublishesImmediately: false,
      isPublished: true,
      isSaving: false,
      isPublishAction: false,
    })
    assert.notEqual(unpublished, "Publish")
    assert.notEqual(published, "Publish")
  })

  it("flag ON → the primary reads Publish", () => {
    assert.equal(
      wizardPrimarySaveLabel({
        savePublishesImmediately: true,
        isPublished: false,
        isSaving: false,
        isPublishAction: true,
      }),
      "Publish"
    )
    assert.equal(
      wizardPrimarySaveLabel({
        savePublishesImmediately: true,
        isPublished: true,
        isSaving: true,
        isPublishAction: true,
      }),
      "Publishing…"
    )
  })
})

describe("describePublishSuccessToast", () => {
  it("download succeeded does not read as a failed publish", () => {
    assert.deepEqual(describePublishSuccessToast({ versionNumber: 4, downloadOk: true }), {
      title: "Published",
      description: "v4 published · media plan downloaded",
    })
  })

  it("download FAILED stays default Published, not destructive copy", () => {
    const toast = describePublishSuccessToast({ versionNumber: 4, downloadOk: false })
    assert.equal(toast.title, "Published")
    assert.match(toast.description, /download failed/i)
    assert.match(toast.description, /Downloads/)
    assert.doesNotMatch(toast.description, /failed to publish/i)
  })
})

describe("edit page wiring (SF-1)", () => {
  it("handleSaveAll no longer navigates on every success; download/exit are opt-in", () => {
    const editSrc = readFileSync(EDIT_PAGE, "utf8")
    assert.match(
      editSrc,
      /handleSaveAll = async \(opts\?: \{[\s\S]*?intent\?: "save" \| "publish"[\s\S]*?exitAfter\?: boolean[\s\S]*?download\?: boolean/
    )
    assert.match(editSrc, /runSaveSuccessSideEffects/)
    assert.match(editSrc, /saveDraftThenExit/)
    const handleStart = editSrc.indexOf("const handleSaveAll = async")
    const handleEnd = editSrc.indexOf("const generateMbaPdfBlob", handleStart)
    const handleBody = editSrc.slice(handleStart, handleEnd)
    assert.doesNotMatch(
      handleBody,
      /clearDirtyOnSaveSuccess\(\)\s*\n\s*router\.push\(["']\/mediaplans["']\)/
    )
  })

  it("bar: flag-on primary is Publish split; Save draft and Generate MBA stay distinct", () => {
    const bar = sliceBottomBar(readFileSync(EDIT_PAGE, "utf8"))
    assert.match(bar, /SplitActionButton/)
    assert.match(bar, /intent: "publish", download: true/)
    assert.match(bar, /Publish and exit/)
    assert.match(bar, /Save draft and exit/)
    assert.match(bar, /handleGenerateMBA/)
    assert.match(bar, /showExplicitPublishButton\(isPublished\)/)
    assert.match(bar, /SAVE_PUBLISHES_IMMEDIATELY/)
    assert.match(bar, /showPlanDraftSaveButton\(/)
    assert.match(
      bar,
      /disabled=\{isSaving \|\| isLoading \|\| !hasUnsavedChanges\}/
    )
    assert.doesNotMatch(bar, /planDraft\.enabled && !isPublished/)
  })
})
