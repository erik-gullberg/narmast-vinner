/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false, // Disabled due to Leaflet map initialization issues
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'upload.wikimedia.org',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'static01.nyt.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'static-cdn.sr.se',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'whyy.org',
        port: '',
        pathname: '/**',
      },
    ],
  },
}

module.exports = nextConfig

