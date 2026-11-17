# Security headers and the content security policy

Decision S27 A: check what Vercel sends, add a baseline of security headers, run the content security policy (CSP) in report-only mode for two weeks, then enforce it.

- Builder: `lib/security/headers.ts` (the one place the headers and the policy string are built).
- Applied by: `middleware.ts` (`applySecurityHeaders`, on every response middleware handles).
- Reports: `POST /api/csp-report` (`app/api/csp-report/route.ts`, parser `lib/security/cspReport.ts`). Open with no session only while `security_headers` is on (middleware). Switched off, it is gated like any API route: 401 with no session, 403 in a client view.
- Tests: `lib/security/__tests__/headers.test.ts` (pins the policy string), `app/api/csp-report/__tests__/route.test.ts`.

## Switches (both `source: "vercel"`, owner Luke, off)

| Switch | Env var | Turning it on |
|---|---|---|
| `security_headers` | `SECURITY_HEADERS` | Every response middleware handles gets the baseline headers. Every page gets the policy as `Content-Security-Policy-Report-Only`. Nothing is blocked by the policy. |
| `csp_enforce` | `CSP_ENFORCE` | The same policy moves to `Content-Security-Policy`: the browser blocks what it reported. Needs `security_headers` on (`requires`). |

Both are read in middleware, which can't query the database, so they are set in Vercel and need a redeploy. Retirement (S16): 14 days after each is confirmed on in production, the next batch deletes it and its off path. Once `csp_enforce` retires the report-only path goes with it.

## Step 1: check what Vercel sends today

Run in PowerShell (production domain from the handbook: `assembledview.com.au`; use the host the app is served on if different):

```powershell
curl.exe -sI https://assembledview.com.au/privacy
curl.exe -sI https://assembledview.com.au/api/me
curl.exe -sI https://assembledview.com.au/brand/logo-inverted-white.png
```

- `/privacy`: a public page (no login), so it renders and shows page headers.
- `/api/me`: an API route (a 401 with no session is expected; look at the headers).
- `/brand/logo-inverted-white.png`: a static file. Middleware never runs on static files, so this shows only what Vercel adds.

Look for: `strict-transport-security`, `x-content-type-options`, `referrer-policy`, `x-frame-options`, `permissions-policy`, `content-security-policy`, `content-security-policy-report-only`.

- None of them (or only `strict-transport-security`): turn `security_headers` on. Vercel sending HSTS is fine: ours has the same value.
- Any of the others already set (a Vercel project header or firewall rule): leave the switch off and tell the next batch which, so the duplicate is removed from `BASELINE_SECURITY_HEADERS` first.

After turning it on, run the same three commands. Expect the baseline on the first two, the report-only policy on `/privacy` only, and nothing new on the static file.

## Baseline headers

