/**
 * AVA's page actions on the plan form (both pages; B52): set a field, click,
 * select and toggle, through the DOM so React Hook Form and the containers
 * see a real input and change event. No page state: one stable object.
 */
type ActionResult = Promise<string | undefined>

async function setField({ fieldId, selector, value }: { fieldId?: string; selector?: string; value: unknown }): ActionResult {
  if (typeof window === "undefined" || typeof document === "undefined") return
  const target =
    (selector ? document.querySelector(selector) : null) ||
    (fieldId ? document.getElementById(fieldId) : null) ||
    (fieldId ? document.querySelector(`[name="${fieldId}"]`) : null)
  if (!target) throw new Error("Field not found")
  const input = target as HTMLInputElement | HTMLTextAreaElement
  input.value = value as string
  input.dispatchEvent(new Event("input", { bubbles: true }))
  input.dispatchEvent(new Event("change", { bubbles: true }))
  return `Set field ${selector || fieldId} to ${value}`
}

async function click({ selector }: { selector: string }): ActionResult {
  if (typeof document === "undefined") return
  const el = document.querySelector(selector) as HTMLElement | null
  if (!el) throw new Error("Element not found")
  el.click()
  return `Clicked ${selector}`
}

async function select({ selector, value }: { selector: string; value: string }): ActionResult {
  if (typeof document === "undefined") return
  const el = document.querySelector(selector) as HTMLSelectElement | null
  if (!el) throw new Error("Select not found")
  el.value = value
  el.dispatchEvent(new Event("change", { bubbles: true }))
  return `Selected ${value} on ${selector}`
}

async function toggle({ selector, value }: { selector: string; value: boolean }): ActionResult {
  if (typeof document === "undefined") return
  const el = document.querySelector(selector) as HTMLInputElement | null
  if (!el) throw new Error("Toggle target not found")
  if (el.type !== "checkbox") throw new Error("Toggle target is not a checkbox")
  el.checked = Boolean(value)
  el.dispatchEvent(new Event("input", { bubbles: true }))
  el.dispatchEvent(new Event("change", { bubbles: true }))
  return `Toggled ${selector} to ${value}`
}

export const AVA_DOM_ACTIONS = { setField, click, select, toggle }
