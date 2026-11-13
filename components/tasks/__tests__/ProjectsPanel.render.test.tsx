/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"

import type { CodexProject } from "@/lib/codex/projects"

import { defaultProjectOwner, NO_CLIENT, newProjectBody, projectClientOptions, ProjectsTable } from "../ProjectsPanel"

const P = (id: number, name: string, extra: Partial<CodexProject> = {}): CodexProject => ({
  id,
  kind: "campaign",
  client_id: null,
  mba_number: null,
  name,
  owner_email: "luke@x.au",
  is_private: false,
  status: "active",
  start_on: null,
  due_on: null,
  created_by_email: "luke@x.au",
  created_at: "2026-11-13T00:00:00Z",
  updated_at: "2026-11-13T00:00:00Z",
  members: [],
  ...extra,
})

describe("Projects tab (B39)", () => {
  it("lists projects with a link to each board, kind, MBA, owner and status; private marked", () => {
    const html = renderToStaticMarkup(
      <ProjectsTable
        items={[P(5, "Sinch", { mba_number: "sinch001" }), P(6, "Digital desk", { kind: "ops", is_private: true, status: "on_hold" })]}
        nameFor={(email) => (email === "luke@x.au" ? "Luke" : "—")}
      />
    )
    expect(html).toContain('href="/tasks/projects/5"')
    expect(html).toContain('href="/tasks/projects/6"')
    expect(html).toContain("sinch001")
    expect(html).toContain("Ops")
    expect(html).toContain("On hold")
    expect(html).toContain('aria-label="Private"')
    expect(html).toContain("Luke")
  })

  it("no projects says how to make one", () => {
    expect(renderToStaticMarkup(<ProjectsTable items={[]} nameFor={() => "—"} />)).toContain("No projects yet")
  })

  it("the create body: trimmed name, kind, optional MBA, private, owner; no sections (server default)", () => {
    expect(newProjectBody({ name: " SEO ", kind: "retainer", client_id: "", mba_number: " ", is_private: true, owner_email: "clay@x.au" })).toEqual({
      name: "SEO",
      kind: "retainer",
      is_private: true,
      owner_email: "clay@x.au",
    })
    expect(newProjectBody({ name: "Sinch", kind: "campaign", client_id: "", mba_number: "sinch001", is_private: false, owner_email: "" })).toEqual({
      name: "Sinch",
      kind: "campaign",
      mba_number: "sinch001",
      is_private: false,
    })
  })

  it("B39fix F5: the client is optional; a picked client goes as a number so board tasks take it", () => {
    const base = { name: "Sinch", kind: "campaign" as const, mba_number: "sinch001", is_private: false, owner_email: "" }
    expect(newProjectBody({ ...base, client_id: "42" })).toEqual({
      name: "Sinch",
      kind: "campaign",
      client_id: 42,
      mba_number: "sinch001",
      is_private: false,
    })
    expect(newProjectBody({ ...base, client_id: "" })).not.toHaveProperty("client_id")
    expect(newProjectBody({ ...base, client_id: NO_CLIENT })).not.toHaveProperty("client_id")
    expect(newProjectBody({ ...base, client_id: "0" })).not.toHaveProperty("client_id")
  })

  it("B39fix F5: client options are No client first, then the clients by name", () => {
    const options = projectClientOptions([
      { id: 9, name: "Treasury" },
      { id: 4, name: "Assembled" },
      { id: 7, name: "" },
    ])
    expect(options.map((o) => o.value)).toEqual([NO_CLIENT, "7", "4", "9"])
    expect(options[0].label).toBe("No client")
    expect(options[1].label).toBe("Client 7")
    expect(projectClientOptions([])).toEqual([{ value: NO_CLIENT, label: "No client" }])
  })

  it("B39fix F10: the owner picker starts on you as the roster's lowercased value, else empty (the You placeholder)", () => {
    const roster = [{ email: "Luke@AssembledMedia.com.au" }, { email: "clay@assembledmedia.com.au" }]
    expect(defaultProjectOwner("LUKE@assembledmedia.com.au", roster)).toBe("luke@assembledmedia.com.au")
    expect(defaultProjectOwner(" clay@assembledmedia.com.au ", roster)).toBe("clay@assembledmedia.com.au")
    expect(defaultProjectOwner("someone@else.au", roster)).toBe("")
    expect(defaultProjectOwner(null, roster)).toBe("")
    expect(defaultProjectOwner("luke@assembledmedia.com.au", [])).toBe("")
  })
})
