/**
 * B55fix (R4): the page nonce middleware puts on the request reaches the one
 * inline script the app adds (next-themes), through ServerAuthScope,
 * ClientRoot and AuthProvider. Rendered on the server, as Next does.
 */
import { renderToString } from "react-dom/server"
import { afterEach, describe, expect, it, vi } from "vitest"

let requestHeaders = new Headers()

vi.mock("next/headers", () => ({ headers: async () => requestHeaders }))
vi.mock("@/lib/auth0", () => ({ auth0: { getSession: vi.fn(async () => null) } }))
vi.mock("@/lib/webReport/visibility", () => ({ publishedWebSearchSlugs: vi.fn(async () => []) }))
vi.mock("@/lib/features/server", () => ({
  isFeatureOn: vi.fn(async () => false),
  readClientFeatureSnapshot: vi.fn(async () => null),
}))
// The shell is not under test: it renders its children only.
vi.mock("@/components/ClientLayout", () => ({ ClientLayout: ({ children }: { children: React.ReactNode }) => <>{children}</> }))

import ServerAuthScope from "@/components/ServerAuthScope"

async function renderLayout(): Promise<string> {
  return renderToString(await ServerAuthScope({ children: <main>page</main> }))
}

const themeScripts = (html: string) => html.match(/<script[^>]*>/g) ?? []

afterEach(() => {
  requestHeaders = new Headers()
})

describe("the theme script's nonce", () => {
  it("carries the nonce from the report-only policy on the request", async () => {
    requestHeaders = new Headers({ "content-security-policy-report-only": "script-src 'self' 'nonce-Tm9uY2U=' 'strict-dynamic'" })
    const html = await renderLayout()
    expect(html).toContain("<main>page</main>")
    expect(themeScripts(html)).toEqual(['<script nonce="Tm9uY2U=">'])
  })

  it("carries the nonce from the enforced policy too", async () => {
    requestHeaders = new Headers({ "content-security-policy": "script-src 'self' 'nonce-ZW5m' 'strict-dynamic'" })
    expect(themeScripts(await renderLayout())).toEqual(['<script nonce="ZW5m">'])
  })

  it("has none when the request has no policy (security_headers off)", async () => {
    expect(themeScripts(await renderLayout())).toEqual(["<script>"])
  })
})
