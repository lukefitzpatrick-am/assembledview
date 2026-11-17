/**
 * B52: AVA's page actions on both plan pages (set a field, click, select,
 * toggle), through the DOM.
 *
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from "vitest"

import { AVA_DOM_ACTIONS } from "../avaDomActions"

describe("AVA_DOM_ACTIONS", () => {
  afterEach(() => {
    document.body.innerHTML = ""
  })

  it("setField finds by selector, id or name, sets the value and fires input then change", async () => {
    document.body.innerHTML = `<input id="mp_campaignname" /><input name="mp_po" />`
    const seen: string[] = []
    const byId = document.getElementById("mp_campaignname") as HTMLInputElement
    byId.addEventListener("input", () => seen.push("input"))
    byId.addEventListener("change", () => seen.push("change"))
    expect(await AVA_DOM_ACTIONS.setField({ fieldId: "mp_campaignname", value: "Summer" })).toBe("Set field mp_campaignname to Summer")
    expect(byId.value).toBe("Summer")
    expect(seen).toEqual(["input", "change"])
    await AVA_DOM_ACTIONS.setField({ fieldId: "mp_po", value: "PO1" })
    expect((document.querySelector('[name="mp_po"]') as HTMLInputElement).value).toBe("PO1")
    await AVA_DOM_ACTIONS.setField({ selector: "#mp_campaignname", value: "Winter" })
    expect(byId.value).toBe("Winter")
    await expect(AVA_DOM_ACTIONS.setField({ fieldId: "missing", value: 1 })).rejects.toThrow("Field not found")
  })

  it("click, select and toggle act on the element or say why not", async () => {
    document.body.innerHTML = `<button id="b"></button><select id="s"><option value="a">a</option><option value="b">b</option></select><input id="c" type="checkbox" /><input id="t" />`
    let clicks = 0
    document.getElementById("b")!.addEventListener("click", () => clicks++)
    expect(await AVA_DOM_ACTIONS.click({ selector: "#b" })).toBe("Clicked #b")
    expect(clicks).toBe(1)
    await expect(AVA_DOM_ACTIONS.click({ selector: "#x" })).rejects.toThrow("Element not found")
    expect(await AVA_DOM_ACTIONS.select({ selector: "#s", value: "b" })).toBe("Selected b on #s")
    expect((document.getElementById("s") as HTMLSelectElement).value).toBe("b")
    await expect(AVA_DOM_ACTIONS.select({ selector: "#x", value: "b" })).rejects.toThrow("Select not found")
    expect(await AVA_DOM_ACTIONS.toggle({ selector: "#c", value: true })).toBe("Toggled #c to true")
    expect((document.getElementById("c") as HTMLInputElement).checked).toBe(true)
    await expect(AVA_DOM_ACTIONS.toggle({ selector: "#t", value: true })).rejects.toThrow("Toggle target is not a checkbox")
    await expect(AVA_DOM_ACTIONS.toggle({ selector: "#x", value: true })).rejects.toThrow("Toggle target not found")
  })
})
