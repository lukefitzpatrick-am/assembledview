# MI Empty Discovery

Discovery only — no code changes. Repo root `c:\Projects\avmediaplan`, 2026-07-12.

---

## 1. Which Xano endpoint fetches campaign structure? Is `version` passed through?

### Call chain

`generateMiWorkbook.ts` does **not** call Xano directly. It calls:

```93:93:lib/ava/tools/generateMiWorkbook.ts
      const lineItems = await fetchAllMediaContainerLineItems(scopedMba.mba)
```

Same pattern in `startMiInterview.ts` (line 98): `fetchAllMediaContainerLineItems(scopedMba.mba)` — MBA only.

### Endpoints (not one — one per media type)

`fetchAllMediaContainerLineItems` fans out to **every** key in `MEDIA_CONTAINER_ENDPOINTS` via `fetchMediaContainerLineItems` → `buildMediaContainerUrl`:

```67:88:lib/api/media-containers.ts
export const MEDIA_CONTAINER_ENDPOINTS = {
  television: 'television_line_items',
  radio: 'radio_line_items',
  newspaper: 'newspaper_line_items',
  magazines: 'magazines_line_items',
  ooh: 'ooh_line_items',
  cinema: 'cinema_line_items',
  digitalDisplay: 'media_plan_digi_display',
  digitalAudio: 'digital_audio_line_items',
  digitalVideo: 'digital_video_line_items',
  bvod: 'bvod_line_items',
  integration: 'integration_line_items',
  search: 'search_line_items',
  socialMedia: 'social_media_line_items',
  progDisplay: 'prog_display_line_items',
  progVideo: 'prog_video_line_items',
  progBvod: 'prog_bvod_line_items',
  progAudio: 'prog_audio_line_items',
  progOoh: 'media_plan_prog_ooh',
  influencers: 'influencers_line_items',
  production: 'media_plan_production',
}
```

### Fetch URL + params (quoted)

```8:25:lib/api/media-containers.ts
function buildMediaContainerUrl(
  mediaType: keyof typeof MEDIA_CONTAINER_ENDPOINTS,
  mbaNumber: string,
  versionNumber?: number
) {
  // Query by BOTH mba_number AND version_number when available
  // This ensures we get exact matches instead of filtering in JavaScript
  const params = new URLSearchParams()
  params.append('mba_number', mbaNumber.trim())
  
  // Include version_number, mp_plannumber, and media_plan_version parameters when versionNumber is provided
  if (versionNumber !== undefined && versionNumber !== null) {
    params.append('version_number', String(versionNumber))
    params.append('mp_plannumber', String(versionNumber))
    params.append('media_plan_version', String(versionNumber))
  }

  return `${xanoUrl(MEDIA_CONTAINER_ENDPOINTS[mediaType], ["XANO_MEDIA_CONTAINERS_BASE_URL", "XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"])}?${params.toString()}`
}
```

Base resolution order: `XANO_MEDIA_CONTAINERS_BASE_URL` → `XANO_MEDIA_PLANS_BASE_URL` → `XANO_MEDIAPLANS_BASE_URL`.

When `versionNumber` is omitted (MI path), the query is **only** `mba_number=<mba>`.

### Is the page `?version=` query param passed through?

**No.** Confidence: **95%+**.

Evidence:

| Layer | Version present? |
|--------|------------------|
| `generate_mi_workbook` tool schema | Only `mba` / `mbaNumber` / `answers` — no `version` |
| Call site | `fetchAllMediaContainerLineItems(scopedMba.mba)` — 1 arg |
| Ava page context (`PageContext.entities`) | `clientSlug`, `mbaNumber`, `campaignName`, `mediaTypes` — **no version** |
| `deriveAvaIdentifiers` in `app/api/chat-v2/route.ts` | Extracts client + MBA only |

Contrast: the campaigns page API **does** pass version (`fetchAllMediaContainerLineItems(mba_number, versionNumber, …)` in `app/api/campaigns/[mba_number]/route.ts`). The MI tools do not.

**Implication:** MI workbook/interview load **all MBA line items** (any version fields present), not the editor’s selected version.

---

## 2. How are line-item publisher labels matched to mi-library keys?

**Not exact string match on filenames.** Pipeline is: field pick → alias map / normalisation → exact slug lookup. Confidence: **95%+**.

### Step A — which line-item fields become the publisher label

```119:119:lib/specs/resolve.ts
      const publisher = firstString(row, ["publisher", "platform", "network", "site"])
```

Channel key (`socialMedia`, `search`, …) is **not** matched to mi-library; it only drives container category (`containerFor`).

### Step B — normalisation + alias map → proposed slug

```148:158:lib/specs/library.ts
export function slugifyPublisher(publisher: string): string {
  if (!publisher) return ""
  const stripped = stripBuyingPlatformSuffix(publisher)
  const p = stripped.trim().toLowerCase()
  if (PUBLISHER_ALIASES[p]) return PUBLISHER_ALIASES[p]
  // Case-insensitive alias keys that preserve punctuation (e.g. oOh!media)
  for (const [alias, slug] of Object.entries(PUBLISHER_ALIASES)) {
    if (alias.toLowerCase() === p) return slug
  }
  return p.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
}
```

`stripBuyingPlatformSuffix` removes trailing ` - AM` / ` - DV360` / ` - CM360` (case-insensitive) before alias lookup.

`PUBLISHER_ALIASES` (excerpt): `"google ads" → "google-ads"`, `"meta"|"facebook"|"instagram"|"fb" → "meta"`, `"ooh!media"|"ooh media" → "ooh-media"`, `"dv360"|"cm360" → "assembled-programmatic"`, etc. (`lib/specs/library.ts` ~101–138).

