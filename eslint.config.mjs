import { dirname } from "path"
import { fileURLToPath } from "url"
import { FlatCompat } from "@eslint/eslintrc"

import { CODEX_SOURCE, CODEX_SPECIFIER_SELECTORS, CODEX_URL_IGNORES, CODEX_URL_SELECTORS, codexImportBlocks, codexUrlSelectorsFor } from "./scripts/codex-boundary.mjs"

const ROOT = dirname(fileURLToPath(import.meta.url))
const compat = new FlatCompat({
  baseDirectory: ROOT,
})

const HEX_SELECTORS = [
  {
    selector: "Literal[value=/^#[0-9a-fA-F][0-9a-fA-F][0-9a-fA-F]([0-9a-fA-F][0-9a-fA-F][0-9a-fA-F])?$/]",
    message: "Hex colour. Use a CSS variable token or lib/brand.",
  },
  {
    selector: "Literal[value=/(bg|text|border|fill|stroke|ring|outline|decoration|from|via|to)-\\[#/]",
    message: "Arbitrary hex class. Use a theme token class.",
  },
  {
    selector: "TemplateElement[value.raw=/(bg|text|border|fill|stroke|ring|outline|decoration|from|via|to)-\\[#/]",
    message: "Arbitrary hex class. Use a theme token class.",
  },
]
const HEX_FILES = ["app/**/*.{ts,tsx}", "components/**/*.{ts,tsx}"]
// DS-2 baseline: existing colour debt, cleared in DS-5 and DS-8. Do not add to this list.
const HEX_BASELINE = ["components/dashboard/delivery/__tests__/ChannelSection.render.test.tsx"]
/** The hex selectors for a file outside the tests (HEX_FILES as a test). */
const hexSelectorsFor = (file) => (/^(app|components)\/.+\.tsx?$/.test(file) && !HEX_BASELINE.includes(file) ? HEX_SELECTORS : [])

// B46: one toast store. The mounted Toaster reads components/ui/use-toast.
const RESTRICTED_IMPORTS = [
  {
    group: ["**/hooks/use-toast"],
    message: "Deleted duplicate toast store. Import from @/components/ui/use-toast.",
  },
]

// B55fix (S27): a prerendered page or layout has no request, so its scripts get no CSP nonce.
const PRERENDER_MESSAGE =
  "Prerendered page or layout: its scripts get no CSP nonce and are blocked once the policy is enforced. Pages render per request (docs/brain/SECURITY-HEADERS.md)."
const PRERENDER_SELECTORS = [
  "ExportNamedDeclaration > VariableDeclaration > VariableDeclarator[id.name='dynamic'][init.value=/^(force-static|error)$/]",
  "ExportNamedDeclaration > VariableDeclaration > VariableDeclarator[id.name='dynamic'][init.expression.value=/^(force-static|error)$/]",
  "ExportNamedDeclaration > VariableDeclaration > VariableDeclarator[id.name=/^(revalidate|generateStaticParams)$/]",
  "ExportNamedDeclaration > FunctionDeclaration[id.name='generateStaticParams']",
  "ExportSpecifier[exported.name=/^(revalidate|generateStaticParams)$/]",
].map((selector) => ({ selector, message: PRERENDER_MESSAGE }))
// Pages and layouts only: API routes are not pages and keep their revalidate.
const PAGE_FILES = ["app/**/{page,layout}.{ts,tsx}"]
const TASKS_PAGE_FILES = ["app/tasks/**/{page,layout}.{ts,tsx}"]
/** The prerender selectors for a page or layout (PAGE_FILES as a test). */
const prerenderSelectorsFor = (file) => (/^app\/(.+\/)?(page|layout)\.tsx?$/.test(file) ? PRERENDER_SELECTORS : [])
/** A C-200 governed file's own block replaces no-restricted-syntax, so it repeats every selector the blocks below give that file. */
export const c200SyntaxFor = (file) => [...hexSelectorsFor(file), ...codexUrlSelectorsFor(file), ...prerenderSelectorsFor(file)]

// Bare globals that are Window properties in lib.dom: bind a local instead.
const WINDOW_GLOBALS = [
  { name: "status", message: "Bare `status` is Window.status (lib.dom). Bind a local." },
  { name: "name", message: "Bare `name` is Window.name (lib.dom). Bind a local." },
  { name: "length", message: "Bare `length` is Window.length (lib.dom). Bind a local." },
  { name: "top", message: "Bare `top` is Window.top (lib.dom). Bind a local." },
  { name: "self", message: "Bare `self` is Window.self (lib.dom). Use globalThis or bind a local." },
  { name: "event", message: "Bare `event` is Window.event (lib.dom). Use the handler argument." },
]

