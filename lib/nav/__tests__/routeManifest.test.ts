import assert from "node:assert/strict"
import { readdirSync, statSync } from "node:fs"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

import {
  ADMIN_SIDEBAR_FOOTER_PATHS,
  ADMIN_SIDEBAR_PATHS,
  ROUTE_MANIFEST,
  ROUTE_MANIFEST_EXCLUSIONS,
  breadcrumbLabelForPath,
  filePathToRoutePath,
  getAdminSidebarFooterNav,
  getAdminSidebarNav,
  getPaletteNav,
  getRouteByExactPath,
  isLinkablePath,
  pageMetadata,
} from "../routeManifest.js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const appDir = path.resolve(__dirname, "../../../app")

function walkPageFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) {
      if (name === "api") continue // documented exclusion
      walkPageFiles(full, out)
    } else if (name === "page.tsx") {
      out.push(full)
    }
  }
  return out
}

test("ADMIN_SIDEBAR_PATHS labels come from the manifest (sidebar SoT)", () => {
  const nav = getAdminSidebarNav()
  assert.equal(nav.length, ADMIN_SIDEBAR_PATHS.length)
  for (let i = 0; i < ADMIN_SIDEBAR_PATHS.length; i++) {
    const pathKey = ADMIN_SIDEBAR_PATHS[i]!
    const entry = getRouteByExactPath(pathKey)
    assert.ok(entry, `missing manifest entry for ${pathKey}`)
    assert.equal(nav[i]!.label, entry!.label)
    assert.equal(nav[i]!.path, pathKey)
  }
})

test("palette includes every admin sidebar destination with matching labels", () => {
  const palette = getPaletteNav(true)
  const paletteByPath = new Map(palette.map((p) => [p.path, p]))
  for (const pathKey of [...ADMIN_SIDEBAR_PATHS, ...ADMIN_SIDEBAR_FOOTER_PATHS]) {
    const entry = getRouteByExactPath(pathKey)!
    const hit = paletteByPath.get(pathKey)
    assert.ok(hit, `palette missing sidebar destination ${pathKey}`)
    assert.equal(hit!.label, entry.label)
  }
  const footer = getAdminSidebarFooterNav()
  assert.equal(footer.length, 0)
})

test("Campaigns and Planning nouns are consistent across surfaces", () => {
  const campaigns = getRouteByExactPath("/mediaplans")!
  const planning = getRouteByExactPath("/tools/behavioural-planner")!
  assert.equal(campaigns.label, "Campaigns")
  assert.equal(campaigns.title, "Campaigns")
  assert.equal(breadcrumbLabelForPath("/mediaplans"), "Campaigns")
  assert.equal(planning.label, "Planning")
  assert.equal(planning.title, "Planning")
  assert.equal(breadcrumbLabelForPath("/tools/behavioural-planner"), "Planning")
  assert.equal(pageMetadata("/mediaplans").title, "Campaigns")
  assert.equal(pageMetadata("/tools/behavioural-planner").title, "Planning")
})

test("Home / Clients / Users labels and Create Campaign is palette-only", () => {
  assert.equal(getRouteByExactPath("/dashboard")!.label, "Home")
  assert.equal(getRouteByExactPath("/client")!.label, "Clients")
  assert.equal(getRouteByExactPath("/admin/users")!.label, "Users")
  assert.equal(getRouteByExactPath("/admin/users/new")!.label, "New user")
  assert.equal(getRouteByExactPath("/admin/users/new")!.inSidebar, false)
  assert.ok(getPaletteNav(true).some((p) => p.path === "/admin/users/new"))
  const create = getRouteByExactPath("/mediaplans/create")!
  assert.equal(create.label, "Create Campaign")
  assert.equal(create.inSidebar, false)
  assert.ok(getPaletteNav(true).some((p) => p.path === "/mediaplans/create"))
  assert.ok(!(ADMIN_SIDEBAR_PATHS as readonly string[]).includes("/mediaplans/create"))
  assert.ok((ADMIN_SIDEBAR_PATHS as readonly string[]).includes("/tasks"))
  assert.ok((ADMIN_SIDEBAR_PATHS as readonly string[]).includes("/admin/users"))
  assert.ok(!(ADMIN_SIDEBAR_PATHS as readonly string[]).includes("/admin/users/new"))
  assert.equal(getRouteByExactPath("/tasks")!.inSidebar, true)
  assert.equal(getRouteByExactPath("/tasks")!.label, "Codex")
})

