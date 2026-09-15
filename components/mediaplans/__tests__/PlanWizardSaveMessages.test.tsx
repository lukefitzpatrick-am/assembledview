/**
 * UI-1 — Save-status panel empty/order contract + compact draft actions.
 *
 * @vitest-environment jsdom
 */
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"

import {
  PlanDraftActiveBanner,
  PlanDraftDiscardConfirmDialog,
  PlanDraftFieldDiffDialog,
  PlanDraftLocalOnlyBanner,
  PlanDraftStaleBanner,
} from "@/components/mediaplan/PlanDraftChrome"
import { EMPTY_DRAFT_DIFF_SUMMARY } from "@/lib/mediaplan/drafts/fieldDiff"
import { PlanWizardSaveMessages } from "@/components/mediaplans/PlanWizardSaveMessages"

describe("PlanWizardSaveMessages", () => {
  it("renders nothing when every slot is empty", () => {
    expect(renderToStaticMarkup(<PlanWizardSaveMessages />)).toBe("")
    expect(
      renderToStaticMarkup(
        <PlanWizardSaveMessages
          draftBanner={null}
          issues={[]}
          extraProblemTexts={[]}
          savePrimary={null}
          saveSecondary={null}
          saveTip={null}
          isSaving={false}
        />
      )
    ).toBe("")
  })

  it("renders problems before draft before save state", () => {
    const html = renderToStaticMarkup(
      <PlanWizardSaveMessages
        extraProblemTexts={["ALERTS"]}
        draftBanner={<span>DRAFT-BANNER</span>}
        savePrimary="SAVE-MODE"
      />
    )
    expect(html).toContain("Save status")
    const alertsAt = html.indexOf("ALERTS")
    const bannerAt = html.indexOf("DRAFT-BANNER")
    const modeAt = html.indexOf("SAVE-MODE")
    expect(alertsAt).toBeGreaterThan(-1)
    expect(bannerAt).toBeGreaterThan(alertsAt)
    expect(modeAt).toBeGreaterThan(bannerAt)
  })

  it("renders a save-state-only card", () => {
    const html = renderToStaticMarkup(
      <PlanWizardSaveMessages savePrimary="Publish will create v1" />
    )
    expect(html).toContain("Publish will create v1")
    expect(html).toContain("Save status")
    expect(html).toContain("When you publish")
    expect(html.includes("Unsaved draft")).toBe(false)
    expect(html.includes("DRAFT-BANNER") || html.includes("ALERTS")).toBe(false)
  })

  it("renders Saving… when isSaving", () => {
    const idleEmpty = renderToStaticMarkup(<PlanWizardSaveMessages />)
    const savingOnly = renderToStaticMarkup(<PlanWizardSaveMessages isSaving />)
    expect(idleEmpty).toBe("")
    expect(savingOnly).toContain("Save status")
    expect(savingOnly).toContain("Saving…")
    expect(savingOnly).toContain("When you publish")

    const replacingPill = renderToStaticMarkup(
      <PlanWizardSaveMessages
        isSaving
        savePrimary="Publish will create v1"
        saveSecondary="Draft - not published"
        saveTip="v4"
      />
    )
    expect(replacingPill).toContain("Saving…")
    expect(replacingPill.includes("Publish will create v1")).toBe(false)
    expect(replacingPill).toContain("Draft - not published")
    expect(replacingPill).toContain("Clients, documents and pacing use v4")
  })

  it("renders extraProblemTexts after issues", () => {
    const html = renderToStaticMarkup(
      <PlanWizardSaveMessages
        issues={[
          {
            id: "missing-client",
            severity: "warning",
            title: "ISSUE-TITLE",
          },
        ]}
        extraProblemTexts={["EXTRA-TEXT"]}
      />
    )
    const issueAt = html.indexOf("ISSUE-TITLE")
    const extraAt = html.indexOf("EXTRA-TEXT")
    expect(issueAt).toBeGreaterThan(-1)
    expect(extraAt).toBeGreaterThan(issueAt)
  })
})

