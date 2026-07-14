#!/usr/bin/env node
/**
 * X5.1 — mba_line_approvals
 *
 * Creates table + btree indexes, GET + bulk PATCH in media_plans (RaUx9FOa / id 8),
 * then LIVE round-trip proving absence = approved (all-in).
 *
 * Requires a fresh Metadata API Access Token in:
 *   xano-metadata-token.txt
 * (Xano → Account → Metadata API → Generate access token with
 *  workspace:database + workspace:api create scopes)
 *
 * Usage:
 *   node scripts/x5-1-mba-line-approvals.mjs
 *   node scripts/x5-1-mba-line-approvals.mjs --roundtrip-only
 */
import fs from "node:fs"
import path from "node:path"

const ROOT = process.cwd()
const META_TOKEN_PATH = path.join(ROOT, "xano-metadata-token.txt")
const ROUNDTRIP_ONLY = process.argv.includes("--roundtrip-only")

function loadEnvLocal() {
  const p = path.join(ROOT, ".env.local")
  if (!fs.existsSync(p)) return
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (!m) continue
    let v = m[2].trim()
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1)
    }
    if (!process.env[m[1]]) process.env[m[1]] = v
  }
}

loadEnvLocal()

const MEDIA_BASE = (
  process.env.XANO_MEDIA_PLANS_BASE_URL ||
  process.env.XANO_MEDIAPLANS_BASE_URL ||
  ""
).replace(/\/$/, "")
const LIVE_KEY = process.env.XANO_API_KEY || ""
const INSTANCE_ORIGIN = (() => {
  try {
    return new URL(MEDIA_BASE).origin
  } catch {
    return "https://xg4h-uyzs-dtex.a2.xano.io"
  }
})()
const META_BASE = `${INSTANCE_ORIGIN}/api:meta`
const APIGROUP_ID = 8 // media_plans / RaUx9FOa

function readMetaToken() {
  if (!fs.existsSync(META_TOKEN_PATH)) {
    throw new Error(`Missing ${META_TOKEN_PATH}`)
  }
  return fs.readFileSync(META_TOKEN_PATH, "utf8").trim()
}

function tokenExpiry(token) {
  try {
    const payload = JSON.parse(
      Buffer.from(token.split(".")[1], "base64url").toString("utf8")
    )
    return payload?.xano?.expires_at ?? null
  } catch {
    return null
  }
}

async function meta(method, rel, { body, contentType } = {}) {
  const token = readMetaToken()
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  }
  if (body != null) {
    headers["Content-Type"] = contentType || "application/json"
  }
  const res = await fetch(`${META_BASE}${rel}`, {
    method,
    headers,
    body:
      body == null
        ? undefined
        : typeof body === "string"
          ? body
          : JSON.stringify(body),
  })
  const text = await res.text()
  let json
  try {
    json = JSON.parse(text)
  } catch {
    json = { raw: text.slice(0, 800) }
  }
  return { status: res.status, ok: res.ok, json, text }
}

