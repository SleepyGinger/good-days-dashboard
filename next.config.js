/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  trailingSlash: true,
  basePath: "/good-days-dashboard",
  assetPrefix: "/good-days-dashboard/",
  images: { unoptimized: true },

  // skip lint + TS errors when CI builds
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
};

module.exports = nextConfig;
