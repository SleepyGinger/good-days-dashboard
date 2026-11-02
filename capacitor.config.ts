import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "org.dansalazar.gooddays",
  appName: "Good Days",
  webDir: "out",
  server: {
    // WKWebView requires a custom scheme; native sessions use iOS Keychain.
    iosScheme: "capacitor",
    androidScheme: "https",
  },
};

export default config;
