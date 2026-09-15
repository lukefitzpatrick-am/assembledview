# D3 — Partner ingest as built, and what a second and third supplier need

Status: discovery  
Date: 2026-09-15  
Scope: read-only. No app code changed.  
Brain: `docs/brain/MAP.md` §3 Pacing (partner-file ingest); `docs/brain/modules/pacing.md`; `docs/brain/INVARIANTS.md` Partner file ingest; `docs/brain/DATA-MODEL.md` `RAW.PARTNER_*` + `delivery_source_map`; `docs/brain/KNOWN-ISSUES.md` C-90 (`partner_file` empty), C-115 (T5), C-116 (Graph app); `docs/brain/BLAST-RADIUS.md` `lib/partner-ingest/*`.

Goal: map the Channel Factory / Datorama mailbox pipeline as it exists, then say what Vistar and Broadsign would need so Programmatic OOH (`prog_ooh` / `PO`) delivery can land and show on dashboards.

Runbook named in the prompt (`av-review/runbook-channel-factory-datorama-rev3-2026-09-14.md`) is **not in this repo** (no `*datorama*` / `*runbook*` files). The pipeline below is from code + brain pages.

`publisher_profiles` is **not** this pipeline. It is schedule-spreadsheet ingest for QMS / JCDecaux / SCA / SEN (`docs/brain/MAP.md` §7). Partner sender allowlisting is Snowflake `RAW.PARTNER_SOURCE_MAP`.

---

## 1. Pipeline map

One line per stage. Supplier identity is **not** hardcoded to Datorama in the matcher; the **parser, header gate, and plan-code regex are**.

