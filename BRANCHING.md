# Branching & Deploy Workflow

This repo uses a trunk-based workflow with one working branch (`localhost`) and one deploy branch (`main`). This document is the source of truth for how work moves between them. If something here turns out to be wrong in practice, fix the doc — don't drift from it silently.

## The model

`localhost` is the **working trunk**. All work happens here. Experiments, WIP, mid-investigation commits, audit docs, code, smoke results — everything lands on `localhost` first. This branch is allowed to be messy.

`main` is the **deploy target**. It auto-deploys on push. It must only contain commits that have been smoke-tested and approved. It is updated exclusively by cherry-picking specific commits from `localhost`.

There are no other branches. No `feature/*`, no `domain-*-long-lived`, no `hotfix/*`. If you find yourself reaching for a branch, you almost certainly want a commit on `localhost` instead.

## The three principles

1. **All work happens on `localhost`.** Including testing.
2. **When something is smoke-tested and approved, cherry-pick it from `localhost` to `main`.** `main` auto-deploys.
3. **Orphan branches get deleted, not left to rot.** If a branch exists and isn't `localhost` or `main`, it's a bug.

## Daily workflow

### Starting work

```
git checkout localhost
git status
```

If `git status` shows uncommitted changes from a previous session, decide whether to commit them or discard them before starting new work. Don't carry mystery state forward.

### Making changes

Edit files. Commit when you reach a coherent checkpoint — doesn't have to be perfect or even working, just coherent enough that the commit message describes one thing. Use Conventional Commits format (see below).

```
git add <files>
git commit -m "feat(scope): short description"
```

It's fine to commit mid-investigation, mid-refactor, or with known issues. `localhost` exists for this. Better to checkpoint than to lose work to a bad merge or a crashed editor.

### Smoke testing

Smoke happens on `localhost`. The dev server runs against `localhost`. Test the change end-to-end in the browser. If it fails, fix it on `localhost` (another commit, or a revert — see below) before considering it shippable.

### Deciding what to push to `main`

`localhost` accumulates commits between deploys. Some are ready for production, some aren't. Before any push to `main`, list what's on `localhost` that isn't yet on `main`:

```
git log main..localhost --oneline
```

For each commit in that list, ask: is this smoke-tested and approved for production? If yes, it gets cherry-picked. If no, it stays on `localhost` and waits.

## Commit message convention

This repo uses **Conventional Commits**. Every commit message starts with a type, optional scope, then a short description.

Types in use:

- `feat:` — new feature or capability
- `fix:` — bug fix
- `docs:` — documentation only (audit files, READMEs, this file)
- `chore:` — tooling, config, dependency bumps, no app behaviour change
- `refactor:` — code restructure with no behaviour change

Examples:

```
feat(billing): add line-fee derivation in seed effect
fix(prog-video): preserve expert-grid placement/size edits on Apply
docs(domain-4): close out Stage C2 — JSDoc + audit appendix
chore(consolidate): integrate selective stash WIP into localhost
refactor(finance): extract shared list filter helpers
```

Scope (in parentheses) is optional but recommended when the commit touches a specific area. Use short slugs: `billing`, `finance`, `pacing`, `mba-edit`, `domain-N`, etc.

## Smoke checklist policy

A smoke pass is **recommended before any cherry-pick to `main`**, but not mandatory for every commit type.

- **`feat:` and `fix:` commits** — smoke before cherry-picking. These change behaviour users will see.
- **`refactor:` commits** — smoke before cherry-picking. Refactors are supposed to be behaviour-preserving but often aren't.
- **`docs:` commits** — smoke optional. If the doc commit also touches code (e.g. a JSDoc edit in a `.ts` file), treat as if it were code.
- **`chore:` commits** — judgement call. Dependency bumps need smoke. Renaming a config key in a comment doesn't.

When in doubt, smoke.

## Cherry-pick to `main`

Once a commit is approved:

```
git checkout main
git pull --ff-only origin main
git cherry-pick <commit-hash>
git push origin main
git checkout localhost
```

The `--ff-only` on the pull is defensive — if `main` has diverged from local for any reason, the pull will fail loudly rather than create a merge mess. Investigate before forcing through.

Multiple commits in one batch:

```
git checkout main
git pull --ff-only origin main
git cherry-pick <commit-A> <commit-B> <commit-C>
git push origin main
git checkout localhost
```

Commits are picked in the order given. If any cherry-pick conflicts, resolve the conflict on `main`, continue with `git cherry-pick --continue`, then push. Resolving conflicts at cherry-pick time is normal and expected — `localhost` may have evolved since the picked commit was made.

After pushing, `main` auto-deploys. Verify the deploy succeeded before considering the push complete.

## Reverts

A commit on `localhost` that turns out wrong gets reverted on `localhost`:

```
git revert <bad-commit-hash>
```

This creates a new commit that undoes the bad one. Both commits stay in `localhost`'s history — this is fine. The combined net effect is zero, but the history records what happened.

**Do not cherry-pick either the bad commit or its revert to `main`.** If neither has been picked yet, neither should be. If the bad commit was *already* picked to `main` before the failure was discovered, then `main` needs the revert — cherry-pick the revert commit (only the revert, not the original).

## When `main` is ahead of `localhost`

Should never happen. `main` is downstream of `localhost`. If `git log localhost..main --oneline` returns anything, something has gone wrong — likely a direct commit to `main` (which shouldn't happen) or a force-push (which shouldn't happen). Investigate.

To resync `localhost` after such an incident:

```
git checkout localhost
git pull --ff-only origin localhost   # if pushing localhost to remote
git cherry-pick <whatever-was-on-main-only>
```

…then audit how a commit landed on `main` without going through `localhost`.

## What not to do

- **No domain branches.** No `feature/*`, no `hotfix/*`, no `domain-N-long-lived`. Work goes on `localhost`.
- **No direct commits to `main`.** `main` is updated only by cherry-pick from `localhost`.
- **No force-push to `localhost` or `main`.** Once a commit is shared, its hash is permanent. Reverts handle mistakes.
- **No rewriting history** (interactive rebase, squash, amend) on commits that have been pushed.
- **No merging `localhost` into `main`** (merge commits on `main` are not allowed — cherry-pick only, which keeps `main` linear).
- **No leaving branches around.** If you find an orphaned branch, delete it (`git branch -D <name>` locally, `git push origin --delete <name>` if remote).

## When this document is wrong

If practice diverges from this doc — for instance, if a new genuine reason for a feature branch emerges — fix the doc in the same commit as the practice change. Don't let drift accumulate.
