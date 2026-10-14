/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"

import { DeckBuildStatus, DeckPollView, ReviewReportStart } from "../DeckBuildStatus"
import {
  DECK_BUILDING_COPY,
  DECK_POLL_DEADLINE_MS,
  DECK_REOPEN_MAX_AGE_MS,
  shouldPollDeck,
} from "@/lib/reports/deckJobs/deckBuildPanel"

const noop = () => {}

describe("DeckBuildStatus", () => {
  it("renders the building state with a spinner and the time elapsed", () => {
    const html = renderToStaticMarkup(
      <DeckBuildStatus
        phase="building"
        elapsedLabel="1 min 5 sec"
        fileName={null}
        downloadUrl={null}
        note={null}
        error={null}
        showBuildNew={false}
        onTryAgain={noop}
        onBuildNew={noop}
      />,
    )
    expect(html).toContain(DECK_BUILDING_COPY.replaceAll("'", "&#x27;"))
    expect(html).toContain("animate-spin")
    expect(html).toContain("1 min 5 sec")
    expect(html).toContain("Elapsed")
  })

  it("renders a ready deck with its file name", () => {
    const html = renderToStaticMarkup(
      <DeckBuildStatus
        phase="ready"
        elapsedLabel=""
        fileName="Curatif-report.pptx"
        downloadUrl="/api/reports/download?path=exports%2Freports%2Fa.pptx"
        note={null}
        error={null}
        showBuildNew={false}
        onTryAgain={noop}
        onBuildNew={noop}
      />,
    )
    expect(html).toContain("Download deck")
    expect(html).toContain("Curatif-report.pptx")
    expect(html).toContain("/api/reports/download?path=exports%2Freports%2Fa.pptx")
    expect(html).not.toContain("Basic layout")
  })

  it("renders Basic layout and the reason when a note is set", () => {
    const html = renderToStaticMarkup(
      <DeckBuildStatus
        phase="ready"
        elapsedLabel=""
        fileName="Curatif-report.pptx"
        downloadUrl="/api/reports/download?path=a"
        note="Basic layout: Cost cap of $0.60"
        error={null}
        showBuildNew={false}
        onTryAgain={noop}
        onBuildNew={noop}
      />,
    )
    expect(html).toContain("Basic layout")
    expect(html).toContain("Cost cap of $0.60")
    expect(html).toContain("Download deck")
  })

  it("renders a failed deck in plain words with Try again", () => {
    const html = renderToStaticMarkup(
      <DeckBuildStatus
        phase="failed"
        elapsedLabel=""
        fileName={null}
        downloadUrl={null}
        note={null}
        error="Timed out"
        showBuildNew={false}
        onTryAgain={noop}
        onBuildNew={noop}
      />,
    )
    expect(html).toContain("Timed out")
    expect(html).toContain("Try again")
    expect(html).not.toContain("Download deck")
  })

  it("stops polling when the deck is generated", () => {
    expect(shouldPollDeck({ status: "generated", watchedMs: 1_000 })).toBe(false)
    const html = renderToStaticMarkup(
      <DeckPollView status="generated" watchedMs={1_000} elapsedLabel="1 sec" error={null} />,
    )
    expect(html).toContain('data-phase="ready"')
    expect(html).not.toContain(DECK_BUILDING_COPY)
  })

  it("stops polling when the deck has failed", () => {
    expect(shouldPollDeck({ status: "failed", watchedMs: 1_000 })).toBe(false)
    const html = renderToStaticMarkup(
      <DeckPollView status="failed" watchedMs={1_000} elapsedLabel="1 sec" error="Timed out" />,
    )
    expect(html).toContain('data-phase="failed"')
    expect(html).toContain("Timed out")
    expect(html).toContain("Try again")
  })

  it("stops polling after 6 minutes and says the deck is still building", () => {
    expect(
      shouldPollDeck({ status: "generating", watchedMs: DECK_POLL_DEADLINE_MS }),
    ).toBe(false)
    expect(
      shouldPollDeck({ status: "generating", watchedMs: DECK_POLL_DEADLINE_MS - 1 }),
    ).toBe(true)
    const html = renderToStaticMarkup(
      <DeckPollView
        status="queued"
        watchedMs={DECK_POLL_DEADLINE_MS}
        elapsedLabel="6 min"
        error={null}
      />,
    )
    expect(html).toContain('data-phase="still"')
    expect(html).toContain("Still building.")
    expect(html).toContain("Reports")
    expect(html).toContain('href="/admin/reports"')
    expect(html).not.toContain(DECK_BUILDING_COPY)
  })

  it("keeps a finished deck ahead of the 6 minute stop", () => {
    expect(shouldPollDeck({ status: "generated", watchedMs: DECK_POLL_DEADLINE_MS })).toBe(false)
    const html = renderToStaticMarkup(
      <DeckPollView
        status="generated"
        watchedMs={DECK_POLL_DEADLINE_MS}
        elapsedLabel="6 min"
        error={null}
      />,
    )
    expect(html).toContain('data-phase="ready"')
    expect(html).not.toContain("Still building.")
  })

  it("reopens a run under 24 hours and offers a new deck", () => {
    const now = Date.parse("2026-10-14T09:00:00.000Z")
    const recent = new Date(now - (DECK_REOPEN_MAX_AGE_MS - 1)).toISOString()
    const html = renderToStaticMarkup(
      <ReviewReportStart
        createdAt={recent}
        nowMs={now}
        fileName="Curatif-report.pptx"
        downloadUrl="/api/reports/download?path=a"
        note={null}
      />,
    )
    expect(html).toContain("Curatif-report.pptx")
    expect(html).toContain("Download deck")
    expect(html).toContain("Build a new deck")
    expect(html).not.toContain("Download report")
  })

  it("starts a new deck when the last run is 24 hours old", () => {
    const now = Date.parse("2026-10-14T09:00:00.000Z")
    const stale = new Date(now - DECK_REOPEN_MAX_AGE_MS).toISOString()
    const html = renderToStaticMarkup(
      <ReviewReportStart
        createdAt={stale}
        nowMs={now}
        fileName="Curatif-report.pptx"
        downloadUrl="/api/reports/download?path=a"
        note={null}
      />,
    )
    expect(html).toContain("Download report")
    expect(html).not.toContain("Build a new deck")
  })
})
