#!/usr/bin/env node
/**
 * knip with a baseline (B7, G4). Unused files and dependencies first.
 *
 * Runs `knip --include files,dependencies,devDependencies,unlisted` and
 * compares every finding to scripts/knip-baseline.json:
 *   files:<path>                  an unused file
 *   dependencies:<name>           an unused dependency
 *   devDependencies:<name>        an unused devDependency
 *   unlisted:<name> <file>        an import of a package that is not in package.json
 * A finding not in the baseline fails. A baseline entry knip no longer reports
 * passes (it was fixed). The baseline only goes down:
 *   --update   drops entries knip no longer reports; never adds one.
 *   --reseed   writes the current findings. Only for a commit that changes
 *              knip.json or what this script includes.
 * Accepting a new finding on purpose means editing the JSON by hand, in review.
 *
 * knip.json no longer hides unused packages (B7). Its one ignoreDependencies
 * entry, eslint-config-next, is a knip false positive: eslint.config.mjs loads
 * it through FlatCompat ("next/core-web-vitals"), which knip cannot follow.
 * Unused exports and unresolved imports are not gated yet.
 *
 * `--root <dir>` runs against another tree; `--from-json <file>` reads a
 * saved `knip --reporter json` result instead of running knip (self-test).
 */
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const KINDS = ["files", "dependencies", "devDependencies", "unlisted"]

/** Baseline keys from a `knip --reporter json` result. */
export function findingsFromKnipJson(report) {
  const keys = new Set()
  for (const issue of report?.issues ?? []) {
    for (const kind of KINDS) {
      for (const item of issue[kind] ?? []) {
        const name = String(item?.name ?? "")
        if (!name) continue
        keys.add(kind === "unlisted" ? `unlisted:${name} ${issue.file}` : `${kind}:${name}`)
      }
    }
  }
  return [...keys].sort()
}

function runKnip(rootDir) {
  const bin = path.join(rootDir, "node_modules", ".bin", process.platform === "win32" ? "knip.cmd" : "knip")
  const r = spawnSync(bin, ["--no-progress", "--include", KINDS.join(","), "--reporter", "json"], {
    cwd: rootDir,
    encoding: "utf8",
    shell: process.platform === "win32",
    maxBuffer: 64 * 1024 * 1024,
  })
  const start = r.stdout.indexOf("{")
  if (start < 0) {
    console.error(r.stdout + r.stderr)
    throw new Error("check:knip: knip printed no JSON")
  }
  return JSON.parse(r.stdout.slice(start))
}

function arg(argv, name) {
  const at = argv.indexOf(name)
  return at >= 0 ? argv[at + 1] : undefined
}

function main(argv) {
  const rootDir = path.resolve(arg(argv, "--root") ?? path.join(path.dirname(fileURLToPath(import.meta.url)), ".."))
  const baselinePath = path.join(rootDir, "scripts", "knip-baseline.json")
  const fromJson = arg(argv, "--from-json")
  const report = fromJson ? JSON.parse(fs.readFileSync(fromJson, "utf8")) : runKnip(rootDir)
  const current = findingsFromKnipJson(report)

  const write = (list) => fs.writeFileSync(baselinePath, `${JSON.stringify([...list].sort(), null, 2)}\n`)

  if (argv.includes("--reseed")) {
    write(current)
    console.log(`check:knip: reseeded baseline (${current.length}). Only with a knip.json or scope change.`)
    return 0
  }
  if (!fs.existsSync(baselinePath)) {
    console.error("check:knip: baseline missing. Run with --reseed once.")
    return 1
  }
  const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8"))
  const known = new Set(baseline)
  const added = current.filter((k) => !known.has(k))
  const now = new Set(current)
  const fixed = baseline.filter((k) => !now.has(k))
  const update = argv.includes("--update")

  if (added.length) {
    console.error(
      update
        ? "check:knip: --update only removes fixed entries; these are new findings.\n"
        : "knip found new unused files or dependency problems (delete or wire them up):\n",
    )
    for (const k of added) console.error(`  ${k}`)
    return 1
  }
  if (update) {
    write(baseline.filter((k) => now.has(k)))
    console.log(`check:knip: baseline lowered by ${fixed.length} (${current.length}).`)
    return 0
  }
  console.log(
    fixed.length
      ? `check:knip: ok (${current.length}, ${fixed.length} fixed since the baseline). --update tightens it.`
      : `check:knip: ok (${current.length} known)`,
  )
  return 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exit(main(process.argv.slice(2)))
}
