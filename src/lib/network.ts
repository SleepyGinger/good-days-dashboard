/** Bound both connection time and reading a JSON response from native REST APIs. */
export async function requestJson(url: string, options: RequestInit, timeoutMs = 20_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const data: unknown = response.ok ? await response.json() : null;
    return { ok: response.ok, status: response.status, data };
  } catch (error) {
    if (controller.signal.aborted) throw new Error("The request timed out. Please check your connection and try again.");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
