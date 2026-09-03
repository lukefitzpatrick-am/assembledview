import { dirname } from "path"
import { fileURLToPath } from "url"
import { FlatCompat } from "@eslint/eslintrc"

const compat = new FlatCompat({
  baseDirectory: dirname(fileURLToPath(import.meta.url)),
})

/**
 * ESLint 9 reads this file. `.eslintrc.json` is the same rule set for
 * `ESLINT_USE_FLAT_CONFIG=false` / older Next lint. Keep them in lockstep.
 */
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
]
