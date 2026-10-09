/**
 * Downloads assembled-brand-kit-v1.zip once and writes the committed catalogue.
 * The app reads lib/ava/brand/assetCatalog.json. It does not download the zip.
 */
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import JSZip from "jszip"
import { BRAND_ASSET_BASE_URL } from "../../lib/config/endpoints"

function brandAssetBaseUrl(): string {
  const base = BRAND_ASSET_BASE_URL.trim().replace(/\/$/, "")
  let parsed: URL
  try {
    parsed = new URL(base)
  } catch {
    throw new Error("BRAND_ASSET_BASE_URL is not a valid URL")
  }
  if (parsed.protocol !== "https:") {
    throw new Error("BRAND_ASSET_BASE_URL must be an https URL")
  }
  return base
}

const STORE = brandAssetBaseUrl()
const ZIP_URL = `${STORE}/assembled-brand-kit-v1.zip`
const OUT = path.join(process.cwd(), "lib", "ava", "brand", "assetCatalog.json")

const LOGO_COPY: Record<string, string> = {
  "full-colour": "Full colour on white and sand.",
  "inverted-white": "Inverted white on black and forest.",
  "one-colour-ink": "One-colour ink when only one colour prints.",
  grayscale: "Grayscale.",
}

type IndexPhoto = {
  id?: unknown
  theme?: unknown
  description?: unknown
}

type CatalogEntry = {
  id: string
  kind: "logo" | "photo"
  name: string
  description: string
  tags: string[]
  url: string
}

function titleCase(value: string): string {
  return value
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

async function main(): Promise<void> {
  const response = await fetch(ZIP_URL)
  if (!response.ok) {
    throw new Error(`brand kit download failed: HTTP ${response.status}`)
  }
  const zip = await JSZip.loadAsync(Buffer.from(await response.arrayBuffer()))
  const names = Object.keys(zip.files)

  const logos: CatalogEntry[] = names
    .filter((name) => /\/logos\/logo-[^/]+\.png$/i.test(name))
    .map((name) => {
      const file = path.posix.basename(name)
      const id = file.replace(/^logo-/i, "").replace(/\.png$/i, "")
      return {
        id,
        kind: "logo" as const,
        name: titleCase(id),
        description: LOGO_COPY[id] ?? titleCase(id),
        tags: ["logo"],
        url: `${STORE}/am-logo-${id}.png`,
      }
    })
    .sort((a, b) => a.id.localeCompare(b.id))

  const indexPath = names.find((name) => name.endsWith("library/index.json"))
  if (!indexPath) throw new Error("library/index.json missing from brand kit")
  const index = JSON.parse(await zip.file(indexPath)!.async("string")) as unknown
  if (!Array.isArray(index)) throw new Error("library/index.json is not an array")

  const photos: CatalogEntry[] = []
  for (const row of index as IndexPhoto[]) {
    const id = text(row.id)
    const description = text(row.description)
    const theme = text(row.theme)
    if (!id || !description) continue
    photos.push({
      id,
      kind: "photo",
      name: description,
      description,
      tags: theme ? [theme] : [],
      url: `${STORE}/am-photo-${id}.jpg`,
    })
  }
  photos.sort((a, b) => a.id.localeCompare(b.id))

  if (logos.length === 0) throw new Error("brand kit has no logos")
  if (photos.length === 0) throw new Error("brand kit index has no photos")

  const catalog = [...logos, ...photos]
  fs.mkdirSync(path.dirname(OUT), { recursive: true })
  const tmp = path.join(os.tmpdir(), "assetCatalog.json")
  fs.writeFileSync(tmp, `${JSON.stringify(catalog, null, 2)}\n`, "utf8")
  fs.copyFileSync(tmp, OUT)
  console.log(`wrote ${catalog.length} assets (${logos.length} logos, ${photos.length} photos)`)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
