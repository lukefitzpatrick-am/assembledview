-- Migration 0118: Codex S1 foundation (projects, sections, task columns, B38)
-- AUTHOR ONLY. Apply via Supabase SQL Editor. Do not drizzle-kit migrate.
-- The guarded run file for Luke is sql/supabase/2026-11-13_0118_codex_s1_projects_SUPABASE.sql
-- (same DDL, with BEFORE and AFTER checks). Run that one.
-- Idempotent: migration_markers guard.
--
-- Why: Codex plan section 10 S1 (Asana parity, plan 4.2 and 5). Projects with
-- their own sections, the task columns the board, task detail, comments,
-- notifications and My Work batches (B39 to B42) build on.
--
-- What it adds (plan section 10 S1, less codex_saved_views (0117) and
-- codex_connections (capture track, later)):
--   new tables  codex_projects, codex_project_members, codex_sections,
--               codex_custom_fields, task_followers, task_attachments,
--               codex_board_configs, codex_notifications,
--               codex_notification_prefs, codex_user_prefs
--   tasks       project_id, section_id, task_type, assigned_by_email,
--               start_on, due_on, sort_order, completed_at, custom_values,
--               created_by_automation
--   checks      tasks_priority_check gains 'asap'; tasks_source_check gains
--               'automation'
--   comments    task_comments.mentions jsonb
--   due_on      the plan's structural column move (D10): due_on is the
--               Sydney civil date of due_date, filled once for existing rows
--   trigger     trg_tasks_codex_s1_sync keeps due_on and due_date in step
--               (whichever a write changes) and keeps completed_at on done
--               tasks only, so writers that only know due_date and status
--               (Fireflies, recurring, seed, relabel, the Drizzle mirror
--               before it carries the new columns) stay correct
--   indexes     board (project, section, order), assignee and due_on,
--               assigned by, followers by email, notifications by recipient
--               and read_at
--
-- Differences from the plan SQL (safe-side choices, B38 notes):
--   * tasks.section_id is ON DELETE SET NULL (a section is deleted only
--     when it has no live tasks; soft-deleted tasks may still point at it).
--   * task_followers, task_attachments, codex_notifications and
--     codex_custom_fields cascade with their parent row, like
--     task_checklist_items and task_comments.
--   * codex_projects.progress_field_id references codex_custom_fields
--     (ON DELETE SET NULL); the plan names the link but has no FK.
--   * task_attachments checks that a blob has a pathname and a link a url.
--   * Constraints are named, so a later migration can find them.
--
-- RLS on every new table, no policies (server connection only), no
-- ava_readonly grant. No FK to clients (DI-12, until T6).
--
-- Mirror: the ten new tables are in db/schema/codex.ts, snapshot
-- db/drizzle/0028. The new tasks and task_comments columns are NOT in the
-- Drizzle tasks / taskComments objects yet: Drizzle lists every mirrored
-- column in db.select().from(tasks) and in inserts, so mirroring them before
-- this runs would 500 every Codex read (C-76). lib/codex/projectsRepo.ts
-- reads and writes them with raw SQL, only once the marker exists. Mirror
-- them after this is applied (C-210), as 0048 did for estimated_minutes.
-- Behind switches codex_v2 and codex_projects.

CREATE TABLE IF NOT EXISTS public.migration_markers (
  key         text primary key,
  applied_at  timestamptz not null default now(),
  note        text
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.migration_markers WHERE key = '0118_codex_s1_projects') THEN
    RAISE NOTICE '0118 already applied - no-op';
    RETURN;
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
END
$$;
