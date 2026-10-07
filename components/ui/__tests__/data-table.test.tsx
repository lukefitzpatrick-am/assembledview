/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"

import {
  DataTable,
  buildCsvRows,
  nextSortState,
  sortRows,
  type DataTableColumn,
} from "../data-table"

type Sample = {
  id: string
  name: string
  amount: number
  live: boolean
  end: Date
  note: string
}

const columns: DataTableColumn<Sample>[] = [
  { id: "name", header: "Name", accessor: (row) => row.name },
  { id: "amount", header: "Amount", accessor: (row) => row.amount },
  { id: "live", header: "Live", accessor: (row) => row.live },
  { id: "end", header: "End", accessor: (row) => row.end },
  { id: "note", header: "Note", accessor: (row) => row.note, csv: false, sortable: false },
]

const rows: Sample[] = [
  {
    id: "b",
    name: "Cedar",
    amount: 10,
    live: false,
    end: new Date(2026, 9, 7),
    note: "skip-me",
  },
  {
    id: "a",
    name: "Alder",
    amount: 2,
    live: true,
    end: new Date(2026, 0, 3),
    note: "also-skip",
  },
]

describe("buildCsvRows", () => {
  it("writes headers, drops csv:false columns, and formats dates and booleans", () => {
    const csv = buildCsvRows(columns, rows)

    expect(csv[0]).toEqual(["Name", "Amount", "Live", "End"])
    expect(csv[1]).toEqual(["Cedar", 10, "No", "2026-10-07"])
    expect(csv[2]).toEqual(["Alder", 2, "Yes", "2026-01-03"])
    expect(csv.flat()).not.toContain("Note")
    expect(csv.flat()).not.toContain("skip-me")
  })
})

describe("nextSortState", () => {
  it("cycles a new column asc then desc then null, and resets when the column changes", () => {
    const asc = nextSortState(null, "name")
    const desc = nextSortState(asc, "name")
    const cleared = nextSortState(desc, "name")
    const switched = nextSortState(desc, "amount")

    expect(asc).toEqual({ id: "name", direction: "asc" })
    expect(desc).toEqual({ id: "name", direction: "desc" })
    expect(cleared).toBeNull()
    expect(switched).toEqual({ id: "amount", direction: "asc" })
  })
})

describe("sortRows", () => {
  it("sorts strings and numbers both ways, keeps original order when unsorted, and does not mutate the input", () => {
    const input = rows.slice()

    expect(sortRows(columns, input, { id: "name", direction: "asc" }).map((row) => row.name)).toEqual([
      "Alder",
      "Cedar",
    ])
    expect(sortRows(columns, input, { id: "name", direction: "desc" }).map((row) => row.name)).toEqual([
      "Cedar",
      "Alder",
    ])
    expect(sortRows(columns, input, { id: "amount", direction: "asc" }).map((row) => row.amount)).toEqual([
      2, 10,
    ])
    expect(sortRows(columns, input, { id: "amount", direction: "desc" }).map((row) => row.amount)).toEqual([
      10, 2,
    ])
    expect(sortRows(columns, input, null).map((row) => row.id)).toEqual(["b", "a"])
    expect(input.map((row) => row.id)).toEqual(["b", "a"])
  })
})

describe("DataTable markup", () => {
  it("renders initialSort order and leaves a non-sortable header without a button", () => {
    const html = renderToStaticMarkup(
      <DataTable
        columns={columns}
        rows={rows}
        getRowId={(row) => row.id}
        initialSort={{ id: "name", direction: "asc" }}
      />,
    )
    const tbody = html.slice(html.indexOf("<tbody"), html.indexOf("</tbody>"))
    const thead = html.slice(html.indexOf("<thead"), html.indexOf("</thead>"))
    const noteHeader = thead.split("<th").find((part) => part.includes("Note")) ?? ""

    expect(tbody.indexOf("Alder")).toBeGreaterThan(-1)
    expect(tbody.indexOf("Alder")).toBeLessThan(tbody.indexOf("Cedar"))
    expect(noteHeader).not.toContain("<button")
  })

  it("keeps the header and renders the empty node inside tbody", () => {
    const html = renderToStaticMarkup(
      <DataTable
        columns={columns}
        rows={[]}
        getRowId={(row) => row.id}
        empty={<p>No campaigns</p>}
      />,
    )
    const tbody = html.slice(html.indexOf("<tbody"), html.indexOf("</tbody>"))

    expect(html.indexOf("<thead")).toBeGreaterThan(-1)
    expect(html.indexOf("Name")).toBeLessThan(html.indexOf("<tbody"))
    expect(tbody).toContain("No campaigns")
    expect(tbody).toContain('colSpan="5"')
  })

  it("renders a disabled Export CSV button when there are no rows", () => {
    const html = renderToStaticMarkup(
      <DataTable
        columns={columns}
        rows={[]}
        getRowId={(row) => row.id}
        csvFilename="example-campaigns"
      />,
    )
    const labelAt = html.indexOf("Export CSV")
    const open = html.lastIndexOf("<button", labelAt)
    const tag = html.slice(open, html.indexOf(">", open) + 1)

    expect(labelAt).toBeGreaterThan(-1)
    expect(tag).toContain('disabled=""')
  })
})
