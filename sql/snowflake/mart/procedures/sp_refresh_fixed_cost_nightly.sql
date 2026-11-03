-- ASSEMBLEDVIEW.MART.SP_REFRESH_FIXED_COST_NIGHTLY
-- Wrapper: 3-day window for all lines, then a full backfill for every fixed-cost
-- line on a partner-file or direct-digital source so late files never leave locked zeros,
-- then (B23) a one-off backfill for any other fixed-cost line whose report basis
-- or fixed cost from date changed since its last backfill,
-- then one set-based assumed-spend refresh (SCOPE 'changed').
-- Never calls the inner procedure with a null id and BACKFILL_MODE true.
-- AUTHOR ONLY — Luke applies in Snowsight. CREATE OR REPLACE PROCEDURE does not copy grants.
-- Re-apply USAGE on this procedure only if a role other than the owner calls it.
-- B23: needs FIXED_COST_LINE_ITEM_FACT.REPORT_BASIS_APPLIED and FIXED_COST_FROM_APPLIED.
-- With fixed_cost_report_net off every snapshot FIXED_COST_BURSTS_JSON is null and
-- every applied basis is null, so the B23 loop finds nothing (the old behaviour).
create or replace procedure ASSEMBLEDVIEW.MART.SP_REFRESH_FIXED_COST_NIGHTLY()
returns varchar
language sql
execute as owner
as
$$
begin
  let none varchar := null;
  call ASSEMBLEDVIEW.MART.SP_REFRESH_FIXED_COST_REPORTED_DAILY(:none, false);

  let n integer := 0;
  let c cursor for
    select distinct lower(LINE_ITEM_ID) as id
    from ASSEMBLEDVIEW.MART.XANO_LINE_ITEMS_SNAPSHOT
    where FIXED_COST_MEDIA = true
      and (
        SOURCE_TABLE in ('media_plan_prog_ooh','media_plan_digi_bvod','media_plan_digi_video',
                         'media_plan_digi_display','media_plan_digi_audio')
        or lower(PLATFORM) in ('channel factory','vistar','broadsign')
      );
  for r in c do
    let id varchar := r.id;
    call ASSEMBLEDVIEW.MART.SP_REFRESH_FIXED_COST_REPORTED_DAILY(:id, true);
    n := n + 1;
  end for;

  -- B23: DV360, Taboola, social, search and other fixed-cost lines are not
  -- backfilled nightly. Backfill one once when the snapshot's basis or date
  -- differs from what its line fact was last backfilled with: the net basis
  -- switched on or off, or a planner set, moved or cleared the date (FC7: a
  -- past date outside the 3-day window gets its days rewritten).
  let m integer := 0;
  let c2 cursor for
    select lower(s.LINE_ITEM_ID) as id
    from ASSEMBLEDVIEW.MART.XANO_LINE_ITEMS_SNAPSHOT s
    left join ASSEMBLEDVIEW.MART.FIXED_COST_LINE_ITEM_FACT f
      on lower(f.LINE_ITEM_ID) = lower(s.LINE_ITEM_ID)
    where s.FIXED_COST_MEDIA = true
      and coalesce(s.ASSUME_SPEND, false) = false
      and not (
        s.SOURCE_TABLE in ('media_plan_prog_ooh','media_plan_digi_bvod','media_plan_digi_video',
                           'media_plan_digi_display','media_plan_digi_audio')
        or lower(s.PLATFORM) in ('channel factory','vistar','broadsign')
      )
      and (
        iff(s.FIXED_COST_BURSTS_JSON is null, null, 'net_melbourne') is distinct from f.REPORT_BASIS_APPLIED
        or (s.FIXED_COST_BURSTS_JSON is not null
            and s.FIXED_COST_FROM is distinct from f.FIXED_COST_FROM_APPLIED)
      );
  for r2 in c2 do
    let id2 varchar := r2.id;
    call ASSEMBLEDVIEW.MART.SP_REFRESH_FIXED_COST_REPORTED_DAILY(:id2, true);
    m := m + 1;
  end for;

  call ASSEMBLEDVIEW.MART.SP_REFRESH_ASSUMED_SPEND_DAILY('changed');

  return 'window refresh done; full backfill on ' || n::varchar
    || ' partner-file / direct-digital lines; basis or date changed backfill on ' || m::varchar
    || ' lines; assumed spend refresh scope=changed';
end;
$$;
