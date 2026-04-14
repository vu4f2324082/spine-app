import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  updateProfile,
  deleteUser,
  type User
} from 'firebase/auth';
import { auth } from './config';
import { createUserProfile, getUserProfile, setUserProfile, deleteUserData } from './firestore';

const googleProvider = new GoogleAuthProvider();

export async function signUp(
  email: string,
  password: string,
  displayName: string,
  role: 'patient' | 'doctor' = 'patient'
): Promise<User> {
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(credential.user, { displayName });
  await setUserProfile(credential.user.uid, {
    email,
    displayName,
    role,
    createdAt: new Date()
  });
  return credential.user;
}

export async function signIn(email: string, password: string): Promise<User> {
  const credential = await signInWithEmailAndPassword(auth, email, password);
  return credential.user;
}

/**
 * Sign in with Google. Returns the user and whether this was a brand-new account
 * (isNewUser = true means we need to ask the user for their role).
 */
export async function signInWithGoogle(): Promise<{ user: User; isNewUser: boolean }> {
  const credential = await signInWithPopup(auth, googleProvider);
  const user = credential.user;

  // Check if a profile already exists
  const existing = await getUserProfile(user.uid);
  const isNewUser = !existing;

  if (isNewUser) {
    // Create a temporary patient profile — role will be updated after the user picks one
    await createUserProfile(user.uid, {
      email: user.email || '',
      displayName: user.displayName || 'User',
      role: 'patient',
      createdAt: new Date()
    });
  }

  return { user, isNewUser };
}

export async function logout(): Promise<void> {
  await signOut(auth);
}

export async function deleteAccount(uid: string, role: 'patient' | 'doctor'): Promise<void> {
  const user = auth.currentUser;
  if (!user || user.uid !== uid) throw new Error("Unauthenticated or user mismatch");
  
  await deleteUserData(uid, role);
  await deleteUser(user);
}
