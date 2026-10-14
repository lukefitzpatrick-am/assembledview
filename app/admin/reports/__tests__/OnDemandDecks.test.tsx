/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"

import { OnDemandDecks } from "../OnDemandDecks"

describe("OnDemandDecks", () => {
  it("shows who asked, the status, the note and a download", () => {
    const html = renderToStaticMarkup(
      <OnDemandDecks
        rows={[
          {
            id: "run-1",
            clientName: "Curatif",
            mbaNumber: "CURATIF004",
            status: "generated",
            requestedByEmail: "luke@assembledmedia.com.au",
            note: "Basic layout: Cost cap of $0.60",
            error: null,
            blobPathname: "exports/reports/CURATIF004/Curatif-report.pptx",
          },
        ]}
      />,
    )
    expect(html).toContain("Who asked")
    expect(html).toContain("luke@assembledmedia.com.au")
    expect(html).toContain("Generated")
    expect(html).toContain("Basic layout: Cost cap of $0.60")
    expect(html).toContain("Download")
    expect(html).toContain(
      "/api/reports/download?path=exports%2Freports%2FCURATIF004%2FCuratif-report.pptx",
    )
    expect(html).not.toContain("Generate now")
  })

  it("shows a failed deck without a download", () => {
    const html = renderToStaticMarkup(
      <OnDemandDecks
        rows={[
          {
            id: "run-2",
            clientName: null,
            mbaNumber: "CURATIF004",
            status: "failed",
            requestedByEmail: null,
            note: null,
            error: "Timed out",
            blobPathname: null,
          },
        ]}
      />,
    )
    expect(html).toContain("Not recorded")
    expect(html).toContain("Failed")
    expect(html).toContain("Timed out")
    expect(html).not.toContain("/api/reports/download")
  })
})
