-- ASSEMBLEDVIEW.MART.SP_REFRESH_FIXED_COST_NIGHTLY
-- Wrapper: 3-day window for all lines, then a full backfill for every fixed-cost
-- line on a partner-file or direct-digital source so late files never leave locked zeros.
-- AUTHOR ONLY — Luke applies in Snowsight (S1, 2026-09-16).
USE SCHEMA ASSEMBLEDVIEW.MART;

create or replace procedure SP_REFRESH_FIXED_COST_NIGHTLY()
returns varchar
language sql
execute as owner
as
$$
declare
  c cursor for
    select distinct LINE_ITEM_ID
    from ASSEMBLEDVIEW.MART.XANO_LINE_ITEMS_SNAPSHOT
    where FIXED_COST_MEDIA = true
      and (
        SOURCE_TABLE in ('media_plan_prog_ooh','media_plan_digi_bvod','media_plan_digi_video',
                         'media_plan_digi_display','media_plan_digi_audio')
        or lower(PLATFORM) in ('channel factory','vistar','broadsign')
      );
  n integer default 0;
begin
  call ASSEMBLEDVIEW.MART.SP_REFRESH_FIXED_COST_REPORTED_DAILY(NULL, FALSE);
  for r in c do
    call ASSEMBLEDVIEW.MART.SP_REFRESH_FIXED_COST_REPORTED_DAILY(:r.LINE_ITEM_ID, TRUE);
    n := n + 1;
  end for;
  return 'window refresh done; full backfill on ' || n || ' partner-file / direct-digital lines';
end;
$$;
