/**
 * B58: field errors for a form without react-hook-form. Each message sits
 * under its field (aria-invalid, aria-describedby), focus goes to the first
 * in form order, one summary is announced, clear() takes one away, and a
 * check that finds nothing marks nothing and says nothing.
 *
 * @vitest-environment jsdom
 */
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { Announcer } from "@/components/ui/announcer"
import { useFieldErrors } from "@/hooks/use-field-errors"

const LABELS = { title: "Title", owner: "Owner" } as const
let checkResult: boolean | null = null

function Sample({ found }: { found: Partial<Record<keyof typeof LABELS, string>> }) {
  const errors = useFieldErrors(LABELS)
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        checkResult = errors.check(found)
      }}
    >
      {(Object.keys(LABELS) as (keyof typeof LABELS)[]).map((key) => (
        <div key={key}>
          <label htmlFor={errors.control(key).id}>{LABELS[key]}</label>
          <input {...errors.control(key)} data-field={key} onChange={() => errors.clear(key)} />
          {errors.message(key)}
        </div>
      ))}
      <button type="submit">Save</button>
    </form>
  )
}

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  checkResult = null
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

const input = (key: string) => container.querySelector<HTMLInputElement>(`[data-field="${key}"]`)!
const assertive = () => container.querySelector<HTMLElement>('[data-announcer="assertive"]')!
const submit = () => act(() => container.querySelector("form")!.requestSubmit())

describe("useFieldErrors", () => {
  it("shows each message on its field, focuses the first in form order, announces once", () => {
    // Found in the other order: focus and the summary still follow the form.
    act(() =>
      root.render(
        <>
          <Announcer />
          <Sample found={{ owner: "Owner is required", title: "Title is required" }} />
        </>,
      ),
    )
    submit()
    expect(checkResult).toBe(false)
    for (const [key, message] of [
      ["title", "Title is required"],
      ["owner", "Owner is required"],
    ]) {
      expect(input(key).getAttribute("aria-invalid")).toBe("true")
      expect(document.getElementById(input(key).getAttribute("aria-describedby")!)?.textContent).toBe(message)
      expect(container.querySelector(`label[for="${input(key).id}"]`)?.textContent).toBe(
        LABELS[key as keyof typeof LABELS],
      )
    }
    expect(document.activeElement).toBe(input("title"))
    expect(assertive().children).toHaveLength(1)
    expect(assertive().textContent).toBe("Fix 2 fields: Title: Title is required; Owner: Owner is required")
  })

  it("clear() takes one field's message away", () => {
    act(() => root.render(<Sample found={{ title: "Title is required" }} />))
    submit()
    expect(input("title").getAttribute("aria-invalid")).toBe("true")
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input("title"), "x")
      input("title").dispatchEvent(new Event("input", { bubbles: true }))
    })
    expect(input("title").getAttribute("aria-invalid")).toBeNull()
    expect(input("title").getAttribute("aria-describedby")).toBeNull()
  })

  it("a check that finds nothing marks nothing and says nothing", () => {
    act(() =>
      root.render(
        <>
          <Announcer />
          <Sample found={{ title: undefined }} />
        </>,
      ),
    )
    const before = assertive().innerHTML
    submit()
    expect(checkResult).toBe(true)
    expect(container.querySelector('[aria-invalid="true"]')).toBeNull()
    expect(assertive().innerHTML).toBe(before)
  })
})
