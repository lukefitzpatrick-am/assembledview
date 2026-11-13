-- 0118_codex_s1_projects: guarded run file for Luke.
-- Supabase project slpdibnxtpdlttbbczvg. Luke runs this by hand in the SQL Editor.
-- Same DDL as db/migrations/0118_codex_s1_projects.sql (the repo copy, AUTHOR ONLY).
--
-- What it does
--   Creates ten empty Codex S1 tables (RLS on, no policies, no ava_readonly
--   grant), adds ten columns to tasks and mentions to task_comments, widens
--   tasks_priority_check (asap) and tasks_source_check (automation), fills
--   tasks.due_on from due_date (Sydney civil date; 2 rows on 13 Nov 2026),
--   adds the sync trigger trg_tasks_codex_s1_sync and the board indexes, and
--   writes the marker 0118_codex_s1_projects.
--   Changes no other value in any existing row. completed_at is NOT filled for
--   tasks already done (5 rows on 13 Nov 2026); it is set from the next time a
--   task becomes done.
--   Until this runs, every /api/codex/projects route answers 503
--   "migration_not_applied" with codex_projects on (404 with it off), and
--   nothing else reads the new tables or columns.
--
-- Order
--   1. Run the BEFORE block. Check every expected value.
--   2. Run the DO block. It refuses (nothing done) if the marker or
--      codex_projects already exists, and rolls back if any AFTER check
--      inside fails.
--   3. Run the AFTER block. Check every expected value.
--   Any time before turning codex_projects on. Then, in a later small
--   change, mirror the new tasks and task_comments columns in
--   db/schema/codex.ts (C-210).

-- ===================== 1. BEFORE (read only) =====================
SELECT to_regclass('public.codex_projects') AS codex_projects;                  -- expect NULL
SELECT count(*) AS marker_rows FROM public.migration_markers
 WHERE key = '0118_codex_s1_projects';                                          -- expect 0
SELECT count(*) AS new_task_columns FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'tasks'
   AND column_name IN ('project_id','section_id','task_type','assigned_by_email','start_on',
                       'due_on','sort_order','completed_at','custom_values','created_by_automation'); -- expect 0
SELECT pg_get_constraintdef(oid) FROM pg_constraint
 WHERE conrelid = 'public.tasks'::regclass AND conname IN ('tasks_priority_check','tasks_source_check'); -- expect the low/normal/high and manual/ava/template/recurring/profile: lists
SELECT count(*) AS with_due_date FROM public.tasks WHERE due_date IS NOT NULL; -- 2 on 13 Nov 2026
SELECT count(*) FILTER (WHERE priority NOT IN ('low','normal','high')) AS odd_priority,
       count(*) FILTER (WHERE source NOT IN ('manual','ava','template','recurring') AND source NOT LIKE 'profile:%') AS odd_source
  FROM public.tasks;                                                            -- expect 0, 0
SELECT count(*) AS task_triggers FROM pg_trigger
 WHERE tgrelid = 'public.tasks'::regclass AND NOT tgisinternal;                 -- expect 0

-- ===================== 2. CHANGE (one DO block) =====================
DO $$
DECLARE
  n_tables  integer;
  n_rls     integer;
  n_grant   integer;
  n_cols    integer;
  n_ment    integer;
  n_bad_due bigint;
  n_trig    integer;
  n_rows    bigint;
  n_marker  integer;
  def_prio  text;
  def_src   text;
