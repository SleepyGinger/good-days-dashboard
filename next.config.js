/** @type {import('next').NextConfig} */
module.exports = {
  output:  "export",      // static HTML export mode
  distDir: "out",         // Next writes files into /out
  // IMPORTANT for sub‑path repos:
  basePath: "/good-days-dashboard",
  assetPrefix: "/good-days-dashboard",
};
