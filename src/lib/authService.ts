"use client";

import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { getFirebaseClient, firebaseConfig } from "./firebaseClient";
import Session from "./nativeSessionPlugin";
import { createNativeSession, type AuthUser, type NativeAuthResult } from "./nativeSession";
import { requestJson } from "./network";

export type { AuthUser } from "./nativeSession";
export const isNativePlatform = () => Capacitor.isNativePlatform();

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  error: Error | null;
}

let state: AuthState = { user: null, loading: true, error: null };
const listeners = new Set<(next: AuthState) => void>();
const publish = (next: AuthState) => {
  state = next;
  listeners.forEach((listener) => listener(next));
};
const asError = (error: unknown) => error instanceof Error ? error : new Error("Sign-in failed. Please try again.");
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function stringField(value: Record<string, unknown>, key: string): string {
  const field = value[key];
  if (typeof field !== "string" || !field) throw new Error("The sign-in service returned an invalid response.");
  return field;
}

async function authRequest(endpoint: string, body: BodyInit, contentType = "application/json") {
  const apiKey = firebaseConfig.apiKey;
  if (!apiKey) throw new Error("Firebase configuration is missing.");
  const response = await requestJson(`${endpoint}?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": contentType },
    body,
  });
  if (!response.ok) {
    throw new Error(response.status === 400 || response.status === 401
      ? "The sign-in session or credentials were rejected. Please sign in again."
      : "The sign-in service is unavailable. Please try again.");
  }
  const result = response.data;
  if (!isRecord(result)) throw new Error("The sign-in service returned an invalid response.");
  return result;
}

const nativeSession = createNativeSession({
  store: {
    read: async () => (await Session.getRefreshToken()).refreshToken ?? null,
    write: async (refreshToken) => Session.setRefreshToken({ refreshToken }),
    clear: async () => Session.clearRefreshToken(),
  },
  async signIn(email, password): Promise<NativeAuthResult> {
    const result = await authRequest(
      "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword",
      JSON.stringify({ email, password, returnSecureToken: true }),
    );
    return {
      idToken: stringField(result, "idToken"),
      refreshToken: stringField(result, "refreshToken"),
      expiresIn: Number(result.expiresIn),
      user: { uid: stringField(result, "localId"), email: stringField(result, "email") },
    };
  },
  async refresh(refreshToken): Promise<NativeAuthResult> {
    const result = await authRequest(
      "https://securetoken.googleapis.com/v1/token",
      new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }),
      "application/x-www-form-urlencoded",
    );
    const idToken = stringField(result, "id_token");
    const lookup = await authRequest(
      "https://identitytoolkit.googleapis.com/v1/accounts:lookup",
      JSON.stringify({ idToken }),
    );
    const user = Array.isArray(lookup.users) ? lookup.users[0] : null;
    if (!isRecord(user)) throw new Error("Please sign in again.");
    return {
      idToken,
      refreshToken: stringField(result, "refresh_token"),
      expiresIn: Number(result.expires_in),
      user: { uid: stringField(user, "localId"), email: typeof user.email === "string" ? user.email : null },
    };
  },
});

let initialization: Promise<void> | null = null;
let authOperation = 0;

function initializeAuth(): Promise<void> {
  if (!initialization) {
    const expectedOperation = authOperation;
    const request = (async () => {
      if (isNativePlatform()) {
        const user = await nativeSession.restore();
        if (authOperation === expectedOperation) publish({ user, loading: false, error: null });
      } else {
        const { auth } = await getFirebaseClient();
        const { onAuthStateChanged } = await import("firebase/auth");
        // One service-owned observer for the application session, shared by all consumers.
        await new Promise<void>((resolve) => {
          onAuthStateChanged(auth, (user) => {
            publish({ user: user ? { uid: user.uid, email: user.email } : null, loading: false, error: null });
            resolve();
          }, (error) => {
            publish({ user: null, loading: false, error });
            resolve();
          });
        });
      }
    })().catch((error: unknown) => {
      if (initialization === request) initialization = null;
      if (authOperation === expectedOperation) publish({ user: null, loading: false, error: asError(error) });
    });
    initialization = request;
  }
  return initialization;
}

async function signInWithGoogle(): Promise<void> {
  const expectedOperation = ++authOperation;
  publish({ ...state, loading: true, error: null });
  try {
    if (isNativePlatform()) throw new Error("Please use your email and password to sign in on this device.");
    const { auth } = await getFirebaseClient();
    const { GoogleAuthProvider, signInWithPopup } = await import("firebase/auth");
    const result = await signInWithPopup(auth, new GoogleAuthProvider());
    if (authOperation === expectedOperation) publish({ user: { uid: result.user.uid, email: result.user.email }, loading: false, error: null });
  } catch (error) {
    if (authOperation === expectedOperation) publish({ ...state, loading: false, error: asError(error) });
  }
}

async function signInWithPassword(email: string, password: string): Promise<void> {
  const expectedOperation = ++authOperation;
  publish({ ...state, loading: true, error: null });
  try {
    let user: AuthUser;
    if (isNativePlatform()) {
      user = await nativeSession.signIn(email.trim(), password);
      if (authOperation === expectedOperation) initialization = Promise.resolve();
    } else {
      const { auth } = await getFirebaseClient();
      const { signInWithEmailAndPassword } = await import("firebase/auth");
      const result = await signInWithEmailAndPassword(auth, email.trim(), password);
      user = { uid: result.user.uid, email: result.user.email };
    }
    if (authOperation === expectedOperation) publish({ user, loading: false, error: null });
  } catch (error) {
    if (authOperation === expectedOperation) publish({ user: null, loading: false, error: asError(error) });
  }
}

async function logout(): Promise<void> {
  const expectedOperation = ++authOperation;
  try {
    if (isNativePlatform()) {
      // Clear the visible user immediately; Keychain failures still surface below.
      publish({ user: null, loading: false, error: null });
      initialization = Promise.resolve();
      await nativeSession.logout();
    } else {
      const { auth } = await getFirebaseClient();
      const { signOut } = await import("firebase/auth");
      await signOut(auth);
    }
    if (authOperation === expectedOperation) publish({ user: null, loading: false, error: null });
  } catch (error) {
    if (authOperation === expectedOperation) publish({ ...state, loading: false, error: asError(error) });
  }
}

export async function getIdToken(expectedUid?: string): Promise<string> {
  await initializeAuth();
  if (isNativePlatform()) {
    const uid = state.user?.uid;
    if (!uid || (expectedUid && uid !== expectedUid)) throw new Error("Your sign-in changed. Please reopen the entry and try again.");
    const token = await nativeSession.getIdToken();
    if (state.user?.uid !== uid) throw new Error("Your sign-in changed. Please try again.");
    return token;
  }
  const { auth } = await getFirebaseClient();
  const user = auth.currentUser;
  if (!user) throw new Error("Please sign in to continue.");
  if (expectedUid && user.uid !== expectedUid) throw new Error("Your sign-in changed. Please reopen the entry and try again.");
  const token = await user.getIdToken();
  if (auth.currentUser?.uid !== user.uid) throw new Error("Your sign-in changed. Please try again.");
  return token;
}

export function useAuth() {
  const [snapshot, setSnapshot] = useState(state);
  useEffect(() => {
    listeners.add(setSnapshot);
    setSnapshot(state);
    void initializeAuth();
    return () => { listeners.delete(setSnapshot); };
  }, []);
  return { ...snapshot, signInWithGoogle, signInWithPassword, logout };
}
