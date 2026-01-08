/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === "production";

// Polyfill localStorage immediately for Node.js 25+ broken implementation
if (typeof globalThis.localStorage !== 'undefined' && typeof globalThis.localStorage.getItem !== 'function') {
  globalThis.localStorage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
    clear: () => {},
    key: () => null,
    length: 0,
  };
}

module.exports = {
  output: "export",
  // No basePath needed when using custom domain (gooddays.dansalazar.org)
  // basePath: isProd ? "/good-days-dashboard" : "",
  // assetPrefix: isProd ? "/good-days-dashboard" : "",
};
