# Decision: what the schedule grid's quantity and cost mean on a fee-inclusive line (C-342, V66)

Status: awaiting Luke (V66). Nothing is changed in the app. The bug is pinned by `lib/mediaplan/__tests__/expertApplyRoundTrip.c342.test.ts`.
Written 18 Nov 2026, batch C342fix, from release head `9d708bf7`. Supabase SELECT only (counts and MBA numbers).

## 1. Why this is a decision and not a fix

The batch was told to fix C-342 with the grid's cost read as gross (V66 A), and to stop if the grid already shows a fee-inclusive line's cost as net. It does.

What the grid shows today for one fee-inclusive cpm line: budget $12,000.00, CPM $15.00, client fee 12.5%, saved deliverables 700,000 (the net $10,500.00 buys them). Same on every channel, because every channel opens the grid from the saved deliverables.

| Grid place | Shows | Meaning in the code |
|---|---|---|
| Week cells (Deliverables mode, the default) | 700,000 | The net's deliverables |
| Week cells ($ Budget mode) | $10,500 | Quantity x rate: the net |
| Net Media column | $9,187.50 | Takes the fee off $10,500 again |
| Footer | Net media $9,187.50, Fees $1,312.50, Total w/ fees $10,500.00 | Reads quantity x rate as the gross |
| The card | $12,000.00, media $10,500.00, fee $1,500.00 | The saved line |

- The numbers a planner sees and types are on the net's scale. The money labels call them gross.
- Apply is split by channel:
  - 13 channels read quantity x rate as the gross budget: Search, Social, Influencers, Integration, Digital Video, Digital Display, the five programmatic channels, Newspaper, Magazines. A fee-inclusive cpm, cpc or cpv line (cpm on press) loses the fee share on every Apply and compounds: $12,000.00, then 10500, then 9187.5.
  - 5 channels read it as the net and gross it up: Digital Audio, BVOD, Cinema, Radio, Television. Right for cpm, cpc, cpv and spots (bar rounding). Wrong for fixed cost and package, whose rate is already the gross: $12,000.00 becomes 13714.29 once.
  - OOH carries each burst's saved budget on its span, so a no-edit Apply is exact. But it also ignores rate and quantity edits on those spans (C-344).
- So the fix decides what a typed number means on some channels. That is Luke's rule.

## 2. Two more findings the test turned up

- **C-343:** saved deliverables are whole (save rounds them). Apply rebuilds the budget as whole count x rate. A budget that is not a whole multiple of the rate moves on every Apply with no edit, fee or not, on every channel but OOH. Test: $7,777.77 at CPC $2.37 saves as 7778.34; spots at $650 as 7800; insertions at $2,950 as 8850. Live, current published versions, lines without fees: 193 bursts outside OOH would move, $99.93 in all (Search cpc $81.69 over 109 bursts, Television spots $14.64, the rest cents). OOH panels show 22 such bursts ($658.24), but OOH's carry keeps their budgets.
- **C-344:** OOH Apply writes an imported span's saved budget whatever was typed. Halving a span's quantity saves the old budget and the old deliverables; doubling the rate keeps the budget and halves the deliverables. Live exposure: 878 OOH lines, 985 bursts with a budget, 41 MBAs on published versions. No fingerprint in the data, so harm cannot be sized (under 90%).

## 3. The options

Both make the grid's cost gross, as V66 A says. They differ in what the week cells hold.

### Option A: cells hold the budget's quantity (budget ÷ rate)

