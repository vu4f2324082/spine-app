import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  type DocumentData
} from 'firebase/firestore';
import { db } from './config';
import type { UserProfile, PatientProfile, SymptomLog, ExercisePlan, ExerciseCompletion, ChatSession, DoctorNote, PatientFullData } from '../types';

// ─── Users ───────────────────────────────────────────────────────────────────

export async function createUserProfile(uid: string, data: Partial<UserProfile>): Promise<void> {
  const ref = doc(db, 'users', uid);
  const existing = await getDoc(ref);
  if (!existing.exists()) {
    await setDoc(ref, { ...data, createdAt: serverTimestamp() });
  }
}

/**
 * Force-write a user profile regardless of whether it already exists.
 * Use this during email signup so the chosen role is ALWAYS committed,
 * bypassing any race conditions with onAuthStateChanged.
 */
export async function setUserProfile(uid: string, data: Partial<UserProfile>): Promise<void> {
  await setDoc(doc(db, 'users', uid), { ...data, createdAt: serverTimestamp() }, { merge: true });
}

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? (snap.data() as UserProfile) : null;
}

export async function getUserRole(uid: string): Promise<string> {
  const profile = await getUserProfile(uid);
  return profile?.role || 'patient';
}

/** Elevate or change a user's role. Used for role correction (e.g. patient → doctor). */
export async function updateUserRole(uid: string, role: 'patient' | 'doctor'): Promise<void> {
  await updateDoc(doc(db, 'users', uid), { role });
}

/**
 * Delete all Firestore data for a user account.
 * Called before Firebase Auth account deletion.
 */
export async function deleteUserData(uid: string, role: 'patient' | 'doctor'): Promise<void> {
  const batches: Promise<void>[] = [];

  // Always delete the user profile doc
  batches.push(deleteDoc(doc(db, 'users', uid)));

  if (role === 'patient') {
    // Patient-specific collections
    batches.push(deleteDoc(doc(db, 'profiles', uid)));
    batches.push(deleteDoc(doc(db, 'exercise_plans', uid)));

    // Delete symptom logs sub-collection docs
    batches.push(
      getDocs(collection(db, 'symptom_logs', uid, 'logs')).then(snap =>
        Promise.all(snap.docs.map(d => deleteDoc(d.ref))).then(() => {})
      )
    );

    // Delete exercise completion sub-collection docs
    batches.push(
      getDocs(collection(db, 'exercise_completions', uid, 'days')).then(snap =>
        Promise.all(snap.docs.map(d => deleteDoc(d.ref))).then(() => {})
      )
    );

    // Delete AI chat sessions
    batches.push(
      getDocs(query(collection(db, 'ai_chat_sessions'), where('uid', '==', uid))).then(snap =>
        Promise.all(snap.docs.map(d => deleteDoc(d.ref))).then(() => {})
      )
    );

    // Delete doctor notes about this patient
    batches.push(
      getDocs(query(collection(db, 'doctor_notes'), where('patientId', '==', uid))).then(snap =>
        Promise.all(snap.docs.map(d => deleteDoc(d.ref))).then(() => {})
      )
    );
  } else {
    // Doctor-specific: delete all notes written by this doctor
    batches.push(
      getDocs(query(collection(db, 'doctor_notes'), where('doctorId', '==', uid))).then(snap =>
        Promise.all(snap.docs.map(d => deleteDoc(d.ref))).then(() => {})
      )
    );
    // Unset doctorId for any patients linked to this doctor
    batches.push(
      getDocs(query(collection(db, 'profiles'), where('doctorId', '==', uid))).then(snap =>
        Promise.all(snap.docs.map(d => updateDoc(d.ref, { doctorId: '' }))).then(() => {})
      )
    );
  }

  await Promise.all(batches);
}

// ─── Patient Profiles ─────────────────────────────────────────────────────────

export async function savePatientProfile(uid: string, data: Partial<PatientProfile>): Promise<void> {
  await setDoc(doc(db, 'profiles', uid), { ...data, uid }, { merge: true });
}

