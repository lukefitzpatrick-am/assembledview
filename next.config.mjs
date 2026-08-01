/** @type {import('next').NextConfig} */
const nextConfig = {
  // postgres uses Node builtins (crypto/stream/net). Keep it out of webpack
  // bundles — especially Edge instrumentation, which still traces dynamic imports
  // from instrumentation.ts unless warmers live in instrumentation.node.ts.
  serverExternalPackages: ["postgres"],
  async redirects() {
    return [
      // FN7 — legacy finance paths → sections (permanent; no ?tab= hop)
      { source: "/finance/billing", destination: "/finance/invoicing", permanent: true },
      { source: "/finance/media", destination: "/finance/invoicing", permanent: true },
      { source: "/finance/scopes", destination: "/finance/invoicing", permanent: true },
      { source: "/finance/retainers", destination: "/finance/invoicing", permanent: true },
      { source: "/finance/sow", destination: "/finance/invoicing", permanent: true },
      { source: "/finance/receivables", destination: "/finance/invoicing", permanent: true },
      { source: "/finance/publishers", destination: "/finance/costs/invoices", permanent: true },
      { source: "/finance/accrual", destination: "/finance/costs/accruals", permanent: true },
      { source: "/finance/forecast", destination: "/finance/forecasting", permanent: true },
      // FN1 tab deep-links (query) → sections
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
        destination: "/finance",
        permanent: true,
      },
      { source: "/learning", destination: "/knowledge", permanent: true },
      { source: "/learning/:path*", destination: "/knowledge/:path*", permanent: true },
    ]
  },
  images: {
    unoptimized: true,
  },
  experimental: {
    // Removed deprecated experimental features for Next.js 15
  },
  outputFileTracingIncludes: {
    "/api/planning/export-deck": ["./lib/planning/export/assets/**"],
    "/api/planning/insight": ["./lib/ava/skills/content/**"],
    "/api/chat-v2": ["./lib/ava/skills/content/**"],
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
