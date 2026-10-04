import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDjm01ZjY9sHVtMLI9J2OG7HqR-w9lVnLo",
  authDomain: "banksetu-69e2f.firebaseapp.com",
  projectId: "banksetu-69e2f",
  storageBucket: "banksetu-69e2f.firebasestorage.app",
  messagingSenderId: "806744371163",
  appId: "1:806744371163:web:28535d723bee82074641fe",
};

export const FIREBASE_WEB_API_KEY = firebaseConfig.apiKey;
const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = initializeFirestore(app, {localCache:persistentLocalCache({tabManager:persistentMultipleTabManager()})});