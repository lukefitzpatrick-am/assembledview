/**
 * Radio add after a delete must not reuse a number still on the form.
 * The Add Line Item button stamps nextLineFields(current rows). Mounting
 * RadioContainer itself does not quiesce under jsdom, so this harness is
 * that button: same helper, same field array, same remove-then-add order.
 *
 * @vitest-environment jsdom
 */
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { useForm, useFieldArray } from "react-hook-form"
import { createRoot, type Root } from "react-dom/client"
import { flushSync } from "react-dom"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { MEDIA_TYPE_ID_CODES, nextLineFields } from "@/lib/mediaplan/lineItemIds"

type Row = { line_item_id: string; line_item: number }

function RadioAddHarness({ initial }: { initial: Row[] }) {
  const form = useForm<{ radiolineItems: Row[] }>({
    defaultValues: { radiolineItems: initial },
  })
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "radiolineItems",
  })
  const rows = form.watch("radiolineItems")

  return (
    <div>
      {fields.map((field, index) => (
        <div key={field.id} data-line-item-id={rows[index]?.line_item_id}>
          <button type="button" onClick={() => remove(index)}>
            Remove
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() =>
          append({
            ...nextLineFields(
              form.getValues("radiolineItems") || [],
              "krusty002",
              MEDIA_TYPE_ID_CODES.radio,
            ),
          })
        }
      >
        Add Line Item
      </button>
    </div>
  )
}

describe("Radio add after delete", () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    host = document.createElement("div")
    document.body.appendChild(host)
    root = createRoot(host)
  })

  afterEach(() => {
    root.unmount()
    host.remove()
  })

  it("gives the new line 4 when lines 1 and 3 remain", () => {
    const initial = [1, 2, 3].map((n) => ({
      line_item: n,
      line_item_id: `krusty002RA${n}`,
    }))
    flushSync(() => {
      root.render(<RadioAddHarness initial={initial} />)
    })

    const removeButtons = () =>
      [...host.querySelectorAll("button")].filter((button) =>
        button.textContent?.includes("Remove"),
      )
    expect(removeButtons()).toHaveLength(3)
    flushSync(() => {
      removeButtons()[1].click()
    })
    const add = [...host.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Add Line Item"),
    )
    flushSync(() => {
      add?.click()
    })

    const ids = [...host.querySelectorAll("[data-line-item-id]")].map((node) =>
      node.getAttribute("data-line-item-id"),
    )
    expect(ids).toEqual(["krusty002RA1", "krusty002RA3", "krusty002RA4"])
  })

  it("RadioContainer stamps nextLineFields instead of the list length", () => {
    const src = readFileSync(
      resolve("components/media-containers/RadioContainer.tsx"),
      "utf8",
    )
    expect(src).toContain("nextLineFields(")
    expect(src).not.toContain("lineItemFields.length + 1")
  })
})