| Header | Value | Why |
|---|---|---|
| `Strict-Transport-Security` | `max-age=63072000` | HTTPS only for two years on this host. No `includeSubDomains` or `preload` until every subdomain is confirmed HTTPS-only. |
| `X-Content-Type-Options` | `nosniff` | No MIME sniffing. |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Other sites see our origin, never the path (paths carry client slugs and MBA numbers). |
| `X-Frame-Options` | `SAMEORIGIN` | Only the app may frame its pages. The creative mockup frames `/api/creative-assets/[id]/preview/` (HTML5 zips), so `DENY` would break it. No other site frames the app: no client dashboard, Splash or partner embed, and Auth0 v4 uses redirects, not frames. |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), payment=(), usb=()` | Off for features the app never uses. Clipboard stays open: the Expert grid paste reads it. |

## The policy

Scripts use a per-request nonce with `'strict-dynamic'`:

- Every page renders per request (the root layout reads the session), so a nonce costs no static page. `/privacy` and `/data-deletion` were `force-static`; B55 removed that, because a page prerendered at build has no nonce on its scripts. A new static page needs the same care (INVARIANTS).
- Next 15 reads the nonce from the policy on the request headers and stamps it on its own scripts. Scripts those load (chunks) are trusted through `'strict-dynamic'`.
- The one inline script the app adds is next-themes' theme script. `ServerAuthScope` reads the nonce (`readNonce`) and passes it down to `ThemeProvider`.
- Hashes can't work: Next streams per-request inline scripts.
- `'unsafe-inline'` for scripts would let any injected script run, which is what the policy is for.

| Directive | Sources | What needs it |
|---|---|---|
| `default-src` | `'self'` | Everything not listed below. |
| `script-src` | `'self'` nonce `'strict-dynamic'` (+ `'unsafe-eval'` in `next dev` only) | Next scripts and chunks; next-themes. No third-party script loads in the browser. |
| `style-src` | `'self' 'unsafe-inline'` | React style props, Recharts, next/font and the chart `<style>` (`components/ui/chart.tsx`). |
| `img-src` | `'self' data: blob: https:` | Meta, TikTok and CM360 creative thumbnails (`*.fbcdn.net`, `graph.facebook.com`, `*.tiktokcdn.com`, `*.2mdn.net`), client and publisher logos, Vercel Blob public images (`*.public.blob.vercel-storage.com`), data URLs from mockups, object URLs. Too many CDN hosts to list without breaking thumbnails. |
| `media-src` | `'self' data: blob: https:` | Creative videos (same origin through `/api/creative-assets/[id]/download`, platform preview URLs), object URLs for video frames. |
| `font-src` | `'self' data:` | next/font (Plus Jakarta Sans, Instrument Serif) and Geist are self-hosted. No Google Fonts request at runtime. |
| `connect-src` | `'self' data: https://vercel.com` | Same-origin API calls. `data:`: chart and Gantt PNG export fetches a canvas data URL. `vercel.com`: creative uploads go from the browser to the Vercel Blob API (`lib/config/endpoints.ts` `VERCEL_BLOB_API_URL`). |
| `frame-src` | `'self'` | HTML5 creative previews. |
| `worker-src` | `'self' blob:` | Room for library workers; none found today. |
| `object-src` | `'none'` | No plugins. |
| `base-uri` | `'self'` | No `<base>` hijack. |
| `form-action` | `'self'` | Forms post to the app only. |
| `frame-ancestors` | `'self'` | Same as `X-Frame-Options`. |
| `report-uri` / `report-to` | `/api/csp-report` (absolute) | Violation reports. `Reporting-Endpoints: csp="…"` goes with it. |

Not loaded from the browser (server only, so not in the policy): Auth0 (redirects), Supabase, Snowflake, Xero, Fireflies, Microsoft Graph, My Hours, ScreenshotOne, Anthropic, Google APIs. Canva and Google Analytics are not used in the app. Vercel Analytics is not installed.

The policy goes on page responses only. API routes set their own when they need one (the HTML5 preview sends `sandbox allow-scripts`). Redirects and JSON responses get the baseline only.

## Reading the reports

- Vercel > project `avmediaplan` > Logs, search `[csp-report]`.
- Each line is JSON: `directive`, `blocked` (an origin, or `inline`, `eval`, `data`, `blob`), `page` (path only), `source` (origin and path), `line`, `disposition` (`report` while report-only).
- Nothing personal is logged: no query string, script sample, referrer, user agent or IP.
- The route answers 204 with no body, 400 for a body with no violation, 413 over 64 KB, 429 past 120 reports a minute per server instance.
- Ignore reports whose `blocked` or `source` is a browser extension (`chrome-extension`, `moz-extension`, `safari-web-extension`).
- Preview deployments: the Vercel toolbar (`vercel.live`) injects a script without a nonce and will report there. Production has no toolbar.

A report from our own code means the policy or the code needs a change before enforcing: add the origin in `buildContentSecurityPolicy` (and update the pinned test), or remove the load.

## Enforcing

- After two weeks of `security_headers` on with no report from our own code, set `CSP_ENFORCE` on in Vercel and redeploy.
- Run `curl.exe -sI https://assembledview.com.au/privacy`: the policy is now `content-security-policy`.
- Smoke the main pages once (dashboard, a campaign dashboard, plan edit, pacing, finance, creative mockup, AVA chat with a file download).
- To back out: turn `CSP_ENFORCE` off and redeploy. Reports keep flowing in report-only mode.
