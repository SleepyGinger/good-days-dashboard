import { registerPlugin } from "@capacitor/core";

export interface NativeSessionPlugin {
  getRefreshToken(): Promise<{ refreshToken?: string }>;
  setRefreshToken(options: { refreshToken: string }): Promise<void>;
  clearRefreshToken(): Promise<void>;
}

/** The native implementation stores only the refresh token in iOS Keychain. */
export default registerPlugin<NativeSessionPlugin>("Session");
