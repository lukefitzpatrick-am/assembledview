/**
 * Codex wording for a lock conflict (B43fix R1). Reading a Postgres failure
 * is `lib/db/pgError` (B49): `isLockConflict`, `safeErrorMessage`.
 */
export const LOCK_CONFLICT_MESSAGE = "Someone else was saving the same tasks at that moment. Nothing was changed. Try again."
