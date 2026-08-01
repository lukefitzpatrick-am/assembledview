-- 0013_codex_v2 — Codex shadow project, Stage 0 schema
-- Preconditions verified live before apply: tasks, task_checklist_items, task_comments,
-- task_templates, task_template_items, client_notes, client_domains ALL 0 rows.
-- Design refs: av-review/codex-rebuild-research-and-staged-plan-2026-07-30.md §3.
-- Deliberate omission: NO foreign keys from codex tables to clients yet — the ETL
-- truncate-and-reload of clients would collide with them. Revisit at T6 when reloads end.

-- ============ 1) tasks — email identity (Auth0) + Codex v2 columns ============
ALTER TABLE public.tasks
  DROP COLUMN assignee_user_id,
  DROP COLUMN created_by;

ALTER TABLE public.tasks
  ADD COLUMN assignee_email text,
  ADD COLUMN assignee_name text,
  ADD COLUMN created_by_email text,
  ADD COLUMN source text NOT NULL DEFAULT 'manual',
  ADD COLUMN source_note_id bigint REFERENCES public.client_notes(id) ON DELETE SET NULL,
  ADD COLUMN category text,
  ADD COLUMN deleted_at timestamptz;

ALTER TABLE public.tasks
  ALTER COLUMN title SET NOT NULL,
  ALTER COLUMN status SET DEFAULT 'todo',
  ALTER COLUMN status SET NOT NULL,
  ALTER COLUMN priority SET DEFAULT 'normal';

ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_source_check CHECK (source IN ('manual','ava','template','recurring')),
  ADD CONSTRAINT tasks_status_check CHECK (status IN ('backlog','todo','in_progress','waiting','done')),
  ADD CONSTRAINT tasks_priority_check CHECK (priority IS NULL OR priority IN ('low','normal','high'));

DROP INDEX IF EXISTS idx_tasks_assignee_user_id_due_date;
CREATE INDEX idx_tasks_assignee_email_due_date ON public.tasks (assignee_email, due_date);
CREATE INDEX idx_tasks_source_note_id ON public.tasks (source_note_id);

-- ============ 2) task_comments — email identity + author kind ============
ALTER TABLE public.task_comments
  DROP COLUMN user_id;

ALTER TABLE public.task_comments
  ADD COLUMN author_email text,
  ADD COLUMN author_name text,
  ADD COLUMN author_kind text NOT NULL DEFAULT 'user'
    CHECK (author_kind IN ('user','ava'));

-- ============ 3) codex-internal foreign keys (all tables empty — safe) ============
ALTER TABLE public.task_comments
  ADD CONSTRAINT fk_task_comments_task
  FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;
ALTER TABLE public.task_checklist_items
  ADD CONSTRAINT fk_task_checklist_items_task
  FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;
ALTER TABLE public.task_template_items
  ADD CONSTRAINT fk_task_template_items_template
  FOREIGN KEY (template_id) REFERENCES public.task_templates(id) ON DELETE CASCADE;
ALTER TABLE public.tasks
  ADD CONSTRAINT fk_tasks_template
  FOREIGN KEY (template_id) REFERENCES public.task_templates(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_task_comments_task_id ON public.task_comments (task_id);
CREATE INDEX IF NOT EXISTS idx_task_checklist_items_task_id ON public.task_checklist_items (task_id);

-- ============ 4) client_notes — Stage 3 ingestion support columns ============
ALTER TABLE public.client_notes
  ADD COLUMN organizer_email text,
  ADD COLUMN matched_by text CHECK (matched_by IS NULL OR matched_by IN ('domain','keyword','manual'));

-- ============ 5) team_members — the roster that feeds assignment + workload ============
CREATE TABLE public.team_members (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email text NOT NULL UNIQUE CHECK (email = lower(email)),
  name text NOT NULL,
  role_title text,
  active boolean NOT NULL DEFAULT true,
  capacity_notes text,
  working_style text,
  default_client_ids bigint[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============ 6) ava_task_proposals — the confirm queue AND the learning corpus ============
CREATE TABLE public.ava_task_proposals (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_note_id bigint REFERENCES public.client_notes(id) ON DELETE CASCADE,
  client_id bigint,
  proposed_title text NOT NULL,
  proposed_description text,
  proposed_category text,
  proposed_due_date timestamptz,
  proposed_assignee_email text,
  ava_confidence numeric(4,3),
  ava_rationale text,
  status text NOT NULL DEFAULT 'proposed'
    CHECK (status IN ('proposed','accepted','accepted_edited','rejected','expired')),
  decided_by_email text,
  decided_at timestamptz,
  created_task_id bigint REFERENCES public.tasks(id) ON DELETE SET NULL,
  decision_diff jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ava_task_proposals_status_created ON public.ava_task_proposals (status, created_at);
CREATE INDEX idx_ava_task_proposals_client ON public.ava_task_proposals (client_id);

-- ============ 7) assignment_rules — manual ways-of-work skeleton + learned rules ============
CREATE TABLE public.assignment_rules (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  client_id bigint,  -- NULL = global rule
  category text NOT NULL,
  assignee_email text NOT NULL,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','learned')),
  confidence numeric(4,3),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_assignment_rules_scope
  ON public.assignment_rules (COALESCE(client_id, 0), category) WHERE active;

-- ============ 8) codex_activity — append-only activity log ============
CREATE TABLE public.codex_activity (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entity_type text NOT NULL,
  entity_id bigint NOT NULL,
  actor_email text,  -- NULL = system
  actor_kind text NOT NULL DEFAULT 'user' CHECK (actor_kind IN ('user','ava','system')),
  action text NOT NULL,
  before jsonb,
  after jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_codex_activity_entity ON public.codex_activity (entity_type, entity_id, created_at);

-- ============ 9) fireflies_sync_state — poll cursor + run log (Xero-sync pattern) ============
CREATE TABLE public.fireflies_sync_state (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_started_at timestamptz NOT NULL DEFAULT now(),
  run_finished_at timestamptz,
  cursor_from timestamptz,
  meetings_seen integer NOT NULL DEFAULT 0,
  notes_created integer NOT NULL DEFAULT 0,
  notes_skipped integer NOT NULL DEFAULT 0,
  unmatched integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','ok','error')),
  error text
);

-- ============ 10) RLS on every new table (consistent with the other 45: on, no policies;
--                  app connects server-side as owner; ava_readonly gets NO grants — fail closed) ============
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ava_task_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignment_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.codex_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fireflies_sync_state ENABLE ROW LEVEL SECURITY;