describe("PlanDraftActiveBanner compact", () => {
  it("compact active banner with no headline names the local draft and published version", () => {
    const html = renderToStaticMarkup(
      <PlanDraftActiveBanner
        compact
        updatedAt="2026-09-01T00:00:00.000Z"
        summary={EMPTY_DRAFT_DIFF_SUMMARY}
        tipVersionNumber={4}
        onDiscard={() => undefined}
      />,
    )
    expect(html).toContain("You&#x27;re editing your unsaved draft from")
    expect(html).toContain("Clients still see v4.")
    expect(html).toContain("0 changes")
  })

  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
  })

  it("keeps View changes and Discard draft and calls onDiscard", () => {
    const onDiscard = vi.fn()
    act(() => {
      root.render(
        <PlanDraftActiveBanner
          compact
          updatedAt="2026-09-01T00:00:00.000Z"
          headline="Restored your unsaved campaign: Acme — Spring, 2 lines, $1000"
          summary={EMPTY_DRAFT_DIFF_SUMMARY}
          onDiscard={onDiscard}
        />
      )
    })
    const buttons = Array.from(container.querySelectorAll("button")).map(
      (el) => el.textContent?.trim()
    )
    expect(buttons).toContain("View changes")
    expect(buttons).toContain("Discard draft")
    const discard = Array.from(container.querySelectorAll("button")).find(
      (el) => el.textContent?.trim() === "Discard draft"
    )
    expect(discard).toBeTruthy()
    act(() => {
      discard!.click()
    })
    expect(onDiscard).toHaveBeenCalledTimes(1)
  })

  it("View changes with a computable compare opens a read-only diff and does not mutate form state", () => {
    const onDiscard = vi.fn()
    const onViewChanges = vi.fn()
    const form = { campaign: "Spring", budget: 1000 }
    const before = JSON.stringify(form)
    const summary = {
      fieldChanges: [
        {
          lineItemId: "glenda008-se1",
          fieldPath: "bursts.0.budget",
          oldValue: 25000,
          newValue: 20000,
          wasFormatted: "$25,000.00",
          kind: "money" as const,
          channel: "search",
          lineLabel: "Google",
        },
      ],
      campaignChanges: [
        {
          lineItemId: "",
          fieldPath: "mp_campaignbudget",
          oldValue: 40000,
          newValue: 42500,
          wasFormatted: "$40,000.00",
          kind: "money" as const,
          channel: "",
          lineLabel: "",
        },
      ],
      addedLineIds: [],
      addedLines: [],
      removedLines: [
        { lineItemId: "glenda008-se2", label: "Bing", channel: "search" },
      ],
      changeCount: 3,
    }

    act(() => {
      root.render(
        <>
          <PlanDraftActiveBanner
            compact
            updatedAt="2026-09-01T00:00:00.000Z"
            summary={summary}
            onDiscard={onDiscard}
            onViewChanges={onViewChanges}
          />
          <PlanDraftFieldDiffDialog summary={summary} onClose={() => undefined} />
        </>
      )
    })

    const view = Array.from(container.querySelectorAll("button")).find(
      (el) => el.textContent?.trim() === "View changes"
    )
    expect(view).toBeTruthy()
    expect((view as HTMLButtonElement).disabled).toBe(false)
    act(() => {
      view!.click()
    })
    const breakdown = Array.from(container.querySelectorAll("button")).find(
      (el) => el.textContent?.trim() === "3 changes"
    )
    expect(breakdown).toBeTruthy()
    act(() => {
      breakdown!.click()
    })
    expect(onViewChanges).toHaveBeenCalledTimes(1)
    expect(onDiscard).not.toHaveBeenCalled()
    expect(JSON.stringify(form)).toBe(before)
    const body = document.body.textContent ?? ""
    expect(body).toContain("$25,000.00")
    expect(body).toContain("$20,000.00")
    expect(body).toContain("Removed: Bing")
    expect(body).not.toContain("Removed: glenda008-se2 — Bing")
    expect(body).toContain("Burst 1 Budget")
    expect(body).not.toContain("bursts.0.budget")
    expect(body).toContain("Google")
    expect(body).toContain("Search")
    expect(body).toContain("Search 1")
    expect(body).toContain("Campaign 1")
    expect(body).toContain("1 line removed")
    expect(body).toContain("+$2,500")
    expect(body).toContain("-$5,000")
    const campaignAt = body.indexOf("Campaign")
    const searchHeadingAt = body.indexOf("Search")
    expect(campaignAt).toBeGreaterThanOrEqual(0)
    expect(searchHeadingAt).toBeGreaterThan(campaignAt)
  })

  it("View changes with no tip is disabled with a reason and changes no state", () => {
    const onDiscard = vi.fn()
    const onViewChanges = vi.fn()
    act(() => {
      root.render(
        <PlanDraftActiveBanner
          compact
          updatedAt="2026-09-01T00:00:00.000Z"
          summary={EMPTY_DRAFT_DIFF_SUMMARY}
          onDiscard={onDiscard}
          viewChangesDisabledReason="No published version to compare"
        />
      )
    })
    const view = Array.from(container.querySelectorAll("button")).find(
      (el) => el.textContent?.trim() === "View changes"
    )
    expect(view).toBeTruthy()
    expect((view as HTMLButtonElement).disabled).toBe(true)
    expect(view!.getAttribute("title")).toBe("No published version to compare")
    act(() => {
      view!.click()
    })
    expect(onViewChanges).not.toHaveBeenCalled()
    expect(onDiscard).not.toHaveBeenCalled()
    expect(container.textContent).not.toContain("Your draft vs")
  })
})