export async function getPatientProfile(uid: string): Promise<PatientProfile | null> {
  const snap = await getDoc(doc(db, 'profiles', uid));
  return snap.exists() ? (snap.data() as PatientProfile) : null;
}

// ─── Doctor–Patient Relationships ─────────────────────────────────────────────

/** Get all patients assigned to a specific doctor (via patientProfile.doctorId). */
export async function getMyPatients(doctorId: string): Promise<DocumentData[]> {
  const q = query(collection(db, 'profiles'), where('doctorId', '==', doctorId));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ uid: d.id, ...d.data() }));
}

/** Get all users with role === 'doctor' (for patient profile doctor picker). */
export async function getAllDoctors(): Promise<UserProfile[]> {
  const q = query(collection(db, 'users'), where('role', '==', 'doctor'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ uid: d.id, ...d.data() } as UserProfile & { uid: string }));
}

/** Aggregate a patient's full data for the doctor dashboard detail panel. */
export async function getPatientFullData(patientUid: string, doctorId: string): Promise<PatientFullData> {
  const today = new Date().toISOString().split('T')[0];

  const [userSnap, profileSnap, logsSnap, planSnap, completionsSnap, notesSnap] = await Promise.all([
    getDoc(doc(db, 'users', patientUid)),
    getDoc(doc(db, 'profiles', patientUid)),
    getDocs(query(collection(db, 'symptom_logs', patientUid, 'logs'), orderBy('date', 'desc'), limit(14))),
    getDoc(doc(db, 'exercise_plans', patientUid)),
    getDoc(doc(db, 'exercise_completions', patientUid, 'days', today)),
    getDocs(query(collection(db, 'doctor_notes'), where('patientId', '==', patientUid), where('doctorId', '==', doctorId)))
  ]);

  const userDoc = userSnap.exists() ? userSnap.data() : {};
  const profile = profileSnap.exists() ? (profileSnap.data() as PatientProfile) : null;
  const recentLogs = logsSnap.docs.map(d => ({ id: d.id, ...d.data() } as SymptomLog));
  const exercisePlan = planSnap.exists() ? (planSnap.data() as ExercisePlan) : null;
  const todayCompletions = completionsSnap.exists() ? (completionsSnap.data().completions || []) : [];
  const doctorNotes = notesSnap.docs
    .map(d => ({ id: d.id, ...d.data() } as DoctorNote))
    .sort((a, b) => {
      const tA = a.createdAt ? (typeof (a.createdAt as any).toMillis === 'function' ? (a.createdAt as any).toMillis() : new Date(a.createdAt as any).getTime()) : 0;
      const tB = b.createdAt ? (typeof (b.createdAt as any).toMillis === 'function' ? (b.createdAt as any).toMillis() : new Date(b.createdAt as any).getTime()) : 0;
      return tB - tA;
    });

  const recentLog = recentLogs[0];
  const flagged = recentLog ? recentLog.painScore >= 8 || (recentLog.symptoms?.length ?? 0) >= 3 : false;

  return {
    uid: patientUid,
    displayName: userDoc.displayName || 'Unknown Patient',
    email: userDoc.email || '',
    patientProfile: profile,
    recentLogs,
    exercisePlan,
    todayCompletions,
    doctorNotes,
    flagged
  };
}

// ─── Symptom Logs ─────────────────────────────────────────────────────────────

export async function addSymptomLog(uid: string, log: Omit<SymptomLog, 'id'>): Promise<string> {
  const ref = await addDoc(collection(db, 'symptom_logs', uid, 'logs'), {
    ...log,
    createdAt: serverTimestamp()
  });
  return ref.id;
}

export async function getSymptomLogs(uid: string, days = 30): Promise<SymptomLog[]> {
  const q = query(
    collection(db, 'symptom_logs', uid, 'logs'),
    orderBy('date', 'desc'),
    limit(days)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as SymptomLog));
}

export function subscribeToSymptomLogs(uid: string, callback: (logs: SymptomLog[]) => void) {
  const q = query(
    collection(db, 'symptom_logs', uid, 'logs'),
    orderBy('date', 'desc'),
    limit(14)
  );
  return onSnapshot(q, snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as SymptomLog)));
  });
}

