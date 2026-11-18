/**
 * B58: the shared form pattern. A failed submit shows each error under its
 * field, sets aria-invalid, links aria-describedby, focuses the first invalid
 * field and announces one summary. A valid submit is unchanged.
 *
 * @vitest-environment jsdom
 */
import { zodResolver } from "@hookform/resolvers/zod"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { useForm } from "react-hook-form"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { z } from "zod"

import { Announcer } from "@/components/ui/announcer"
import {
  announceInvalid,
  Form,
  FormControl,
  FormErrorSummary,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { invalidFieldList, invalidFieldSummary } from "@/lib/ui/invalidFields"

const schema = z.object({
  name: z.string().min(1, "Name is required"),
  code: z.string().min(1, "Code is required"),
})
type Values = z.infer<typeof schema>
const LABELS = { name: "Name", code: "Code" }

function Sample({
  onValid,
  summary = false,
  mode,
}: {
  onValid: (v: Values) => void
  summary?: boolean
  mode?: "onChange"
}) {
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { name: "", code: "" }, mode })
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onValid, announceInvalid(LABELS))}>
        {(["name", "code"] as const).map((name) => (
          <FormField
            key={name}
            control={form.control}
            name={name}
            render={({ field }) => (
              <FormItem>
                <FormLabel>{LABELS[name]}</FormLabel>
                <FormControl>
                  <Input {...field} data-field={name} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        ))}
        {summary ? <FormErrorSummary labels={LABELS} /> : null}
        <button type="submit">Save</button>
      </form>
    </Form>
  )
}

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
    for (let i = 0; i < 5; i++) await Promise.resolve()
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

const input = (name: string) => container.querySelector<HTMLInputElement>(`[data-field="${name}"]`)!
const assertive = () => container.querySelector<HTMLElement>('[data-announcer="assertive"]')!

async function type(name: string, value: string) {
  const el = input(name)
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, value)
    el.dispatchEvent(new Event("input", { bubbles: true }))
  })
  await settle()
}

async function submit() {
  await act(async () => {
    container.querySelector<HTMLButtonElement>('button[type="submit"]')!.click()
  })
  await settle()
}

describe("shared form errors", () => {
  it("shows each error on its field, links it, focuses the first and announces once", async () => {
    const onValid = vi.fn()
    act(() =>
      root.render(
        <>
          <Announcer />
          <Sample onValid={onValid} />
        </>,
      ),
    )
    await settle()
    await submit()
    expect(onValid).not.toHaveBeenCalled()
    for (const [name, message] of [
      ["name", "Name is required"],
      ["code", "Code is required"],
    ]) {
      const el = input(name)
      expect(el.getAttribute("aria-invalid")).toBe("true")
      const ids = (el.getAttribute("aria-describedby") ?? "").split(" ")
      const described = ids.map((id) => document.getElementById(id)?.textContent).filter(Boolean)
      expect(described).toEqual([message])
    }
    expect(document.activeElement).toBe(input("name"))
    expect(assertive().children).toHaveLength(1)
    expect(assertive().textContent).toBe("Fix 2 fields: Name: Name is required; Code: Code is required")
  })

  it("a valid submit saves, marks nothing and announces nothing", async () => {
    const onValid = vi.fn()
    act(() =>
      root.render(
        <>
          <Announcer />
          <Sample onValid={onValid} />
        </>,
      ),
    )
    await settle()
    const before = assertive().innerHTML
    for (const name of ["name", "code"]) await type(name, "x")
    await submit()
    expect(onValid).toHaveBeenCalledTimes(1)
    expect(container.querySelector('[aria-invalid="true"]')).toBeNull()
    expect(assertive().innerHTML).toBe(before)
  })

  it("the visible summary shows only after a failed submit", async () => {
    act(() => root.render(<Sample onValid={vi.fn()} summary mode="onChange" />))
    await settle()
    // A field checked as it is typed shows its own error, not the summary.
    await type("name", "x")
    await type("name", "")
    expect(input("name").getAttribute("aria-invalid")).toBe("true")
    expect(container.querySelector("[data-form-error-summary]")).toBeNull()
    await submit()
    const summary = container.querySelector("[data-form-error-summary]")
    expect(summary?.textContent).toBe("Fix 2 fields: Name: Name is required; Code: Code is required")
    expect(summary?.getAttribute("aria-live")).toBeNull()
    expect(summary?.getAttribute("role")).toBeNull()
  })
})

describe("invalidFieldList", () => {
  it("names each field once, reads rows and nested errors, never the ref", () => {
    // A ref React rendered carries React's own circular state.
    act(() => root.render(<Sample onValid={vi.fn()} />))
    const ref = input("name")
    const errors = {
      cost: [undefined, { cost: { message: "Cost must be a number", ref } }, { cost: { message: "Cost must be a number" } }],
      date: { message: "Date is required", ref, type: "required" },
      odd: { ref, type: "custom" },
    }
    expect(invalidFieldList(errors, { date: "Scope date" })).toEqual([
      "cost: Cost must be a number",
      "Scope date: Date is required",
      "odd: Invalid value",
    ])
    expect(invalidFieldSummary({})).toBe("")
    expect(invalidFieldSummary({ a: { message: "x" } })).toBe("Fix 1 field: a: x")
  })
})
