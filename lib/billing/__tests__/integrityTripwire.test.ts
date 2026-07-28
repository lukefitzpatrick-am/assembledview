import { describe, expect, it } from "vitest"

import {
  countFindingsBySeverity,
  flagIntegrityFindings,
  type IntegrityRow,
  type VersionMeta,
} from "@/lib/billing/integrityTripwire"

function versionMap(
  entries: Array<{ id: number; mba_number: string; version_number: number }>
): Map<number, VersionMeta> {
  return new Map(entries.map((e) => [e.id, e]))
}

describe("flagIntegrityFindings", () => {
  const knownVersions = versionMap([
    { id: 100, mba_number: "MBA-1", version_number: 2 },
    { id: 101, mba_number: "MBA-1", version_number: 1 },
    { id: 200, mba_number: "MBA-2", version_number: 1 },
  ])
  const knownVersionIds = new Set(knownVersions.keys())
  const currentVersionByMba = new Map([
    ["MBA-1", 2],
    ["MBA-2", 1],
  ])

  it("flags duplicates when rows > distinct line_item_ids (live current version)", () => {
    const rows: IntegrityRow[] = [
      { id: 1, mba_number: "MBA-1", media_plan_version: 100, line_item_id: "LI-A" },
      { id: 2, mba_number: "MBA-1", media_plan_version: 100, line_item_id: "LI-A" },
      { id: 3, mba_number: "MBA-1", media_plan_version: 100, line_item_id: "LI-B" },
    ]

    const findings = flagIntegrityFindings({
      table: "media_plan_ooh",
      rows,
      knownVersionIds,
      knownVersions,
      currentVersionByMba,
    })

    expect(findings).toEqual([
      {
        table: "media_plan_ooh",
        mba_number: "MBA-1",
        version: 100,
        rows: 3,
        distinctIds: 2,
        kind: "duplicate",
        severity: "live",
      },
    ])
  })

  it("marks historical duplicates as history severity", () => {
    const rows: IntegrityRow[] = [
      { id: 1, mba_number: "MBA-1", media_plan_version: 101, line_item_id: "LI-A" },
      { id: 2, mba_number: "MBA-1", media_plan_version: 101, line_item_id: "LI-A" },
    ]

    const findings = flagIntegrityFindings({
      table: "media_plan_television",
      rows,
      knownVersionIds,
      knownVersions,
      currentVersionByMba,
    })

    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({
      kind: "duplicate",
      version: 101,
      severity: "history",
      rows: 2,
      distinctIds: 1,
    })
  })

  it("flags version_less production rows with missing media_plan_version as live", () => {
    const rows: IntegrityRow[] = [
      { id: 1, mba_number: "MBA-1", media_plan_version: undefined, line_item_id: "LI-A" },
      { id: 2, mba_number: "MBA-1", media_plan_version: null, line_item_id: "LI-B" },
      { id: 3, mba_number: "MBA-1", media_plan_version: "", line_item_id: "LI-A" },
      // versioned rows must not enter version_less
      { id: 4, mba_number: "MBA-1", media_plan_version: 100, line_item_id: "LI-C" },
    ]

    const findings = flagIntegrityFindings({
      table: "media_plan_production",
      rows,
      knownVersionIds,
      knownVersions,
      currentVersionByMba,
      checkVersionLess: true,
    })

    const versionLess = findings.filter((f) => f.kind === "version_less")
    expect(versionLess).toEqual([
      {
        table: "media_plan_production",
        mba_number: "MBA-1",
        version: null,
        rows: 3,
        distinctIds: 2,
        kind: "version_less",
        severity: "live",
      },
    ])
  })

  it("does not emit version_less when checkVersionLess is false", () => {
    const rows: IntegrityRow[] = [
      { id: 1, mba_number: "MBA-1", media_plan_version: undefined, line_item_id: "LI-A" },
    ]

    const findings = flagIntegrityFindings({
      table: "media_plan_ooh",
      rows,
      knownVersionIds,
      knownVersions,
      currentVersionByMba,
      checkVersionLess: false,
    })

    expect(findings).toEqual([])
  })

  it("flags orphans when media_plan_version matches no versions row", () => {
    const rows: IntegrityRow[] = [
      { id: 1, mba_number: "MBA-1", media_plan_version: 999, line_item_id: "LI-A" },
      { id: 2, mba_number: "MBA-1", media_plan_version: 999, line_item_id: "LI-B" },
    ]

    const findings = flagIntegrityFindings({
      table: "media_plan_social",
      rows,
      knownVersionIds,
      knownVersions,
      currentVersionByMba,
    })

    expect(findings).toEqual([
      {
        table: "media_plan_social",
        mba_number: "MBA-1",
        version: 999,
        rows: 2,
        distinctIds: 2,
        kind: "orphan",
        severity: "live",
      },
    ])
  })

  it("can emit both duplicate and orphan for the same group", () => {
    const rows: IntegrityRow[] = [
      { id: 1, mba_number: "MBA-2", media_plan_version: 888, line_item_id: "LI-A" },
      { id: 2, mba_number: "MBA-2", media_plan_version: 888, line_item_id: "LI-A" },
    ]

    const findings = flagIntegrityFindings({
      table: "media_plan_search",
      rows,
      knownVersionIds,
      knownVersions,
      currentVersionByMba,
    })

    expect(findings.map((f) => f.kind).sort()).toEqual(["duplicate", "orphan"])
    expect(findings.every((f) => f.rows === 2 && f.distinctIds === 1)).toBe(true)
  })

  it("does not flag clean groups", () => {
    const rows: IntegrityRow[] = [
      { id: 1, mba_number: "MBA-1", media_plan_version: 100, line_item_id: "LI-A" },
      { id: 2, mba_number: "MBA-1", media_plan_version: 100, line_item_id: "LI-B" },
    ]

    const findings = flagIntegrityFindings({
      table: "media_plan_radio",
      rows,
      knownVersionIds,
      knownVersions,
      currentVersionByMba,
    })

    expect(findings).toEqual([])
  })

  it("counts findings by severity", () => {
    const counts = countFindingsBySeverity([
      {
        table: "t",
        mba_number: "M",
        version: 1,
        rows: 2,
        distinctIds: 1,
        kind: "duplicate",
        severity: "live",
      },
      {
        table: "t",
        mba_number: "M",
        version: 2,
        rows: 2,
        distinctIds: 1,
        kind: "duplicate",
        severity: "history",
      },
      {
        table: "t",
        mba_number: "M",
        version: null,
        rows: 1,
        distinctIds: 1,
        kind: "version_less",
        severity: "live",
      },
    ])
    expect(counts).toEqual({ live: 2, history: 1 })
  })
})
