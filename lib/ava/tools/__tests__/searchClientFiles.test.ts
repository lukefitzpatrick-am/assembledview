/**
 * search_client_files: one client's site only, ava_sharepoint on, never on
 * /tasks; text out of the office formats Ava reads.
 */
import assert from "node:assert/strict"
import { test } from "node:test"

import ExcelJS from "exceljs"
import JSZip from "jszip"

import { avaToolDefinitionsForPage } from "../pageToolOffer"
import { fileText, odataQuote, searchClientFilesTool, sitePath } from "../searchClientFiles"
import { AVA_TOOL_TAGS } from "../toolAccess"

const page = (pathname: string) => ({ route: { pathname } }) as never
const flags = (sharepoint: boolean) => ({ billingRevisions: false, trueUp: false, sharepoint })

test("sitePath: stored URL or path first, else /sites/cli-<id>; anything else refuses", () => {
  assert.equal(sitePath("https://assembledmedia.sharepoint.com/sites/cli-bicau/", "x"), "/sites/cli-bicau")
  assert.equal(sitePath("/sites/cli-golf", null), "/sites/cli-golf")
  assert.equal(sitePath(null, "LEGAL"), "/sites/cli-legal")
  assert.equal(sitePath("", null), null)
  assert.equal(sitePath("https://other.example/sites/a/../b", null), "/sites/a") // first segment only, on SHAREPOINT_HOST
  assert.equal(sitePath("/personal/luke", null), null)
  assert.equal(sitePath("https://assembledmedia.sharepoint.com/sites/cli-bic/SitePages/Home.aspx", null), "/sites/cli-bic")
  assert.equal(sitePath("not a url", "golf"), "/sites/cli-golf")
})

test("odataQuote doubles single quotes", () => {
  assert.equal(odataQuote("O'Brien brief"), "'O''Brien brief'")
})

test("fileText reads docx, pptx, xlsx and csv; null for an unknown type", async () => {
  const docx = new JSZip()
  docx.file("word/document.xml", "<w:document><w:p><w:r><w:t>Brief &amp; KPIs</w:t></w:r></w:p><w:p><w:t>Line two</w:t></w:p></w:document>")
  assert.equal(await fileText("a.docx", await docx.generateAsync({ type: "nodebuffer" })), "Brief & KPIs\nLine two")

  const pptx = new JSZip()
  pptx.file("ppt/slides/slide10.xml", "<p:sld><a:p><a:t>Ten</a:t></a:p></p:sld>")
  pptx.file("ppt/slides/slide2.xml", "<p:sld><a:p><a:t>Two</a:t></a:p></p:sld>")
  assert.equal(await fileText("d.pptx", await pptx.generateAsync({ type: "nodebuffer" })), "Slide 1\nTwo\n\nSlide 2\nTen")

  const wb = new ExcelJS.Workbook()
  wb.addWorksheet("Plan").addRows([
    ["Channel", "Budget"],
    ["Search", 1200],
    [
      { richText: [{ text: "Rich " }, { text: "text" }] },
      { text: "Link", hyperlink: "https://x.example" },
      { formula: "B2*2", result: 2400 },
      new Date(Date.UTC(2026, 0, 1)),
    ],
  ])
  assert.equal(
    await fileText("p.xlsx", Buffer.from(await wb.xlsx.writeBuffer())),
    "Sheet Plan\nChannel\tBudget\nSearch\t1200\nRich text\tLink\t2400\t2026-01-01",
  )

  assert.equal(await fileText("a.csv", Buffer.from("a,b")), "a,b")
  assert.equal(await fileText("a.zip", Buffer.from("x")), null)
})

test("no client, no call", async () => {
  const out = await searchClientFilesTool.execute({ query: "brief" }, { roles: ["admin"], clientSlugs: [], mbaNumbers: [] } as never)
  assert.equal(out.isError, true)
  assert.match(out.content, /Which client/)
})

test("offered only with ava_sharepoint on, never on /tasks, tagged read", () => {
  const tools = [{ name: "search_client_files" }]
  const names = (on: boolean, p: string) => avaToolDefinitionsForPage(tools, page(p), flags(on)).map((t) => t.name)
  assert.deepEqual(names(false, "/dashboard/bic"), [])
  assert.deepEqual(names(true, "/dashboard/bic"), ["search_client_files"])
  assert.deepEqual(names(true, "/tasks"), [])
  assert.equal(AVA_TOOL_TAGS.search_client_files.access, "read")
})
