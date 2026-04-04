import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  updateProfile,
  type User
} from 'firebase/auth';
import { auth } from './config';
import { createUserProfile } from './firestore';

const googleProvider = new GoogleAuthProvider();

export async function signUp(email: string, password: string, displayName: string): Promise<User> {
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(credential.user, { displayName });
  await createUserProfile(credential.user.uid, {
    email,
    displayName,
    role: 'patient',
    createdAt: new Date()
  });
  return credential.user;
}

export async function signIn(email: string, password: string): Promise<User> {
  const credential = await signInWithEmailAndPassword(auth, email, password);
  return credential.user;
}

export async function signInWithGoogle(): Promise<User> {
  const credential = await signInWithPopup(auth, googleProvider);
  await createUserProfile(credential.user.uid, {
    email: credential.user.email || '',
    displayName: credential.user.displayName || 'Patient',
    role: 'patient',
    createdAt: new Date()
  });
  return credential.user;
}

export async function logout(): Promise<void> {
  await signOut(auth);
}