### Step C — exact match on `publisher_slug` (not filename)

```233:257:lib/specs/resolve.ts
function resolvePublisher(
  line: IndexedLine,
  library: LoadedMiLibrary,
  answers: Map<string, string>,
): { slug: string | null; record: MiPublisherRecord | null; question?: MiOpenQuestion; needsSpec: boolean } {
  const appliesTo = `publisher:${line.line_item_id}`
  const answer = answerFor(answers, appliesTo)
  const proposed = answer ?? slugifyPublisher(line.publisher)
  if (answer?.toLowerCase() === "not in library") {
    return { slug: null, record: null, needsSpec: true }
  }
  const record = library.bySlug.get(proposed)
  if (record) return { slug: proposed, record, needsSpec: false }
  return {
    slug: null,
    record: null,
    needsSpec: false,
    question: question(
      line,
      "publisher",
      "choice",
      `Which publisher matches “${line.publisher || "this row"}”?`,
      [...nearestPublisherSlugs(line.publisher, library), "not in library"],
    ),
  }
}
```

Library index: `bySlug.set(raw.publisher_slug, raw)` from each JSON’s **`publisher_slug` field** (`loadMiLibrary`). Filenames are load paths only; lookup key is the slug.

If slug miss: fuzzy `nearestPublisherSlugs` (token / includes / levenshtein≤2) offers up to 5 choices for the interview — that is **not** auto-match.

**Verdict:** mapping table (`PUBLISHER_ALIASES`) + normalisation (lowercasing, buying-platform suffix strip, kebab fallback) + **exact** `bySlug.get(proposed)`.

---

## 3. mi-library publisher keys vs jayco001 labels (version 7)

### mi-library publisher keys (filenames → `publisher_slug`)

| Filename | `publisher_slug` | `publisher_name` |
|----------|------------------|------------------|
| `assembled-programmatic.json` | `assembled-programmatic` | Assembled Programmatic (internal default specs) |
| `cartology.json` | `cartology` | Cartology |
| `civic-outdoor.json` | `civic-outdoor` | Civic Outdoor |
| `google-ads.json` | `google-ads` | Google Ads |
| `linkby.json` | `linkby` | Linkby |
| `meta.json` | `meta` | Meta (Facebook + Instagram) |
| `news-corp.json` | `news-corp` | News Corp Australia |
| `ooh-media.json` | `ooh-media` | oOh!media |
| `quantcast.json` | `quantcast` | Quantcast |
| `seven.json` | `seven` | Seven Network |
| `tiktok.json` | `tiktok` | TikTok |
| `tonic.json` | `tonic` | Tonic Media Network |
| `twitch.json` | `twitch` | Twitch (via Amazon Ads) |
| `youtube.json` | `youtube` | YouTube (via Google Ads) |

Non-publisher files in the same dir: `VERSION.json`, `template_structure.json`.

Note: `PUBLISHER_ALIASES` also maps `jcdecaux`, `qms`, `nine`, `ten` — **no** matching JSON files for those slugs (would fall through to interview / needs_spec).

### jayco001 version 7 — live Xano sample

**Attempted read-only live fetch; not usable.** Confidence on “could not retrieve live labels”: **90%**.

- Loaded `.env.local`; called each `MEDIA_CONTAINER_ENDPOINTS` path with  
  `mba_number=jayco001&version_number=7&mp_plannumber=7&media_plan_version=7`.
- Result: **HTTP 404 on all 20** endpoints against the first configured base (`XANO_MEDIA_CONTAINERS_BASE_URL` / same host+api group as media-plans in this env).
- Local Next route `GET /api/campaigns/jayco001?version=7` returned **401** (auth required).

So **no live Xano row dump** for jayco001 v7 publisher/channel labels from this session.

### jayco001 version 7 — local snapshot (proxy)

Source: `scripts/data/kpi-best-practice/campaign-backfill-report.json` (not a live Xano response; KPI backfill staging). Confidence that these were the v7 publishers at snapshot time: **~85%** (flagged &lt;90%).

From `inScopePlans`:

- `mba_number=jayco001`, `version_number=7`, `campaign_status=booked`, `rowCount=2`

From `stagedPatches` for that MBA/version:

| id | media_type (channel key) | publisher label |
|----|--------------------------|-----------------|
| 2258 | `search` | `google ads - am` |
| 2259 | `socialMedia` | `meta` |

### Would those labels resolve against mi-library?

| Line label | After `slugifyPublisher` | Library hit? |
|------------|--------------------------|--------------|
| `google ads - am` | strip ` - am` → `google ads` → alias `google-ads` | Yes → `google-ads.json` |
| `meta` | alias `meta` | Yes → `meta.json` |

(Derived from code; not re-run against live data.)

---

## Confidence summary

| Finding | Confidence |
|---------|------------|
| Campaign structure = parallel media-container line-item endpoints | **95%+** |
| MI path does **not** pass page `version` | **95%+** |
| Publisher match = aliases + normalise + exact `publisher_slug` | **95%+** |
| mi-library key inventory (14 publishers) | **95%+** |
| Live jayco001 v7 Xano labels | **Unavailable** (404/401); snapshot labels **~85%** |

---

## Hard stops / gaps

1. Live Xano sample for jayco001 v7 failed in this environment — use authenticated app session or fix/confirm which Xano API group hosts `*_line_items` before treating snapshot labels as ground truth.
2. MI export ignores editor version; empty / wrong-version workbooks may be an MBA-wide fetch artefact, not only missing library coverage.
