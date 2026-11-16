// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"

import type { CodexCustomField } from "@/lib/codex/customFields"
import { ProgressFieldPicker, progressFieldChoices, ProjectFieldsEditor } from "../ProjectFieldsDialog"

const field = (id: number, name: string, extra: Partial<CodexCustomField> = {}): CodexCustomField => ({
  id,
  project_id: 1,
  name,
  field_type: "single_select",
  options: [
    { id: "o1", label: "Not started" },
    { id: "o2", label: "Done" },
  ],
  done_option: "o2",
  ...extra,
})

const FIELDS = [
  field(1, "Task Progress"),
  field(2, "Stage", { done_option: null }),
  field(3, "Tags", { field_type: "multi_select" }),
  field(4, "Old", { done_option: "o9" }),
]

describe("progress field (B42)", () => {
  it("offers only single-select fields with a live done option", () => {
    expect(progressFieldChoices(FIELDS).map((f) => f.name)).toEqual(["Task Progress"])
  })

  it("the picker says what it does, and why a linked field is inactive", () => {
    const html = renderToStaticMarkup(<ProgressFieldPicker fields={FIELDS} value={2} busy={false} onChange={() => {}} />)
    expect(html).toContain("Progress field")
    expect(html).toContain("Completing a task sets this field to its done option")
    expect(html).toContain("Linking a field, or changing its done option, also sets it on tasks already done.")
    expect(html).toContain("no done option now")
    const none = renderToStaticMarkup(<ProgressFieldPicker fields={[FIELDS[1]]} value={null} busy={false} onChange={() => {}} />)
    expect(none).toContain("pick its done option first")
  })

  it("the fields editor shows the picker only when the switch hands it a handler", () => {
    const base = { fields: FIELDS, cardFields: [], onCreate: async () => true, onUpdate: async () => true, onDelete: () => {}, onToggleCard: () => {} }
    expect(renderToStaticMarkup(<ProjectFieldsEditor {...base} />)).not.toContain("Progress field")
    expect(renderToStaticMarkup(<ProjectFieldsEditor {...base} progressFieldId={1} onProgressField={() => {}} />)).toContain("Progress field")
  })
})