| Stage | Function | Emits |
|---|---|---|
| Cron | `GET\|POST /api/cron/partner-ingest` (`app/api/cron/partner-ingest/route.ts:27-51`) → `runPartnerIngestJob` (`lib/partner-ingest/runPartnerIngestJob.ts:16-28`) | JSON `PartnerIngestRunSummary`. Auth `assertCronSecret`. Needs `PARTNER_INGEST_TENANT_ID` / `CLIENT_ID` / `CLIENT_SECRET`. Mailbox default `snowflake@assembledview.com.au` (`mailbox.ts:5`, `partnerIngestMailboxFromEnv` `:163-166`). Graph app is **not** `M365_*` (C-116). |
| Mailbox poll | `createPartnerMailbox.listInboxMessages` (`mailbox.ts:54-58, :99-118`) | Up to 50 inbox messages, oldest first, `hasAttachments eq true`. Shape: `{ id, internetMessageId, receivedDateTime, senderAddress, subject }`. |
| Supplier decide | `matchPartnerSource` (`matchSource.ts:23-38`) | First **active** `PARTNER_SOURCE_MAP` row whose `SENDER_DOMAIN` equals the sender domain **and** whose `SUBJECT_PATTERN` SQL-LIKE-matches the subject. Emits `PartnerSourceMapRow` (`types.ts:1-11`). **Not hardcoded to Datorama.** Tests seed `datorama.com` + `%1248052%` (`matchSource.test.ts:7-18, :20-28`) because `noreply@datorama.com` is shared (`INVARIANTS.md` two-factor rule). No match → Unrecognised folder (`runPartnerIngest.ts:131-139`). |
| Attachment filter | `keepPartnerAttachment` (`keepAttachment.ts:1-11`) then `getAttachments` (`mailbox.ts:121-143`) | Non-inline, not `image/*`, name `*.xlsx\|*.csv\|*.zip`. Bytes from Graph `contentBytes`. |
| Duplicate skip | `hasLoadedDuplicate` (`sql.ts:23-30`, `snowflakeWriter.ts:103-110`) | Skip when `(INTERNET_MESSAGE_ID, ATTACHMENT_NAME, ATTACHMENT_SHA256)` already `STATUS='loaded'`. Same bytes again = no restatement. New file (new hash) proceeds. |
| Unzip / matrix | `readPartnerFileMatrix` → `matrixFromBuffer` (`parseChannelFactory.ts:165-183`) | First nested `.xlsx`/`.csv` in a zip; else CSV or first Excel worksheet. `unknown[][]` cells. |
| Raw dump (before parse) | `rawLinesFromMatrix` + `insertRawLines` (`runPartnerIngest.ts:225-226`, invariant) | `RAW.PARTNER_FILE_LINES` `(SOURCE_FILE, FILE_ROW, RAW_LINE)`. Kept on parse failure. |
| Parse / normalise | `parsePartnerFileMatrix` (`parseChannelFactory.ts:185-258`) | `ParsedPartnerFile`: header = first 20 rows containing **Day** and **Impressions** (`:89-92`); columns by **Channel Factory names** (`columnNames.ts:6-18`); drop first-cell `total*`; dates as Date / Excel serial / `YYYY-MM-DD`. Emits `PartnerDeliveryRow[]` (`types.ts:13-30`). Quartile **counts** = `ROUND(rate × impressions)` (`parseChannelFactory.ts:245-248`). |
| Plan-code join key | `extractPlanCode` (`extractPlanCode.ts:1-8`) | `AV_LINE_ITEM_ID` = first `/[A-Za-z]{3,}[0-9]{3}PV[0-9]+/i` in Media Buy Name, lowercased — e.g. `bicau002pv4` from `…_BICAU002PV4` (`extractPlanCode.test.ts:6-10`). **Not** the planner `line_item_id`. Uncoded rows load with NULL (`INVARIANTS.md`). |
| Gates | `runPartnerFileParseTests` (`parseTests.ts:61-73`) | T1 header vs map `EXPECTED_HEADER`; T4 quartile rates monotonically decreasing; T5 `ABS(SUM(completed)−SUM(video_views))/SUM(video_views) ≤ 0.02` on `VIDEO_VIEWS > 0` only (C-115). Any fail → no daily load. |
| Stage / Snowflake load | `writeLoadAndLog` (`snowflakeWriter.ts:127-156`) | Atomic `BEGIN` → `DELETE … WHERE SOURCE=? AND REPORT_DATE BETWEEN ? AND ?` (`sql.ts:55-59`) → `INSERT` 18 columns (`sql.ts:61-85`) → `COMMIT`. `SOURCE` = map **`sourceLabel`** (e.g. `"Channel Factory"`), not the slug (`runPartnerIngest.ts:257`). `LOAD_MODE` / `MAX_STALE_DAYS` are **read** (`snowflakeWriter.ts:70-71`) and **never used**. |
| Mail disposition | `moveMessage` (`mailbox.ts:146-158`) | Processed / Failed / Unrecognised. Never deleted. |
| Dashboard read | **does not happen** | Nothing in `lib/delivery/**`, `lib/pacing/**` (except the ingest writer itself), or `sql/snowflake/mart/**` reads `RAW.PARTNER_DELIVERY_DAILY`. MART refresh unions `VW_PACING_DV360` only (`tsk_refresh_pacing_fact.sql:10-27`). |

Vercel schedule in-repo: one slot `30 22 * * *` (`vercel.json:60-61`). Brain `MAP.md:100` still says a second `0 3 * * *` — that second slot is **not** in `vercel.json` (see §7).

---

## 2. The landing shape

DDL for `RAW.PARTNER_*` is **not** in `sql/snowflake/` (`DATA-MODEL.md` ~185: tables exist in Snowflake, not authored here). The **writer contract** is the INSERT list:

```
SOURCE, REPORT_DATE, PARTNER_ADVERTISER_ID, PARTNER_CAMPAIGN_NAME,
PARTNER_LINE_ITEM_NAME, AV_LINE_ITEM_ID, IMPRESSIONS, CLICKS, VIDEO_VIEWS,
VIDEO_Q25, VIDEO_Q50, VIDEO_Q75, COMPLETED_VIEWS, RATE_Q25, RATE_Q50,
RATE_Q75, RATE_FULLY_PLAYED, SOURCE_FILE
```

(`sql.ts:61-80`, binds `:97-121`)

