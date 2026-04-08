let userConfig = undefined
try {
  userConfig = await import('./v0-user-next.config')
} catch (e) {
  // ignore error
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      { source: "/finance/billing", destination: "/finance?tab=billing", permanent: true },
      { source: "/finance/media", destination: "/finance?tab=billing", permanent: true },
      { source: "/finance/scopes", destination: "/finance?tab=billing", permanent: true },
      { source: "/finance/retainers", destination: "/finance?tab=billing", permanent: true },
      { source: "/finance/sow", destination: "/finance?tab=billing", permanent: true },
      { source: "/finance/publishers", destination: "/finance?tab=payables", permanent: true },
      { source: "/finance/accrual", destination: "/finance?tab=accrual", permanent: true },
      { source: "/finance/forecast", destination: "/finance?tab=forecast", permanent: true },
    ]
  },
  images: {
    unoptimized: true,
  },
  experimental: {
    // Removed deprecated experimental features for Next.js 15
  },
  webpack: (config, { isServer, dev }) => {
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
  

mergeConfig(nextConfig, userConfig)

function mergeConfig(nextConfig, userConfig) {
  if (!userConfig) {
    return
  }

  for (const key in userConfig) {
    if (
      typeof nextConfig[key] === 'object' &&
      !Array.isArray(nextConfig[key])
    ) {
      nextConfig[key] = {
        ...nextConfig[key],
        ...userConfig[key],
      }
    } else {
      nextConfig[key] = userConfig[key]
    }
  }
}

export default nextConfig
