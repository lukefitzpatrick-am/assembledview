-- ASSEMBLEDVIEW.MART.SP_REFRESH_FIXED_COST_NIGHTLY
-- Wrapper: 3-day window for all lines, then a full backfill for every fixed-cost
-- line on a partner-file or direct-digital source so late files never leave locked zeros,
-- then a full backfill per ASSUME_SPEND line id.
-- Never calls the inner procedure with a null id and BACKFILL_MODE true.
-- AUTHOR ONLY — Luke applies in Snowsight (S1, 2026-09-16).
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

  let assumed integer := 0;
  let c2 cursor for
    select distinct lower(LINE_ITEM_ID) as id
    from ASSEMBLEDVIEW.MART.XANO_LINE_ITEMS_SNAPSHOT
    where ASSUME_SPEND = true
      and LINE_ITEM_ID is not null;
  for r2 in c2 do
    let id2 varchar := r2.id;
    if (id2 is not null) then
      call ASSEMBLEDVIEW.MART.SP_REFRESH_FIXED_COST_REPORTED_DAILY(:id2, true);
      assumed := assumed + 1;
    end if;
  end for;

  return 'window refresh done; full backfill on ' || n::varchar
    || ' partner-file / direct-digital lines; assumed spend backfill on '
    || assumed::varchar || ' lines';
end;
$$;