| Question | Answer |
|---|---|
| Date grain | Daily. `REPORT_DATE` ISO date. |
| Logical grain | `(REPORT_DATE, PARTNER_ADVERTISER_ID, PARTNER_CAMPAIGN_NAME, PARTNER_LINE_ITEM_NAME)` — **not** plan code (`INVARIANTS.md`, `DATA-MODEL.md`). |
| Line-item join key | `AV_LINE_ITEM_ID` = Channel Factory Media Buy Name regex above. Uncoded → NULL, still loaded. |
| Impressions | `IMPRESSIONS` |
| Clicks | `CLICKS` |
| Video | `VIDEO_VIEWS` plus quartile **rates** and derived **counts**. Completions = `ROUND(fully-played rate × impressions)`, not a native plays column. |
| Spend | **None.** No currency. |
| Plays | **None.** |
| Venue / screen | **None.** |
| Source / supplier column | **Yes.** `SOURCE` = `PARTNER_SOURCE_MAP.SOURCE_LABEL` (human label). Slug is on the ingest log / `SOURCE_FILE` path (`sourceFile.ts:11-20`: `{slug}/{yyyy-mm-dd}/{messageId}_{name}`). |

This is **not** `MART.PACING_FACT` (`pacing_fact.sql:5-21`: `CHANNEL, DATE_DAY, LINE_ITEM_ID, … AMOUNT_SPENT, IMPRESSIONS, CLICKS, RESULTS, VIDEO_3S_VIEWS`). Partner rows never MERGE there (`tsk_refresh_pacing_fact.sql:10-27` sources `VW_PACING_DV360` only).

DV360's own join key in MART is a different regex (`vw_pacing_dv360.sql:34-42`: `[A-Z]{3}AU[0-9]{3,}[A-Z0-9]+` then fallback Fivetran id) — also not `{mba}{CODE}{n}`.

---

## 3. Prog OOH today

Plan container exists. Delivery fact path does not.

**Plan**

- Table `media_plan_prog_ooh`, UI key `progOoh`, line channel `prog_ooh` (`lib/api/media-containers.ts:85`, `lib/mediaplan/mapUiMediaTypeToLineChannel.ts:34`).
- Planner `line_item_id` = `{mba}PO{n}` (`lineItemIds.ts:16-34`, `buildLineItemId` `:71-78`). Legacy `ML` still valid for old rows (`:6-14`).
- Naming family for trafficking is `dv360` (`naming/channelTabs.ts:85`). That is a naming stamp, not a Snowflake source.

**Pacing**

- Live resolver **does** pull `media_plan_prog_ooh` (`resolveLiveProgrammaticLineItems.ts:67-71`) and stamps `channelFamily: "progOoh"`, `snowflakeChannel: "programmatic-display"`.
- Hydration is `queryPacingFact({ channel: "programmatic-display", lineItemIds: plan ids })` (`fetchProgrammaticPacingCampaignRows.ts:103-128`, `pacing-fact.ts:93-94`: `LOWER(CHANNEL) LIKE '%programmatic%' AND LIKE '%display%'` against `MART.PACING_FACT`).
- Join is lowercased plan `line_item_id` (`fetchProgrammaticPacingCampaignRows.ts:134-147`). Partner `AV_LINE_ITEM_ID` values like `bicau002pv4` will not match `qatar003po1`.
- `delivery_source_map` is **not** consulted on the pacing composer. Every prog OOH line is included.
- No facts + current burst: maths `spendToDate === 0 && daysPassed >= 2` → `no_delivery` (`maths/index.ts:153`) → UI **No data** (`status.ts:105-109`). Spend/impressions stay 0 (`resolveLiveProgrammaticLineItems.ts:364-373` then overwrite only when facts exist).

**Dashboard delivery**

