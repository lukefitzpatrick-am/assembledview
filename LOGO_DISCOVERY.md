# LOGO DISCOVERY — F8 client + publisher logos

Read-only recon (2026-07-11). Answers whether a Xano field is needed (Lane A vs B),
whether creative Blob storage can host brand assets, how publisher logos should key,
and an informed render-points menu for Luke. **No code changes in this commit.**

---

## 1. Client brand fields today — Lane A vs Lane B

### Shape the app actually receives / writes

**Dashboard client summary** (`lib/types/dashboard.ts` → `ClientDashboardData`):

```ts
{
  clientName: string
  brandColour?: string          // from Xano `brand_colour`
  clientRecord?: Record<string, unknown> | null  // raw Xano row (admin edit)
  clientLogo?: string | null    // merged by pages from raw row (see below)
  // …spend / campaign lists…
}
```

**Xano clients collection usage (confirmed in write forms + dashboard loaders):**

| Field | In Edit/Add client forms? | Used in UI today? |
| --- | --- | --- |
| `brand_colour` | Yes (hex) | Yes — heroes, charts, finance colour maps |
| Platform IDs (`idmeta`, `idgoogleads`, …) | Yes | Yes — Meta Graph avatar for creative mockups |
| `logo` / `client_logo` | **No** | Read-only probe on dashboard pages only |
| `dashboard_logo_url` | **No** | Theme helper only (`buildClientTheme`); **not** wired into dashboard pages |
| `brand_primary_hex` / `_dark` / `_tint` | **No** | Planned in `docs/client-dashboard/README.md` + `lib/client-dashboard/theme.ts` — still a Xano TODO |

**`ClientInfo` (media-plan fee helpers, `lib/api.ts`):**

```ts
interface ClientInfo {
  id: string
  name: string
  feesearch: number
  payment_days: number
  payment_terms: string
  brand_colour: string
}
```

No logo field on that shape.

### Existing logo / avatar usage

**Dashboard hero already has a logo slot.** Pages merge from the raw Xano row:

```27:32:app/client/[slug]/page.tsx
  const clientLogo =
    typeof clientRecord?.logo === 'string' && clientRecord.logo.trim()
      ? clientRecord.logo
      : typeof clientRecord?.client_logo === 'string' && clientRecord.client_logo.trim()
        ? clientRecord.client_logo
        : undefined
```

Same probe in `app/dashboard/[slug]/page.tsx`. That URL is passed to `HeroBanner` → `next/image`.

**Theme layer (parallel, unused by heroes today)** expects `dashboard_logo_url`:

```91:98:lib/client-dashboard/theme.ts
export type ClientDashboardBrandInput = {
  name?: string | null
  sub_name?: string | null
  dashboard_logo_url?: string | null
  brand_primary_hex?: string | null
  brand_primary_dark_hex?: string | null
  brand_primary_tint_hex?: string | null
}
```

`docs/client-dashboard/README.md` still lists these as **Xano TODO**.

**Mockup avatar uses `idmeta`, not a logo URL.** `CreativeAssetManager` / `CreativeCampaignPicker` resolve the client's `idmeta` from `/api/clients`, then `BrandAvatar` loads:

`https://graph.facebook.com/{idmeta}/picture?type=large`

On missing/broken → `brandInitials(name)` (`components/creative/mockups/social/shared.tsx`).

### Verdict — Xano field y/n

| Option | Meaning | Fit |
| --- | --- | --- |
| **Lane A** | Reuse an existing clients field for a logo URL | Only if live Xano already has `logo` and/or `client_logo` (or similar). App already *reads* those names; forms never write them. **Cannot verify live schema from the repo.** |
| **Lane B** | Add (or confirm empty) a dedicated URL field + admin write path | Matches the already-designed `dashboard_logo_url` contract and the missing Edit Client upload surface. |

**Recommendation: Lane B.** Treat durable storage as a Xano string URL on `clients` (prefer one canonical name: `dashboard_logo_url`; alias-read `logo` / `client_logo` during migration if they exist). Brand colour alone is not enough for logos. `idmeta` is Meta-only and unsuitable as a general brand mark.

**Hard stop / untraceable:** whether `logo` / `client_logo` columns exist and are populated in production Xano — needs a one-shot Luke check in Xano UI or a sample GET.

---

## 2. Storage — creative Blob vs brand assets

### What creative helpers do today

