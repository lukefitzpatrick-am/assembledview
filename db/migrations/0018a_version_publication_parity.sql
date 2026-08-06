-- db/migrations/0018a_version_publication_parity.sql
-- AUTHOR ONLY — Claude (Cowork), Thu 6 Aug 2026, evening.
-- Cursor must NOT author or edit this file. Apply via the Supabase SQL Editor
-- (project slpdibnxtpdlttbbczvg). Do not `db:migrate`.
--
-- CORRECTS 0018, which is already applied. Two defects, one decision.
--
-- DEFECT 1 — 0018's backfill is not idempotent, despite its header saying it is.
--   UPDATE media_plan_versions SET published_at = created_at WHERE published_at IS NULL;
--   sits outside any guard. Today that is harmless (every row was NULL). Once
--   VC1-2 is live and genuine drafts carry published_at IS NULL, ONE re-run
--   silently publishes every unpublished draft in the system: downloads open,
--   billing locks, every save spawns a version. Section 1 neutralises it.
--
-- DEFECT 2 — 0018 shipped no indexes. Section 3 adds them.
--
-- DECISION (Luke, 6 Aug) — restore parity. 0018 stamped all 1,023 versions as
--   published. Publication is now also driving mutability, so that quietly
--   changed behaviour for 411 versions. The historical meaning of "published"
--   was the old isPublished predicate: campaign_status != 'draft'. Section 2
--   clears the 145 draft rows so history is recorded honestly.
--
-- SAFE TO RUN NOW: no version has been published through the new write path
-- (published_by is NULL on all 1,023 rows) and the Stage 1 code is not on main.
-- MUST run BEFORE VC1-2 reaches production, or it will clear real publications.

begin;

-- ---------------------------------------------------------------------------
-- 0. Guard: refuse to run if anything has been published through VC1-2 already.
--    Section 2 would destroy real data in that case.
-- ---------------------------------------------------------------------------
do $$
declare
  stamped int;
begin
  select count(*) into stamped
  from public.media_plan_versions
  where published_by is not null;

  if stamped > 0 then
    raise exception
      '0018a ABORTED: % versions carry published_by, so VC1-2 is already live. Section 2 would clear real publications. Re-scope by hand.', stamped;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 1. Neutralise 0018's re-runnable backfill.
-- ---------------------------------------------------------------------------
create table if not exists public.migration_markers (
  key         text primary key,
  applied_at  timestamptz not null default now(),
  note        text
);

insert into public.migration_markers (key, note)
values (
  '0018_version_publication_backfill',
  'Historical publication backfill ran once on 2026-08-06. 0018 must never backfill again — a re-run would publish live drafts.'
)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Parity: draft versions were never published.
--    Old isPublished = normaliseStatus(campaign_status) !== 'draft'.
--    Expect 145 rows affected.
-- ---------------------------------------------------------------------------
update public.media_plan_versions
   set published_at = null
 where lower(trim(coalesce(campaign_status, ''))) = 'draft'
   and published_at is not null;

-- ---------------------------------------------------------------------------
-- 3. The indexes 0018 omitted.
-- ---------------------------------------------------------------------------
create index if not exists idx_mpv_published_at
  on public.media_plan_versions (published_at)
  where published_at is not null;

create index if not exists idx_mpv_master_published
  on public.media_plan_versions (master_id, published_at desc)
  where published_at is not null;

commit;


-- ============================================================================
-- VERIFICATION — run immediately after; paste into the gate review.
-- EXPECT: versions_total 1023 · published 878 · unpublished 145
--         draft_published 0 · nondraft_unpublished 0 · with_publisher 0
--         marker 1 · indexes 2 · chk 1
-- ============================================================================
-- select
--   count(*)                                                              as versions_total,
--   count(*) filter (where published_at is not null)                      as published,
--   count(*) filter (where published_at is null)                          as unpublished,
--   count(*) filter (where lower(trim(coalesce(campaign_status,''))) =  'draft'
--                      and published_at is not null)                      as draft_published,
--   count(*) filter (where lower(trim(coalesce(campaign_status,''))) <> 'draft'
--                      and published_at is null)                          as nondraft_unpublished,
--   count(*) filter (where published_by is not null)                      as with_publisher
-- from public.media_plan_versions;
--
-- select count(*) as marker from public.migration_markers
--  where key = '0018_version_publication_backfill';
-- select count(*) as indexes from pg_indexes
--  where tablename = 'media_plan_versions'
--    and indexname in ('idx_mpv_published_at','idx_mpv_master_published');
-- select count(*) as chk from pg_constraint
--  where conrelid = 'public.media_plan_versions'::regclass
--    and conname  = 'media_plan_versions_published_by_lowercase';
--
-- -- Sanity: the 14 draft master tips must now be unpublished, so they keep
-- -- overwriting in place instead of spawning a version on every save.
-- select count(*) as draft_tips_unpublished
--   from media_plan_versions v
--   join media_plan_masters  m on m.id = v.master_id and m.published_version_id = v.id
--  where lower(trim(coalesce(v.campaign_status,''))) = 'draft'
--    and v.published_at is null;


-- ============================================================================
-- ROLLBACK — restores the 0018 state exactly.
-- ============================================================================
-- begin;
-- update public.media_plan_versions
--    set published_at = created_at
--  where published_at is null;
-- delete from public.migration_markers
--  where key = '0018_version_publication_backfill';
-- drop index if exists public.idx_mpv_master_published;
-- drop index if exists public.idx_mpv_published_at;
-- commit;