- `CampaignDeliverySection` builds Programmatic – Display only from `progDisplayLineItems` (`CampaignDeliverySection.tsx:190-206`). **No `progOoh` argument. No OOH adapter file.**
- `loadDeliverySnapshot` collects `progDisplay` / `progVideo` only (`loadDeliverySnapshot.ts:228-240`). Prog OOH planned money does not enter delivered totals.
- Campaign **plan** charts do include `progOoh` in the media-type order (`mediaPlanChartReshape.ts:7-19`) — planned budget only.
- Programmatic adapters drop lines with no active map row (`normalizeProgrammaticLineItems` `programmaticCompute.ts:113-134`). Seed has DV360 / Taboola / Quantcast only (`deliverySourceMap.ts:21-30`). `partner_file` is allowed by CHECK (`0063_delivery_source_map.sql:36-37`) and **has no seed rows** (C-90). `snowflakeChannelsForDeliverySource("partner_file")` returns **empty** (`deliverySourceMap.ts:58-65`).
- `derive_spend_from_plan` is Quantcast-only in the seed (`deliverySourceMap.ts:27-29`). Off for DSP. Off for any future Vistar/Broadsign until a row is added.

**What a `prog_ooh` line with no delivery rows shows**

| Surface | Behaviour |
|---|---|
| Campaign delivery tab | No Programmatic OOH section. Line is invisible there. |
| Client delivered totals / snapshot | Ignored. |
| Pacing programmatic table | Row present (from the plan). Zeros. Status **No data** once the burst is ≥2 days in (`no_delivery`). |
| Plan mix charts | Planned dollars still plot. |

There is no partner-file dashboard adapter to miss — the MART hop was never built.

---

## 4. Extension points

To add a supplier, these must exist. `publisher_profiles` is listed only to say **do not use it**.

| Piece | What | Config vs code |
|---|---|---|
| Mailbox | Same `snowflake@assembledview.com.au` inbox | Config (env `PARTNER_INGEST_MAILBOX`) |
| Sender + subject | `RAW.PARTNER_SOURCE_MAP` row: `SENDER_DOMAIN`, `SUBJECT_PATTERN`, `SOURCE_SLUG`, `SOURCE_LABEL`, `EXPECTED_HEADER`, `IS_ACTIVE` | **Config** (Snowflake). First match wins. |
| Attachment types | `.xlsx` / `.csv` / `.zip` | **Code** (`keepAttachment.ts:10`) |
| Parser / column map | Always `parseChannelFactory` + `COL` names (`runPartnerIngest.ts:1-4, :228`). Header detect requires cells named Day **and** Impressions. | **Code**. A Broadsign/Vistar header will fail T1 and/or produce zero rows unless columns are literally Channel Factory names. |
| Plan-code extract | `/[A-Za-z]{3,}[0-9]{3}PV[0-9]+/i` on Media Buy Name | **Code**. Will not extract `{mba}PO{n}`. |
| Parse gates | T4/T5 assume video quartile rates | **Code**. Impression-only OOH files can pass T4/T5 (zeros are monotonic; T5 skips when no video views) **if** T1 header matches. |
| `SOURCE` value | `SOURCE_LABEL` on the map row | **Config** |
| Range replace | Always min–max dates **of this file**, keyed by `SOURCE` label | **Code**. `LOAD_MODE` unused. |
| `delivery_source_map` | `publisher_key` (platform/publisher string) → `dsp` \| `cm360` \| `partner_file`; `derive_spend_from_plan` | **Config** (table 0063 AUTHOR ONLY; runtime is still the TS seed, C-76 / C-90). Need keys such as `vistar`, `broadsign`. |
| Snowflake channel for `partner_file` | `snowflakeChannelsForDeliverySource` empty set | **Code** |
| MART fact / refresh | `PACING_FACT` MERGE does not read `PARTNER_DELIVERY_DAILY` | **Code + warehouse** (new view + task union, or a dedicated query). |
| Dashboard adapter | Display/Video only; no `progOoh` wiring | **Code** (`CampaignDeliverySection.tsx`, `loadDeliverySnapshot.ts`, possibly a third adapter). |
| Pacing join | Plan `line_item_id` vs `PACING_FACT.LINE_ITEM_ID` | **Code** unless MART projects `AV_LINE_ITEM_ID` already equal to `{mba}PO{n}`. |
| `publisher_profiles` | Unrelated (buy-schedule ingest) | Do not add a row expecting partner-ingest to read it. |

