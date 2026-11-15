/**
 * C-264 (B43): who a system writer is, in `codex_activity`.
 *
 * A writer with no person behind it records a named system actor in
 * `actor_email` with `actor_kind 'system'`, never a bare "system" stored as a
 * user, and never a blank actor:
 * - `system:relabel`: the relabel auto-close (digest cron);
 * - `system:recurring`: the recurring copies (codex-recurring cron);
 * - `system:reminders`: the due and overdue reminders (codex-notifications cron).
 *
 * Every activity writer maps its actor through `activityActor`, so a system
 * actor passed down a shared path (an update, a section move, the progress
 * field) is recorded the same way at every step. Pure.
 */

export const SYSTEM_ACTORS = {
  relabel: "system:relabel",
  recurring: "system:recurring",
  reminders: "system:reminders",
} as const

export type SystemActor = (typeof SYSTEM_ACTORS)[keyof typeof SYSTEM_ACTORS]

const SYSTEM_PREFIX = "system:"

/** True for a named system actor (`system:<writer>`). */
export function isSystemActor(actor: string | null | undefined): actor is SystemActor {
  return typeof actor === "string" && actor.startsWith(SYSTEM_PREFIX) && actor.length > SYSTEM_PREFIX.length
}

type ActorKind = "user" | "ava" | "system"

/**
 * The `actor_email` and `actor_kind` an activity row stores for `actor`: a
 * named system actor as itself with kind `system`; a person's email in lower
 * case with `personKind` (default `user`); no actor: null with `noActorKind`
 * (default `personKind`).
 */
export function activityActor(
  actor: string | null | undefined,
  opts: { personKind?: ActorKind; noActorKind?: ActorKind } = {}
): { actorEmail: string | null; actorKind: ActorKind } {
  if (isSystemActor(actor)) return { actorEmail: actor, actorKind: "system" }
  const email = (actor ?? "").trim().toLowerCase()
  const personKind = opts.personKind ?? "user"
  return email ? { actorEmail: email, actorKind: personKind } : { actorEmail: null, actorKind: opts.noActorKind ?? personKind }
}
