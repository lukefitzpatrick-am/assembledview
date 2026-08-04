# Codex write failure — static diagnosis (pre-browser)

**Status:** report only (4 Aug). No fixes. Complements live DB facts from Claude (tasks hard-deleted; `team_members` never inserted; failure today is before DB).
**Settles with browser:** HTTP status on `POST /api/codex/tasks` and `POST /api/codex/team` (404 vs 401 vs 403 vs 400 vs 500).

---

## STEP 1 — Gates and role derivation

### 1a — Flag gate and role gate (quoted)

**Flag** (`lib/codex/flag.ts`):

```ts
export function isCodexV2Enabled(): boolean {
  return (process.env.CODEX_V2 ?? "").trim().toLowerCase() === "on"
}
```

**Flag → 404 before auth** (`app/api/codex/_shared.ts:21-27`):

```ts
/** 404 when Codex v2 flag is off — checked before auth (module invisible). */
export function codexFlagGuard(): NextResponse | null {
  if (!isCodexV2Enabled()) {
    return NextResponse.json({ error: "not_found" }, { status: 404 })
  }
  return null
}
```

**Role allowlist** (`lib/codex/shadowRoles.ts`):

```ts
export const CODEX_SHADOW_ROLES = ["admin"] as const
export function userHasCodexShadowAccess(
  roles: readonly string[] | null | undefined
): boolean {
  if (!roles?.length) return false
  return CODEX_SHADOW_ROLES.some((r) => roles.includes(r))
}
```

**Auth gate** (`app/api/codex/_shared.ts:29-51`):

```ts
export async function requireCodexInternalAccess(request: Request): Promise<CodexAuthResult> {
  const session = await auth0.getSession(request as NextRequest)
  if (!session?.user) {
    return { error: NextResponse.json({ error: "unauthorised" }, { status: 401 }) }
  }
  const roles = getUserRoles(session.user)
  if (!userHasCodexShadowAccess(roles)) {
    return { error: NextResponse.json({ error: "forbidden" }, { status: 403 }) }
  }
  return { session, roles }
}
```

**Confirmed:** flag-off → **404**; no session → **401**; session without shadow role → **403**. Every `/api/codex/*` handler calls `codexFlagGuard()` then `requireCodexInternalAccess`.

### 1b — How session role is derived (highest-value check)

| Surface | Role function | Source of truth |
|---|---|---|
| Codex API (`requireCodexInternalAccess`) | `getUserRoles(session.user)` from `lib/rbac.ts` | Same |
| `requireAdmin` / `requireRole` | `getUserRoles(session.user)` | Same |
| Middleware (page + `/api` auth) | `getUserRoles(session.user)` | Same |
| Sidebar Codex link filter | `getUserRoles(user)` via `AuthContext` on Auth0 **client** `useUser()` | Same **function**, possibly different **user object shape** |

`getUserRoles` resolution order (`lib/rbac.ts` `getUserRolesWithSource`):

1. **Namespaced custom claims** — `https://assembledview.com/roles` (and `.au`, singular `/role`, env overrides)
2. Else **`app_metadata.role` / `app_metadata.roles`**
3. Else **`user_metadata.role` / `user_metadata.roles`**
4. Else infer admin from **`permissions`** starting with `write:users` / `delete:users`
5. Else `[]`

It does **not** read Auth0’s Management-API “roles” array as a separate channel — only whatever lands on the session/ID-token user object under those claim paths / metadata keys.

**Mismatch verdict (code-provable):** Codex does **not** use a different role vocabulary than `requireAdmin`. Both call `getUserRoles`. An admin who passes middleware/`requireAdmin` **cannot** be 403’d by Codex for a *different claim source* — same function, same session user on the server.

**Real differences that can still look like “admin elsewhere, Codex forbidden”:**

