/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"

import { TaskMbaSelect } from "../TaskMbaSelect"

const PLANS = [
  { mba_number: "PENFOLD002", client_id: 12 },
  { mba_number: "PENFOLD012", client_id: 12 },
  { mba_number: "PENFOLD001", client_id: 12 },
  { mba_number: "OTHER099", client_id: 99 },
  { mba_number: "PENFOLD2", client_id: 12 },
]

describe("TaskMbaSelect MBA dropdown ordering", () => {
  it("lists the selected client's MBA numbers descending (highest / most recent first)", () => {
    const html = renderToStaticMarkup(
      <TaskMbaSelect
        clientId={12}
        value="PENFOLD002"
        plans={PLANS}
        onChange={() => {}}
      />,
    )

    const orderMatch = html.match(
      /data-mba-order="([^"]+)"/,
    )
    expect(orderMatch?.[1]).toBe(
      "PENFOLD012, PENFOLD002, PENFOLD2, PENFOLD001",
    )
    expect(html).not.toContain("OTHER099")
    expect(html.indexOf("PENFOLD012")).toBeLessThan(html.indexOf("PENFOLD002"))
    expect(html.indexOf("PENFOLD002")).toBeLessThan(html.indexOf("PENFOLD2"))
    expect(html.indexOf("PENFOLD2")).toBeLessThan(html.indexOf("PENFOLD001"))
  })

  it("stays empty and explains why until a client is chosen", () => {
    const html = renderToStaticMarkup(
      <TaskMbaSelect
        clientId={null}
        value=""
        plans={PLANS}
        onChange={() => {}}
      />,
    )

    expect(html).toContain("Select a client first")
    expect(html).toContain("disabled")
    expect(html).not.toContain("data-mba-order=")
  })
})