// B57: one way to ask a question. The browser's boxes block the page, cannot be styled and some screen readers read them badly.
const BROWSER_BOX_MESSAGE =
  "Browser box. Ask with useConfirm() from @/hooks/use-confirm: confirm() for a question, notice() for a message (docs/brain/CONVENTIONS.md)."
const BROWSER_BOXES = ["confirm", "alert", "prompt"]
const BROWSER_BOX_GLOBALS = BROWSER_BOXES.map((name) => ({ name, message: BROWSER_BOX_MESSAGE }))
const BROWSER_BOX_PROPERTIES = ["window", "globalThis"].flatMap((object) =>
  BROWSER_BOXES.map((property) => ({ object, property, message: BROWSER_BOX_MESSAGE })),
)
const TEST_FILES = ["**/*.test.{js,jsx,mjs,ts,tsx}", "**/__tests__/**"]

/** ESLint 9 reads this file. */
const config = [
  ...compat.extends("next/core-web-vitals"),
  {
    files: [
      "lib/**/*.js",
      "lib/**/*.jsx",
      "lib/**/*.ts",
      "lib/**/*.tsx",
      "app/**/*.js",
      "app/**/*.jsx",
      "app/**/*.ts",
      "app/**/*.tsx",
    ],
    rules: { "no-restricted-globals": ["error", ...WINDOW_GLOBALS] },
  },
  // B57: no browser confirm(), alert() or prompt() outside tests. A later block replaces the rule's options, so app and lib repeat WINDOW_GLOBALS.
  {
    files: ["{app,lib}/**/*.{js,jsx,ts,tsx}"],
    ignores: TEST_FILES,
    rules: { "no-restricted-globals": ["error", ...WINDOW_GLOBALS, ...BROWSER_BOX_GLOBALS] },
  },
  {
    files: ["{components,hooks,contexts}/**/*.{js,jsx,ts,tsx}"],
    ignores: TEST_FILES,
    rules: { "no-restricted-globals": ["error", ...BROWSER_BOX_GLOBALS] },
  },
  {
    files: ["{app,lib,components,hooks,contexts}/**/*.{js,jsx,ts,tsx}"],
    ignores: TEST_FILES,
    rules: { "no-restricted-properties": ["error", ...BROWSER_BOX_PROPERTIES] },
  },
  {
    files: ["**/*.{js,jsx,mjs,cjs,ts,tsx}"],
    rules: { "no-restricted-imports": ["error", { patterns: RESTRICTED_IMPORTS }] },
  },
  {
    files: ["app/**/*.{js,jsx,ts,tsx}", "components/**/*.{js,jsx,ts,tsx}"],
    ignores: [
      "**/*.test.ts",
      "**/*.test.tsx",
      "**/*.test.js",
      "**/*.test.jsx",
      "**/__tests__/**",
    ],
    rules: {
      "no-console": ["error", { allow: ["warn", "error"] }],
    },
  },
  {
    files: HEX_FILES,
    ignores: HEX_BASELINE,
    rules: { "no-restricted-syntax": ["error", ...HEX_SELECTORS] },
  },
  // C-200 URLs and specifiers. A later block replaces the rule's options, so the hex files repeat the hex selectors.
  { files: CODEX_SOURCE, ignores: CODEX_URL_IGNORES, rules: { "no-restricted-syntax": ["error", ...CODEX_URL_SELECTORS, ...CODEX_SPECIFIER_SELECTORS] } },
  {
    files: HEX_FILES,
    ignores: [...HEX_BASELINE, ...CODEX_URL_IGNORES],
    rules: { "no-restricted-syntax": ["error", ...HEX_SELECTORS, ...CODEX_URL_SELECTORS, ...CODEX_SPECIFIER_SELECTORS] },
  },
  // Pages and layouts add the prerender selectors to what the two blocks above give them (the Tasks zone has no URL selectors).
  {
    files: PAGE_FILES,
    ignores: [...HEX_BASELINE, ...CODEX_URL_IGNORES],
    rules: { "no-restricted-syntax": ["error", ...HEX_SELECTORS, ...CODEX_URL_SELECTORS, ...CODEX_SPECIFIER_SELECTORS, ...PRERENDER_SELECTORS] },
  },
  { files: TASKS_PAGE_FILES, rules: { "no-restricted-syntax": ["error", ...HEX_SELECTORS, ...PRERENDER_SELECTORS] } },
  // C-200 (S32 A, B51): Codex task writes only in Tasks (scripts/codex-boundary.mjs).
  // Its per-file blocks replace no-restricted-imports and no-restricted-syntax, so they repeat both.
  ...codexImportBlocks(ROOT, {
    restrictedImports: RESTRICTED_IMPORTS,
    syntaxFor: c200SyntaxFor,
  }),
]

export default config
