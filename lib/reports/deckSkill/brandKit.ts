/**
 * Brand kit for the v5 skill deck. Template and three cover photos come from
 * BRAND_KIT_BASE_URL. The unpacked files stay in /tmp for this function instance.
 */
import "server-only"

import { createHash } from "node:crypto"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import JSZip from "jszip"

export type DeckSkillKit = {
  template: Buffer
  photos: { filename: string; bytes: Buffer }[]
}

const KIT_FILES = ["assembled-brand-kit-v1.zip", "assembled-brand-library-v1.zip"] as const
const TEMPLATE_NAME = "Assembled-Media-Template-v5.potx"

type LibraryPhoto = {
  id: string
  file: string
  theme: string
  orientation: string
}

type MemoryCache = { key: string; kit: DeckSkillKit }

let memory: MemoryCache | null = null
let pending: { key: string; promise: Promise<DeckSkillKit> } | null = null

function kitBaseUrl(): string {
  const raw = process.env.BRAND_KIT_BASE_URL?.trim()
  if (!raw) {
    throw new Error("BRAND_KIT_BASE_URL is unset. Set it to the public brand kit host.")
  }
  return raw.replace(/\/$/, "")
}

function cacheDir(key: string): string {
  return path.join(os.tmpdir(), "av-deck-brand-kit", key)
}

async function download(url: string, dest: string): Promise<void> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`kit download failed for ${path.basename(dest)} status ${response.status}`)
  }
  fs.writeFileSync(dest, Buffer.from(await response.arrayBuffer()))
}

async function unzip(zipPath: string, dest: string): Promise<void> {
  const zip = await JSZip.loadAsync(fs.readFileSync(zipPath))
  const jobs: Promise<void>[] = []
  for (const [name, entry] of Object.entries(zip.files)) {
    if (name.split(/[/\\]/).includes("..")) continue
    const target = path.join(dest, name)
    if (entry.dir) {
      fs.mkdirSync(target, { recursive: true })
      continue
    }
    jobs.push(
      entry.async("nodebuffer").then((buf) => {
        fs.mkdirSync(path.dirname(target), { recursive: true })
        fs.writeFileSync(target, buf)
      }),
    )
  }
  await Promise.all(jobs)
}

function findFile(dir: string, base: string, depth = 0): string | null {
  if (depth > 8 || !fs.existsSync(dir)) return null
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      const found = findFile(full, base, depth + 1)
      if (found) return found
    } else if (entry.name === base) {
      return full
    }
  }
  return null
}

function findLibraryIndex(dir: string, depth = 0): string | null {
  if (depth > 8 || !fs.existsSync(dir)) return null
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      const found = findLibraryIndex(full, depth + 1)
      if (found) return found
    } else if (entry.name === "index.json" && dir.endsWith(`${path.sep}library`)) {
      return full
    }
  }
  return null
}

function safeJoin(root: string, rel: string): string {
  const target = path.resolve(root, rel)
  const prefix = root.endsWith(path.sep) ? root : root + path.sep
  if (target !== root && !target.startsWith(prefix)) {
    throw new Error("kit photo path escapes the kit directory")
  }
  return target
}

function pickCoverPhotos(index: LibraryPhoto[], kitRoot: string): { filename: string; bytes: Buffer }[] {
  const portrait = (theme: string) =>
    index
      .filter((photo) => photo.orientation === "portrait" && photo.theme === theme)
      .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }))
  const family = portrait("family-and-outdoors")
  const travel = portrait("road-trips-and-travel")
  const picked = [family[0], travel[0], family[1]].filter((photo): photo is LibraryPhoto => !!photo)
  if (picked.length < 3) {
    throw new Error("need 3 portrait photos from family-and-outdoors and road-trips-and-travel")
  }
  return picked.map((photo, indexNumber) => {
    const source = safeJoin(kitRoot, photo.file)
    const filename = `${indexNumber + 1}-${path.basename(photo.file)}`
    return { filename, bytes: fs.readFileSync(source) }
  })
}

function readCached(dir: string): DeckSkillKit | null {
  const manifestPath = path.join(dir, "manifest.json")
  const templatePath = path.join(dir, TEMPLATE_NAME)
  if (!fs.existsSync(manifestPath) || !fs.existsSync(templatePath)) return null
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as { photos?: unknown }
  if (!Array.isArray(manifest.photos) || manifest.photos.length !== 3) return null
  const photos: { filename: string; bytes: Buffer }[] = []
  for (const name of manifest.photos) {
    if (typeof name !== "string" || !name || name.includes("..") || name.includes("/") || name.includes("\\")) {
      return null
    }
    const full = path.join(dir, name)
    if (!fs.existsSync(full)) return null
    photos.push({ filename: name, bytes: fs.readFileSync(full) })
  }
  return { template: fs.readFileSync(templatePath), photos }
}

function writeCached(dir: string, kit: DeckSkillKit): void {
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, TEMPLATE_NAME), kit.template)
  for (const photo of kit.photos) {
    fs.writeFileSync(path.join(dir, photo.filename), photo.bytes)
  }
  fs.writeFileSync(
    path.join(dir, "manifest.json"),
    JSON.stringify({ photos: kit.photos.map((photo) => photo.filename) }),
  )
}

async function downloadKit(base: string, dir: string): Promise<DeckSkillKit> {
  const src = path.join(dir, "src")
  fs.mkdirSync(src, { recursive: true })
  for (const name of KIT_FILES) {
    const zipPath = path.join(dir, name)
    await download(`${base}/${name}`, zipPath)
    await unzip(zipPath, src)
    fs.rmSync(zipPath, { force: true })
  }
  const templatePath = findFile(src, TEMPLATE_NAME)
  const indexPath = findLibraryIndex(src)
  if (!templatePath) throw new Error(`kit is missing ${TEMPLATE_NAME}`)
  if (!indexPath) throw new Error("kit is missing library/index.json")
  const index = JSON.parse(fs.readFileSync(indexPath, "utf8")) as LibraryPhoto[]
  const kit: DeckSkillKit = {
    template: fs.readFileSync(templatePath),
    photos: pickCoverPhotos(index, path.dirname(path.dirname(indexPath))),
  }
  writeCached(dir, kit)
  fs.rmSync(src, { recursive: true, force: true })
  return kit
}

async function readOrDownload(base: string, key: string): Promise<DeckSkillKit> {
  const dir = cacheDir(key)
  const cached = readCached(dir)
  if (cached) return cached
  fs.mkdirSync(dir, { recursive: true })
  return downloadKit(base, dir)
}

/** Template plus three cover photos. Reused for the life of this function instance. */
export async function loadBrandKit(): Promise<DeckSkillKit> {
  const base = kitBaseUrl()
  const key = createHash("sha256").update(base).digest("hex").slice(0, 16)
  if (memory?.key === key) return memory.kit
  if (pending?.key === key) return pending.promise
  const promise = readOrDownload(base, key).then((kit) => {
    memory = { key, kit }
    return kit
  })
  pending = { key, promise }
  try {
    return await promise
  } finally {
    if (pending?.promise === promise) pending = null
  }
}