| Piece | Behaviour |
| --- | --- |
| Upload | `@vercel/blob/client` `upload(..., { access: "private" })` → `creative/{mba}/…` (`CreativeUploadZone`) |
| Token | `BLOB_READ_WRITE_TOKEN` — README: **private SYD1 store** |
| Serve | Authenticated Next proxies: `GET /api/creative-assets/[id]/download` and `…/preview` call `get(url, { access: "private" })` then stream |
| Mockups | `<img src={/api/creative-assets/${id}/download}>` — same-origin + session cookie |
| MI export | `put(..., { access: "private" })` then `getDownloadUrl(blob.url)` (`lib/specs/storeMiExport.ts`) — **signed URL** |

### Implication for logos in `<img>` / email / Excel

Private creative Blob **can** store small PNGs technically, but the **access pattern is wrong for brand chrome**:

1. **Signed / private URLs expire** — fine for one-shot downloads; broken for long-lived `<img>` srcs, SendGrid HTML, cached dashboards, and anyone opening an old email.
2. Creative download routes require **Auth0 session** (+ MBA ACL for clients) — useless inside Excel/PPTX/email and awkward for public-ish marketing surfaces.
3. Existing export logos already use **repo static files** baked to base64 at generation time (`/assembled-logo.png` in `lib/generateMediaPlan.ts`, MBA/SOW/billing PDFs).

### Recommended pattern for F8

| Use case | Pattern |
| --- | --- |
| In-app heroes / cards | **Stable HTTPS URL** on the client row (public Blob, CDN, or Xano-hosted file URL) |
| Excel / PDF / PPTX | Fetch URL **at export time** → embed base64 (same as Assembled logo today) |
| Email (F5) | Prefer **public** absolute URL in the template, or host on a non-expiring CDN; do **not** put `getDownloadUrl` tokens in SendGrid |

**Do not reuse the MBA-scoped private creative store as the system of record for brand logos.** Optional: a separate public Blob prefix (`brand/clients/{id}/logo.png`) whose permanent URL is what you save to Xano.

---

## 3. Publisher logos

### App-side publisher entity — yes

Xano-backed `Publisher` (`lib/types/publisher.ts`): `id`, `publisher_name`, `publisherid`, media flags, **`publisher_colour`**, KPIs — **no logo / image field**. Hub UI (`PublishersPageClient`, `PublisherDetailClient`) uses **initials + colour** only.

### Other key spaces

| Key space | What it is | Logo-friendly? |
| --- | --- | --- |
| Xano publishers | Finance/hub entities; `publisherid` unique code | Good for **per-publisher** hub marks if you add a URL field later |
| Naming platforms | Fixed slugs: `cm360`, `dv360`, `youtube`, `meta`, `search`, `native` (`lib/naming/fromPlan.ts`) | Good for **static repo icons** on trafficking tabs |
| MI specs library | `publisher_slug` on format rows (`lib/specs/library.ts`) | Good for **static icons** on Meta/MI sheets keyed by slug |
| Pacing platform labels | Channel/platform strings in pacing UI | Label text today; icons optional |

### Recommendation

**v1 publisher logos = static repo assets keyed by platform / publisher slug** (e.g. `public/brands/platforms/meta.svg`), not a Xano column.

**Maintenance trade-off:** new platforms need a PR + asset; unknown publishers fall back to initials (already implemented). Adding `publisher_logo_url` on Xano is Lane B-for-publishers and only worth it if hub cards must show arbitrary vendor marks without deploys.

---

## 4. Candidate render points

Effort: **S** = wire existing URL + initials fallback; **M** = new header chrome / export embed / email template work.

