// Served only by the local Vite development server; never imported by the app.
import { getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { getFirestore, doc, setDoc } from 'firebase/firestore';
export async function login(email: string) {
  if (getAuth().app.options.projectId !== 'demo-daigou-sync') throw new Error('Emulator only');
  await signInWithEmailAndPassword(getAuth(), email, 'test-password-123');
}
export async function logout() { await signOut(getAuth()); }
export async function oldClientWrite(uid: string) {
  try { await setDoc(doc(getFirestore(), 'users', uid), { orders: [], lastUpdated: Date.now() }, { merge: true }); return 'unexpected-success'; }
  catch (error: any) { return error.code; }
}
