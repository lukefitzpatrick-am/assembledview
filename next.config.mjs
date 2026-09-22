/** @type {import('next').NextConfig} */
const nextConfig = {
  // postgres uses Node builtins (crypto/stream/net). Keep it out of webpack
  // bundles — especially Edge instrumentation, which still traces dynamic imports
  // from instrumentation.ts unless warmers live in instrumentation.node.ts.
  serverExternalPackages: ["postgres"],
  typescript: {
    // Type checking is its own step, not part of the build. `next build` ran
    // tsc over the whole repo inside the same process as the compile, which on
    // a 4-core / 8 GB Vercel builder pushed the optimize phase into swap and
    // the build past the 45-minute kill. `npm run typecheck` is a step in
    // `gate:main` and in CI, so nothing is unchecked — it just no longer
    // shares a heap with webpack.
    ignoreBuildErrors: true,
  },
  eslint: {
    // Same split as typecheck: lint is `npm run lint` in `gate:main`, not a
    // second analysis pass sharing the Vercel webpack heap.
    ignoreDuringBuilds: true,
  },
  async redirects() {
    return [
      // FN7 — legacy finance paths → sections (permanent; no ?tab= hop)
      { source: "/finance/billing", destination: "/finance/invoicing", permanent: true },
      { source: "/finance/media", destination: "/finance/invoicing", permanent: true },
      { source: "/finance/scopes", destination: "/finance/invoicing", permanent: true },
      { source: "/finance/retainers", destination: "/finance/invoicing", permanent: true },
      { source: "/finance/sow", destination: "/finance/invoicing", permanent: true },
      { source: "/finance/receivables", destination: "/finance/invoicing", permanent: true },
      { source: "/finance/home", destination: "/finance/invoicing", permanent: true },
      { source: "/finance/publishers", destination: "/finance/costs/invoices", permanent: true },
      { source: "/finance/accrual", destination: "/finance/costs/accruals", permanent: true },
      { source: "/finance/forecast", destination: "/finance/forecasting", permanent: true },
      // FN1 / FIN-1 tab deep-links (query) → sections
      {
        source: "/finance",
        has: [{ type: "query", key: "tab", value: "billing" }],
        destination: "/finance/invoicing",
        permanent: true,
      },
      {
        source: "/finance",
        has: [{ type: "query", key: "tab", value: "payables" }],
        destination: "/finance/costs/invoices",
        permanent: true,
      },
      {
        source: "/finance",
        has: [{ type: "query", key: "tab", value: "accrual" }],
        destination: "/finance/costs/accruals",
        permanent: true,
      },
      {
        source: "/finance",
        has: [{ type: "query", key: "tab", value: "forecast" }],
        destination: "/finance/forecasting",
        permanent: true,
      },
      {
        source: "/finance",
        has: [{ type: "query", key: "tab", value: "report" }],
        destination: "/finance/investment",
        permanent: true,
      },
      {
        source: "/finance",
        has: [{ type: "query", key: "tab", value: "queue" }],
        destination: "/finance/xero",
        permanent: true,
      },
      {
        source: "/finance",
        has: [{ type: "query", key: "tab", value: "xero-queue" }],
        destination: "/finance/xero",
        permanent: true,
      },
      {
        source: "/finance",
        has: [{ type: "query", key: "tab", value: "overview" }],
        destination: "/finance/invoicing",
        permanent: true,
      },
      // FIN-1 — Overview retired; bare /finance → Clients billing
      { source: "/finance", destination: "/finance/invoicing", permanent: true },
      { source: "/learning", destination: "/knowledge", permanent: true },
      { source: "/learning/:path*", destination: "/knowledge/:path*", permanent: true },
    ]
  },
  images: {
    unoptimized: true,
  },
  experimental: {
    // Low-risk webpack behaviour that cuts peak heap at a small compile-time
    // cost. Needed on the 8 GB Vercel builder; see memory-usage.mdx.
    webpackMemoryOptimizations: true,
  },
  outputFileTracingIncludes: {
    "/api/planning/export-deck": ["./lib/planning/export/assets/**"],
    "/api/planning/insight": ["./lib/ava/skills/content/**"],
    "/api/chat-v2": ["./lib/ava/skills/content/**"],
    "/api/campaign-reads/generate": ["./lib/ava/skills/content/**"],
  },
  webpack: (config, { isServer, dev }) => {
    config.resolve.extensionAlias = { ".js": [".js", ".ts", ".tsx"] }

    if (isServer) {
      config.externals = config.externals || []
      config.externals.push({
        "snowflake-sdk": "commonjs snowflake-sdk",
      })
    }

    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback, // Keep any existing fallbacks
        fs: false,
        'jpeg-exif': false, // This is a dependency of pdfkit that uses 'fs'
        'png-js': false, // Another dependency of pdfkit that can cause issues
      }
      // Dev: first compile or HMR can exceed default chunk wait; reduces ChunkLoadError timeouts.
      if (dev) {
        config.output = { ...config.output, chunkLoadTimeout: 300_000 }
      }
    }

    return config
  },
}

export default nextConfig
