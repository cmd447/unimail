import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

function init() {
  if (getApps().length) return getApps()[0];
  const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (sa) {
    return initializeApp({
      credential: cert(JSON.parse(sa)),
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    });
  }
  // Local fallback: gcloud application-default credentials
  return initializeApp({ credential: applicationDefault() });
}

export function db() {
  init();
  return getFirestore();
}

export function adminAuth() {
  init();
  return getAuth();
}

export function adminStorage() {
  init();
  return getStorage();
}
