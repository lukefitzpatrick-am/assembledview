/**
 * SF-1 — stay-on-page publish: navigation/download only on full success.
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import {
  CREATE_SAVE_DRAFT_DISABLED_REASON,
  catchPlanDraftAction,
  describePublishSuccessToast,
  resolveSaveSuccessSideEffects,
  runSaveSuccessSideEffects,
  showPlanDraftSaveButton,
  wizardDownloadControls,
  wizardPrimarySaveLabel,
  wizardPublishMbaLabel,
  DRAFT_DOWNLOAD_HINT,
  DRAFT_MBA_TOAST,
} from "../planWizardSaveBar"

const CREATE_PAGE = join(process.cwd(), "app/mediaplans/create/page.tsx")
const EDIT_PAGE = join(
  process.cwd(),
  "app/mediaplans/mba/[mba_number]/edit/page.tsx"
)
const BOTTOM_BAR = join(
  process.cwd(),
  "components/mediaplans/PlanWizardBottomBar.tsx"
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

describe("wizardPublishMbaLabel", () => {
  it("idle is MBA; busy is Generating MBA…", () => {
    assert.equal(wizardPublishMbaLabel({ isBusy: false }), "MBA")
    assert.equal(wizardPublishMbaLabel({ isBusy: true }), "Generating MBA…")
    assert.equal(
      wizardPublishMbaLabel({ isBusy: false, label: "Published MBA (v33)" }),
      "Published MBA (v33)"
    )
  })
})

describe("wizardDownloadControls", () => {
  it("create: draft-only labels, AA hidden", () => {
    const c = wizardDownloadControls({
      isCreate: true,
      isPublished: false,
      hasWorkingDraftOrDirty: true,
      publishedVersionNumber: null,
    })
    assert.equal(c.showDraftGroup, true)
    assert.equal(c.showPublishedGroup, false)
    assert.equal(c.showDraftAa, false)
    assert.equal(c.draftMbaLabel, "Download draft MBA")
    assert.equal(c.draftMediaPlanLabel, "Download draft Media Plan")
    assert.equal(c.draftHint, DRAFT_DOWNLOAD_HINT)
  })

  it("edit published + dirty: two groups labelled with pointer vN", () => {
    const c = wizardDownloadControls({
      isCreate: false,
      isPublished: true,
      hasWorkingDraftOrDirty: true,
      publishedVersionNumber: 33,
    })
    assert.equal(c.showDraftGroup, true)
    assert.equal(c.showPublishedGroup, true)
    assert.equal(c.showDraftAa, true)
    assert.equal(c.draftMbaLabel, "Draft MBA")
    assert.equal(c.publishedMbaLabel, "Published MBA (v33)")
    assert.equal(c.publishedMediaPlanLabel, "Published Media Plan (v33)")
  })

  it("edit published and clean: published labels, no stamp group", () => {
    const c = wizardDownloadControls({
      isCreate: false,
      isPublished: true,
      hasWorkingDraftOrDirty: false,
      publishedVersionNumber: 33,
    })
    assert.equal(c.showDraftGroup, false)
    assert.equal(c.showPublishedGroup, true)
    assert.equal(c.publishedMbaLabel, "MBA")
    assert.equal(c.publishedMediaPlanLabel, "Media Plan")
    assert.equal(c.draftHint, undefined)
  })
})

describe("DRAFT_MBA_TOAST", () => {
  it("is not a success-as-shipped title", () => {
    assert.match(DRAFT_MBA_TOAST, /not for the client/i)
    assert.doesNotMatch(DRAFT_MBA_TOAST, /successfully/i)
  })
})

describe("edit page wiring (SF-1)", () => {
  it("handleSaveAll no longer navigates on every success; download/exit are opt-in", () => {
    const editSrc = readFileSync(EDIT_PAGE, "utf8")
    assert.match(
      editSrc,
      /handleSaveAll = async \(opts\?: \{[\s\S]*?intent\?: "save" \| "publish"[\s\S]*?exitAfter\?: boolean[\s\S]*?download\?: boolean[\s\S]*?zipAfter\?: boolean/
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

  it("bar: flag-on primary is Publish split; Save draft and MBA download stay distinct", () => {
    const bar = sliceBottomBar(readFileSync(EDIT_PAGE, "utf8"))
    assert.match(bar, /PlanWizardBottomBar/)
    assert.match(bar, /intent: "publish", download: true/)
    assert.match(bar, /onPublishAndExit/)
    assert.match(bar, /onSaveDraftAndExit/)
    assert.match(bar, /handleGenerateMBA/)
    assert.match(bar, /showExplicitPublishButton\(isPublished\)/)
    assert.match(bar, /SAVE_PUBLISHES_IMMEDIATELY/)
    assert.match(bar, /showPlanDraftSaveButton\(/)
    assert.match(
      bar,
      /saveDraftDisabled=\{isSaving \|\| isLoading \|\| saveBlockedByFailedChannelLoad \|\| !hasUnsavedChanges\}/
    )
    assert.doesNotMatch(bar, /planDraft\.enabled && !isPublished/)
  })

  it("BZ-3: Save disabled on failed channel load; bar names Retry; watchdog stays on hydration hold", () => {
    const editSrc = readFileSync(EDIT_PAGE, "utf8")
    const bar = sliceBottomBar(editSrc)
    assert.match(editSrc, /saveBlockedByFailedChannelLoad/)
    assert.match(editSrc, /channelLoadSucceededFromMediaStatus/)
    assert.match(bar, /failedLoadRetry/)
    assert.match(bar, /retryMediaTypeLoad/)
    assert.match(
      editSrc,
      /shouldWatch = loadPhase === "loadingLineItems" \|\| saveHeldForHydration/
    )
    const watchStart = editSrc.indexOf(
      "const shouldWatch = loadPhase === \"loadingLineItems\" || saveHeldForHydration"
    )
    const watchEnd = editSrc.indexOf("}, [loadPhase, saveHeldForHydration, updateLoadStatus]")
    const watchBody = editSrc.slice(watchStart, watchEnd)
    assert.doesNotMatch(watchBody, /saveBlockedByFailedChannelLoad/)
    assert.match(
      editSrc,
      /saveBarDisabled =\s*[\s\S]*?saveBlockedByFailedChannelLoad/
    )
  })
})

describe("SM-30: create bar is the edit bar", () => {
  it("shared component order is Publish, Save draft, then MBA first in the download group", () => {
    const barSrc = readFileSync(BOTTOM_BAR, "utf8")
    const publish = barSrc.indexOf("label={primaryLabel}")
    const saveDraft = barSrc.indexOf('label="Save draft"')
    const mba = barSrc.indexOf("onClick={onPublishMba}")
    const mediaPlan = barSrc.indexOf("onClick={onDownloadMediaPlan}")
    assert.ok(publish >= 0, "missing primary SplitActionButton")
    assert.ok(saveDraft > publish, "Save draft must follow Publish")
    assert.ok(mba > saveDraft, "MBA download must follow Save draft")
    assert.ok(mediaPlan > mba, "MBA must precede Media Plan in the download group")
    assert.match(barSrc, /<SplitActionButton[\s\S]*label=\{primaryLabel\}/)
    assert.match(barSrc, /<SplitActionButton[\s\S]*label="Save draft"/)
    assert.match(barSrc, /bg-primary/)
    assert.doesNotMatch(barSrc, /Publish MBA/)
  })

  it("both pages mount PlanWizardBottomBar with the same control order and split handlers", () => {
    const createSrc = readFileSync(CREATE_PAGE, "utf8")
    const editSrc = readFileSync(EDIT_PAGE, "utf8")
    for (const src of [createSrc, editSrc]) {
      const bar = sliceBottomBar(src)
      assert.match(bar, /<PlanWizardBottomBar/)
      assert.match(bar, /intent: "publish", download: true/)
      assert.match(bar, /onPublishAndExit/)
      assert.match(bar, /onSaveDraftAndExit/)
      assert.match(bar, /showExplicitPublishButton\(/)
      assert.match(bar, /showPlanDraftSaveButton\(/)
      assert.match(bar, /onPublishMba=\{handleGenerateMBA\}/)
      assert.match(bar, /onDraftMba=/)
      const publish = bar.indexOf("download: true")
      const saveDraft = bar.indexOf("onSaveDraft=")
      const mba = bar.indexOf("onPublishMba=")
      assert.ok(publish >= 0 && saveDraft > publish && mba > saveDraft)
    }
  })

  it("BZ-3: create with toggled channels and no fetch keeps Save enabled", () => {
    const createSrc = readFileSync(CREATE_PAGE, "utf8")
    assert.match(createSrc, /channelLoadSucceededWithoutFetch/)
    const primarySave = createSrc.match(
      /saveBarDisabled =\s*([\s\S]*?)const saveBarTitle/
    )
    assert.ok(primarySave, "create primary Save disabled expression must exist")
    assert.doesNotMatch(primarySave![1]!, /saveBlockedByFailedChannelLoad/)
    assert.doesNotMatch(primarySave![1]!, /mediaLoadStatus/)
    assert.match(
      createSrc,
      /buildSavePlanLineItemsFromSnapshots\(\s*snapshots,\s*billingSaveInputs\.lineItems,\s*createChannelLoadSucceeded/
    )
  })

  it("create first save lands on edit; Publish and exit returns to Campaigns", () => {
    const createSrc = readFileSync(CREATE_PAGE, "utf8")
    assert.match(
      createSrc,
      /handleSaveAll = async \(opts\?: \{[\s\S]*?intent\?: "save" \| "publish"[\s\S]*?exitAfter\?: boolean[\s\S]*?download\?: boolean[\s\S]*?zipAfter\?: boolean/
    )
    assert.match(createSrc, /runSaveSuccessSideEffects/)
    assert.match(createSrc, /saveDraftThenExit/)
    const handleStart = createSrc.indexOf("const handleSaveAll = async")
    const handleEnd = createSrc.indexOf("const handleExit =", handleStart)
    const handleBody = createSrc.slice(handleStart, handleEnd)
    assert.match(
      handleBody,
      /\/mediaplans\/mba\/\$\{encodeURIComponent\(mba\)\}\/edit/
    )
    assert.match(handleBody, /navigate: \(\) => router\.push\("\/mediaplans"\)/)
    assert.doesNotMatch(
      handleBody,
      /clearDirtyOnSaveSuccess\(\)\s*\n\s*form\.reset\(form\.getValues\(\)\)\s*\n\s*router\.push\(['"]\/mediaplans['"]\)/
    )
  })

  it("SD-1: create Save draft is disabled with a reason", () => {
    const createSrc = readFileSync(CREATE_PAGE, "utf8")
    const bar = sliceBottomBar(createSrc)
    assert.match(bar, /saveDraftTitle=\{CREATE_SAVE_DRAFT_DISABLED_REASON\}/)
    assert.match(bar, /saveDraftDisabled=\{true\}/)
    assert.match(bar, /catchPlanDraftAction/)
    assert.equal(
      CREATE_SAVE_DRAFT_DISABLED_REASON,
      "Drafts save to this browser until the plan is published"
    )
    assert.doesNotMatch(bar, /void planDraft\.saveDraftNow/)
  })

  it("SD-1: edit saveDraftNow is caught and toasted", () => {
    const bar = sliceBottomBar(readFileSync(EDIT_PAGE, "utf8"))
    assert.match(bar, /await planDraft\.saveDraftNow\(\)/)
    assert.match(bar, /Draft saved ·/)
    assert.match(bar, /SESSION_EXPIRED_SAVE_MESSAGE/)
    assert.doesNotMatch(
      bar,
      /catchPlanDraftAction\(\s*planDraft\.saveDraftNow\(\)/
    )
  })
})

describe("DD-3 draft downloads", () => {
  it("create zip runs after publish, never before", () => {
    const createSrc = readFileSync(CREATE_PAGE, "utf8")
    const zipAll = createSrc.indexOf("const handleSaveAndDownloadAll")
    const zipBody = createSrc.slice(
      zipAll,
      createSrc.indexOf("const handleDownloadNamingConventions", zipAll)
    )
    assert.match(zipBody, /handleSaveAll\(\{ intent: "publish", zipAfter: true \}\)/)
    assert.doesNotMatch(zipBody, /generateMbaPdfBlob\(\)/)
    const handleStart = createSrc.indexOf("const handleSaveAll = async")
    const handleEnd = createSrc.indexOf("const handleExit =", handleStart)
    const handleBody = createSrc.slice(handleStart, handleEnd)
    assert.match(handleBody, /zipAfter/)
    assert.match(handleBody, /zipPublishedCreateDocuments/)
    const zipCall = handleBody.indexOf("zipPublishedCreateDocuments")
    const landOnEdit = handleBody.indexOf("encodeURIComponent(mba)")
    assert.ok(zipCall >= 0 && landOnEdit > zipCall)
  })

  it("create draft MBA posts the save body, not /api/mba/generate with campaign_status", () => {
    const createSrc = readFileSync(CREATE_PAGE, "utf8")
    const draftStart = createSrc.indexOf("const handleDraftMba")
    const draftEnd = createSrc.indexOf("const handleGenerateMBA", draftStart)
    const draftBody = createSrc.slice(draftStart, draftEnd)
    assert.match(draftBody, /postDraftDocuments/)
    assert.match(draftBody, /buildCreateDraftDocumentsBody\("mba_pdf"\)/)
    assert.doesNotMatch(draftBody, /\/api\/mba\/generate/)
    assert.match(createSrc, /DRAFT_MBA_TOAST/)
    const genStart = createSrc.indexOf("const generateMbaPdfBlob")
    const genEnd = createSrc.indexOf("const generateMediaPlanXlsxBlob", genStart)
    assert.doesNotMatch(
      createSrc.slice(genStart, genEnd),
      /campaign_status/
    )
  })

  it("edit handleGenerateMBA / handleDownloadMediaPlan no longer toast-and-return on unpublished", () => {
    const editSrc = readFileSync(EDIT_PAGE, "utf8")
    const mbaStart = editSrc.indexOf("const handleGenerateMBA = async")
    const mbaEnd = editSrc.indexOf("const handleDownloadMediaPlan", mbaStart)
    assert.doesNotMatch(editSrc.slice(mbaStart, mbaEnd), /if \(!isPublished\)/)
    const planStart = editSrc.indexOf("const handleDownloadMediaPlan = async")
    const planEnd = editSrc.indexOf(
      "const handleDownloadAdvertisingAssociatesMediaPlan",
      planStart
    )
    assert.doesNotMatch(
      editSrc.slice(planStart, planEnd),
      /if \(!opts\?\.fromPublish && !isPublished\)/
    )
  })

  it("edit unpublished zip publishes first", () => {
    const editSrc = readFileSync(EDIT_PAGE, "utf8")
    const zipAll = editSrc.indexOf("const handleSaveAndDownloadAll")
    const zipBody = editSrc.slice(
      zipAll,
      editSrc.indexOf("const handleSearchTotalChange", zipAll)
    )
    assert.match(zipBody, /handleSaveAll\(\{ intent: "publish", zipAfter: true \}\)/)
    assert.doesNotMatch(zipBody, /draftBlocksDownloadMessage/)
  })
})

describe("catchPlanDraftAction", () => {
  it("toasts the rejected error message", async () => {
    const calls: Array<{
      variant: string
      title: string
      description: string
    }> = []
    const err = new Error("Missing master id — cannot save working draft")
    const orig = console.error
    console.error = () => undefined
    try {
      catchPlanDraftAction(
        Promise.reject(err),
        (opts) => {
          calls.push(opts)
        },
        "Draft save failed"
      )
      await new Promise((r) => setTimeout(r, 0))
    } finally {
      console.error = orig
    }
    assert.equal(calls.length, 1)
    assert.equal(calls[0]?.title, "Draft save failed")
    assert.equal(
      calls[0]?.description,
      "Missing master id — cannot save working draft"
    )
  })
})