test("sidebar groups match Plan / Deliver / Finance / Admin IA (FIN-1)", async () => {
  const { ADMIN_SIDEBAR_GROUPS, getAdminSidebarGroups } = await import("../routeManifest.js")
  assert.deepEqual(
    ADMIN_SIDEBAR_GROUPS.map((g) => ({ id: g.id, label: g.label, paths: [...g.paths] })),
    [
      { id: "top", label: null, paths: ["/dashboard", "/knowledge"] },
      {
        id: "plan",
        label: "Plan",
        paths: ["/tools/behavioural-planner", "/mediaplans", "/scopes-of-work"],
      },
      { id: "deliver", label: "Deliver", paths: ["/pacing", "/creative"] },
      {
        id: "finance",
        label: "Finance",
        paths: [
          "/finance/invoicing",
          "/finance/costs",
          "/finance/forecasting",
          "/finance/investment",
        ],
      },
      {
        id: "admin",
        label: "Admin",
        paths: ["/tasks", "/client", "/publishers", "/admin/users"],
      },
    ]
  )
  const groups = getAdminSidebarGroups()
  assert.equal(groups.find((g) => g.id === "admin")?.tone, "muted")
  assert.equal(groups.find((g) => g.id === "plan")?.items[0]?.label, "Planning")
  const finance = groups.find((g) => g.id === "finance")
  assert.deepEqual(
    finance?.items.map((i) => i.label),
    ["Clients billing", "Publishers", "Forecasting", "Investment"]
  )
})

test("breadcrumb intermediates that have no page are not linkable", () => {
  for (const p of ["/tools", "/admin", "/mediaplans/mba", "/mediaplans/mba/ABC-1"]) {
    assert.equal(isLinkablePath(p), false, p)
  }
  assert.equal(isLinkablePath("/admin/users"), true)
  assert.equal(isLinkablePath("/admin/users/new"), true)
  assert.equal(isLinkablePath("/mediaplans"), true)
  assert.equal(isLinkablePath("/tools/behavioural-planner"), true)
})

test("every app/**/page.tsx is covered by the manifest or a documented exclusion", () => {
  const pages = walkPageFiles(appDir)
  assert.ok(pages.length > 40, `expected many pages, got ${pages.length}`)

  const exclusionPrefixes = ROUTE_MANIFEST_EXCLUSIONS.filter((e) => e.path.endsWith("/**")).map((e) =>
    e.path.replace(/\/\*\*$/, "")
  )
  const exclusionExact = new Set(
    ROUTE_MANIFEST_EXCLUSIONS.filter((e) => !e.path.endsWith("/**")).map((e) => e.path)
  )

  const uncovered: string[] = []
  for (const file of pages) {
    const routePath = filePathToRoutePath(file)
    if (exclusionExact.has(routePath)) continue
    if (exclusionPrefixes.some((p) => routePath === p || routePath.startsWith(`${p}/`))) continue

    const exact = getRouteByExactPath(routePath)
    if (exact) continue

    // Dynamic page files map to a pattern entry (e.g. knowledge/[section])
    const patternHit = ROUTE_MANIFEST.some((e) => {
      if (!e.path.includes("[")) return false
      // Same segment count and static segments match
      const a = e.path.split("/").filter(Boolean)
      const b = routePath.split("/").filter(Boolean)
      if (a.length !== b.length) return false
      return a.every((seg, i) => seg.startsWith("[") || seg === b[i])
    })
    if (patternHit) continue

    // Concrete knowledge sections are listed even though the file is [section]
    if (
      routePath === "/knowledge/[section]" &&
      getRouteByExactPath("/knowledge/definitions")
    ) {
      continue
    }

    uncovered.push(`${routePath} (${file})`)
  }

  assert.deepEqual(uncovered, [], `Uncovered pages:\n${uncovered.join("\n")}`)
})

test("auth/api exclusions are documented", () => {
  assert.ok(ROUTE_MANIFEST_EXCLUSIONS.some((e) => e.path.includes("auth")))
  assert.ok(ROUTE_MANIFEST_EXCLUSIONS.some((e) => e.path.includes("api")))
})