- Open the grid: each burst's cell is its budget ÷ rate. The example line shows 800,000.
- Apply: budget = quantity x rate (the 13 channels' rule today). Deliverables are worked from the net: 700,000.
- Grid: Net Media $10,500.00, fee $1,500.00, Total w/ fees $12,000.00, $ cell $12,000. No grid code changes.
- No edit: exact on every channel and buy type, to the cent, by construction. Clears C-343 for untouched cells.
- The cost: the grid's quantities stop being the line's deliverables on a fee-inclusive line. Σ qty and Total Deliverables read 800,000 for a line that buys 700,000. Whole-unit cells show fractions where the budget is not a whole multiple (11.97 spots).
- Typed quantity: gross-equivalent on every channel. New on the 5 channels: 10 spots typed on a fee-inclusive Radio line at $650 saves $6,500.00 and 9 spots (today $7,428.57 and 10 spots).
- Code: one shared to-expert helper used by the 20 mappers; the 5 channels' from-expert stop grossing up and work deliverables from the net. Grid untouched.

### Option B: cells hold the real deliverables; the grid grosses them up

- Open the grid: cells hold the saved deliverables (as today). Each untouched cell carries its saved budget (the OOH idea), dropped once the cell or the rate is edited.
- Apply: an untouched cell writes its saved budget. An edited cell's budget is quantity x rate grossed up (the 5 channels' rule today for cpm, cpc, cpv, spots). Fixed cost and package are never grossed up.
- Grid: the cost helpers read quantity x rate as the net for a fee-inclusive line: Net Media $10,500.00, fee $1,500.00, Total w/ fees $12,000.00. $ Budget cells show and take the gross (recommended) or the net (sub-choice).
- No edit: exact on every channel and buy type (the carry). Clears C-343 and C-344 for untouched cells.
- Typed quantity: real deliverables on every channel. New on the 13 channels: 700,000 typed on a fee-inclusive Search line saves $12,000.00 and 700,000 (today $10,500.00 and 612,500).
- Code: to-expert carry on 20 mappers (one helper), from-expert on 18 (one helper), the grid's shared cost helpers (`expertRowCost.ts`), the grid's edit paths dropping the carry. More code than A.

### Not offered

- The W5e builder's old B (Apply clears Budget Includes Fees): it changes the line's fee basis and every billing and finance view of it. Not recommended.

### Recommendation

- B, with $ cells in gross. The grid stays a deliverables grid that tells the truth, the money columns agree with the card, and planners on all 18 channels type what they mean.
- A is the smaller change and exact by construction, but the grid would show deliverables the line does not buy.

## 4. Goldens either option changes

No golden changed in this batch. Either option changes the expert Apply step of fee-inclusive lines only, back to the saved values. From the W5e notes and review:

- Social: $5,000.00 (Apply today 4375).
- Search and Prog Display: $12,000.00 (today 10500).
- Digital Video and Digital Display: $8,000.00 and $1,000.00 (today 7000 and 875).
- Influencers and Integration: $8,000.00 (today 7000).
- Cinema CN13: $1,000.00 (today 1001.14).
- Cinema package line, $12,000.00 saved with quantity 8 at $1,000.00 (today 8000): A saves $12,000.00 but the package quantity becomes 12 (budget ÷ rate); B saves $12,000.00 and 8 (the carry). Under 90%: worked by hand, not run.

## 5. SELECT for finance: fee-inclusive lines whose budget moved by exactly the fee share

Read only. Lists every pair of consecutive versions of the same fee-inclusive line (same plan, channel and line id) whose line budget dropped or rose by exactly the client fee share. The fee is the earlier version's fee snapshot, else the client's fee today. Tolerance is a cent per burst. A match is a lead, not proof: removing whole bursts can match by chance.

