import { requestJson } from "./network";

interface CloudDataOptions {
  databaseURL: string | undefined;
  getToken(expectedUid?: string): Promise<string>;
  request?: typeof requestJson;
  onMutation?(path: string): void;
  tokenTimeoutMs?: number;
}

/** One bounded REST transport for all platforms; no offline SDK write queue. */
export function createCloudDataClient({ databaseURL, getToken, request = requestJson, onMutation, tokenTimeoutMs = 20_000 }: CloudDataOptions) {
  return async (path: string, method = "GET", data?: unknown, expectedUid?: string): Promise<unknown> => {
    if (!databaseURL) throw new Error("Firebase configuration is missing.");
    let timer: ReturnType<typeof setTimeout> | undefined;
    let token: string;
    try {
      // Timing out token acquisition is safe: no database write has begun yet.
      token = await Promise.race([
        getToken(expectedUid),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error("Sign-in verification timed out. Please check your connection and try again.")), tokenTimeoutMs);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
    if (!token) throw new Error("Please sign in to continue.");
    const response = await request(`${databaseURL.replace(/\/$/, "")}/${path}.json?auth=${encodeURIComponent(token)}`, {
      method,
      ...(data === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }),
    });
    if (!response.ok) {
      throw new Error(response.status === 401 || response.status === 403
        ? "Journal access was denied. Please sign in again."
        : "Unable to reach the journal. Please try again.");
    }
    if (method !== "GET") onMutation?.(path);
    return response.data;
  };
}
