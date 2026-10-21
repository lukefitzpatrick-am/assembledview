-- =============================================================================
-- Codex test junk cleanup (Supabase production, project slpdibnxtpdlttbbczvg)
-- 2026-10-21. MANUAL: Luke reviews and runs in the Supabase SQL editor.
--
-- Why: Codex DB tests loaded .env.local and wrote to production on 10 to 19 Oct
-- (fixed in 9aad3bd2, test DB guard). This removes only rows proven to be test
-- data:
--   * tasks on test client ids (client_id >= 900000000; all on 900090015)
--   * task 5656 "s1smv1ym5sn no client" (same test run tag, null client)
--   * the 9 test task templates named 's1rmv4wonmf %' and their items
--     (these hold the 6 live recurring seeds: 5 monthly:lbd, 1 weekly:fri)
--   * checklist items and comments of those tasks
--   * codex_activity rows for those tasks, checklist items, templates and
--     template items
--   * codex_activity rows for test team members (email name.help<run>@...,
--     created by repo.helpRequest.test.ts; the team_members rows are gone)
--
-- Measured read-only on 2026-10-21 (expected counts, guarded below):
--   tasks                          173  (172 on 900090015 + task 5656)
--     of which live (deleted_at null) 172, source 'recurring' 127,
--     with recurring_rule 6, assigned to Luke and live 32
--   task_checklist_items            33
--   task_comments                    0
--   task_template_items              8
--   task_templates                   9
--   codex_activity task            175
--   codex_activity checklist_item   33
--   codex_activity task_template    11
--   codex_activity task_template_item 8
--   codex_activity team_member     210
--   clients rows >= 900000000        0  (no test client rows exist)
--   ava_task_proposals linked        0
--
-- NOT deleted (ambiguous, listed for Luke; see the end of this file):
--   * 748 codex_activity 'checklist_item' create rows whose checklist item AND
--     parent task no longer exist (561 hard-deleted tasks, labels only
--     'Close month' / 'Pull pacing' / 'Send deck', 7 Aug to 19 Oct). Almost
--     certainly test leftovers (labels come from repo.stage1Templates.test.ts
--     and the app only soft-deletes tasks), but they carry no test client id
--     or prefix, so they are not in the guarded delete.
--   * 1 codex_activity 'task' create row (id 1, task 2 titled 'test',
--     1 Aug 2026) whose task no longer exists.
--
-- If the guard raises, counts moved since 21 Oct (for example the recurring
-- job spawned another instance from a seed, or a test ran). Re-run the Before
-- block, check the new rows are test rows, update the expected numbers, rerun.
-- =============================================================================

-- ---------- Before counts (read-only) ----------------------------------------
WITH t AS (
  SELECT id FROM tasks
  WHERE client_id >= 900000000
     OR (id = 5656 AND client_id IS NULL AND title LIKE 's1smv1ym5sn %')
), ci AS (
  SELECT id FROM task_checklist_items WHERE task_id IN (SELECT id FROM t)
), tp AS (
  SELECT id FROM task_templates WHERE name LIKE 's1rmv4wonmf %'
), ti AS (
  SELECT id FROM task_template_items WHERE template_id IN (SELECT id FROM tp)
)
SELECT 'tasks' AS what, count(*) AS n FROM t
UNION ALL SELECT 'tasks_live', count(*) FROM tasks WHERE id IN (SELECT id FROM t) AND deleted_at IS NULL
UNION ALL SELECT 'tasks_recurring_source', count(*) FROM tasks WHERE id IN (SELECT id FROM t) AND source = 'recurring'
UNION ALL SELECT 'tasks_with_rule', count(*) FROM tasks WHERE id IN (SELECT id FROM t) AND recurring_rule IS NOT NULL
UNION ALL SELECT 'task_checklist_items', count(*) FROM ci
UNION ALL SELECT 'task_comments', count(*) FROM task_comments WHERE task_id IN (SELECT id FROM t)
UNION ALL SELECT 'task_templates', count(*) FROM tp
UNION ALL SELECT 'task_template_items', count(*) FROM ti
UNION ALL SELECT 'activity_task', count(*) FROM codex_activity WHERE entity_type = 'task' AND entity_id IN (SELECT id FROM t)
UNION ALL SELECT 'activity_checklist_item', count(*) FROM codex_activity WHERE entity_type = 'checklist_item' AND entity_id IN (SELECT id FROM ci)
UNION ALL SELECT 'activity_task_template', count(*) FROM codex_activity WHERE entity_type = 'task_template' AND entity_id IN (SELECT id FROM tp)
UNION ALL SELECT 'activity_task_template_item', count(*) FROM codex_activity WHERE entity_type = 'task_template_item' AND entity_id IN (SELECT id FROM ti)
UNION ALL SELECT 'activity_test_team_member', count(*) FROM codex_activity
  WHERE entity_type = 'team_member'
    AND coalesce(after->>'email', before->>'email', '') ~* '\.help[a-z0-9]{6,}@assembledmedia\.com\.au$'
    AND NOT EXISTS (SELECT 1 FROM team_members m WHERE m.id = codex_activity.entity_id)