```sql
with fee_col(channel, col) as (values
  ('search','feesearch'),('social','feesocial'),('influencers','feeinfluencers'),('integrations','feeintegration'),
  ('digi_video','feedigivideo'),('digi_display','feedigidisplay'),('digi_audio','feedigiaudio'),('digi_bvod','feebvod'),
  ('prog_display','feeprogdisplay'),('prog_video','feeprogvideo'),('prog_bvod','feeprogbvod'),('prog_audio','feeprogaudio'),
  ('prog_ooh','feeprogooh'),('newspaper','feenewspapers'),('magazines','feemagazines'),('cinema','feecinema'),
  ('radio','feeradio'),('television','feetelevision'),('ooh','feeooh')),
lines as (
  select v.master_id, v.mba_number, v.version_number, v.id as version_id, v.published_at,
         li.channel::text as channel, li.line_item_id, li.buy_type,
         coalesce(li.budget_includes_fees, false) as incl,
         jsonb_array_length(case when jsonb_typeof(li.bursts) = 'array' then li.bursts else '[]'::jsonb end) as bursts,
         (select coalesce(sum(nullif(regexp_replace(e->>'budget', '[^0-9.-]', '', 'g'), '')::numeric), 0)
            from jsonb_array_elements(case when jsonb_typeof(li.bursts) = 'array' then li.bursts else '[]'::jsonb end) e) as budget
  from line_items li
  join media_plan_versions v on v.id = li.version_id
),
pairs as (
  select l.*,
         lag(budget) over w as prev_budget, lag(version_number) over w as prev_version,
         lag(version_id) over w as prev_version_id, lag(incl) over w as prev_incl
  from lines l
  window w as (partition by master_id, channel, line_item_id order by version_number)
),
priced as (
  select p.*,
         coalesce(nullif(s.fees ->> fc.col, '')::numeric,
                  nullif(to_jsonb(c) ->> fc.col, '')::numeric,
                  case when p.channel = 'influencers' then nullif(to_jsonb(c) ->> 'feecontentcreator', '')::numeric end) as fee_pct,
         case when s.fees ? fc.col then 'version fee snapshot' else 'client fee today' end as fee_source
  from pairs p
  join fee_col fc on fc.channel = p.channel
  join media_plan_masters m on m.id = p.master_id
  left join clients c on c.id = m.client_id
  left join lateral (
    select fees from mba_fee_snapshots s where s.version_id = p.prev_version_id order by captured_at desc limit 1
  ) s on true
  where p.prev_version is not null and p.incl and p.prev_incl
)
select mba_number, channel, line_item_id, buy_type, prev_version, version_number, published_at,
       fee_pct, fee_source, prev_budget, budget,
       case when abs(budget - prev_budget * (1 - fee_pct / 100)) <= 0.01 * greatest(bursts, 1) then 'dropped by the fee share'
            else 'rose by the fee share' end as movement
from priced
where fee_pct > 0 and fee_pct < 100 and budget <> prev_budget
  and (abs(budget - prev_budget * (1 - fee_pct / 100)) <= 0.01 * greatest(bursts, 1)
       or abs(budget - prev_budget / (1 - fee_pct / 100)) <= 0.01 * greatest(bursts, 1))
order by mba_number, channel, line_item_id, version_number;
```

- Run 18 Nov 2026: 964 consecutive pairs checked, 720 with a fee. 2 matches: candel001 Search cpc dropped (the W5e review explains it: two whole bursts removed), sthaus001 Social cpm rose.
- It cannot see an Apply in a plan's first save (no earlier version), or a planner who retyped every burst after an Apply.

## 6. SELECT for C-340 (corrected in the W5e review, F4)

Read only. Lists every line on a naming channel, in any version ever published, whose plan page Excel id before W5e was not its own id. The number is taken as the page takes it: the id suffix when the id has a channel code, else the saved position.

```sql
with codes(channel, code) as (values ('social','SM'),('search','SE'),('integrations','IT'),('digi_video','DV'),
  ('digi_audio','DA'),('digi_bvod','BV'),('prog_display','PD'),('prog_video','PV'),('prog_bvod','PB'),
  ('prog_audio','PA'),('prog_ooh','PO')),
ranked as (
  select v.mba_number, v.version_number, v.published_at, li.channel::text as channel, c.code, li.line_item_id,
         row_number() over (partition by li.version_id, li.channel order by li.position, li.id) as excel_number,
         case when li.line_item_id ~* '(PROD|TV|NP|SM|RA|MG|CN|DD|DA|DV|BV|IT|SE|PD|PV|PB|PA|PO|OH|IN|ML)\d+$'
              then substring(li.line_item_id from '(\d+)$')::int
              when li.position > 0 then li.position
              else substring(li.line_item_id from '(\d+)$')::int end as page_number
  from line_items li
  join media_plan_versions v on v.id = li.version_id
  join codes c on c.channel = li.channel::text
  where v.published_at is not null
)
select mba_number, version_number, published_at, channel,
       mba_number || code || page_number as id_on_page_now,
       mba_number || code || excel_number as id_in_naming_workbook_before_w5e
from ranked
where page_number is distinct from excel_number
order by mba_number, version_number, channel, excel_number;
```

- Run 18 Nov 2026: 10 lines in 9 versions of 6 MBAs (BICAU001, hartm015, hema001, jayco017, PGAAUS015, trwico002).
- It cannot see a Remove, Duplicate or Apply made in a session before the workbook was made.
