import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getFirestore, doc, runTransaction, onSnapshot, connectFirestoreEmulator, type Firestore } from 'firebase/firestore';
import {
  getAuth, connectAuthEmulator,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged
} from 'firebase/auth';
import type { Auth, User } from 'firebase/auth';
import type { UserProfile } from '../types';
import type { WorkspaceData } from './workspaceData';
import { versionOf, normalizeWorkspace } from './workspaceData';
import type { CloudDocument } from './workspaceSync';

// =========================================================================
// 設定區：請將下方的字串替換為您 Firebase Console > Project Settings 中的設定
// =========================================================================
const firebaseConfig = {
  apiKey: "AIzaSyBd_T0vm8e1uFHdO1XkU5RceHe1b1hFIyU",
  authDomain: "daigo-2d168.firebaseapp.com",
  projectId: "daigo-2d168",
  storageBucket: "daigo-2d168.firebasestorage.app",
  messagingSenderId: "537024631130",
  appId: "1:537024631130:web:0be2a398ea8a2b132f6363",
  measurementId: "G-4LZG3HGKCC"
};

let app: FirebaseApp | undefined;
let db: Firestore | undefined;
let auth: Auth | undefined;
const useEmulators = import.meta.env.DEV && import.meta.env.VITE_FIREBASE_EMULATORS === '1';

// 初始化 Cloud (無參數版本，解決 TS2554 錯誤)
export const initializeCloud = () => {
  try {
    // 檢查是否還沒填寫設定
    if (firebaseConfig.apiKey === "YOUR_API_KEY" || !firebaseConfig.apiKey) {
        console.warn("⚠️ Firebase Config 尚未設定！請至 services/cloudService.ts 填入您的專案資訊。");
        return false;
    }

    if (!getApps().length) {
      app = initializeApp(useEmulators ? { ...firebaseConfig, projectId: 'demo-daigou-sync', apiKey: 'demo-key', authDomain: 'localhost' } : firebaseConfig);
    } else {
      app = getApp();
    }
    if (!db) {
      db = getFirestore(app);
      auth = getAuth(app);
      if (useEmulators) {
        connectFirestoreEmulator(db, '127.0.0.1', 8088);
        connectAuthEmulator(auth, 'http://127.0.0.1:9098', { disableWarnings: true });
      }
    }
    return true;
  } catch (error) {
    console.error("Firebase init error:", error);
    return false;
  }
};

// --- Auth Functions ---

export const loginWithGoogle = async (): Promise<UserProfile | null> => {
    // 確保已初始化
    if (!auth) {
        const success = initializeCloud();
        if (!success) {
            throw new Error("系統設定錯誤：請聯繫管理員設定 Firebase Config (services/cloudService.ts)");
        }
    }

    if (!auth) throw new Error("Firebase 初始化失敗");

    const provider = new GoogleAuthProvider();
    try {
        const result = await signInWithPopup(auth, provider);
        const user = result.user;
        return {
            uid: user.uid,
            displayName: user.displayName,
            email: user.email,
            photoURL: user.photoURL
        };
    } catch (error) {
        console.error("Login failed", error);
        throw error;
    }
};

export const logoutFirebase = async () => {
    if (!auth) return;
    await signOut(auth);
};

export const subscribeToAuthChanges = (callback: (user: UserProfile | null) => void) => {
    // 嘗試在載入時初始化，以便監聽登入狀態
    if (!auth) initializeCloud();

    if (!auth) return () => {};
    return onAuthStateChanged(auth, (user) => {
        if (user) {
            callback({
                uid: user.uid,
                displayName: user.displayName,
                email: user.email,
                photoURL: user.photoURL
            });
        } else {
            callback(null);
        }
    });
};

// Writes require the server document read by this account, not a browser timestamp.
export const saveToCloud = async (uid: string, data: WorkspaceData, expectedVersion: string) => {
  if (!db || auth?.currentUser?.uid !== uid) throw new Error('帳號已切換，已停止寫入');
  const docRef = doc(db, 'users', uid);
  const cleanData = normalizeWorkspace(data);
  const revision = crypto.randomUUID();
  return runTransaction(db, async transaction => {
    const snapshot = await transaction.get(docRef);
    const current = snapshot.exists() ? snapshot.data() : null;
    if (auth?.currentUser?.uid !== uid) throw new Error('帳號已切換，已停止寫入');
    if (versionOf(current) !== expectedVersion) {
      throw Object.assign(new Error('雲端資料已變更'), { code: 'sync/conflict' });
    }
    const stored = { ...current, ...cleanData, lastUpdated: Date.now(), revision,
      syncSchemaVersion: 2, device: navigator.userAgent };
    transaction.set(docRef, stored);
    return stored;
  });
};

export const subscribeToCloud = (uid: string, onData: (data: CloudDocument) => void, onError: (error: Error) => void) => {
  if (!db || auth?.currentUser?.uid !== uid) {
    onError(new Error('帳號尚未驗證'));
    return () => {};
  }
  return onSnapshot(doc(db, 'users', uid), { includeMetadataChanges: true }, snapshot => {
    if (auth?.currentUser?.uid !== uid || snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) return;
    onData(snapshot.exists() ? snapshot.data() : null);
  }, onError);
};
