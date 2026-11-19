# Decision: what the schedule grid's quantity and cost mean on a fee-inclusive line (C-342, V66)

Status: **B confirmed by Luke 20 Nov 2026, shipped in C342B and C342Bfix.** Batch C342B built option B and C342Bfix closed its review items; both are on the release head.
Written 18 Nov 2026, batch C342fix, from release head `9d708bf7`. Supabase SELECT only (counts and MBA numbers). Updated 19 Nov 2026 in C342B (sections 3 and 4, and section 7: what was built).

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
  - 13 channels read quantity x rate as the gross budget: Search, Social, Influencers, Integration, Digital Video, Digital Display, the five programmatic channels, Newspaper, Magazines. A fee-inclusive cpm, cpc or cpv line (cpm and insertions on press) loses the fee share on every Apply and compounds: $12,000.00, then 10500, then 9187.5. Press insertions lose it too: the saved count was worked from the net, so whole count x rate is the net ($7,777.77 at $2,950 saves 5900).
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

### Risks the C342fix review added (F4)

- A: a lump-sum package at rate $0.00 or blank (live: Television 2 lines, $185,000; BVOD 1 line, $95,000) has no budget ÷ rate; package quantities become budget ÷ rate (8 becomes 12); typed and pasted deliverables stay netted on 13 channels.
- B: one cell can hold several bursts (two bursts in one week, overlapping bursts that cannot be a span, day detail, a multi-week burst spread over weeks), so the carry needs a rule (section 7); the carry must hold deliverables and rate too (C-345).
- Both: the grid's "Fees (x% on net)" label was wrong; the figure is a slice of gross.

### Not offered

- The W5e builder's old B (Apply clears Budget Includes Fees): it changes the line's fee basis and every billing and finance view of it. Not recommended.

### Recommendation

- B, with $ cells in gross. The grid stays a deliverables grid that tells the truth, the money columns agree with the card, and planners on all 18 channels type what they mean.
- A is the smaller change and exact by construction, but the grid would show deliverables the line does not buy.

## 4. Goldens either option changes

From the C342fix review (F3), read leaf by leaf; the B column is what C342B's run gave (section 7 lists every changed value).

| Golden | Line | Saved | Today | A | B |
|---|---|---|---|---|---|
| Search | 2, 5 (cpm, fee-inclusive) | $12,000.00 | 10500 | 12000 | 12000 |
| Prog Display | 2, 7 (cpm, fee-inclusive) | $12,000.00 | 10500 | 12000 | 12000 |
| Social | 2, 9 (cpc, fee-inclusive) | $5,000.00 | 4375 | 5000 | 5000 |
| Social | 1 burst 2 (cpm, fee on top, $18.75 vs $15.00) | $9,250.50 | 7400.4 | 9250.5, deliverables 616,700 | 9250.5, 493,360, rate $18.75 |
| Digital Video, Digital Display | 2 / 8 and 2 / 14 (cpm, fee-inclusive) | $8,000.00 / $1,000.00 | 7000 / 875 | saved | saved |
| Influencers 7, Integration 10 | cpm, fee-inclusive | $8,000.00 | 7000 | 8000 | 8000 |
| Cinema | 2 (spots, fee-inclusive) | $7,777.00 | 7428.57 | 7777 | 7777 |
| Cinema | 12 (spots, fee-inclusive) | $1,000.00 | 1001.14 | 1000 | 1000 |
| Cinema 7, BVOD 7, Digital Audio 6 | package, fee on top, 8 at $1,000.00 | $12,000.00 | 8000 | 12000, quantity 12 | 12000, 8 |
| BVOD | 12 ($15.00 and $8.00 bursts) | $1,500.00, $800.00 | 22500, 4000, 3999.99 | depends on the rate rule | $1,500.00 and $800.00, two bursts as saved |

- Not fee-inclusive, and moved by the carry under B only: bonus burst splits (BVOD, Cinema, Digital Audio line 1: 2 bursts to 5 today, 2 as saved under B); package inclusions and package deliverables (Digital Display 8, Influencers 4, Integration 2, 3 and 5: the grid's rule value, 0 or 1, back to the saved 3, 4 or 8).
- Unchanged by either: Search and Prog Display line 1's zero-quantity bonus burst is still dropped (no money, no quantity); Cinema line 10's blank fixed cost and Influencers line 6's blank line still come back as $0 with 1 deliverable (no saved budget to carry).

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

## 7. What C342B built (option B)

Confirmed by Luke 20 Nov 2026 (V66 B). Shipped in C342B and C342Bfix.

- **Cells:** real deliverables on every channel, as before.
- **Untouched cells:** on open each row carries its saved bursts (`lib/mediaplan/expertCarry.ts`). On Apply a group of cells the planner has not touched gives its saved bursts back: budget, deliverables, rate, cost and amount (Production), dates. Untouched is read from the values (spans, week cells, day cells, and the row's rate, buy type and Budget Includes Fees), so every edit path in the grid drops the carry for what it changed. Typing a cell's own number back counts as untouched.
- **Edited cells:** quantity x rate, grossed up on a fee-inclusive line (`expertCellBudget`, the card's rule read backwards); fixed cost and package never grossed up; bonus and package inclusions $0. A rate edit reprices every cell of the row.
- **Several bursts in one cell (review F4):** the bursts that share a week, or a span, form one group. The rule: carry the group whole while every cell in it is untouched; price it whole from the grid once any cell in it is edited (the burst count can then change, as it always has). Chosen over "gross up each burst in proportion" (needs a share rule per burst and still guesses at what the planner meant) and over "refuse the edit" (a new block on the planner's main tool, needing a switch and copy). It is the smaller rule and it never invents money: the result is either the saved line or what the grid shows.
- **Mixed rates (C-345):** an untouched burst keeps its own rate; an edited cell prices at the row's rate (the first burst's).
- **OOH (C-344):** the span `gross` stamp is gone; OOH uses the shared carry, so span and rate edits reach the line.
- **Grid money:** Net Media, the footer and OOH's totals show the line's budget (carried budgets plus the gross of the rest); $ cells show and take the gross (the recommended sub-choice); the fee label reads "x% of gross".
- **Known limit (C-361):** a burst the import spreads into week cells under a span keeps that share only while untouched.
- **Proof:** `expertApplyRoundTrip.c342.test.ts` (all 152 cases and Production exact; edits follow the card's rule; mixed rates, several bursts in one week, OOH spans; both zones), `expertCarry.c342b.test.ts`, `sharedChannelContainer.gridMoney.c342b.test.tsx` (mounted), every container golden (only expert Apply steps move, each back to the saved line).