describe("PlanDraftStaleBanner", () => {
  const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString()

  it("names the resolved base version", () => {
    const html = renderToStaticMarkup(
      <PlanDraftStaleBanner
        updatedAt={twoMinutesAgo}
        baseVersionNumber={3}
        tipVersionNumber={5}
        onLoadAnyway={() => undefined}
        onDiscard={() => undefined}
        onCompare={() => undefined}
      />,
    )
    expect(html).toContain("Someone published v5 after you started this draft")
    expect(html).toContain("(based on v3)")
    expect(html).toContain("Using your draft and publishing would replace their changes.")
    expect(html).toContain("Compare first")
    expect(html).toContain("Use my draft")
    expect(html).toContain("Discard my draft")
    expect(html.includes("v?")).toBe(false)
  })

  it("omits the based-on clause when the base version cannot be resolved", () => {
    const html = renderToStaticMarkup(
      <PlanDraftStaleBanner
        updatedAt={twoMinutesAgo}
        baseVersionNumber={null}
        tipVersionNumber={5}
        onLoadAnyway={() => undefined}
        onDiscard={() => undefined}
        onCompare={() => undefined}
      />,
    )
    expect(html).toContain("Someone published v5 after you started this draft")
    expect(html.includes("based on")).toBe(false)
    expect(html.includes("v?")).toBe(false)
  })
})

describe("PlanDraftLocalOnlyBanner", () => {
  it("offers Apply and Discard with the unsaved-local copy", () => {
    const html = renderToStaticMarkup(
      <PlanDraftLocalOnlyBanner
        updatedAt="2026-08-14T00:00:00.000Z"
        onApply={() => undefined}
        onDiscard={() => undefined}
      />,
    )
    expect(html).toContain("You have unsaved local changes from")
    expect(html).toContain("Apply")
    expect(html).toContain("Discard")
    expect(html.includes("Load anyway")).toBe(false)
  })
})

describe("PlanDraftStaleBanner button order", () => {
  it("is Compare first, then Use my draft, then Discard my draft", () => {
    const html = renderToStaticMarkup(
      <PlanDraftStaleBanner
        updatedAt={new Date().toISOString()}
        baseVersionNumber={3}
        tipVersionNumber={5}
        onLoadAnyway={() => undefined}
        onDiscard={() => undefined}
        onCompare={() => undefined}
      />,
    )
    const compare = html.indexOf("Compare first")
    const useMine = html.indexOf("Use my draft")
    const discard = html.indexOf("Discard my draft")
    expect(compare).toBeGreaterThan(-1)
    expect(useMine).toBeGreaterThan(compare)
    expect(discard).toBeGreaterThan(useMine)
  })
})

describe("PlanDraftDiscardConfirmDialog", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
  })

  it("opens with Keep draft and does not discard when Keep draft is clicked", () => {
    const onKeep = vi.fn()
    const onDiscard = vi.fn()
    act(() => {
      root.render(
        <PlanDraftDiscardConfirmDialog
          open
          updatedAt="2026-09-01T00:00:00.000Z"
          onKeep={onKeep}
          onDiscard={onDiscard}
        />,
      )
    })
    expect(document.body.textContent).toContain("Discard your draft from")
    expect(document.body.textContent).toContain("This can't be undone.")
    const keep = Array.from(document.body.querySelectorAll("button")).find(
      (el) => el.textContent?.trim() === "Keep draft",
    )
    expect(keep).toBeTruthy()
    act(() => {
      keep!.click()
    })
    expect(onKeep).toHaveBeenCalled()
    expect(onDiscard).not.toHaveBeenCalled()
  })
})