Minimal set that is **not** “insert a map row and it works”: parser (or a dispatch by `sourceSlug`), plan-code extractor, MART (or a RAW reader), `partner_file` channel set, dashboard `progOoh` section, and `delivery_source_map` seed keys.

---

## 5. Idempotency and restatement

**What Datorama daily full-history already does**

1. New attachment hash → not a duplicate.
2. DELETE all `PARTNER_DELIVERY_DAILY` rows for that `SOURCE` label whose `REPORT_DATE` is between the file's min and max dates.
3. INSERT the file.

Full history in one workbook restates the spanned window. That matches Channel Factory.

**Duplicate skip is the opposite of restatement.** Identical bytes + same message id + same filename with `loaded` → skip, even if warehouse rows were deleted by hand.

**Vistar daily deltas (hypothetical)**

If each file is **one calendar day** of complete numbers: current loader is safe (DELETE that day, INSERT that day).

If a “delta” is incremental adds, or a rolling N-day window that is not a complete restatement of those days: range-replace **wipes** that window and keeps only what is in the file. Older days outside the file survive; days inside the file that the vendor omitted disappear.

`LOAD_MODE` / `MAX_STALE_DAYS` look designed for this and are unused (`types.ts:9-10`, `sql.ts:17-18`). A delta supplier needs a real mode (append / merge-by-grain / single-day replace) in `writeLoadAndLog`, not another map row.

**Broadsign weekly full files (hypothetical)**

Weekly file spanning Mon–Sun: those seven days restated; days after last Sunday stay stale until the next drop. No `MAX_STALE_DAYS` alert. Weekly-full is compatible with range-replace **if** the file is complete for its date span. It is not a full-history restatement like Datorama.

**Grain collision:** two suppliers must not share `SOURCE_LABEL`. Range-replace is per label. Same label + overlapping dates = they delete each other.

**No spend/plays columns:** a supplier that only restates spend cannot land those figures without a schema + parser change.

---

## 6. Draft supplier requests

Planner key for Programmatic OOH: `line_item_id` = `{mba_number}PO{line_item}` lowercase in joins, e.g. `qatar003PO1` (`lineItemIds.ts:33, :71-78`). That is the **one field** we will join on. Do not use Channel Factory's `…PV…` Media Buy token; do not use venue id alone.

Ask them to put that string, unchanged, in one dedicated column (preferred) or as a suffix on campaign/order name. We will lowercase+trim.

### Email — Vistar

Subject: Assembled Media — daily delivery file for AssembledView (Vistar / Programmatic OOH)

Hi,

We need a daily delivery extract emailed to **snowflake@assembledview.com.au** so we can pace Programmatic OOH against the media plan.

Please send:

- **Cadence:** daily, after yesterday is final in your system. Prefer a **full restatement of all days in the file** (not incremental adds). If you can only send yesterday, say so — we will treat that file as a single-day replace.
- **File:** `.xlsx` or `.csv` (zip of one of those is fine). One header row; no totals row, or a totals row whose first cell starts with “Total”.
- **Subject line (exact convention):** `AssembledView Vistar Daily Delivery` — we match sender domain **and** this subject, because shared mailboxes are not unique.
- **From:** a stable address on a domain you control (tell us the domain to allowlist).

**Grain:** one row per **calendar day per AssembledView line** (campaign/order that maps 1:1 to our line). Screen/venue breakdown is useful as extra columns but we will roll to line+day.

**Columns we need (names can vary; we will map once):**

| Column | Required | Notes |
|---|---|---|
| Date | yes | Calendar day, ISO `YYYY-MM-DD` preferred |
| AssembledView line item id | **yes — the join** | Exact plan code, e.g. `qatar003PO1`. Planner keys Programmatic OOH as MBA + `PO` + line number. |
| Campaign / order id | yes | Your id |
| Campaign / order name | yes | |
| Creative or placement name | yes | |
| Plays | if you have them | Completes / loops as you define them |
| Impressions | yes | |
| Spend | yes | Gross or net — say which |
| Currency | yes | AUD expected |
| Venue / screen id | nice | Not the join key |

