import { writable, derived } from 'svelte/store';
import { auth } from '$lib/firebase/config';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { getUserProfile, getPatientProfile } from '$lib/firebase/firestore';
import type { UserProfile, PatientProfile } from '$lib/types';

interface AuthState {
  user: User | null;
  userProfile: UserProfile | null;
  patientProfile: PatientProfile | null;
  loading: boolean;
  initialized: boolean;
}

function createAuthStore() {
  const { subscribe, set, update } = writable<AuthState>({
    user: null,
    userProfile: null,
    patientProfile: null,
    loading: true,
    initialized: false
  });

  let unsubscribe: (() => void) | null = null;

  function init() {
    if (typeof window === 'undefined') return;
    unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const [userProfile, patientProfile] = await Promise.all([
          getUserProfile(user.uid),
          getPatientProfile(user.uid)
        ]);
        set({ user, userProfile, patientProfile, loading: false, initialized: true });
      } else {
        set({ user: null, userProfile: null, patientProfile: null, loading: false, initialized: true });
      }
    });
  }

  function destroy() {
    if (unsubscribe) unsubscribe();
  }

  function refresh(uid: string) {
    return Promise.all([
      getUserProfile(uid),
      getPatientProfile(uid)
    ]).then(([userProfile, patientProfile]) => {
      update(s => ({ ...s, userProfile, patientProfile }));
    });
  }

  return { subscribe, init, destroy, refresh };
}

export const authStore = createAuthStore();

export const isAuthenticated = derived(authStore, $auth => !!$auth.user);
export const isDoctor = derived(authStore, $auth => $auth.userProfile?.role === 'doctor');
export const currentUser = derived(authStore, $auth => $auth.user);
