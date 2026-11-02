/** Share in-flight initialization and allow a later retry after a failure. */
export function sharedInitialization<T>(initialize: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | null = null;
  return () => {
    if (!pending) {
      pending = Promise.resolve().then(initialize).catch((error: unknown) => {
        pending = null;
        throw error;
      });
    }
    return pending;
  };
}
