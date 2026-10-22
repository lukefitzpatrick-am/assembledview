-- 2026-10-22 codex_activity: delete orphan activity rows Luke approved
-- Project: Supabase slpdibnxtpdlttbbczvg. Run in the Supabase SQL editor.
--
-- Why
--   Codex activity rows whose subject no longer exists. Luke approved the
--   delete on 22 Oct 2026. Nothing else in codex_activity is touched.
--
-- Target rows (and only these)
--   A. entity_type = 'checklist_item' where the checklist item is gone
--      (no task_checklist_items row) AND its parent task is gone (no tasks
--      row for the task_id in after/before), label in 'Close month' /
--      'Pull pacing' / 'Send deck', created 7 Aug to 19 Oct 2026 (UTC).
--   B. entity_type = 'task', entity_id = 2 ('test', created 1 Aug 2026),
--      whose task is gone.
--
-- Measured read-only 22 Oct 2026
--   A. 748 rows (every orphan checklist_item row: all three labels, all
--      with a task_id, all inside the window). 0 orphans outside the filter.
--   B. 1 row (codex_activity.id 1).
--   codex_activity holds 1,774 rows in all, so 1,025 stay.
--   No triggers, rules or foreign keys reference codex_activity.
--   Guards are exact: A = 748 and B = 1, or the block aborts.

-- ===================== BEFORE =====================
SELECT 'A checklist_item orphans' AS part, count(*) AS rows_,
       min(a.created_at) AS first_at, max(a.created_at) AS last_at,
       array_agg(DISTINCT coalesce(a.after->>'label', a.before->>'label')) AS labels
FROM codex_activity a
WHERE a.entity_type = 'checklist_item'
  AND coalesce(a.after->>'task_id', a.before->>'task_id') IS NOT NULL
  AND coalesce(a.after->>'label', a.before->>'label') IN ('Close month', 'Pull pacing', 'Send deck')
  AND a.created_at >= '2026-08-07' AND a.created_at < '2026-10-20'
  AND NOT EXISTS (SELECT 1 FROM task_checklist_items ci WHERE ci.id = a.entity_id)
  AND NOT EXISTS (SELECT 1 FROM tasks t
                  WHERE t.id = coalesce(a.after->>'task_id', a.before->>'task_id')::bigint)
UNION ALL
SELECT 'B task 2 orphan', count(*), min(a.created_at), max(a.created_at),
       array_agg(DISTINCT coalesce(a.after->>'title', a.before->>'title'))
FROM codex_activity a
WHERE a.entity_type = 'task' AND a.entity_id = 2
  AND NOT EXISTS (SELECT 1 FROM tasks t WHERE t.id = a.entity_id)
UNION ALL
SELECT 'codex_activity total', count(*), min(created_at), max(created_at), NULL
FROM codex_activity;
-- Expect A 748 (7 Aug to 19 Oct, Close month / Pull pacing / Send deck),
--        B 1 ('test', 1 Aug), total 1774

-- ===================== CHANGE =====================
DO $$
DECLARE
  v_a       int;
  v_b       int;
  v_del_a   int;
  v_del_b   int;
BEGIN
  SELECT count(*) INTO v_a
  FROM codex_activity a
  WHERE a.entity_type = 'checklist_item'
    AND coalesce(a.after->>'task_id', a.before->>'task_id') IS NOT NULL
    AND coalesce(a.after->>'label', a.before->>'label') IN ('Close month', 'Pull pacing', 'Send deck')
    AND a.created_at >= '2026-08-07' AND a.created_at < '2026-10-20'
    AND NOT EXISTS (SELECT 1 FROM task_checklist_items ci WHERE ci.id = a.entity_id)
    AND NOT EXISTS (SELECT 1 FROM tasks t
                    WHERE t.id = coalesce(a.after->>'task_id', a.before->>'task_id')::bigint);

  SELECT count(*) INTO v_b
  FROM codex_activity a
  WHERE a.entity_type = 'task' AND a.entity_id = 2
    AND NOT EXISTS (SELECT 1 FROM tasks t WHERE t.id = a.entity_id);

  RAISE NOTICE 'checklist orphans=% task orphans=%', v_a, v_b;

  IF v_a <> 748 THEN
    RAISE EXCEPTION 'Aborting: % checklist_item orphan rows, expected 748.', v_a;
  END IF;
  IF v_b <> 1 THEN
    RAISE EXCEPTION 'Aborting: % task 2 orphan rows, expected 1.', v_b;
  END IF;

  DELETE FROM codex_activity a
  WHERE a.entity_type = 'checklist_item'
    AND coalesce(a.after->>'task_id', a.before->>'task_id') IS NOT NULL
    AND coalesce(a.after->>'label', a.before->>'label') IN ('Close month', 'Pull pacing', 'Send deck')
    AND a.created_at >= '2026-08-07' AND a.created_at < '2026-10-20'
    AND NOT EXISTS (SELECT 1 FROM task_checklist_items ci WHERE ci.id = a.entity_id)
    AND NOT EXISTS (SELECT 1 FROM tasks t
                    WHERE t.id = coalesce(a.after->>'task_id', a.before->>'task_id')::bigint);
  GET DIAGNOSTICS v_del_a = ROW_COUNT;

  DELETE FROM codex_activity a
  WHERE a.entity_type = 'task' AND a.entity_id = 2
    AND NOT EXISTS (SELECT 1 FROM tasks t WHERE t.id = a.entity_id);
  GET DIAGNOSTICS v_del_b = ROW_COUNT;

  IF v_del_a <> 748 OR v_del_b <> 1 THEN
    RAISE EXCEPTION 'Aborting: deleted % and %, expected 748 and 1. Rolled back.', v_del_a, v_del_b;
  END IF;

  RAISE NOTICE 'deleted checklist_item=% task=%', v_del_a, v_del_b;
END $$;

-- ===================== AFTER =====================
SELECT 'orphan checklist_item rows left' AS check_, count(*) AS rows_
FROM codex_activity a
WHERE a.entity_type = 'checklist_item'
  AND NOT EXISTS (SELECT 1 FROM task_checklist_items ci WHERE ci.id = a.entity_id)
  AND NOT EXISTS (SELECT 1 FROM tasks t
                  WHERE t.id = coalesce(a.after->>'task_id', a.before->>'task_id')::bigint)
UNION ALL
SELECT 'orphan task rows left (task 2)', count(*)
FROM codex_activity a
WHERE a.entity_type = 'task' AND a.entity_id = 2
  AND NOT EXISTS (SELECT 1 FROM tasks t WHERE t.id = a.entity_id)
UNION ALL
SELECT 'codex_activity total', count(*) FROM codex_activity;
-- Expect 0, 0 and 1025 (1774 - 749), plus any new activity since 22 Oct.
