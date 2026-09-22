import assert from "node:assert/strict"
import { afterEach, describe, it } from "node:test"

const ENV_KEYS = [
  "SCREENSHOTONE_API_URL",
  "FIREFLIES_GRAPHQL_URL",
  "MYHOURS_API_BASE",
  "MS_GRAPH_BASE_URL",
  "MS_LOGIN_BASE_URL",
  "MS_GRAPH_SCOPE",
  "XERO_IDENTITY_URL",
  "XERO_API_BASE",
  "XERO_APP_BASE",
  "XANO_EXPORT_INSTANCE_URL",
  "XANO_INSTANCE_BASE",
  "FACEBOOK_GRAPH_URL",
  "APP_ASSET_BASE_URL",
  "MEMORY_BLOB_BASE_URL",
  "NEXT_PUBLIC_APP_URL",
  "AUTH0_BASE_URL",
  "VERCEL_URL",
  "NODE_ENV",
] as const

const saved: Record<string, string | undefined> = {}

/** `NODE_ENV` is a read-only literal union in @types/node; widen it to write. */
const mutableEnv = process.env as Record<string, string | undefined>

function stashEnv() {
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key]
    delete process.env[key]
  }
}

function restoreEnv() {
  for (const key of ENV_KEYS) {
    const prev = saved[key]
    if (prev === undefined) delete process.env[key]
    else mutableEnv[key] = prev
  }
}

async function loadEndpoints() {
  // Bust the module cache so env reads re-evaluate.
  const href = new URL("../../config/endpoints.ts", import.meta.url).href
  const bust = `${href}?t=${Date.now()}-${Math.random()}`
  return import(bust)
}

describe("lib/config/endpoints", () => {
  afterEach(() => {
    restoreEnv()
  })

  it("returns documented defaults when env is unset", async () => {
    stashEnv()
    mutableEnv.NODE_ENV = "development"
    const ep = await loadEndpoints()
    assert.equal(ep.SCREENSHOTONE_API_URL, "https://api.screenshotone.com/take")
    assert.equal(ep.FIREFLIES_GRAPHQL_URL, "https://api.fireflies.ai/graphql")
    assert.equal(ep.MYHOURS_API_BASE, "https://api2.myhours.com/api")
    assert.equal(ep.MS_GRAPH_BASE_URL, "https://graph.microsoft.com/v1.0")
    assert.equal(ep.MS_LOGIN_BASE_URL, "https://login.microsoftonline.com")
    assert.equal(ep.MS_GRAPH_SCOPE, "https://graph.microsoft.com/.default")
    assert.equal(ep.XERO_IDENTITY_URL, "https://identity.xero.com/connect/token")
    assert.equal(ep.XERO_API_BASE, "https://api.xero.com/api.xro/2.0")
    assert.equal(ep.XERO_APP_BASE, "https://go.xero.com")
    assert.equal(ep.XANO_EXPORT_INSTANCE_URL, "https://xg4h-uyzs-dtex.a2.xano.io")
    assert.equal(ep.FACEBOOK_GRAPH_URL, "https://graph.facebook.com")
    assert.equal(
      ep.APP_ASSET_BASE_URL,
      "https://hebbkx1anhila5yf.public.blob.vercel-storage.com",
    )
    assert.equal(ep.resolvePublicOrigin(), "http://localhost:3000")
  })

  it("returns the env value when set", async () => {
    stashEnv()
    mutableEnv.NODE_ENV = "development"
    process.env.SCREENSHOTONE_API_URL = "https://shot.example/take"
    process.env.FIREFLIES_GRAPHQL_URL = "https://ff.example/graphql"
    process.env.MYHOURS_API_BASE = "https://mh.example/api"
    process.env.MS_GRAPH_BASE_URL = "https://graph.example/v1.0"
    process.env.MS_LOGIN_BASE_URL = "https://login.example"
    process.env.MS_GRAPH_SCOPE = "https://graph.example/.default"
    process.env.XERO_IDENTITY_URL = "https://id.xero.example/token"
    process.env.XERO_API_BASE = "https://api.xero.example/2.0"
    process.env.XERO_APP_BASE = "https://app.xero.example"
    process.env.XANO_EXPORT_INSTANCE_URL = "https://xano.example"
    process.env.FACEBOOK_GRAPH_URL = "https://fb.example"
    process.env.APP_ASSET_BASE_URL = "https://assets.example"
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example/"

    const ep = await loadEndpoints()
    assert.equal(ep.SCREENSHOTONE_API_URL, "https://shot.example/take")
    assert.equal(ep.FIREFLIES_GRAPHQL_URL, "https://ff.example/graphql")
    assert.equal(ep.MYHOURS_API_BASE, "https://mh.example/api")
    assert.equal(ep.MS_GRAPH_BASE_URL, "https://graph.example/v1.0")
    assert.equal(ep.MS_LOGIN_BASE_URL, "https://login.example")
    assert.equal(ep.MS_GRAPH_SCOPE, "https://graph.example/.default")
    assert.equal(ep.XERO_IDENTITY_URL, "https://id.xero.example/token")
    assert.equal(ep.XERO_API_BASE, "https://api.xero.example/2.0")
    assert.equal(ep.XERO_APP_BASE, "https://app.xero.example")
    assert.equal(ep.XANO_EXPORT_INSTANCE_URL, "https://xano.example")
    assert.equal(ep.FACEBOOK_GRAPH_URL, "https://fb.example")
    assert.equal(ep.APP_ASSET_BASE_URL, "https://assets.example")
    assert.equal(ep.resolvePublicOrigin(), "https://app.example")
  })

  it("resolvePublicOrigin prefers NEXT_PUBLIC_APP_URL then AUTH0 then VERCEL_URL", async () => {
    stashEnv()
    mutableEnv.NODE_ENV = "production"
    process.env.VERCEL_URL = "preview.vercel.app"
    let ep = await loadEndpoints()
    assert.equal(ep.resolvePublicOrigin(), "https://preview.vercel.app")

    process.env.AUTH0_BASE_URL = "https://auth.example/"
    ep = await loadEndpoints()
    assert.equal(ep.resolvePublicOrigin(), "https://auth.example")

    process.env.NEXT_PUBLIC_APP_URL = "https://app.example"
    ep = await loadEndpoints()
    assert.equal(ep.resolvePublicOrigin(), "https://app.example")
  })
})
