/** @type {import('next').NextConfig} */
module.exports = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  // Both the custom domain and Capacitor load the exported app from their root.
};
