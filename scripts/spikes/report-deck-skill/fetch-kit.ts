/**
 * Download the public Assembled brand kit into kit/ and unzip it.
 *
 * node --import tsx scripts/spikes/report-deck-skill/fetch-kit.ts
 *
 * No client data. Read only.
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import JSZip from "jszip"

const here = path.dirname(fileURLToPath(import.meta.url))
const kitDir = path.join(here, "kit")

const ZIPS = [
  {
    name: "assembled-brand-kit-v1.zip",
    url: "https://rzpuygzq2ull7c9x.public.blob.vercel-storage.com/assembled-brand-kit-v1.zip",
  },
  {
    name: "assembled-brand-library-v1.zip",
    url: "https://rzpuygzq2ull7c9x.public.blob.vercel-storage.com/assembled-brand-library-v1.zip",
  },
] as const

async function download(url: string, dest: string): Promise<void> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`kit download failed: ${url} status ${response.status}`)
  }
  const bytes = Buffer.from(await response.arrayBuffer())
  fs.writeFileSync(dest, bytes)
  console.log(JSON.stringify({ downloaded: path.basename(dest), bytes: bytes.length }))
}

async function unzip(zipPath: string, dest: string): Promise<void> {
  const zip = await JSZip.loadAsync(fs.readFileSync(zipPath))
  const jobs: Promise<void>[] = []
  for (const [name, entry] of Object.entries(zip.files)) {
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

function findFile(dir: string, base: string): string | null {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      const found = findFile(full, base)
      if (found) return found
    } else if (entry.name === base) {
      return full
    }
  }
  return null
}

async function main(): Promise<void> {
  fs.mkdirSync(kitDir, { recursive: true })
  for (const zip of ZIPS) {
    const dest = path.join(kitDir, zip.name)
    await download(zip.url, dest)
    await unzip(dest, kitDir)
  }
  for (const name of ["Assembled-Media-Template-v5.potx", "am_rebrand.py"]) {
    const found = findFile(kitDir, name)
    if (!found) throw new Error(`kit is missing ${name}`)
    const bytes = fs.statSync(found).size
    console.log(JSON.stringify({ file: name, bytes, path: path.relative(here, found) }))
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err))
  process.exitCode = 1
})