UNION ALL SELECT 'tasks_using_test_templates_outside_set', count(*) FROM tasks
  WHERE template_id IN (SELECT id FROM tp) AND id NOT IN (SELECT id FROM t)
UNION ALL SELECT 'child_tasks_outside_set', count(*) FROM tasks
  WHERE parent_task_id IN (SELECT id FROM t) AND id NOT IN (SELECT id FROM t)
ORDER BY 1;

-- ---------- Guarded delete ---------------------------------------------------
BEGIN;

CREATE TEMP TABLE junk_tasks ON COMMIT DROP AS
  SELECT id FROM tasks
  WHERE client_id >= 900000000
     OR (id = 5656 AND client_id IS NULL AND title LIKE 's1smv1ym5sn %');
CREATE TEMP TABLE junk_checklist ON COMMIT DROP AS
  SELECT id FROM task_checklist_items WHERE task_id IN (SELECT id FROM junk_tasks);
CREATE TEMP TABLE junk_templates ON COMMIT DROP AS
  SELECT id FROM task_templates WHERE name LIKE 's1rmv4wonmf %';
CREATE TEMP TABLE junk_template_items ON COMMIT DROP AS
  SELECT id FROM task_template_items WHERE template_id IN (SELECT id FROM junk_templates);
CREATE TEMP TABLE junk_activity ON COMMIT DROP AS
  SELECT id FROM codex_activity
  WHERE (entity_type = 'task' AND entity_id IN (SELECT id FROM junk_tasks))
     OR (entity_type = 'checklist_item' AND entity_id IN (SELECT id FROM junk_checklist))
     OR (entity_type = 'task_template' AND entity_id IN (SELECT id FROM junk_templates))
     OR (entity_type = 'task_template_item' AND entity_id IN (SELECT id FROM junk_template_items))
     OR (entity_type = 'team_member'
         AND coalesce(after->>'email', before->>'email', '') ~* '\.help[a-z0-9]{6,}@assembledmedia\.com\.au$'
         AND NOT EXISTS (SELECT 1 FROM team_members m WHERE m.id = codex_activity.entity_id));

DO $$
DECLARE
  n_tasks int; n_ci int; n_cm int; n_tp int; n_ti int; n_act int;
  n_outside_tpl int; n_outside_child int;
