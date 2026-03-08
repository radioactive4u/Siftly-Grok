import type { NextConfig } from 'next'

// Disable Turbopack persistent cache — causes SST write failures on Windows
// ("Unable to write SST file 00000001.sst" / os error 3)
process.env.TURBOPACK_PERSISTENT_CACHE ??= '0'

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.twimg.com',
      },
    ],
  },
}

export default nextConfig
