export interface AuthUser {
  uid: string;
  email: string | null;
}

export interface NativeAuthResult {
  idToken: string;
  refreshToken: string;
  expiresIn: number;
  user: AuthUser;
}

export interface RefreshTokenStore {
  read(): Promise<string | null>;
  write(refreshToken: string): Promise<void>;
  clear(): Promise<void>;
}

interface NativeSessionOptions {
  store: RefreshTokenStore;
  signIn(email: string, password: string): Promise<NativeAuthResult>;
  refresh(refreshToken: string): Promise<NativeAuthResult>;
  now?: () => number;
}

/** Native REST auth lifecycle, independent of React and the Capacitor bridge. */
export function createNativeSession({ store, signIn, refresh, now = Date.now }: NativeSessionOptions) {
  let current: (NativeAuthResult & { expiresAt: number }) | null = null;
  let renewal: Promise<NativeAuthResult> | null = null;
  let generation = 0;
  let storageQueue: Promise<void> = Promise.resolve();

  const writeStore = (operation: () => Promise<void>) => {
    const next = storageQueue.then(operation);
    storageQueue = next.catch(() => {});
    return next;
  };

  const accept = async (result: NativeAuthResult, expectedGeneration: number) => {
    if (generation !== expectedGeneration) throw new Error("The sign-in session changed.");
    if (!result.idToken || !result.refreshToken || !Number.isFinite(result.expiresIn) || result.expiresIn <= 0) {
      throw new Error("The sign-in service returned an invalid session.");
    }
    await writeStore(() => store.write(result.refreshToken));
    if (generation !== expectedGeneration) throw new Error("The sign-in session changed.");
    current = { ...result, expiresAt: now() + result.expiresIn * 1000 };
    return result;
  };

  const renew = (token: string) => {
    if (!renewal) {
      const expectedGeneration = generation;
      const request = refresh(token).then((result) => accept(result, expectedGeneration));
      renewal = request;
      void request.finally(() => {
        if (renewal === request) renewal = null;
      }).catch(() => {});
    }
    return renewal;
  };

  return {
    async restore(): Promise<AuthUser | null> {
      const expectedGeneration = generation;
      const token = await store.read();
      if (generation !== expectedGeneration) throw new Error("The sign-in session changed.");
      if (!token) return null;
      return (await renew(token)).user;
    },
    async signIn(email: string, password: string): Promise<AuthUser> {
      const expectedGeneration = ++generation;
      current = null;
      renewal = null;
      return (await accept(await signIn(email, password), expectedGeneration)).user;
    },
    async getIdToken(): Promise<string> {
      if (!current) throw new Error("Please sign in to continue.");
      if (current.expiresAt - now() > 60_000) return current.idToken;
      return (await renew(current.refreshToken)).idToken;
    },
    async logout(): Promise<void> {
      generation += 1;
      current = null;
      renewal = null;
      await writeStore(() => store.clear());
    },
  };
}
