-- ASSEMBLEDVIEW.MART.SP_REFRESH_FIXED_COST_NIGHTLY
-- Wrapper: 3-day window for all lines, then a full backfill for every fixed-cost
-- line on a partner-file or direct-digital source so late files never leave locked zeros,
-- then one set-based assumed-spend refresh (SCOPE 'changed').
-- Never calls the inner procedure with a null id and BACKFILL_MODE true.
-- AUTHOR ONLY — Luke applies in Snowsight. CREATE OR REPLACE PROCEDURE does not copy grants.
-- Re-apply USAGE on this procedure only if a role other than the owner calls it.
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

  call ASSEMBLEDVIEW.MART.SP_REFRESH_ASSUMED_SPEND_DAILY('changed');

  return 'window refresh done; full backfill on ' || n::varchar
    || ' partner-file / direct-digital lines; assumed spend refresh scope=changed';
end;
$$;
