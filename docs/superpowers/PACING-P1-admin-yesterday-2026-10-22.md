# P1: admin pacing counts to Melbourne yesterday (22 Oct 2026)

Luke's decision (22 Oct): admin pacing counts to Melbourne yesterday, like the client campaign strip. Also C2 (plan CPV in pacing KPI cells) and C5 (purchase-only ROAS).

## Rule

- View day (`asOfDate`): Melbourne today, or the toolbar day. Decides which campaigns are live and keys the caches and snapshots. The campaign lists do not change.
- Count-to day (`countToDate`): the day before the view day. Expected, delivered, assumed spend, days elapsed, status and spend yesterday stop there.
- A campaign starting on the view day is listed, reads not started, nothing expected.
- A campaign that ended on the count-to day is fully expected and not yet completed. It is not live on the view day, so live-only lists still drop it (unchanged).
- Helper: `lib/pacing/countTo.ts`.

## Commits (stage in this order)

| Commit | Surface |
| --- | --- |
| `5b1e0acd` | Helper only. No surface uses it. |
| `db2d33b0` | Admin channel tabs (search, social, programmatic, ad serving, direct). Composers take `countToDate`; direct line and burst totals drop daily rows after it; cache keys carry it. |
| `6759e201` | Portfolio (cron, route, UI). Rows carry `countToDate`. A stored row without it is rebuilt for admin and served stale to clients. |
| `e67c17e1` | Campaign pacing modal. Daily chart still runs to the view day. |
| `cbf10070` | Ava `get_pacing_snapshot` (`countedTo` in the summary). |
| `f36defed` | Pacing digest. A pre-P1 snapshot falls back to the caches. |
| `ed144884` | C2: pacing KPI cells compare CPV to the plan rate (`resolveCpvPlanRate`). Saved `campaign_kpi.cpv` ignored. |
| `966f8d59` | C5: `computePacing` ROAS is purchase revenue only. No pacing surface has it, so ROAS is null ("Not tracked"). |

Each surface commit works on its own. Until the portfolio commit is live, the modal and digest keep reading the old snapshot rule.

## Before and after (read-only data, 22 Oct 2026)

Portfolio rows. Before = stored 22 Oct snapshot (counted to 22 Oct). After expected = the 21 Oct figure on the same plan version (the stored 21 Oct snapshot). After delivered = before less the facts dated 22 Oct, as loaded at the time of the check.

| MBA | Expected before | Expected after | Change | Delivered before | 22 Oct facts | Delivered after |
| --- | --- | --- | --- | --- | --- | --- |
| curatif004 | $58,397.32 | $57,752.13 | -$645.19 | $48,409.08 | search $4.88, social $6.17 | about $48,398.03 |
| hartm001 | $627,563.72 | $625,188.92 | -$2,374.80 | $548,664.09 | search $3.10, direct reported $44.90 | about $548,616.09 |
| sinch001 | $236,699.66 | $233,162.34 | -$3,537.32 | $122,072.30 | assumed spend $895.08 | $121,177.22 |
| golf025 | $89,564.92 | $88,086.46 | -$1,478.46 | $81,148.28 | social $8.22 (CM360 estimate not checked) | about $81,140.06 |

Admin tabs (the same composers, by channel). Expected drops by one day of each in-flight line's net plan:

| MBA | Channel | Expected change (net) | Delivered change |
| --- | --- | --- | --- |
| curatif004 | Search | -$250.47 | -$4.88 |
| curatif004 | Social (Meta + TikTok) | -$394.72 | -$6.17 |
| hartm001 | Search | -$1,005.24 | -$3.10 |
| hartm001 | Social | -$662.81 | $0.00 |
| hartm001 | Programmatic (reported) | -$706.75 | $0.00 on the tab; $2.75 DV360 display on 22 Oct |
| sinch001 | Direct (assumed) | -$895.08 | -$895.08 |
| sinch001 | Programmatic and OOH | -$2,322.51 | $0.00 |
| golf025 | Social | -$369.87 | -$8.22 |

Channel changes sum to the campaign change for curatif004 ($645.19) and hartm001 ($2,374.80). sinch001's channels sum to $3,217.59 against $3,537.32 for the campaign; the rest sits on plan lines with no channel row.

Client strip (counts to 21 Oct):

- curatif004 and hartm001: the strip's measured one-day gap (audit, $645.19 and $2,374.80) equals the portfolio change to the cent, so expected now matches the strip.
- sinch001 and golf025: the audit's strip gaps ($4,203.30, $1,542.97) are not the portfolio day slice ($3,537.32, $1,478.46). They differ by more than the day (assumed spend and CM360 estimates, as the audit noted). Not verified here.

## After deploy

- Today's stored portfolio row was built before P1. The first admin portfolio load rebuilds it; client loads see it as stale until the build lands. Or run the portfolio route with `refresh=1`.

## Not done / open

- The Overview tab (`/api/pacing/overview`) still counts to the view day. It was not in the brief. Move it too?
- Live-only lists keep using the view day, so a campaign that ended yesterday drops off on the morning after its last day. List it for one more day?
- C2: a line with no saved KPI row still reads "KPI pending" even when it has a plan CPV. Count the plan CPV as a target?
- sinch001 and golf025 strip parity (above).
