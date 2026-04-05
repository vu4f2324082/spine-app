import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
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
import type { UserProfile, PatientProfile, SymptomLog, ExercisePlan, ExerciseCompletion, ChatSession, DoctorNote } from '../types';

// ─── Users ───────────────────────────────────────────────────────────────────

export async function createUserProfile(uid: string, data: Partial<UserProfile>): Promise<void> {
  const ref = doc(db, 'users', uid);
  const existing = await getDoc(ref);
  if (!existing.exists()) {
    await setDoc(ref, { ...data, createdAt: serverTimestamp() });
  }
}

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? (snap.data() as UserProfile) : null;
}

export async function getUserRole(uid: string): Promise<string> {
  const profile = await getUserProfile(uid);
  return profile?.role || 'patient';
}

// ─── Patient Profiles ─────────────────────────────────────────────────────────

export async function savePatientProfile(uid: string, data: Partial<PatientProfile>): Promise<void> {
  await setDoc(doc(db, 'profiles', uid), { ...data, uid }, { merge: true });
}

export async function getPatientProfile(uid: string): Promise<PatientProfile | null> {
  const snap = await getDoc(doc(db, 'profiles', uid));
  return snap.exists() ? (snap.data() as PatientProfile) : null;
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
  if (session.id) {
    await setDoc(doc(db, 'ai_chat_sessions', session.id), {
      ...session,
      updatedAt: serverTimestamp()
    }, { merge: true });
    return session.id;
  }
  const ref = await addDoc(collection(db, 'ai_chat_sessions'), {
    ...session,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  return ref.id;
}

export async function getChatSessions(uid: string): Promise<ChatSession[]> {
  const q = query(collection(db, 'ai_chat_sessions'), where('uid', '==', uid));
  const snap = await getDocs(q);
  
  const sessions = snap.docs.map(d => ({ id: d.id, ...d.data() } as ChatSession));
  
  return sessions.sort((a, b) => {
    const timeA = a.updatedAt && typeof (a.updatedAt as any).toMillis === 'function' 
      ? (a.updatedAt as any).toMillis() 
      : new Date(a.updatedAt || 0).getTime();
    const timeB = b.updatedAt && typeof (b.updatedAt as any).toMillis === 'function' 
      ? (b.updatedAt as any).toMillis() 
      : new Date(b.updatedAt || 0).getTime();
    return timeB - timeA;
  });
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

export async function getAllPatients(): Promise<DocumentData[]> {
  const q = query(collection(db, 'users'), where('role', '==', 'patient'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ uid: d.id, ...d.data() }));
}