| Difference | Effect |
|---|---|
| `requireAdmin(..., { allowEmails })` email allowlist | Some admin APIs can grant without `admin` role; **Codex has no allowlist** → 403 |
| Flag off | Codex **404**, other admin APIs still 200 |
| Client `useUser()` missing namespaced claims | Sidebar may hide `/tasks`; **server** still uses full session — does not by itself 403 API if server claims include `admin` |

**Confidence that role-source mismatch explains admin-403:** **low (~15%)** from static analysis. Flag-off or allowlist-only “admin” are stronger code paths.

### 1c — `/tasks` page flag gate; no auth before it

`app/tasks/page.tsx`:

```ts
export default function TasksPage() {
  if (!isCodexV2Enabled()) {
    return ( /* EmptyState: "Codex is not enabled" / Set CODEX_V2=on … */ )
  }
  return ( <Suspense><TasksPageClient /></Suspense> )
}
```

**Confirmed:** only `isCodexV2Enabled()` runs before render. No `getSession` / `requireAdmin` / role check on the page module. When flag is off, `TasksPageClient` never mounts (no create buttons, no fetch).

### 1d — Where `/tasks` page-level auth is enforced

| Layer | `/tasks` behaviour |
|---|---|
| `middleware.ts` | Non-API: requires session (else login redirect). Clients redirected off staff paths. Unrecognised role → `/unauthorized`. **Recognised `admin` proceeds** — no Codex-specific check. |
| Parent layout | **No** `app/tasks/layout.tsx`. Root / `(internal)` layouts do not gate Codex. |
| Page | Flag only (1c). |
| Client | `accessDenied` UI if list fetch returns **403** (`TasksPageClient`). |
| API | Flag + `requireCodexInternalAccess` (1a). |

**Plain answer:** there is **no** Codex-specific page-level auth. Auth for the page is **generic staff middleware (must be `admin`)**. Shadow-role enforcement for writes/lists is **API-only** (plus client EmptyState on 403).

**Local env note (static):** workspace `.env.local` has **no** `CODEX_V2` key (ripgrep). Flag therefore evaluates **off** in local Next unless set elsewhere (shell / Vercel). That alone yields page EmptyState + API 404 and **zero DB writes** — consistent with “today: zero writes … before the database.”

---

## STEP 2 — Create-task path: button → POST

Flow: `TasksPageClient` `openCreate` → `TaskFormDialog` (create) → `onSubmit` → `POST /api/codex/tasks`.

### Early returns / guards that can stop the POST

**Before dialog exists**

1. **`CODEX_V2` off** — `page.tsx` never mounts client → no button.
2. **`accessDenied`** — after GET 403; full-page EmptyState; create button not rendered.
3. User must click **New task** (`openCreate`); no other gate on the button (`disabled` only on unrelated filter/pagination controls).

**Inside `TaskFormDialog` (create)**

4. **Zod / RHF** — submit handler is `form.handleSubmit(...)`; invalid form **never enters** `onSubmit` (no fetch):
   - `title` trim min 1
   - **`client_id` must be `z.number().int().positive()`** — default `0` until client selected → **blocks POST** with “Client is required”
   - `status` / `priority` / `category` enums (defaults set on open)
5. **`submitting`** — submit button `disabled={submitting}` only after a submit starts (does not block first click).
6. Edit-only early return (`Object.keys(patch).length === 0`) — **N/A** on create.

**After fetch starts (POST fired; not “before DB” in the client sense)**

7. API `codexFlagGuard` → 404  
8. API `requireCodexInternalAccess` → 401 / 403  
9. Invalid JSON / missing title / missing `client_id` → 400  
10. **`sessionEmail` empty** → 401 `no_user` (rare if session exists)  
11. `createTask` throw → 500  

Alternate create entry: `CreativeAdminLanding` also mounts `TaskFormDialog` when Codex flag on — same client validation + same API gates. Explains historical task rows without ever using the Team tab.

---

## STEP 3 — Team create path vs task path