| # | Surface | Path(s) | Source of image | Fallback (already exists) | Effort |
| --- | --- | --- | --- | --- | --- |
| 1 | **Client dashboard hero** | `components/dashboard/HeroBanner.tsx`; pages `app/dashboard/[slug]/page.tsx`, `app/client/[slug]/page.tsx` | Xano logo URL → `clientLogo` | `getClientInitials` in `HeroBanner` (first letters / 2-char single word) on `brandColour` pill | **S** — slot exists; needs durable URL + optional form |
| 2 | **Staff mediaplan header** | `components/mediaplans/MediaPlanEditorHero.tsx` (+ `PlanWizardShell`); campaign `CampaignHeroBanner.tsx` | Client `brand_colour` only today — **no logo slot** | Title + accent underline; no initials avatar on editor hero | **M** — add avatar slot mirroring `HeroBanner` |
| 3 | **Planning tool client surface** | `components/planning/StageBrief.tsx` (client picker); `StageCompare.tsx` badge `{brandOverride \|\| clientName}`; future P7-7 client section | Client logo URL once client selected (`brief.clientId`) | Text name / badge only today | **S–M** — small avatar beside picker / compare header |
| 4 | **Mockup avatar slot** | `components/creative/mockups/social/shared.tsx` → `BrandAvatar`; wired from `idmeta` via picker/manager | Meta Graph CDN via `idmeta` | `brandInitials` + hashed channel tone | **S** (optional) — keep Graph as default; override with client logo URL when set |
| 5 | **Trafficking / naming Excel export header** | `lib/naming/exportTraffickingWorkbook.ts` (`writeInputSheet` text header: brand/campaign/mba) | No image today; Assembled or client logo via `workbook.addImage` (pattern in `lib/generateMediaPlan.ts`) | Text header block | **M** — embed at export time |
| 6 | **MI workbook Meta sheet** | `lib/specs/buildMiWorkbook.ts` → `writeMetaSheet` (title + campaign/client fields only) | Client logo + optional Assembled mark as images | Text “MATERIAL INSTRUCTIONS” title | **M** — pairs with mi-port / `generate_mi_workbook` |
| 7 | **Pacing digest email** | Spec: `docs/sendgrid/pacing-template.md` (header: “agency logo”); payload builder path cited as `lib/email/pacing-summary-payload.ts` | **Public** client or Assembled logo URL in template vars | Text `client_name` sections | **M** — pairs with F5; see untraceable note |
| 8 | **PPTX export (future P7-6)** | `PLANNING_TOOL_BLUEPRINT.md` P7-6 — not implemented; Ava presentations skill is outline-only | Template placeholders (skill docs already mention client logo covers) | Text / empty picture frames | **M** (future) — bake logos when pptxgen lands |

### Initials patterns to reuse (quote)

**Client dashboard hero** (`HeroBanner`):

```ts
function getClientInitials(clientName: string): string {
  const parts = clientName.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return "?"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
}
```

**Client hub cards** (`app/client/ClientHubCard.tsx`) — same 2-letter rule.

**Finance cards** (`lib/finance/cardHelpers.ts` → `clientInitials`) — single-letter for one-word names (slightly different).

**Publisher hub** (`publisherInitials`) — same as `HeroBanner`.

**Creative mockups** (`brandInitials`) — same as `HeroBanner`, default `"B"`.

---

## 5. Decision list for Luke

### A. Render points for v1 (recommended)

Include:

1. **Client dashboard / client hub hero** (slot already live — highest ROI)
2. **Mockup avatar override** when logo URL exists (keep `idmeta` Graph fallback)
3. Optionally **planning brief header** avatar if planning ships in the same window

Defer:

- Staff mediaplan / campaign heroes (nice, not blocking)
- Trafficking Excel + MI Meta sheet embeds (do with export polish / mi-port)
- Pacing email logos (bundle with F5)
- PPTX (P7-6)

Publisher platform icons: **static assets only** in v1 if desired; not required to unblock client logos.

### B. Upload surface

**Yes — admin client settings / Edit Client form** (`components/EditClientForm.tsx` already owns `brand_colour` + platform IDs). Add:

- Logo URL field and/or small image upload that writes the public URL to Xano
- Preview + clear → initials

Do **not** invent a separate page unless Luke wants a dedicated brand kit; the existing client edit panel is the natural home.

### C. Xano y/n (from §1)

**Yes — Lane B.** Add (or formalise) a clients logo URL field. Prefer `dashboard_logo_url` to match `buildClientTheme` / client-dashboard docs; keep reading `logo` / `client_logo` as aliases if they already exist in Xano.

Luke check before BUILD: open one clients row in Xano and confirm whether `logo` / `client_logo` / `dashboard_logo_url` columns exist.

### D. Storage decision (from §2)

**Public (or permanently addressable) URL on the client row**, not private creative Blob signed URLs. Exports embed at generation time; email needs non-expiring URLs.

---

## Untraceable / hard stops

| Item | Status |
| --- | --- |
| Live Xano columns for `logo` / `client_logo` / `dashboard_logo_url` | **Unconfirmed** from repo — Lane A possible only if Luke finds them |
| `lib/email/pacing-summary-payload.ts` + send-daily-summary routes | **Cited in docs, not present in tree** at discovery time — F5 email logo work needs that payload rebuilt or located first |
| P7-6 PPTX implementation | **Not started** — logo slots are design-only |
| Blob store region | README says private SYD1 for creatives; no separate public brand store configured |

---

## Lane summary for F8 BUILD

| Lane | When | F8 work |
| --- | --- | --- |
| **A** | Luke confirms an existing clients URL field is already on Xano | Wire Edit form + unify page reads; skip schema add |
| **B** (default) | Field missing or empty / unnamed | Add Xano field + form upload + hero/mockup consumers |

End of discovery.
