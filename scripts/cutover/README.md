# KR-1 — Krusty / Krabby test-record purge (dual store)

**Author pack only.** Cursor does not execute deletes.  
Application order (owners):

1. **Fixture** — anyone with `DATABASE_URL`: run `01-export-krusty-fixture.ts`
2. **Xano** — Luke applies `02-xano-delete-krusty.md`
3. **Postgres** — Claude applies `03-postgres-delete-krusty.sql` via MCP (project `slpdibnxtpdlttbbczvg`)
4. **Rescan** — Claude runs `05-rescan-to-zero.sql` + Luke fills Xano checklist → both stores **zero**
5. Treemaps / pacing re-check (product)

## Files

| File | Role |
|---|---|
| `00-discover-matches.sql` | Enumerate exact MBA/client hits before wildcards are trusted |
| `01-export-krusty-fixture.ts` | Dump one complete krusty/krabby version → `fixtures/*.json` |
| `02-xano-delete-krusty.md` | Dependency-safe Xano delete steps for Luke |
| `03-postgres-delete-krusty.sql` | Single-transaction Postgres delete |
| `04-precount.sql` + `04-precount-ledger.md` | Before/after ledger |
| `05-rescan-to-zero.sql` + `.md` | Pattern rescan acceptance (C-20 lesson) |
| `_kr1_match.sql` | Shared pattern notes |

## Match patterns

| Pattern | Catches |
|---|---|
| `lower(mba_number) LIKE 'krusty%'` | All `krusty*` MBAs (literature: `krusty001`…`krusty015`+) |
| `lower(mba_number) LIKE 'krabby%'` | All `krabby*` MBAs (if any) |
| Client `mbaidentifier` ∈ {`krusty`,`krabby`} or prefix; `mp_client_name` contains those tokens | Test client row(s) |
| **Not used:** bare `kr%` | Would collide with non-test clients |

Live discovery (`00-…`) is authoritative — paste the returned lists into the ledger before COMMIT.

## Fixture export

```bash
node --import ./scripts/test-shims/register-server-only.mjs \
  --require ./scripts/test-shims/mock-server-only.cjs \
  --import tsx scripts/cutover/01-export-krusty-fixture.ts

# optional pin:
# … -- --mba=krusty015 --version=4
```

Fixture JSON is under `scripts/cutover/fixtures/` (gitignored large dumps; keep small harness copies if needed).
