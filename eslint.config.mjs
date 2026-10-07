import { dirname } from "path"
import { fileURLToPath } from "url"
import { FlatCompat } from "@eslint/eslintrc"

const compat = new FlatCompat({
  baseDirectory: dirname(fileURLToPath(import.meta.url)),
})

/** ESLint 9 reads this file. */
export default [
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
    files: ["app/**/*.{ts,tsx}", "components/**/*.{ts,tsx}"],
    // DS-2 baseline: existing colour debt, cleared in DS-5 and DS-8. Do not add to this list.
    ignores: [
      "components/dashboard/delivery/__tests__/ChannelSection.render.test.tsx",
    ],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "Literal[value=/^#[0-9a-fA-F][0-9a-fA-F][0-9a-fA-F]([0-9a-fA-F][0-9a-fA-F][0-9a-fA-F])?$/]",
          message: "Hex colour. Use a CSS variable token or lib/brand.",
        },
        {
          selector:
            "Literal[value=/(bg|text|border|fill|stroke|ring|outline|decoration|from|via|to)-\\[#/]",
          message: "Arbitrary hex class. Use a theme token class.",
        },
        {
          selector:
            "TemplateElement[value.raw=/(bg|text|border|fill|stroke|ring|outline|decoration|from|via|to)-\\[#/]",
          message: "Arbitrary hex class. Use a theme token class.",
        },
      ],
    },
  },
]