BEGIN
  SELECT count(*) INTO n_tasks FROM junk_tasks;
  SELECT count(*) INTO n_ci FROM junk_checklist;
  SELECT count(*) INTO n_cm FROM task_comments WHERE task_id IN (SELECT id FROM junk_tasks);
  SELECT count(*) INTO n_tp FROM junk_templates;
  SELECT count(*) INTO n_ti FROM junk_template_items;
  SELECT count(*) INTO n_act FROM junk_activity;
  SELECT count(*) INTO n_outside_tpl FROM tasks
    WHERE template_id IN (SELECT id FROM junk_templates) AND id NOT IN (SELECT id FROM junk_tasks);
  SELECT count(*) INTO n_outside_child FROM tasks
    WHERE parent_task_id IN (SELECT id FROM junk_tasks) AND id NOT IN (SELECT id FROM junk_tasks);

  IF n_tasks <> 173 OR n_ci <> 33 OR n_cm <> 0 OR n_tp <> 9 OR n_ti <> 8
     OR n_act <> 437 OR n_outside_tpl <> 0 OR n_outside_child <> 0 THEN
    RAISE EXCEPTION
      'Counts moved since 2026-10-21: tasks % (exp 173), checklist % (33), comments % (0), templates % (9), template items % (8), activity % (437), real tasks on test templates % (0), real child tasks % (0). Nothing deleted.',
      n_tasks, n_ci, n_cm, n_tp, n_ti, n_act, n_outside_tpl, n_outside_child;
  END IF;
END $$;

-- Children first, then parents.
DELETE FROM codex_activity       WHERE id IN (SELECT id FROM junk_activity);
DELETE FROM task_comments        WHERE task_id IN (SELECT id FROM junk_tasks);
DELETE FROM task_checklist_items WHERE id IN (SELECT id FROM junk_checklist);
DELETE FROM tasks                WHERE id IN (SELECT id FROM junk_tasks);
DELETE FROM task_template_items  WHERE id IN (SELECT id FROM junk_template_items);
DELETE FROM task_templates       WHERE id IN (SELECT id FROM junk_templates);

COMMIT;

-- ---------- After counts (all should be 0) -----------------------------------
SELECT 'tasks_on_test_clients' AS what, count(*) AS n FROM tasks WHERE client_id >= 900000000
UNION ALL SELECT 'task_5656', count(*) FROM tasks WHERE id = 5656
UNION ALL SELECT 'test_templates', count(*) FROM task_templates WHERE name LIKE 's1rmv4wonmf %'
UNION ALL SELECT 'test_recurring_seeds', count(*) FROM tasks WHERE title LIKE 's1rmv4wonmf %' AND recurring_rule IS NOT NULL
UNION ALL SELECT 'orphan_checklist_items', count(*) FROM task_checklist_items c WHERE NOT EXISTS (SELECT 1 FROM tasks x WHERE x.id = c.task_id)
UNION ALL SELECT 'orphan_template_items', count(*) FROM task_template_items i WHERE NOT EXISTS (SELECT 1 FROM task_templates x WHERE x.id = i.template_id)
UNION ALL SELECT 'activity_test_team_member', count(*) FROM codex_activity
  WHERE entity_type = 'team_member'
    AND coalesce(after->>'email', before->>'email', '') ~* '\.help[a-z0-9]{6,}@assembledmedia\.com\.au$'
ORDER BY 1;

-- ---------- Ambiguous rows (NOT deleted; review only) ------------------------
-- 748 checklist_item activity rows whose item and task are both gone:
-- SELECT a.id, a.entity_id, a.after->>'task_id' AS task_id, a.after->>'label' AS label, a.created_at
-- FROM codex_activity a
-- WHERE a.entity_type = 'checklist_item'
--   AND NOT EXISTS (SELECT 1 FROM task_checklist_items x WHERE x.id = a.entity_id)
--   AND NOT EXISTS (SELECT 1 FROM tasks t WHERE t.id = (a.after->>'task_id')::int)
-- ORDER BY a.created_at;
--
-- 1 task activity row for task 2 ('test', 1 Aug 2026), task gone:
-- SELECT * FROM codex_activity a
-- WHERE a.entity_type = 'task' AND NOT EXISTS (SELECT 1 FROM tasks t WHERE t.id = a.entity_id);
