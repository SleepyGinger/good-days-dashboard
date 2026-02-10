/** @type {import('next').NextConfig} */
const isCapacitor = process.env.CAPACITOR_BUILD === "1";

const nextConfig = {
  output: "export",
  trailingSlash: true,
  ...(isCapacitor
    ? {}
    : { basePath: "/good-days-dashboard", assetPrefix: "/good-days-dashboard/" }),
  images: { unoptimized: true },

  // skip lint + TS errors during CI build
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
};

module.exports = nextConfig;