async function live(method, pathRel, body) {
  const res = await fetch(`${MEDIA_BASE}${pathRel}`, {
    method,
    headers: {
      Authorization: `Bearer ${LIVE_KEY}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: body == null ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  let json
  try {
    json = JSON.parse(text)
  } catch {
    json = { raw: text.slice(0, 800) }
  }
  return { status: res.status, ok: res.ok, json, text }
}

const TABLE_SCHEMA = [
  {
    name: "id",
    type: "int",
    description: "",
    nullable: false,
    default: "",
    required: true,
    access: "public",
    style: "single",
  },
  {
    name: "mba_number",
    type: "text",
    description: "MBA number (campaign key)",
    nullable: false,
    default: "",
    required: true,
    format: "",
    access: "public",
    style: "single",
    validators: { trim: true },
  },
  {
    name: "media_plan_version",
    type: "int",
    description: "Media plan version number (int), not table id",
    nullable: false,
    default: "0",
    required: true,
    access: "public",
    style: "single",
  },
  {
    name: "line_item_id",
    type: "text",
    description: "Canonical billing line id",
    nullable: false,
    default: "",
    required: true,
    format: "",
    access: "public",
    style: "single",
    validators: { trim: true },
  },
  {
    name: "media_type",
    type: "text",
    description: "Media type label for the line",
    nullable: false,
    default: "",
    required: false,
    format: "",
    access: "public",
    style: "single",
    validators: { trim: true },
  },
  {
    name: "approved",
    type: "bool",
    description:
      "false = excluded from MBA. Absence of row = approved (all-in).",
    nullable: false,
    default: "true",
    required: false,
    access: "public",
    style: "single",
  },
  {
    name: "approved_in_version",
    type: "int",
    description: "Version in which line was (re-)approved; null when excluded",
    nullable: true,
    default: "",
    required: false,
    access: "public",
    style: "single",
  },
]

const TABLE_INDEXES = [
  { type: "primary", fields: [{ name: "id" }] },
  {
    type: "btree",
    fields: [{ name: "mba_number" }, { name: "media_plan_version" }],
  },
  { type: "btree", fields: [{ name: "line_item_id" }] },
]

/** XanoScript: GET mba_line_approvals?mba_number=&media_plan_version= */
const GET_XS = `// X5.1 — list line approval rows for an MBA version (absence = approved)
query mba_line_approvals verb=GET {
  input {
    text mba_number filters=trim
    int media_plan_version
  }

  stack {
    db.query mba_line_approvals {
      where = $db.mba_number == $input.mba_number && $db.media_plan_version == $input.media_plan_version
      return = {type: "list"}
    } as $rows
  }

  response = $rows
}
`

/**
 * Bulk PATCH: upsert exclusions (approved=false); delete row when approved=true
 * so absence remains the all-in default.
 */
const PATCH_XS = `// X5.1 — bulk approve/exclude MBA lines for a version
query mba_line_approvals verb=PATCH {
  input {
    text mba_number filters=trim
    int media_plan_version
    json lines
  }

  stack {
    var $results {
      value = []
    }

    foreach ($input.lines) {
      each as $line {
        var $line_id {
          value = $line.line_item_id|to_text
        }
        var $media_type {
          value = $line.media_type|to_text
        }
        var $approved {
          value = $line.approved|to_bool
        }

        db.query mba_line_approvals {
          where = $db.mba_number == $input.mba_number && $db.media_plan_version == $input.media_plan_version && $db.line_item_id == $line_id
          return = {type: "single"}
        } as $existing

        conditional {
          if ($approved == true) {
            conditional {
              if ($existing != null) {
                db.del mba_line_approvals {
                  field_name = "id"
                  field_value = $existing.id
                }
              }
            }
            var $results {
              value = $results|push:{line_item_id: $line_id, action: "approved_absent", approved: true}
            }
          }
          else {
            conditional {
              if ($existing != null) {
                db.edit mba_line_approvals {
                  field_name = "id"
                  field_value = $existing.id
                  data = {
                    media_type         : $media_type
                    approved           : false
                    approved_in_version: null
                  }
                } as $saved
              }
              else {
                db.add mba_line_approvals {
                  data = {
                    mba_number         : $input.mba_number
                    media_plan_version : $input.media_plan_version
                    line_item_id       : $line_id
                    media_type         : $media_type
                    approved           : false
                    approved_in_version: null
                  }
                } as $saved
              }
            }
            var $results {
              value = $results|push:{line_item_id: $line_id, action: "excluded", approved: false}
            }
          }
        }
      }
    }
  }

  response = {
    mba_number        : $input.mba_number
    media_plan_version: $input.media_plan_version
    results           : $results
  }
}
`

async function resolveWorkspaceId() {
  const res = await meta("GET", "/workspace")
  if (!res.ok) {
    throw new Error(
      `GET /workspace ${res.status}: ${JSON.stringify(res.json)}`
    )
  }
  const list = Array.isArray(res.json) ? res.json : res.json?.items || []
  if (!list.length) throw new Error("No workspaces returned")
  // Prefer workspace that owns media_plans apigroup id 8
  for (const w of list) {
    const ag = await meta("GET", `/workspace/${w.id}/apigroup`)
    const groups = Array.isArray(ag.json) ? ag.json : ag.json?.items || []
    if (groups.some((g) => g.id === APIGROUP_ID || g.canonical === "RaUx9FOa")) {
      return w.id
    }
  }
  return list[0].id
}

async function ensureTable(workspaceId) {
  const list = await meta("GET", `/workspace/${workspaceId}/table`)
  const tables = Array.isArray(list.json) ? list.json : list.json?.items || []
  const existing = tables.find((t) => t.name === "mba_line_approvals")
  if (existing) {
    console.log("table exists", existing.id)
    return existing.id
  }

  const create = await meta("POST", `/workspace/${workspaceId}/table`, {
    body: {
      name: "mba_line_approvals",
      description:
        "X5.1 MBA line include/exclude. Absence of a row = approved (all-in).",
      docs: "GET by (mba_number, media_plan_version). PATCH bulk approve/exclude. Missing row ⇒ approved.",
      auth: false,
      schema: TABLE_SCHEMA,
      index: TABLE_INDEXES,
      tag: ["finance", "x5.1"],
    },
  })
  if (!create.ok) {
    // Fallback: create empty then add schema via XanoScript
    const xs = await meta(
      "POST",
      `/workspace/${workspaceId}/table?include_xanoscript=true`,
      {
        body: `table mba_line_approvals {
  auth = false
  description = "X5.1 MBA line include/exclude. Absence of a row = approved (all-in)."
  schema {
    int id
    text mba_number filters=trim
    int media_plan_version
    text line_item_id filters=trim
    text media_type filters=trim
    bool approved?=true
    int approved_in_version?
  }
  index = [
    {type: "primary", fields: [{name: "id"}]}
    {type: "btree", fields: [{name: "mba_number"}, {name: "media_plan_version"}]}
    {type: "btree", fields: [{name: "line_item_id"}]}
  ]
}
`,
        contentType: "text/x-xanoscript",
      }
    )
    if (!xs.ok) {
      throw new Error(
        `CREATE table failed JSON ${create.status} ${JSON.stringify(create.json)} / XS ${xs.status} ${JSON.stringify(xs.json)}`
      )
    }
    console.log("table created via XanoScript", xs.json?.id || xs.json)
    return xs.json.id
  }
  console.log("table created", create.json.id)
  return create.json.id
}

async function ensureEndpoint(workspaceId, verb, xanoscript) {
  const list = await meta(
    "GET",
    `/workspace/${workspaceId}/apigroup/${APIGROUP_ID}/api`
  )
  const apis = Array.isArray(list.json) ? list.json : list.json?.items || []
  const existing = apis.find(
    (a) => a.name === "mba_line_approvals" && a.verb === verb
  )
  if (existing) {
    console.log(`${verb} mba_line_approvals exists`, existing.id, "— updating XS")
    const upd = await meta(
      "PUT",
      `/workspace/${workspaceId}/apigroup/${APIGROUP_ID}/api/${existing.id}?include_xanoscript=true`,
      { body: xanoscript, contentType: "text/x-xanoscript" }
    )
    if (!upd.ok) {
      // some instances use PATCH
      const upd2 = await meta(
        "PATCH",
        `/workspace/${workspaceId}/apigroup/${APIGROUP_ID}/api/${existing.id}?include_xanoscript=true`,
        { body: xanoscript, contentType: "text/x-xanoscript" }
      )
      if (!upd2.ok) {
        console.warn(
          `update ${verb} failed`,
          upd.status,
          JSON.stringify(upd.json).slice(0, 300),
          upd2.status,
          JSON.stringify(upd2.json).slice(0, 300)
        )
      } else {
        console.log(`updated ${verb}`, upd2.json?.id)
      }
    } else {
      console.log(`updated ${verb}`, upd.json?.id)
    }
    return existing.id
  }

  const created = await meta(
    "POST",
    `/workspace/${workspaceId}/apigroup/${APIGROUP_ID}/api?include_xanoscript=true`,
    { body: xanoscript, contentType: "text/x-xanoscript" }
  )
  if (!created.ok) {
    throw new Error(
      `CREATE ${verb} mba_line_approvals failed ${created.status}: ${JSON.stringify(created.json)}`
    )
  }
  console.log(`created ${verb}`, created.json?.id, created.json?.xanoscript?.status)
  if (created.json?.xanoscript?.status === "error") {
    throw new Error(
      `XanoScript error for ${verb}: ${created.json.xanoscript.message}`
    )
  }
  return created.json.id
}

async function roundTrip() {
  if (!MEDIA_BASE || !LIVE_KEY) {
    throw new Error("Need XANO_MEDIA_PLANS_BASE_URL + XANO_API_KEY for LIVE RT")
  }
  const mba = `X51RT-${Date.now()}`
  const version = 1
  const lineId = "billing-probe::line-a"

  console.log("\n=== LIVE round-trip ===")
  console.log({ mba, version, lineId })

  const empty = await live(
    "GET",
    `/mba_line_approvals?mba_number=${encodeURIComponent(mba)}&media_plan_version=${version}`
  )
  console.log("1) GET (expect [] / all-in)", empty.status, JSON.stringify(empty.json).slice(0, 200))
  if (!empty.ok) {
    throw new Error(`GET failed — endpoints not LIVE yet: ${empty.status} ${empty.text.slice(0, 300)}`)
  }
  const emptyRows = Array.isArray(empty.json)
    ? empty.json
    : empty.json?.items || empty.json?.rows || []
  if (emptyRows.length !== 0) {
    throw new Error("Expected empty list for new mba_number (all-in)")
  }
  console.log("   ✓ absence = approved (no rows)")

  const exclude = await live("PATCH", "/mba_line_approvals", {
    mba_number: mba,
    media_plan_version: version,
    lines: [
      {
        line_item_id: lineId,
        media_type: "TV",
        approved: false,
      },
    ],
  })
  console.log("2) PATCH exclude", exclude.status, JSON.stringify(exclude.json).slice(0, 300))
  if (!exclude.ok) throw new Error(`PATCH exclude failed: ${exclude.text.slice(0, 400)}`)

  const afterExclude = await live(
    "GET",
    `/mba_line_approvals?mba_number=${encodeURIComponent(mba)}&media_plan_version=${version}`
  )
  console.log("3) GET after exclude", afterExclude.status, JSON.stringify(afterExclude.json).slice(0, 400))
  const exRows = Array.isArray(afterExclude.json)
    ? afterExclude.json
    : afterExclude.json?.items || []
  const hit = exRows.find((r) => r.line_item_id === lineId && r.approved === false)
  if (!hit) throw new Error("Excluded row not found on GET")
  console.log("   ✓ excluded row present (approved=false)")

  const approve = await live("PATCH", "/mba_line_approvals", {
    mba_number: mba,
    media_plan_version: version,
    lines: [
      {
        line_item_id: lineId,
        media_type: "TV",
        approved: true,
      },
    ],
  })
  console.log("4) PATCH approve (delete → absent)", approve.status, JSON.stringify(approve.json).slice(0, 300))
  if (!approve.ok) throw new Error(`PATCH approve failed: ${approve.text.slice(0, 400)}`)

  const afterApprove = await live(
    "GET",
    `/mba_line_approvals?mba_number=${encodeURIComponent(mba)}&media_plan_version=${version}`
  )
  const apRows = Array.isArray(afterApprove.json)
    ? afterApprove.json
    : afterApprove.json?.items || []
  const gone = apRows.find((r) => r.line_item_id === lineId)
  if (gone) throw new Error("Approved line should be absent (all-in), but row remains")
  console.log("5) GET after approve", afterApprove.status, `rows=${apRows.length}`)
  console.log("   ✓ row removed — absence = approved again")

  return { mba, version, lineId, ok: true }
}

async function main() {
  console.log(
    JSON.stringify(
      {
        instance: INSTANCE_ORIGIN,
        mediaGroup: MEDIA_BASE,
        meta: META_BASE,
        tokenExpires: tokenExpiry(readMetaToken()),
        roundtripOnly: ROUNDTRIP_ONLY,
      },
      null,
      2
    )
  )

  if (ROUNDTRIP_ONLY) {
    const rt = await roundTrip()
    console.log("\nREPORT", JSON.stringify({ status: "LIVE_OK", ...rt }, null, 2))
    return
  }

  // Auth check
  const auth = await meta("GET", "/workspace")
  if (!auth.ok) {
    console.error("\n=== X5.1 BLOCKED ===")
    console.error(
      "Metadata API token invalid/expired.",
      "expires_at hint:",
      tokenExpiry(readMetaToken())
    )
    console.error(
      "Refresh: Xano → Account / Metadata API → Generate Access Token"
    )
    console.error(
      "Paste the JWT into xano-metadata-token.txt (overwrite), then re-run:"
    )
    console.error("  node scripts/x5-1-mba-line-approvals.mjs")
    console.error("Upstream:", auth.status, JSON.stringify(auth.json))
    process.exit(2)
  }

  const workspaceId = await resolveWorkspaceId()
  console.log("workspace_id", workspaceId)

  const tableId = await ensureTable(workspaceId)
  await ensureEndpoint(workspaceId, "GET", GET_XS)
  await ensureEndpoint(workspaceId, "PATCH", PATCH_XS)

  // Brief settle then LIVE RT
  await new Promise((r) => setTimeout(r, 1500))
  const rt = await roundTrip()

  console.log(
    "\n=== X5.1 REPORT ===\n" +
      JSON.stringify(
        {
          status: "COMPLETE",
          workspace_id: workspaceId,
          table: { name: "mba_line_approvals", id: tableId },
          indexes: [
            "primary(id)",
            "btree(mba_number, media_plan_version)",
            "btree(line_item_id)",
          ],
          endpoints: {
            group: "media_plans (RaUx9FOa / id 8)",
            GET: "/mba_line_approvals?mba_number=&media_plan_version=",
            PATCH: "/mba_line_approvals  body:{mba_number,media_plan_version,lines:[{line_item_id,media_type,approved}]}",
          },
          semantics:
            "Absence of a row = approved (all-in). PATCH approved=true deletes row; approved=false upserts exclusion.",
          live_roundtrip: rt,
        },
        null,
        2
      )
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
