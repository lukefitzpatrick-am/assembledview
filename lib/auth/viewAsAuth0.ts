import { readCookieFromRequestLike, resolveViewAs, VIEW_AS_COOKIE } from "./viewAs"

/**
 * Wraps the real Auth0 client so `getSession` returns the view-as client user
 * when a valid view-as cookie is present (lib/auth/viewAs.ts). Every other
 * member (middleware, getAccessToken, ...) is the real client's, bound to it.
 *
 * Fail-safe: no cookie is the raw session, untouched. Any error reading the
 * cookie is treated as no cookie. Only code that must see the real admin
 * (view-as start, exit and audit routes, `/view-as/*` pages) uses `auth0Raw`.
 */

type GetSessionLike = (...args: unknown[]) => Promise<unknown>

export async function readViewAsToken(req?: unknown): Promise<string | null> {
  if (req !== undefined && req !== null) {
    const value = readCookieFromRequestLike(req, VIEW_AS_COOKIE)
    if (value !== undefined) return value || null
  }
  try {
    const { cookies } = await import("next/headers")
    const store = await cookies()
    return store.get(VIEW_AS_COOKIE)?.value || null
  } catch {
    return null
  }
}

export type ViewAsAuth0Deps = {
  readToken?: (req?: unknown) => Promise<string | null>
  env?: () => Record<string, string | undefined>
  now?: () => number
}

export function withViewAsOverlay<T extends { getSession: GetSessionLike }>(raw: T, deps: ViewAsAuth0Deps = {}): T {
  const readToken = deps.readToken ?? readViewAsToken
  const env = deps.env ?? (() => process.env as Record<string, string | undefined>)
  const now = deps.now ?? (() => Date.now())

  const getSession = async (...args: unknown[]) => {
    const session = (await raw.getSession(...args)) as { user: Record<string, unknown> } | null
    let token: string | null = null
    try {
      token = await readToken(args[0])
    } catch {
      token = null
    }
    if (!token) return session
    const resolved = await resolveViewAs(session, token, { env: env(), nowMs: now() })
    return resolved.session
  }

  return new Proxy(raw, {
    get(target, prop) {
      if (prop === "getSession") return getSession
      const value = Reflect.get(target, prop, target)
      return typeof value === "function" ? value.bind(target) : value
    },
  })
}
