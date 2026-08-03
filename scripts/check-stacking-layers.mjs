#!/usr/bin/env node
/**
 * MB-29 guard: fail when overlay / scanned surfaces use raw z-50 or z-[digits]
 * instead of the named stacking scale (lib/ui/stackingLayers.ts).
 *
 * Allowed: z-chrome | z-assistant | z-modal | z-nested | z-popover | z-tooltip |
 * z-toast | z-eg-*
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

const namedFiles = [
  "components/ui/dialog.tsx",
  "components/ui/alert-dialog.tsx",
  "components/ui/sheet.tsx",
  "components/ui/select.tsx",
  "components/ui/dropdown-menu.tsx",
  "components/ui/popover.tsx",
  "components/ui/command.tsx",
  "components/ui/tooltip.tsx",
  "components/ui/toast.tsx",
  "components/ChatWidget.tsx",
  "components/media-containers/expertGridSticky.ts",
  "components/media-containers/ExpertGrid.tsx",
]

const dirRoots = ["components/billing"]

/** Tailwind arbitrary / bare 50 that must use named tokens. */
const rawZPattern = /\bz-50\b|z-\[\d+\]/

const skipDirNames = new Set([
  "node_modules",
  ".git",
  "__tests__",
  "dist",
  ".next",
])

function shouldSkipFile(filePath) {
  const base = path.basename(filePath)
  if (base.endsWith(".test.ts") || base.endsWith(".test.tsx")) return true
  if (base === "check-stacking-layers.mjs") return true
  return false
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (skipDirNames.has(entry.name)) continue
      walk(full, out)
      continue
    }
    if (!/\.(ts|tsx|js|jsx|mjs)$/.test(entry.name)) continue
    if (shouldSkipFile(full)) continue
    out.push(full)
  }
  return out
}

function collectFiles() {
  const out = []
  for (const rel of namedFiles) {
    const full = path.join(rootDir, rel)
    if (fs.existsSync(full) && !shouldSkipFile(full)) out.push(full)
  }
  for (const rel of dirRoots) {
    walk(path.join(rootDir, rel), out)
  }
  return [...new Set(out)]
}

const hits = []
for (const file of collectFiles()) {
  const text = fs.readFileSync(file, "utf8")
  const lines = text.split(/\r?\n/)
  lines.forEach((line, i) => {
    // Skip pure comments that only mention the forbidden pattern in prose.
    const trimmed = line.trim()
    if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) {
      return
    }
    if (!rawZPattern.test(line)) return
    hits.push({
      file: path.relative(rootDir, file).replace(/\\/g, "/"),
      line: i + 1,
      text: trimmed.slice(0, 160),
    })
  })
}

if (hits.length > 0) {
  console.error(
    "MB-29 stacking guard failed: use named tokens from lib/ui/stackingLayers.ts\n" +
      "  (z-chrome … z-toast, or in-surface z-eg-*). Do not invent z-[N] / z-50.\n" +
      "  Same-tier rule: a surface opened inside another must declare a higher layer.\n"
  )
  for (const h of hits) {
    console.error(`  ${h.file}:${h.line}: ${h.text}`)
  }
  process.exit(1)
}

console.log("check-stacking-layers: ok")