// ─── Exercise Plans ───────────────────────────────────────────────────────────

export async function saveExercisePlan(uid: string, plan: Omit<ExercisePlan, 'uid'>): Promise<void> {
  await setDoc(doc(db, 'exercise_plans', uid), { ...plan, uid, generatedAt: serverTimestamp() });
}

export async function getExercisePlan(uid: string): Promise<ExercisePlan | null> {
  const snap = await getDoc(doc(db, 'exercise_plans', uid));
  return snap.exists() ? (snap.data() as ExercisePlan) : null;
}

// ─── Exercise Completions ─────────────────────────────────────────────────────

export async function markExerciseComplete(
  uid: string,
  date: string,
  completion: ExerciseCompletion
): Promise<void> {
  const ref = doc(db, 'exercise_completions', uid, 'days', date);
  const existing = await getDoc(ref);
  const completions = existing.exists() ? (existing.data().completions || []) : [];
  completions.push({ ...completion, completedAt: Timestamp.now() });
  await setDoc(ref, { completions, date }, { merge: true });
}

export async function unmarkExerciseComplete(
  uid: string,
  date: string,
  exerciseId: string
): Promise<void> {
  const ref = doc(db, 'exercise_completions', uid, 'days', date);
  const existing = await getDoc(ref);
  if (!existing.exists()) return;
  
  let completions = existing.data().completions || [];
  completions = completions.filter((c: any) => c.exerciseId !== exerciseId);
  
  await setDoc(ref, { completions, date }, { merge: true });
}

export async function getExerciseCompletions(uid: string, date: string): Promise<ExerciseCompletion[]> {
  const snap = await getDoc(doc(db, 'exercise_completions', uid, 'days', date));
  return snap.exists() ? snap.data().completions || [] : [];
}

// ─── Chat Sessions ────────────────────────────────────────────────────────────

export async function saveChatSession(session: ChatSession): Promise<string> {
  // Never write the id field into the Firestore document itself
  const { id, ...data } = session;

  if (id) {
    await setDoc(doc(db, 'ai_chat_sessions', id), {
      ...data,
      updatedAt: serverTimestamp()
    }, { merge: true });
    return id;
  }

  const ref = await addDoc(collection(db, 'ai_chat_sessions'), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  return ref.id;
}

export async function getChatSessions(uid: string): Promise<ChatSession[]> {
  // Query without orderBy to avoid requiring a composite Firestore index.
  // Sort client-side by updatedAt instead.
  const q = query(collection(db, 'ai_chat_sessions'), where('uid', '==', uid));
  const snap = await getDocs(q);

  const sessions = snap.docs.map(d => ({ id: d.id, ...d.data() } as ChatSession));

  return sessions.sort((a, b) => {
    const toMs = (v: any) =>
      v && typeof v.toMillis === 'function' ? v.toMillis() : new Date(v || 0).getTime();
    return toMs(b.updatedAt) - toMs(a.updatedAt);
  });
}

export async function deleteChatSession(sessionId: string): Promise<void> {
  await deleteDoc(doc(db, 'ai_chat_sessions', sessionId));
}

// ─── Doctor Notes ─────────────────────────────────────────────────────────────

export async function addDoctorNote(note: Omit<DoctorNote, 'id'>): Promise<string> {
  const ref = await addDoc(collection(db, 'doctor_notes'), {
    ...note,
    createdAt: serverTimestamp()
  });
  return ref.id;
}

export async function getPatientDoctorNotes(patientId: string): Promise<DoctorNote[]> {
  const q = query(
    collection(db, 'doctor_notes'),
    where('patientId', '==', patientId),
    orderBy('createdAt', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as DoctorNote));
}

/** Get all patients with role='patient' from users collection (general query, unfiltered by doctor). */
export async function getAllPatients(): Promise<DocumentData[]> {
  const q = query(collection(db, 'users'), where('role', '==', 'patient'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ uid: d.id, ...d.data() }));
}
