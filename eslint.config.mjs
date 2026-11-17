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
    rules: {
      "no-restricted-globals": [
        "error",
        {
          name: "status",
          message: "Bare `status` is Window.status (lib.dom). Bind a local.",
        },
        {
          name: "name",
          message: "Bare `name` is Window.name (lib.dom). Bind a local.",
        },
        {
          name: "length",
          message: "Bare `length` is Window.length (lib.dom). Bind a local.",
        },
        {
          name: "top",
          message: "Bare `top` is Window.top (lib.dom). Bind a local.",
        },
        {
          name: "self",
          message: "Bare `self` is Window.self (lib.dom). Use globalThis or bind a local.",
        },
        {
          name: "event",
          message: "Bare `event` is Window.event (lib.dom). Use the handler argument.",
        },
      ],
    },
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
  // C-200 (S32 A, B51): Codex task writes only in Tasks (scripts/codex-boundary.mjs).
  // Its per-file blocks replace no-restricted-imports and no-restricted-syntax, so they repeat both.
  ...codexImportBlocks(ROOT, {
    restrictedImports: RESTRICTED_IMPORTS,
    syntaxFor: (file) => [...hexSelectorsFor(file), ...codexUrlSelectorsFor(file)],
  }),
]

export default config
