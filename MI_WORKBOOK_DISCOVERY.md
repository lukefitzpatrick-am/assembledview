# MI Workbook Discovery

Discovery only — no code changes. Commands run from repo root `c:\Projects\avmediaplan` on 2026-07-12.

---

## 1. Does `lib/specs/library.ts` or `library.js` exist?

**Command:** `Get-ChildItem lib\specs`

**Result:**

| Name | Type |
|------|------|
| `mi-library/` | directory |
| `__tests__/` | directory |
| `buildMiWorkbook.ts` | file |
| `library.ts` | file |
| `resolve.ts` | file |
| `storeMiExport.ts` | file |

**Verdict:**

- `lib/specs/library.ts` — **exists**
- `lib/specs/library.js` — **does not exist** (`Test-Path` → `False`)

There is no compiled/emitted `library.js` on disk. Imports that reference `./library.js` resolve to `library.ts` via TypeScript `moduleResolution: "bundler"` (see §5).

---

## 2. Where is `loadTemplateStructure` defined, if anywhere?

**Command:** `Get-ChildItem -Recurse -Include *.ts,*.tsx lib | Select-String "loadTemplateStructure"`

**Command output:** empty (no matches). That PowerShell pipeline did not surface hits; a follow-up content search did.

**Actual definition (verified by file read / ripgrep):**

| Path | Line | Role |
|------|------|------|
| `lib/specs/library.ts` | 287 | **Definition** — `export function loadTemplateStructure(...)` |
| `lib/specs/buildMiWorkbook.ts` | 3, 191 | Import from `./library.js` + call site |
| `lib/specs/__tests__/library.test.ts` | 9, 75 | Import + test usage |

**Definition (excerpt):**

```ts
export function loadTemplateStructure(dir = miLibraryDir()): MiTemplateStructure {
  return JSON.parse(
    fs.readFileSync(path.join(dir, "template_structure.json"), "utf8"),
  ) as MiTemplateStructure
}
```

**Verdict:** `loadTemplateStructure` **is defined** in `lib/specs/library.ts` (line 287). It is **not** missing — do not scaffold a new one.

---

## 3. Where do the mi-library JSONs live?

**Command:** `Get-ChildItem -Recurse -Filter template_structure.json`

**Location:** `lib/specs/mi-library/`

Full inventory:

| File | Notes |
|------|--------|
| `template_structure.json` | Workbook tab/structure template (5030 bytes) |
| `VERSION.json` | Library version metadata |
| `assembled-programmatic.json` | Publisher |
| `cartology.json` | Publisher |
| `civic-outdoor.json` | Publisher |
| `google-ads.json` | Publisher |
| `linkby.json` | Publisher |
| `meta.json` | Publisher |
| `news-corp.json` | Publisher |
| `ooh-media.json` | Publisher |
| `quantcast.json` | Publisher |
| `seven.json` | Publisher |
| `tiktok.json` | Publisher |
| `tonic.json` | Publisher |
| `twitch.json` | Publisher |
| `youtube.json` | Publisher |

`library.ts` documents this as vendored verbatim under `lib/specs/mi-library/`; never edited repo-side. `miLibraryDir()` / `loadTemplateStructure()` read from this directory.

---

## 4. Does the repo use `.js`-suffixed relative imports elsewhere?

**Command:** `Get-ChildItem -Recurse -Include *.ts lib | Select-String 'from "\./.*\.js"'`

**Matches:**

| Path | Line (import) |
|------|----------------|
| `lib/mediaplan/expertChannelMappings.ts` | `from "./expertModeWeeklySchedule.js"` |
| `lib/mediaplan/expertModeSwitch.ts` | `from "./expertModeWeeklySchedule.js"` |
| `lib/mediaplan/expertModeSwitch.ts` | `from "./expertChannelMappings.js"` |
| `lib/specs/buildMiWorkbook.ts` | `from "./library.js"` |
| `lib/specs/buildMiWorkbook.ts` | `from "./resolve.js"` |
| `lib/specs/resolve.ts` | `from "./library.js"` |

**Verdict:** Yes. `.js`-suffixed relative imports are an existing convention under `lib/` (at least `lib/mediaplan/` and `lib/specs/`), not unique to the MI workbook path. They target sibling `.ts` modules; there are no corresponding on-disk `.js` source files for those imports.

---

## 5. `tsconfig` `module` / `moduleResolution`

**File:** `tsconfig.json` (repo root; only tsconfig present)

| Option | Value |
|--------|--------|
| `compilerOptions.module` | `"esnext"` |
| `compilerOptions.moduleResolution` | `"bundler"` |

Relevant related options: `noEmit: true`, `allowJs: true`, `resolveJsonModule: true`, `paths: { "@/*": ["./*"] }`.

With `moduleResolution: "bundler"`, `./library.js` imports resolve to `library.ts` without a physical `.js` file.

---

## Summary

1. **`library.ts` exists; `library.js` does not.**
2. **`loadTemplateStructure` is already defined** in `lib/specs/library.ts:287` (also used by `buildMiWorkbook.ts` and tests).
3. **MI library JSONs** live at `lib/specs/mi-library/`, including `template_structure.json`.
4. **`.js`-suffixed relative imports** are used elsewhere in `lib/` (`mediaplan`, `specs`).
5. **tsconfig:** `module: "esnext"`, `moduleResolution: "bundler"`.