Please send a sample of 5–10 days including at least one coded line id. Reply with the from-address and whether spend is gross.

Thanks,  
Luke

### Email — Broadsign

Subject: Assembled Media — weekly delivery file for AssembledView (Broadsign / Programmatic OOH)

Hi,

We need a delivery extract emailed to **snowflake@assembledview.com.au** so we can pace Programmatic OOH against the media plan.

Please send:

- **Cadence:** weekly is acceptable if the file is a **complete restatement of every day in its date range** (not a delta). Ideal send: Monday covering the previous calendar week through Sunday. If you can do daily full-history, even better.
- **File:** `.xlsx` or `.csv` (or a zip containing one). Header row; no mixed-language totals.
- **Subject line (exact convention):** `AssembledView Broadsign Weekly Delivery` — we match sender domain **and** this subject.
- **From:** a stable address on a domain you control (tell us the domain to allowlist).

**Grain:** one row per **calendar day per AssembledView line**. If the native grain is screen, include the line id on every row so we can sum.

**Columns we need:**

| Column | Required | Notes |
|---|---|---|
| Date | yes | Calendar day |
| AssembledView line item id | **yes — the join** | Exact plan code, e.g. `qatar003PO1`. Planner keys Programmatic OOH as MBA + `PO` + line number. |
| Campaign / order id | yes | Your id |
| Campaign / order name | yes | |
| Creative or placement name | yes | |
| Plays | if you have them | |
| Impressions | yes | |
| Spend | yes | Gross or net — say which |
| Currency | yes | AUD expected |
| Venue / screen id | nice | |

A sample covering one full week, with at least one row stamped `…PO1`, is enough to build the parser.

Thanks,  
Luke

---

## 7. Anything below 90%

| Item | Confidence | Why |
|---|---|---|
| Live `PARTNER_SOURCE_MAP` row (domain, subject `%1248052%`, label `"Channel Factory"`) | ~85% | Tests and fixture preamble (`parseChannelFactory.test.ts:25-30`) match that shape; production map is not in the repo. |
| Extra warehouse columns on `PARTNER_DELIVERY_DAILY` beyond the INSERT list | ~80% | No GET_DDL in `sql/snowflake/`. Writer only sets those 18. |
| Second cron `0 3 * * *` | ~70% that MAP is stale | `vercel.json` has only `30 22 * * *`. |
| A MART view on `PARTNER_*` created only in Snowsight | ~75% absent | Repo MART captures (2026-06-08) and `TSK_REFRESH_PACING_FACT` do not mention it; app has no SELECT. Could still exist unused. |
| Exact dashboard empty copy for “unmapped programmatic” vs “mapped but zero rows” | ~88% | Unmapped → section `null` (`programmaticAdapterShared.ts:362-363`). Prog OOH never reaches that adapter. Pacing No data path is from maths, not a dedicated OOH empty component. |
| Whether planners already stamp `{mba}PO{n}` into Vistar/Broadsign order names | unknown | No code evidence. Channel Factory uses a different `…PV…` token. |
| Vistar/Broadsign real sender domains, whether they can email that mailbox, and whether they expose spend | unknown | Ask in the emails. |
| Collision: CF `extractPlanCode` vs AssembledView prog **video** ids (`{mba}PV{n}`) | ~90% the shapes overlap, ~60% it matters in prod | Regex requires `PV`. Prog OOH `PO` does not match. A CF media buy containing `PENFOLD018PV1` could theoretically equal a video line id on a different MBA. |

What is **≥90%**: mailbox → two-factor map → Channel Factory parser only → RAW range-replace → no MART/dashboard consumer; prog OOH is planned and paced against DV360 display PACING_FACT and is invisible on campaign delivery; second supplier is not a config-only add.