BEGIN
  IF EXISTS (SELECT 1 FROM public.migration_markers WHERE key = '0118_codex_s1_projects') THEN
    RAISE EXCEPTION 'marker 0118_codex_s1_projects already exists - nothing done';
  END IF;
  IF to_regclass('public.codex_projects') IS NOT NULL THEN
    RAISE EXCEPTION 'codex_projects already exists - nothing done';
  END IF;

  -- Projects -----------------------------------------------------------------
  CREATE TABLE IF NOT EXISTS public.codex_projects (
    id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    kind              text NOT NULL
                      CONSTRAINT codex_projects_kind_check
                      CHECK (kind IN ('campaign','retainer','onboarding','pitch','internal','ops')),
    client_id         bigint,
    mba_number        text,
    name              text NOT NULL,
    owner_email       text,
    is_private        boolean NOT NULL DEFAULT false,
    progress_field_id bigint,
    status            text NOT NULL DEFAULT 'active'
                      CONSTRAINT codex_projects_status_check
                      CHECK (status IN ('active','on_hold','closed')),
    start_on          date,
    due_on            date,
    teams_channel_id  text,
    created_by_email  text NOT NULL,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    deleted_at        timestamptz
  );
  CREATE UNIQUE INDEX IF NOT EXISTS uq_codex_projects_mba
    ON public.codex_projects (mba_number)
    WHERE mba_number IS NOT NULL AND deleted_at IS NULL;

  CREATE TABLE IF NOT EXISTS public.codex_project_members (
    project_id bigint NOT NULL REFERENCES public.codex_projects(id) ON DELETE CASCADE,
    email      text NOT NULL,
    PRIMARY KEY (project_id, email)
  );
  CREATE INDEX IF NOT EXISTS idx_codex_project_members_email
    ON public.codex_project_members (email);

  CREATE TABLE IF NOT EXISTS public.codex_sections (
    id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    project_id        bigint NOT NULL REFERENCES public.codex_projects(id) ON DELETE CASCADE,
    name              text NOT NULL,
    sort_order        integer NOT NULL DEFAULT 0,
    collapsed_default boolean NOT NULL DEFAULT false,
    status_category   text NOT NULL DEFAULT 'todo'
                      CONSTRAINT codex_sections_status_category_check
                      CHECK (status_category IN ('todo','in_progress','waiting','done'))
  );
  CREATE INDEX IF NOT EXISTS idx_codex_sections_project_sort
    ON public.codex_sections (project_id, sort_order);

  CREATE TABLE IF NOT EXISTS public.codex_custom_fields (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    project_id  bigint REFERENCES public.codex_projects(id) ON DELETE CASCADE,
    name        text NOT NULL,
    field_type  text NOT NULL
                CONSTRAINT codex_custom_fields_field_type_check
                CHECK (field_type IN ('single_select','multi_select','text','date')),
    options     jsonb,
    done_option text
  );
  CREATE INDEX IF NOT EXISTS idx_codex_custom_fields_project
    ON public.codex_custom_fields (project_id);

  ALTER TABLE public.codex_projects
    ADD CONSTRAINT codex_projects_progress_field_id_fkey
    FOREIGN KEY (progress_field_id) REFERENCES public.codex_custom_fields(id) ON DELETE SET NULL;

  -- Task columns ---------------------------------------------------------------
  ALTER TABLE public.tasks
    ADD COLUMN IF NOT EXISTS project_id bigint
      CONSTRAINT tasks_project_id_fkey REFERENCES public.codex_projects(id),
    ADD COLUMN IF NOT EXISTS section_id bigint
      CONSTRAINT tasks_section_id_fkey REFERENCES public.codex_sections(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS task_type text NOT NULL DEFAULT 'task'
      CONSTRAINT tasks_task_type_check
      CHECK (task_type IN ('task','subtask','help','milestone','approval')),
    ADD COLUMN IF NOT EXISTS assigned_by_email text,
    ADD COLUMN IF NOT EXISTS start_on date,
    ADD COLUMN IF NOT EXISTS due_on date,
    ADD COLUMN IF NOT EXISTS sort_order integer,
    ADD COLUMN IF NOT EXISTS completed_at timestamptz,
    ADD COLUMN IF NOT EXISTS custom_values jsonb NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS created_by_automation boolean NOT NULL DEFAULT false;

  -- Check changes (Asana Medium maps to normal; asap for the planner) -------------
  ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_priority_check;
  ALTER TABLE public.tasks ADD CONSTRAINT tasks_priority_check
    CHECK (priority IS NULL OR priority IN ('low','normal','high','asap'));
  ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_source_check;
  ALTER TABLE public.tasks ADD CONSTRAINT tasks_source_check
    CHECK (source IN ('manual','ava','template','recurring','automation') OR source LIKE 'profile:%');

  -- due_on (D10: Sydney civil date). Structural column move, plan section 10.
  -- Runs once, inside the marker guard, before the sync trigger exists.
  UPDATE public.tasks
     SET due_on = (due_date AT TIME ZONE 'Australia/Sydney')::date
   WHERE due_date IS NOT NULL AND due_on IS NULL;

  -- Keep due_on and due_date in step, completed_at on done tasks only.
  -- due_date is written today as a bare YYYY-MM-DD in a UTC session (00:00
  -- UTC); due_on -> due_date writes that same instant.
  -- A write that sets both (an UPDATE changing both, or an INSERT giving
  -- both) must agree: due_on is the Sydney civil date of due_date. If not,
  -- the write is refused (check_violation), so neither date is silently
  -- dropped and the writer's bug shows at once. No writer sets both today.
  CREATE OR REPLACE FUNCTION public.codex_tasks_s1_sync()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog, public
  AS $fn$
  BEGIN
    IF TG_OP = 'INSERT' THEN
      IF NEW.due_on IS NULL AND NEW.due_date IS NOT NULL THEN
        NEW.due_on := (NEW.due_date AT TIME ZONE 'Australia/Sydney')::date;
      ELSIF NEW.due_date IS NULL AND NEW.due_on IS NOT NULL THEN
        NEW.due_date := (NEW.due_on::timestamp AT TIME ZONE 'UTC');
      ELSIF NEW.due_on IS DISTINCT FROM (NEW.due_date AT TIME ZONE 'Australia/Sydney')::date THEN
        RAISE EXCEPTION 'tasks: due_on % does not match due_date % (Sydney date %); write one of them, or both from one date',
          NEW.due_on, NEW.due_date, (NEW.due_date AT TIME ZONE 'Australia/Sydney')::date
          USING ERRCODE = 'check_violation';
      END IF;
      IF NEW.status = 'done' THEN
        IF NEW.completed_at IS NULL THEN NEW.completed_at := now(); END IF;
      ELSE
        NEW.completed_at := NULL;
      END IF;
    ELSE
      IF NEW.due_date IS DISTINCT FROM OLD.due_date AND NEW.due_on IS NOT DISTINCT FROM OLD.due_on THEN
        NEW.due_on := CASE WHEN NEW.due_date IS NULL THEN NULL
                           ELSE (NEW.due_date AT TIME ZONE 'Australia/Sydney')::date END;
      ELSIF NEW.due_on IS DISTINCT FROM OLD.due_on AND NEW.due_date IS NOT DISTINCT FROM OLD.due_date THEN
        NEW.due_date := CASE WHEN NEW.due_on IS NULL THEN NULL
                             ELSE (NEW.due_on::timestamp AT TIME ZONE 'UTC') END;
      ELSIF NEW.due_on IS DISTINCT FROM OLD.due_on
            AND NEW.due_on IS DISTINCT FROM (NEW.due_date AT TIME ZONE 'Australia/Sydney')::date THEN
        -- Both changed in one UPDATE and they disagree (STACKfix, review L4).
        RAISE EXCEPTION 'tasks: due_on % does not match due_date % (Sydney date %); write one of them, or both from one date',
          NEW.due_on, NEW.due_date, (NEW.due_date AT TIME ZONE 'Australia/Sydney')::date
          USING ERRCODE = 'check_violation';
      END IF;
      IF NEW.status = 'done' THEN
        IF OLD.status IS DISTINCT FROM 'done' AND NEW.completed_at IS NOT DISTINCT FROM OLD.completed_at THEN
          NEW.completed_at := now();
        END IF;
      ELSE
        NEW.completed_at := NULL;
      END IF;
    END IF;
    RETURN NEW;
  END
  $fn$;

  DROP TRIGGER IF EXISTS trg_tasks_codex_s1_sync ON public.tasks;
  CREATE TRIGGER trg_tasks_codex_s1_sync
    BEFORE INSERT OR UPDATE ON public.tasks
    FOR EACH ROW EXECUTE FUNCTION public.codex_tasks_s1_sync();

  -- Board and My Work indexes
  CREATE INDEX IF NOT EXISTS idx_tasks_project_section_sort
    ON public.tasks (project_id, section_id, sort_order);
  CREATE INDEX IF NOT EXISTS idx_tasks_section_id
    ON public.tasks (section_id);
  CREATE INDEX IF NOT EXISTS idx_tasks_assignee_email_due_on
    ON public.tasks (assignee_email, due_on);
  CREATE INDEX IF NOT EXISTS idx_tasks_assigned_by_email
    ON public.tasks (assigned_by_email);
  CREATE INDEX IF NOT EXISTS idx_tasks_due_on
    ON public.tasks (due_on);

  -- Comments
  ALTER TABLE public.task_comments
    ADD COLUMN IF NOT EXISTS mentions jsonb NOT NULL DEFAULT '[]'::jsonb;

  -- Followers and attachments -----------------------------------------------------
  CREATE TABLE IF NOT EXISTS public.task_followers (
    task_id bigint NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
    email   text NOT NULL,
    reason  text,
    PRIMARY KEY (task_id, email)
  );
  CREATE INDEX IF NOT EXISTS idx_task_followers_email
    ON public.task_followers (email);

  CREATE TABLE IF NOT EXISTS public.task_attachments (
    id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    task_id           bigint NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
    kind              text NOT NULL
                      CONSTRAINT task_attachments_kind_check CHECK (kind IN ('blob','link')),
    name              text NOT NULL,
    blob_pathname     text,
    url               text,
    size_bytes        bigint,
    uploaded_by_email text NOT NULL,
    created_at        timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT task_attachments_target_check CHECK (
      (kind = 'blob' AND blob_pathname IS NOT NULL) OR (kind = 'link' AND url IS NOT NULL)
    )
  );
  CREATE INDEX IF NOT EXISTS idx_task_attachments_task_id
    ON public.task_attachments (task_id);

  -- Boards, notifications, prefs --------------------------------------------------
  CREATE TABLE IF NOT EXISTS public.codex_board_configs (
    id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    scope          text NOT NULL,
    owner_email    text,
    group_by       text NOT NULL,
    swimlane_by    text,
    card_fields    jsonb NOT NULL DEFAULT '[]'::jsonb,
    hide_completed boolean NOT NULL DEFAULT true,
    wip_limits     jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at     timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS idx_codex_board_configs_scope_owner
    ON public.codex_board_configs (scope, owner_email);

  CREATE TABLE IF NOT EXISTS public.codex_notifications (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    recipient_email text NOT NULL,
    kind            text NOT NULL,
    task_id         bigint REFERENCES public.tasks(id) ON DELETE CASCADE,
    actor_email     text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    read_at         timestamptz,
    teams_sent_at   timestamptz,
    email_digest_at timestamptz
  );
  CREATE INDEX IF NOT EXISTS idx_codex_notifications_recipient_read
    ON public.codex_notifications (recipient_email, read_at);
  CREATE INDEX IF NOT EXISTS idx_codex_notifications_task_id
    ON public.codex_notifications (task_id);

  CREATE TABLE IF NOT EXISTS public.codex_notification_prefs (
    email       text PRIMARY KEY,
    prefs       jsonb NOT NULL DEFAULT '{}'::jsonb,
    quiet_start time DEFAULT '18:00',
    quiet_end   time DEFAULT '08:00'
  );

  CREATE TABLE IF NOT EXISTS public.codex_user_prefs (
    email                    text PRIMARY KEY,
    default_lens             text NOT NULL DEFAULT 'plan'
                             CONSTRAINT codex_user_prefs_default_lens_check
                             CHECK (default_lens IN ('plan','flow')),
    calendar_feed_token_hash text,
    updated_at               timestamptz NOT NULL DEFAULT now()
  );

  -- RLS on, no policies, no ava_readonly grant ---------------------------------------
  ALTER TABLE public.codex_projects           ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.codex_project_members    ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.codex_sections           ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.codex_custom_fields      ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.task_followers           ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.task_attachments         ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.codex_board_configs      ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.codex_notifications      ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.codex_notification_prefs ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.codex_user_prefs         ENABLE ROW LEVEL SECURITY;

  COMMENT ON TABLE public.codex_projects IS
    'Codex projects (S1). Private projects are visible to the owner, the creator and members only (app). No FK to clients (DI-12).';
  COMMENT ON TABLE public.codex_sections IS
    'Codex project sections (board columns). status_category drives tasks.status when a task moves in; a project keeps at least one done section (app).';
  COMMENT ON COLUMN public.tasks.due_on IS
    'Sydney civil due date (S1 read column). Kept in step with due_date by trg_tasks_codex_s1_sync; a write that sets both to different days is refused.';
  COMMENT ON COLUMN public.tasks.completed_at IS
    'Set when status becomes done, cleared when it leaves done (trg_tasks_codex_s1_sync).';

  INSERT INTO public.migration_markers (key, note)
  VALUES ('0118_codex_s1_projects', 'Codex S1: 10 tables, 10 tasks columns, mentions, checks, due_on fill and sync trigger. RLS on, no ava grants.');

  -- AFTER checks inside the block. Any failure rolls the whole block back.
  SELECT count(*) INTO n_tables FROM information_schema.tables
   WHERE table_schema = 'public' AND table_name IN (
     'codex_projects','codex_project_members','codex_sections','codex_custom_fields','task_followers',
     'task_attachments','codex_board_configs','codex_notifications','codex_notification_prefs','codex_user_prefs');
  IF n_tables <> 10 THEN RAISE EXCEPTION 'expected 10 new tables, found %', n_tables; END IF;

  SELECT count(*) INTO n_rls FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relrowsecurity AND c.relname IN (
     'codex_projects','codex_project_members','codex_sections','codex_custom_fields','task_followers',
     'task_attachments','codex_board_configs','codex_notifications','codex_notification_prefs','codex_user_prefs');
  IF n_rls <> 10 THEN RAISE EXCEPTION 'expected RLS on 10 new tables, found %', n_rls; END IF;

  SELECT count(*) INTO n_grant FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND grantee = 'ava_readonly' AND table_name IN (
     'codex_projects','codex_project_members','codex_sections','codex_custom_fields','task_followers',
     'task_attachments','codex_board_configs','codex_notifications','codex_notification_prefs','codex_user_prefs');
  IF n_grant <> 0 THEN RAISE EXCEPTION 'expected no ava_readonly grant on the new tables, found %', n_grant; END IF;

  SELECT count(*) INTO n_cols FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'tasks'
     AND column_name IN ('project_id','section_id','task_type','assigned_by_email','start_on',
                         'due_on','sort_order','completed_at','custom_values','created_by_automation');
  IF n_cols <> 10 THEN RAISE EXCEPTION 'expected 10 new tasks columns, found %', n_cols; END IF;

  SELECT count(*) INTO n_ment FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'task_comments' AND column_name = 'mentions';
  IF n_ment <> 1 THEN RAISE EXCEPTION 'expected task_comments.mentions'; END IF;

  SELECT pg_get_constraintdef(oid) INTO def_prio FROM pg_constraint
   WHERE conrelid = 'public.tasks'::regclass AND conname = 'tasks_priority_check';
  IF def_prio IS NULL OR position('asap' IN def_prio) = 0 THEN
    RAISE EXCEPTION 'tasks_priority_check does not allow asap: %', def_prio;
  END IF;
  SELECT pg_get_constraintdef(oid) INTO def_src FROM pg_constraint
   WHERE conrelid = 'public.tasks'::regclass AND conname = 'tasks_source_check';
  IF def_src IS NULL OR position('automation' IN def_src) = 0 OR position('profile:' IN def_src) = 0 THEN
    RAISE EXCEPTION 'tasks_source_check is wrong: %', def_src;
  END IF;

  SELECT count(*) INTO n_bad_due FROM public.tasks
   WHERE (due_date IS NULL) <> (due_on IS NULL)
      OR (due_date IS NOT NULL AND due_on <> (due_date AT TIME ZONE 'Australia/Sydney')::date);
  IF n_bad_due <> 0 THEN RAISE EXCEPTION 'expected due_on to match due_date on every row, % differ', n_bad_due; END IF;

  SELECT count(*) INTO n_trig FROM pg_trigger
   WHERE tgrelid = 'public.tasks'::regclass AND tgname = 'trg_tasks_codex_s1_sync';
  IF n_trig <> 1 THEN RAISE EXCEPTION 'expected trigger trg_tasks_codex_s1_sync'; END IF;

  SELECT (SELECT count(*) FROM public.codex_projects) + (SELECT count(*) FROM public.codex_sections)
       + (SELECT count(*) FROM public.task_followers) + (SELECT count(*) FROM public.codex_notifications)
    INTO n_rows;
  IF n_rows <> 0 THEN RAISE EXCEPTION 'expected the new tables empty, found % rows', n_rows; END IF;

  SELECT count(*) INTO n_marker FROM public.migration_markers WHERE key = '0118_codex_s1_projects';
  IF n_marker <> 1 THEN RAISE EXCEPTION 'expected 1 marker row, found %', n_marker; END IF;

  RAISE NOTICE '0118_codex_s1_projects applied: 10 tables, 10 tasks columns, mentions, checks, due_on, trigger, marker.';
END
$$;

-- ===================== 3. AFTER (read only) =====================
SELECT c.relname, c.relrowsecurity
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relname IN (
   'codex_projects','codex_project_members','codex_sections','codex_custom_fields','task_followers',
   'task_attachments','codex_board_configs','codex_notifications','codex_notification_prefs','codex_user_prefs')
 ORDER BY 1;                                                                    -- expect 10 rows, all true
SELECT column_name, data_type, is_nullable, column_default
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'tasks'
   AND column_name IN ('project_id','section_id','task_type','assigned_by_email','start_on',
                       'due_on','sort_order','completed_at','custom_values','created_by_automation')
 ORDER BY ordinal_position;                                                     -- expect 10 rows
SELECT id, due_date, due_on FROM public.tasks WHERE due_date IS NOT NULL;      -- due_on = Sydney date of due_date (2 rows on 13 Nov 2026)
SELECT count(*) FILTER (WHERE task_type <> 'task') AS not_task,
       count(*) FILTER (WHERE project_id IS NOT NULL) AS in_project,
       count(*) FILTER (WHERE completed_at IS NOT NULL) AS completed_at_set
  FROM public.tasks;                                                            -- expect 0, 0, 0
SELECT key FROM public.migration_markers WHERE key = '0118_codex_s1_projects'; -- expect 1 row

-- ===================== Rollback (only if you must undo) =====================
-- Turn codex_projects off first. Drops every project, section, follower,
-- attachment row, notification and pref, and the new task columns.
-- BEGIN;
--   DROP TRIGGER IF EXISTS trg_tasks_codex_s1_sync ON public.tasks;
--   DROP FUNCTION IF EXISTS public.codex_tasks_s1_sync();
--   DROP TABLE IF EXISTS public.codex_user_prefs, public.codex_notification_prefs,
--     public.codex_notifications, public.codex_board_configs, public.task_attachments,
--     public.task_followers;
--   ALTER TABLE public.task_comments DROP COLUMN IF EXISTS mentions;
--   ALTER TABLE public.tasks
--     DROP COLUMN IF EXISTS project_id, DROP COLUMN IF EXISTS section_id,
--     DROP COLUMN IF EXISTS task_type, DROP COLUMN IF EXISTS assigned_by_email,
--     DROP COLUMN IF EXISTS start_on, DROP COLUMN IF EXISTS due_on,
--     DROP COLUMN IF EXISTS sort_order, DROP COLUMN IF EXISTS completed_at,
--     DROP COLUMN IF EXISTS custom_values, DROP COLUMN IF EXISTS created_by_automation;
--   ALTER TABLE public.codex_projects DROP CONSTRAINT IF EXISTS codex_projects_progress_field_id_fkey;
--   DROP TABLE IF EXISTS public.codex_custom_fields, public.codex_sections,
--     public.codex_project_members, public.codex_projects;
--   ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_priority_check;
--   ALTER TABLE public.tasks ADD CONSTRAINT tasks_priority_check
--     CHECK (priority IS NULL OR priority IN ('low','normal','high'));     -- fails if any row is asap
--   ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_source_check;
--   ALTER TABLE public.tasks ADD CONSTRAINT tasks_source_check
--     CHECK (source IN ('manual','ava','template','recurring') OR source LIKE 'profile:%'); -- fails if any row is automation
--   DELETE FROM public.migration_markers WHERE key = '0118_codex_s1_projects';
-- COMMIT;
