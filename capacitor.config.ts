import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "org.dansalazar.gooddays",
  appName: "Good Days",
  webDir: "out",
  server: {
    // Use https scheme so Firebase Auth persistence works in the WebView
    iosScheme: "https",
    androidScheme: "https",
  },
};

export default config;
