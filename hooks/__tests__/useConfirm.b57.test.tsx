/**
 * B57: useConfirm, the one way to ask a question. Yes and no answers, Escape,
 * focus (starts inside, stays inside, returns to the opener), the destructive
 * tone, notices, and the cases that answer no on their own.
 *
 * @vitest-environment jsdom
 */
import { act, useState } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { useConfirm, type ConfirmOptions, type NoticeOptions } from "@/hooks/use-confirm"

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

function button(label: string): HTMLButtonElement {
  const found = [...document.body.querySelectorAll("button")].find((el) => el.textContent?.trim() === label)
  expect(found, label).toBeTruthy()
  return found as HTMLButtonElement
}

function alertDialog(): HTMLElement | null {
  return document.querySelector('[role="alertdialog"]')
}

function pressEscape() {
  act(() => {
    ;(document.activeElement ?? document.body).dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
    )
  })
}

/** A page that asks on click and records what ran after the answer. */
function Asker({
  ask,
  log,
  second,
}: {
  ask: ConfirmOptions | ({ notice: true } & NoticeOptions)
  log: string[]
  second?: ConfirmOptions
}) {
  const { confirm, notice, confirmDialog } = useConfirm()
  const [shown, setShown] = useState(true)
  return (
    <>
      <button
        type="button"
        onClick={async () => {
          log.push("asked")
          if ("notice" in ask) {
            await notice(ask)
            log.push("after notice")
            return
          }
          const yes = await confirm(ask)
          log.push(yes ? "yes ran" : "no")
        }}
      >
        Ask
      </button>
      {second ? (
        <button type="button" onClick={async () => log.push((await confirm(second)) ? "second yes" : "second no")}>
          Ask again
        </button>
      ) : null}
      <button type="button" onClick={() => setShown(false)}>
        Leave
      </button>
      {shown ? confirmDialog : null}
    </>
  )
}

async function ask(label = "Ask") {
  const opener = button(label)
  opener.focus()
  act(() => opener.click())
  await settle()
  return opener
}

const DELETE: ConfirmOptions = {
  title: "Delete this?",
  description: "This cannot be undone.",
  confirmLabel: "Delete",
  tone: "destructive",
}

describe("useConfirm (B57)", () => {
  it("yes runs the action after the answer, and focus returns to the opener", async () => {
    const log: string[] = []
    act(() => root.render(<Asker ask={DELETE} log={log} />))
    const opener = await ask()
    expect(log).toEqual(["asked"])
    expect(alertDialog()?.textContent).toContain("Delete this?")
    expect(alertDialog()?.textContent).toContain("This cannot be undone.")

    act(() => button("Delete").click())
    await settle()
    expect(log).toEqual(["asked", "yes ran"])
    expect(alertDialog()).toBeNull()
    expect(document.activeElement).toBe(opener)
  })

  it("Cancel answers no and the action never runs", async () => {
    const log: string[] = []
    act(() => root.render(<Asker ask={DELETE} log={log} />))
    const opener = await ask()
    act(() => button("Cancel").click())
    await settle()
    expect(log).toEqual(["asked", "no"])
    expect(document.activeElement).toBe(opener)
  })

  it("Escape answers no and closes the window", async () => {
    const log: string[] = []
    act(() => root.render(<Asker ask={DELETE} log={log} />))
    const opener = await ask()
    pressEscape()
    await settle()
    expect(log).toEqual(["asked", "no"])
    expect(alertDialog()).toBeNull()
    expect(document.activeElement).toBe(opener)
  })

  it("focus starts on Cancel and Tab stays inside", async () => {
    act(() => root.render(<Asker ask={DELETE} log={[]} />))
    await ask()
    expect(document.activeElement).toBe(button("Cancel"))
    act(() => button("Leave").focus())
    expect(alertDialog()?.contains(document.activeElement)).toBe(true)
  })

  it("the destructive tone styles the action; the default does not", async () => {
    act(() => root.render(<Asker ask={DELETE} log={[]} />))
    await ask()
    expect(button("Delete").className).toContain("bg-destructive")
    act(() => button("Cancel").click())
    await settle()

    act(() => root.render(<Asker ask={{ title: "Go on?" }} log={[]} />))
    await ask()
    expect(button("Continue").className).not.toContain("bg-destructive")
    expect(alertDialog()?.getAttribute("aria-describedby")).toBeNull()
  })

  it("a notice waits for OK before the flow goes on", async () => {
    const log: string[] = []
    act(() => root.render(<Asker ask={{ notice: true, title: "Export failed", description: "a\nb" }} log={log} />))
    const opener = await ask()
    expect(log).toEqual(["asked"])
    expect(button("OK")).toBe(document.activeElement)
    expect(() => button("Cancel")).toThrow()
    act(() => button("OK").click())
    await settle()
    expect(log).toEqual(["asked", "after notice"])
    expect(document.activeElement).toBe(opener)
  })

  it("a notice closed with Escape also lets the flow go on", async () => {
    const log: string[] = []
    act(() => root.render(<Asker ask={{ notice: true, title: "Saved with notes" }} log={log} />))
    await ask()
    pressEscape()
    await settle()
    expect(log).toEqual(["asked", "after notice"])
  })

  it("a second question answers the first no", async () => {
    const log: string[] = []
    act(() => root.render(<Asker ask={DELETE} log={log} second={{ title: "Other?", confirmLabel: "Yes" }} />))
    await ask()
    act(() => button("Ask again").click())
    await settle()
    expect(log).toEqual(["asked", "no"])
    expect(alertDialog()?.textContent).toContain("Other?")
    act(() => button("Yes").click())
    await settle()
    expect(log).toEqual(["asked", "no", "second yes"])
  })

  it("unmounting while a question is open answers no", async () => {
    const log: string[] = []
    act(() => root.render(<Asker ask={DELETE} log={log} />))
    await ask()
    act(() => root.render(<div />))
    await settle()
    expect(log).toEqual(["asked", "no"])
  })
})
