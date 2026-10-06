/**
 * Reproduce private blob read: REST bearer vs @vercel/blob get().
 * Loads .env.local the same way as other scripts (token must be present).
 *
 * Usage: npx tsx scripts/repro-blob-private-get.ts [assetId]
 * Optional: BLOB_URL=https://... overrides Xano lookup.
 */
import * as fs from "node:fs"
import * as path from "node:path"
import { fileURLToPath } from "node:url"
import { get } from "@vercel/blob"
import { getPrivateBlob } from "../lib/creative/getPrivateBlob"

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..")

function loadEnvLocal(): void {
  const p = path.join(REPO_ROOT, ".env.local")
  if (!fs.existsSync(p)) {
    console.error("Missing .env.local at", p)
    process.exit(1)
  }
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const eq = trimmed.indexOf("=")
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    let val = trimmed.slice(eq + 1).trim()
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1)
    }
    if (process.env[key] === undefined || process.env[key] === "") {
      process.env[key] = val
    }
  }
}

async function resolveBlobUrl(assetId: number): Promise<string> {
  const override = process.env.BLOB_URL?.trim()
  if (override) return override

  const base = process.env.XANO_CLIENTS_BASE_URL?.replace(/\/$/, "")
  const apiKey = process.env.XANO_API_KEY
  if (!base || !apiKey) {
    throw new Error("Need XANO_CLIENTS_BASE_URL + XANO_API_KEY (or set BLOB_URL)")
  }

  const res = await fetch(`${base}/creative_asset/${assetId}`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
  })
  if (!res.ok) {
    throw new Error(`Xano getById ${assetId} → HTTP ${res.status}`)
  }
  const row = (await res.json()) as { blob_url?: string; id?: number }
  if (!row.blob_url) throw new Error(`Asset ${assetId} has no blob_url`)
  return row.blob_url
}

async function main() {
  loadEnvLocal()

  const assetId = Number(process.argv[2] || "6")
  const token = process.env.BLOB_READ_WRITE_TOKEN
  const hasToken = Boolean(token && token.length > 0)
  const hasOidc = Boolean(process.env.VERCEL_OIDC_TOKEN)

  console.log("=== blob private-get repro ===")
  console.log("BLOB_READ_WRITE_TOKEN present:", hasToken)
  console.log("VERCEL_OIDC_TOKEN present:", hasOidc)
  const blobPkg = JSON.parse(
    fs.readFileSync(
      path.join(REPO_ROOT, "node_modules", "@vercel", "blob", "package.json"),
      "utf8",
    ),
  ) as { version: string }
  console.log("@vercel/blob package:", blobPkg.version)

  if (!hasToken) {
    console.error("ABORT: no BLOB_READ_WRITE_TOKEN — would fake a 403")
    process.exit(2)
  }

  const blobUrl = await resolveBlobUrl(assetId)
  let host = blobUrl
  try {
    host = new URL(blobUrl).host
  } catch {
    /* keep raw */
  }
  console.log("assetId:", assetId)
  console.log("blob host:", host)

  // 1) Direct REST GET of the blob URL with bearer (same token as list=200)
  const restRes = await fetch(blobUrl, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
    redirect: "follow",
  })
  const restBytes = restRes.ok ? (await restRes.arrayBuffer()).byteLength : 0
  console.log("REST GET blob URL:", restRes.status, restRes.ok ? `(${restBytes} bytes)` : "")

  // 2) SDK get() — the path used by download/frame/preview/ad-copy routes
  let sdkStatus: string
  try {
    const blobResult = await get(blobUrl, {
      access: "private",
      token,
    })
    if (!blobResult) {
      sdkStatus = "null result"
    } else {
      sdkStatus = `ok statusCode=${blobResult.statusCode} stream=${Boolean(blobResult.stream)} size=${blobResult.blob?.size}`
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    sdkStatus = `THREW: ${msg}`
  }
  console.log("SDK get(private, explicit token):", sdkStatus)

  // 3) Same SDK call without explicit token (env default — matches route code)
  let sdkEnvStatus: string
  try {
    const blobResult = await get(blobUrl, { access: "private" })
    if (!blobResult) {
      sdkEnvStatus = "null result"
    } else {
      sdkEnvStatus = `ok statusCode=${blobResult.statusCode} stream=${Boolean(blobResult.stream)} size=${blobResult.blob?.size}`
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    sdkEnvStatus = `THREW: ${msg}`
  }
  console.log("SDK get(private, env token):", sdkEnvStatus)

  // 4) Pathname-only get (docs example style)
  let pathname = ""
  try {
    pathname = decodeURIComponent(new URL(blobUrl).pathname.replace(/^\//, ""))
  } catch {
    pathname = ""
  }
  let sdkPathStatus = "skipped (no pathname)"
  if (pathname) {
    try {
      const blobResult = await get(pathname, { access: "private", token })
      if (!blobResult) {
        sdkPathStatus = "null result"
      } else {
        sdkPathStatus = `ok statusCode=${blobResult.statusCode} stream=${Boolean(blobResult.stream)} size=${blobResult.blob?.size}`
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      sdkPathStatus = `THREW: ${msg}`
    }
  }
  console.log("SDK get(pathname, explicit token):", sdkPathStatus)

  // 5) App helper — must succeed when RW token is present
  let helperStatus: string
  try {
    const blobResult = await getPrivateBlob(blobUrl)
    if (!blobResult) {
      helperStatus = "null result"
    } else {
      helperStatus = `ok statusCode=${blobResult.statusCode} stream=${Boolean(blobResult.stream)} size=${blobResult.blob?.size}`
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    helperStatus = `THREW: ${msg}`
  }
  console.log("getPrivateBlob():", helperStatus)

  console.log("---")
  const sdkEnvFailed = /403|Forbidden|THREW/i.test(sdkEnvStatus)
  if (restRes.ok && /ok statusCode=200/i.test(sdkStatus) && sdkEnvFailed) {
    console.log(
      "CONCLUSION: OIDC+BLOB_STORE_ID steals auth from RW token; pass explicit token (getPrivateBlob)",
    )
  } else if (restRes.ok && sdkEnvFailed) {
    console.log("CONCLUSION: REST OK + SDK env fail → use explicit RW token")
  } else if (!restRes.ok && sdkEnvFailed) {
    console.log("CONCLUSION: both fail → token/store/ACL issue, not auth precedence")
  } else if (restRes.ok && /ok statusCode=200/i.test(helperStatus)) {
    console.log("CONCLUSION: getPrivateBlob OK")
  } else {
    console.log("CONCLUSION: mixed/unexpected — inspect statuses above")
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
