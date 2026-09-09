import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  buildClientMenuItems,
  clientBottomNavItems,
  formatClientSlugLabel,
  resolveActiveClientSlug,
} from "../clientMenuItems"

describe("formatClientSlugLabel", () => {
  it("title-cases hyphenated slugs", () => {
    assert.equal(formatClientSlugLabel("golf-australia"), "Golf Australia")
  })
})

describe("resolveActiveClientSlug", () => {
  const slugs = ["golf-australia", "golf-australia-self-run-campaigns"]

  it("uses the URL segment when it is in the set", () => {
    assert.equal(
      resolveActiveClientSlug("/dashboard/golf-australia-self-run-campaigns/creative", slugs),
      "golf-australia-self-run-campaigns",
    )
  })

  it("falls back to primary when the path is not a member dashboard", () => {
    assert.equal(resolveActiveClientSlug("/knowledge", slugs), "golf-australia")
  })
})

describe("buildClientMenuItems", () => {
  it("one slug is dashboard, Creative, Knowledge Hub", () => {
    const items = buildClientMenuItems({
      clientSlugs: ["golf-australia"],
      labels: { "golf-australia": "Golf Australia" },
      pathname: "/dashboard/golf-australia",
      creativeLabel: "Creative",
      knowledgeLabel: "Knowledge Hub",
    })
    assert.deepEqual(
      items.map((i) => ({ title: i.title, href: i.href, kind: i.kind })),
      [
        { title: "Golf Australia", href: "/dashboard/golf-australia", kind: "client" },
        { title: "Creative", href: "/dashboard/golf-australia/creative", kind: "creative" },
        { title: "Knowledge Hub", href: "/knowledge", kind: "knowledge" },
      ],
    )
  })

  it("two slugs are clients first, then Creative, then Knowledge Hub", () => {
    const items = buildClientMenuItems({
      clientSlugs: ["golf-australia", "golf-australia-self-run-campaigns"],
      labels: {
        "golf-australia": "Golf Australia",
        "golf-australia-self-run-campaigns": "Golf Australia - Self Run Campaigns",
      },
      pathname: "/dashboard/golf-australia-self-run-campaigns",
      creativeLabel: "Creative",
      knowledgeLabel: "Knowledge Hub",
    })
    assert.deepEqual(
      items.map((i) => ({ title: i.title, href: i.href, kind: i.kind })),
      [
        { title: "Golf Australia", href: "/dashboard/golf-australia", kind: "client" },
        {
          title: "Golf Australia - Self Run Campaigns",
          href: "/dashboard/golf-australia-self-run-campaigns",
          kind: "client",
        },
        {
          title: "Creative",
          href: "/dashboard/golf-australia-self-run-campaigns/creative",
          kind: "creative",
        },
        { title: "Knowledge Hub", href: "/knowledge", kind: "knowledge" },
      ],
    )
    const golf = items.find((i) => i.href === "/dashboard/golf-australia")
    const direct = items.find((i) => i.href === "/dashboard/golf-australia-self-run-campaigns")
    assert.equal(golf?.isActive, false)
    assert.equal(direct?.isActive, true)
  })

  it("falls back to formatClientSlugLabel while a display name is missing", () => {
    const items = buildClientMenuItems({
      clientSlugs: ["pga-australia"],
      labels: {},
      pathname: "/dashboard/pga-australia",
      creativeLabel: "Creative",
      knowledgeLabel: "Knowledge Hub",
    })
    assert.equal(items[0]?.title, "Pga Australia")
  })
})

describe("clientBottomNavItems", () => {
  it("two clients keep Creative and Knowledge Hub", () => {
    const items = buildClientMenuItems({
      clientSlugs: ["golf-australia", "golf-direct"],
      labels: { "golf-australia": "Golf", "golf-direct": "Golf Direct" },
      pathname: "/dashboard/golf-australia",
      creativeLabel: "Creative",
      knowledgeLabel: "Knowledge Hub",
    })
    const bottom = clientBottomNavItems(items)
    assert.deepEqual(
      bottom.map((i) => i.kind),
      ["client", "client", "creative", "knowledge"],
    )
  })

  it("caps client items at 3 so Creative and Knowledge Hub stay in the 5-slot bar", () => {
    const items = buildClientMenuItems({
      clientSlugs: ["a-client", "b-client", "c-client", "d-client"],
      labels: {},
      pathname: "/dashboard/a-client",
      creativeLabel: "Creative",
      knowledgeLabel: "Knowledge Hub",
    })
    const bottom = clientBottomNavItems(items)
    assert.equal(bottom.length, 5)
    assert.deepEqual(
      bottom.map((i) => i.kind),
      ["client", "client", "client", "creative", "knowledge"],
    )
    assert.equal(
      bottom.filter((i) => i.kind === "client").map((i) => i.slug).join(","),
      "a-client,b-client,c-client",
    )
  })
})
