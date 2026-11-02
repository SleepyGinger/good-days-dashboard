import type { FirebaseApp } from "firebase/app";
import type { Auth } from "firebase/auth";
import type { Database } from "firebase/database";
import { sharedInitialization } from "./sharedInitialization";

export const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

interface FirebaseClient {
  app: FirebaseApp;
  auth: Auth;
  database: Database;
}

export const getFirebaseClient = sharedInitialization<FirebaseClient>(async () => {
  if (typeof window === "undefined") throw new Error("Firebase requires a browser.");
  if (!firebaseConfig.apiKey || !firebaseConfig.projectId || !firebaseConfig.databaseURL) {
    throw new Error("Firebase configuration is missing. Please check the app configuration.");
  }
  const [apps, authentication, database] = await Promise.all([
    import("firebase/app"),
    import("firebase/auth"),
    import("firebase/database"),
  ]);
  const app = apps.getApps().length ? apps.getApp() : apps.initializeApp(firebaseConfig);
  return { app, auth: authentication.getAuth(app), database: database.getDatabase(app) };
});
