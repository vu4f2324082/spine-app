export interface UserProfile {
  email: string;
  displayName: string;
  role: 'patient' | 'doctor';
  createdAt: Date;
  photoURL?: string;
}

export interface PatientProfile {
  uid: string;
  surgeryType: string;
  surgeryDate: string;
  recoveryStage: 'pre-op' | 'early' | 'mid' | 'late' | 'complete';
  age: number;
  phoneNumber?: string;
  doctorId?: string;
  height?: number;
  weight?: number;
  medications?: string;
  allergies?: string;
}

export interface SymptomLog {
  id?: string;
  uid: string;
  date: string; // YYYY-MM-DD
  painScore: number; // 0-10
  mobility: number; // 0-10
  mood: number; // 0-10
  symptoms: string[];
  notes: string;
  createdAt: Date;
}

export interface Exercise {
  id: string;
  name: string;
  duration: string;
  reps?: string;
  description: string;
  category: 'morning' | 'afternoon' | 'evening';
  videoUrl?: string;
  imageUrl?: string;
}

export interface ExercisePlan {
  uid: string;
  generatedAt: Date;
  surgeryType: string;
  recoveryStage: string;
  morning: Exercise[];
  afternoon: Exercise[];
  evening: Exercise[];
  precautions: string[];
  redFlags: string[];
}

export interface ExerciseCompletion {
  exerciseId: string;
  exerciseName: string;
  completedAt: Date;
  notes?: string;
}

export interface ChatMessage {
  role: 'user' | 'model';
  content: string;
  timestamp: Date;
}

export interface ChatSession {
  id?: string;
  uid: string;
  title: string;          // first user message, truncated
  messages: ChatMessage[];
  createdAt: Date;
  updatedAt: Date;
}

export interface DoctorNote {
  id?: string;
  doctorId: string;
  patientId: string;
  note: string;
  createdAt: Date;
  flagged: boolean;
  flagReason?: string;
}

export interface DashboardStats {
  todayPainScore: number;
  exercisesCompleted: number;
  totalExercises: number;
  recoveryDays: number;
  weeklyAdherence: number;
  lastLog?: SymptomLog;
}