Flow: Team tab → **Add member** → `TeamMemberFormDialog` → `POST /api/codex/team` → `createTeamMember` (`lib/codex/repo.ts:437+`).

### Explicit `id`?

**No.** Insert values are email, name, roleTitle, active, capacityNotes, workingStyle, defaultClientIds, timestamps only — no `id`. Matches `GENERATED … AS IDENTITY` (Drizzle: `generatedAlwaysAsIdentity()` on `team_members`).

### Why team could fail where task once succeeded

Same flag + same `requireCodexInternalAccess` as tasks. If tasks inserted on 1 Aug, those gates were open then.

| Difference | Implication |
|---|---|
| Team UI on **second tab**; default tab is **tasks** | Easy to create tasks and never open Team |
| Team form validation: name + email only (no `client_id`) | **Easier** than task form — not a stricter client gate |
| `team_members.email` **UNIQUE** | Failed insert would be 500 **and** would normally advance identity if `nextval` ran — live `is_called=FALSE` ⇒ insert **never reached** this DB |
| Soft delete vs never-tried | Tasks were created then hard-deleted; team seq never called ⇒ **no successful (or even attempted-at-identity) insert** |

**Code-provable:** nothing in `createTeamMember` / team POST uniquely blocks relative to task POST once the request body is valid. Historical zero rows + unused sequence ⇒ **POST body never reached `insert(teamMembers)` on this database** (UI never submitted, or request died at flag/auth/400 before repo).

---

## STEP 4 — Ranked candidate causes

| Rank | Cause | Evidence for | Evidence against | Confidence |
|---|---|---|---|---|
| **1** | **`CODEX_V2` not `on` in the process serving the browser** | Flag checked first → **404**, no DB; page EmptyState; local `.env.local` lacks `CODEX_V2`; “today zero writes before DB” | 1 Aug writes prove flag was on *somewhere* then; prod/Vercel may still have it | **~70% for today’s local/dev failure** (code + env absence). Browser status **404** proves it. |
| **2** | **Create never submitted (esp. Team); task create blocked on missing client** | Team seq never used; Team is secondary tab; task zod requires positive `client_id` | Doesn’t explain *today* if user is actively clicking create with client selected | **~55% for team-never**; **~40% for task UX block** when clients list empty / none selected |
| **3** | **403 — session lacks normalised `admin`** | `CODEX_SHADOW_ROLES=["admin"]`; client EmptyState on 403; tests assert client→403 | Same `getUserRoles` as rest of app; middleware already requires admin for `/tasks` | **~25%** unless allowlisted-only “admin” or empty roles somehow still browsing (unlikely past middleware) |
| **4** | **Role-source mismatch (Codex vs requireAdmin)** | Hypothesised in prompt | **Provably false for claim source** — both use `getUserRoles`. Only allowlist / flag differ | **~10%** as stated; allowlist-without-role is the only related variant (~20%) |
| **5** | **401 — no session on API** | Middleware also 401s unauthenticated `/api` | Page wouldn’t load without session | **~10%** |
| **6** | **DB / identity / NOT NULL** | — | Ruled out by Claude live verify; team `is_called=FALSE` is “never called”, not constraint fail | **~0%** (out of scope) |

### Top pick

**For today’s zero writes:** `CODEX_V2` off in the running server → flag gate 404 / page EmptyState. **Provable from code + local env absence;** confirmed when Network shows **404** `{ error: "not_found" }` on any `/api/codex/*`.

**For team never having a row while tasks once did:** not a separate server bug — **team create never hit `insert`**; most likely UI path unused (or never got past flag/auth). Task create is stricter (`client_id`) but still succeeded twice historically.

**Luke’s browser check:** one create attempt → note status:

- **404** → flag  
- **403** → role (`getUserRoles` missing `admin`)  
- **401** → session / email  
- **400** → validation (title/client/email)  
- **201** → static half wrong; look at client toast / wrong env DB  

No source or migration changes in this report.
