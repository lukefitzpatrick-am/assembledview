/**
 * B19 Q4: the admin "Add to Publishers" shortcut on the editors' save panel.
 *
 * @vitest-environment jsdom
 */
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { PlanWizardSaveMessages } from "@/components/mediaplans/PlanWizardSaveMessages"
import { PublisherGuardActions } from "@/components/mediaplans/PublisherGuardActions"
import { evaluatePublisherGuard } from "@/lib/mediaplan/publisherGuard"

vi.mock("@/components/ui/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }))

const PUBLISHERS = [{ id: 11, publisher_name: "Nine", publisherid: "nine" }]

const blocked = evaluatePublisherGuard(
  [
    { lineItemId: "DD1", channel: "digi_display", publisher: "Broadsheet Media" },
    { lineItemId: "DV1", channel: "digi_video", publisher: "broadsheet media" },
    { lineItemId: "P1", channel: "production", publisher: "" },
  ],
  PUBLISHERS,
).blocked

describe("PublisherGuardActions", () => {
  it("admin: one Add to Publishers button per typed name", () => {
    const html = renderToStaticMarkup(
      <PublisherGuardActions blocked={blocked} isAdmin onPublisherAdded={() => undefined} />,
    )
    expect(html).toContain("Add &quot;Broadsheet Media&quot; to Publishers")
    expect(html.match(/to Publishers<\/span>/g)?.length).toBe(1)
  })

  it("not an admin: renders nothing", () => {
    const html = renderToStaticMarkup(
      <PublisherGuardActions blocked={blocked} isAdmin={false} onPublisherAdded={() => undefined} />,
    )
    expect(html).toBe("")
  })

  it("only blank production lines: nothing to add, renders nothing", () => {
    const html = renderToStaticMarkup(
      <PublisherGuardActions
        blocked={blocked.filter((f) => f.kind === "production_blank")}
        isAdmin
        onPublisherAdded={() => undefined}
      />,
    )
    expect(html).toBe("")
  })

  it("the save panel shows the actions under the problems, and never without problems", () => {
    const actions = <span>ACTIONS</span>
    const withProblems = renderToStaticMarkup(
      <PlanWizardSaveMessages extraProblemTexts={["BLOCKED"]} problemActions={actions} />,
    )
    expect(withProblems.indexOf("ACTIONS")).toBeGreaterThan(withProblems.indexOf("BLOCKED"))
    expect(renderToStaticMarkup(<PlanWizardSaveMessages problemActions={actions} />)).toBe("")
  })
})

describe("PublisherGuardActions dialog", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    // jsdom has no ResizeObserver; the form's Radix checkboxes measure themselves.
    if (!("ResizeObserver" in globalThis)) {
      ;(globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    }
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it("opens the Publishers create form with the typed name filled in", async () => {
    await act(async () => {
      root.render(<PublisherGuardActions blocked={blocked} isAdmin onPublisherAdded={() => undefined} />)
    })
    const button = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("to Publishers"),
    )
    expect(button).toBeTruthy()
    await act(async () => {
      button?.click()
    })
    expect(document.body.textContent).toContain("which isn't in Publishers")
    const inputs = Array.from(document.body.querySelectorAll("input")) as HTMLInputElement[]
    expect(inputs.some((i) => i.value === "Broadsheet Media")).toBe(true)
  })
})
