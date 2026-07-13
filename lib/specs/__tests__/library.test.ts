import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import {
  listPublisherLibraryFiles,
  loadMiLibrary,
  loadMiLibraryVersion,
  loadTemplateStructure,
  miLibraryDir,
  slugifyPublisher,
  stripBuyingPlatformSuffix,
  validatePublisherJson,
} from "../library.js"

const DIR = miLibraryDir()

test("mi-library: every publisher file parses as JSON", () => {
  const files = listPublisherLibraryFiles(DIR)
  assert.ok(files.length >= 1)
  for (const file of files) {
    const raw = fs.readFileSync(path.join(DIR, file), "utf8")
    const parsed = JSON.parse(raw)
    assert.equal(typeof parsed, "object")
    assert.ok(parsed !== null)
  }
})

test("mi-library: slugs unique; required fields; source; container; aliases optional", () => {
  const files = listPublisherLibraryFiles(DIR)
  const slugs = new Set<string>()
  const allIssues: string[] = []

  for (const file of files) {
    const raw = JSON.parse(fs.readFileSync(path.join(DIR, file), "utf8"))
    const issues = validatePublisherJson(file, raw)
    for (const issue of issues) {
      allIssues.push(`${issue.file}: ${issue.message}`)
    }
    const slug = String(raw.publisher_slug ?? "")
    assert.ok(slug, `${file}: slug`)
    assert.equal(slugs.has(slug), false, `duplicate slug ${slug}`)
    slugs.add(slug)

    // Extra top-level keys must be preserved (not stripped by loader)
    const loaded = loadMiLibrary(DIR).bySlug.get(slug)
    assert.ok(loaded)
    for (const key of Object.keys(raw)) {
      assert.ok(key in loaded!, `${file}: lost key ${key}`)
    }

    if (Array.isArray(raw.formats)) {
      for (const fmt of raw.formats) {
        // aliases optional — presence or absence both OK
        if (fmt.aliases !== undefined) {
          assert.ok(Array.isArray(fmt.aliases))
        }
      }
    }
  }

  assert.deepEqual(allIssues, [])
})

test("mi-library: VERSION.json matches loaded counts", () => {
  const version = loadMiLibraryVersion(DIR)
  const lib = loadMiLibrary(DIR)
  assert.equal(version.publisherCount, lib.publishers.length)
  assert.equal(version.formatCount, lib.formatCount)
  assert.equal(version.sourceZip.includes("material-instructions-builder"), true)
  assert.ok(version.importedAt)
})

test("mi-library: template_structure.json loads", () => {
  const tpl = loadTemplateStructure(DIR)
  assert.ok(tpl.tabs.Social)
  assert.ok(tpl.tabs.Search)
  assert.equal(tpl.section_colours.AM, "DCE6F1")
})

test("slugifyPublisher: aliases + buying-platform suffix strip", () => {
  assert.equal(stripBuyingPlatformSuffix("ChatGPT - AM"), "ChatGPT")
  assert.equal(stripBuyingPlatformSuffix("YouTube - DV360"), "YouTube")
  assert.equal(stripBuyingPlatformSuffix("Display - CM360"), "Display")
  assert.equal(slugifyPublisher("Meta"), "meta")
  assert.equal(slugifyPublisher("Facebook"), "meta")
  assert.equal(slugifyPublisher("Google Ads"), "google-ads")
  assert.equal(slugifyPublisher("YouTube - DV360"), "youtube")
  assert.equal(slugifyPublisher("DV360"), "assembled-programmatic")
  assert.equal(slugifyPublisher("oOh!media"), "ooh-media")
  assert.equal(slugifyPublisher("ChatGPT - AM"), "chatgpt")
})
