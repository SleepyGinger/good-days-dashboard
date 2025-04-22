/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === "production";

module.exports = {
  output: "export",                     
  basePath: isProd ? "/good-days-dashboard" : "",
  assetPrefix: isProd ? "/good-days-dashboard" : "",
  // images: { unoptimized: true },     // add if you use <Image>
};
