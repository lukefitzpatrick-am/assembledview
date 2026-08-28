# TypeScript 7 trial results

Date: 2026-07-11  
Branch under test: `trial/ts7` (deleted after run; not merged)  
Host branch: `localhost` (`package.json` / lockfile left untouched)

## Baseline

| Item | Value |
|------|--------|
| Package | `typescript@5.9.3` (`package.json`: `"typescript": "^5"`) |
| Command | `npx tsc --noEmit` |
| Cold | **5.69s**, exit **0**, **0** errors |
| Warm (2nd) | **4.59s**, exit **0** |

## Trial package (discovered at runtime)

Native TS7 compiler ships as **`@typescript/native-preview`** (bin: **`tsgo`**), not as a drop-in `typescript@7` replacement for this preview path.

| Item | Value |
|------|--------|
| Package | `@typescript/native-preview@7.0.0-dev.20260707.2` (`latest` tag as of run) |
| Command | `npx tsgo --noEmit` |
| Cold (first) | **9.46s**, exit **1**, **63** errors |
| Warm (2nd) | **1.47s**, exit **1**, same 63 errors |

Also noted (not installed for this trial): official `typescript@7.0.2` exists on npm as the JS/`tsc` line. This trial measured the **native** preview only.

## Speedup

| Comparison | Factor |
|------------|--------|
| Warm baseline ÷ warm native | **~3.1×** (4.59s → 1.47s) |
| Cold baseline ÷ cold native | **0.6×** (native slower on first run; includes preview cold-start) |

Once warm, native typecheck is clearly faster. First-run cold times are not a win yet.

## New errors vs baseline (63 total; baseline had 0)

### TS2352 — unsafe `KeyboardEvent` cast (62)

**Cause:** `KeyboardEvent<HTMLButtonElement>` cast to `KeyboardEvent<HTMLInputElement>` rejected as insufficiently overlapping (stricter overlap check than 5.9).

**Where:** repeated pattern across expert grids under `components/media-containers/*ExpertGrid.tsx` (BVOD, Cinema, Digital*, Influencers, Integration, Magazines, Newspaper, OOH, Prog*, Radio, Search, Social, Television). Typically 3–4 sites per file.

**Fix shape (not applied):** cast via `unknown`, or share a narrower handler type that both button and input events satisfy.

### TS2882 — CSS side-effect import (1)

**Cause:** `app/layout.tsx` side-effect import of `./globals.css` — native preview reports missing module/type declarations for the CSS import (`TS2882`).

**Fix shape (not applied):** ambient `*.css` module declaration, or whatever Next’s TS plugin already supplies for `tsc` but `tsgo` does not yet honour.

## Blockers / tooling

| Area | Status |
|------|--------|
| `npm run typecheck` (`tsc --noEmit`) | Still on TS 5.9; native is a **separate** CLI (`tsgo`). Not a silent swap. |
| Next.js / `next lint` | Untouched; still depends on project `typescript@5`. Native preview is not the language service Next wires by default. |
| IDE | Cursor/VS Code TypeScript language service uses workspace `typescript` (5.9), not `tsgo`. Native speedups won’t show in the editor until Microsoft ships IDE integration / official package cutover. |
| Plugins | Native preview does not appear to load the same CSS/Next module resolution path as `tsc` (see TS2882). |
| Upgrade path | Do **not** replace `typescript` with `@typescript/native-preview` in app deps yet — preview is explicit experimental; keep `tsc` as CI gate until error parity. |

## Go / no-go

**No-go for adopting native TS7 as the CI typecheck now** (timing: re-evaluate after ~1–2 more preview cuts, or when `typescript@7` + native are the documented default and Next documents support).

Reasons:
1. **63 new errors** vs clean 5.9 baseline (mostly one ExpertGrid cast pattern + one CSS import).
2. **Tooling split:** CI/`typecheck` and IDE still need `typescript`; `tsgo` is parallel-only today.
3. Warm **~3×** speedup is attractive for a dual-run experiment, but cold first-run was slower and exit ≠ 0.

Optional follow-up (not in this commit): fix the 62 casts + CSS ambient, re-run `tsgo` for a green dual-check — still keep `tsc` as the merge gate until Next/IDE catch up.
