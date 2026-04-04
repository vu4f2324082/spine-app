<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { authStore } from '$lib/stores/auth';
  import { getAllPatients, getSymptomLogs, getExercisePlan, addDoctorNote } from '$lib/firebase/firestore';
  import Alert from '$lib/components/Alert.svelte';
  import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import ProgressBar from '$lib/components/ProgressBar.svelte';
  import type { SymptomLog } from '$lib/types';

  interface PatientSummary {
    uid: string;
    displayName: string;
    email: string;
    recentLog?: SymptomLog;
    logCount: number;
    flagged: boolean;
  }

  let patients = $state<PatientSummary[]>([]);
  let loading = $state(true);
  let selectedPatient = $state<PatientSummary | null>(null);
  let noteText = $state('');
  let savingNote = $state(false);
  let noteSaved = $state(false);

  const user = $derived($authStore.user);
  const isDoctor = $derived($authStore.userProfile?.role === 'doctor');

  // Mock patients for demo when not a doctor or no patients in DB
  const mockPatients: PatientSummary[] = [
    { uid: 'mock-1', displayName: 'Sarah Johnson', email: 'sarah.j@example.com', recentLog: { uid: 'mock-1', date: '2024-01-15', painScore: 4, mobility: 7, mood: 6, symptoms: ['Lower back pain', 'Stiffness'], notes: 'Feeling better after morning walk', createdAt: new Date() }, logCount: 12, flagged: false },
    { uid: 'mock-2', displayName: 'Michael Chen', email: 'm.chen@example.com', recentLog: { uid: 'mock-2', date: '2024-01-15', painScore: 8, mobility: 3, mood: 4, symptoms: ['Severe pain', 'Leg numbness', 'Fatigue'], notes: 'Pain increased significantly overnight', createdAt: new Date() }, logCount: 7, flagged: true },
    { uid: 'mock-3', displayName: 'Emma Williams', email: 'emma.w@example.com', recentLog: { uid: 'mock-3', date: '2024-01-14', painScore: 2, mobility: 9, mood: 9, symptoms: [], notes: 'Great day! Completed all exercises.', createdAt: new Date() }, logCount: 28, flagged: false },
    { uid: 'mock-4', displayName: 'James Patel', email: 'j.patel@example.com', recentLog: undefined, logCount: 0, flagged: false }
  ];

  onMount(async () => {
    // Wait slightly to ensure auth finishes loading if we hit the page directly
    if ($authStore.loading) return; 

    if (!user) {
      goto('/auth');
      return;
    }
    
    // Redirect patients away from admin page
    if (!isDoctor) {
      goto('/dashboard');
      return;
    }

    try {
      const allPatients = await getAllPatients();
      if (allPatients.length === 0) {
        patients = mockPatients;
      } else {
        const summaries = await Promise.all(allPatients.slice(0, 10).map(async (p) => {
          const logs = await getSymptomLogs(p.uid, 7);
          const recent = logs[0];
          return {
            uid: p.uid,
            displayName: p.displayName || 'Unknown',
            email: p.email || '',
            recentLog: recent,
            logCount: logs.length,
            flagged: recent ? recent.painScore >= 8 || recent.symptoms?.length >= 3 : false
          } as PatientSummary;
        }));
        patients = summaries.length > 0 ? summaries : mockPatients;
      }
    } catch {
      patients = mockPatients;
    } finally {
      loading = false;
    }
  });

  async function saveNote() {
    if (!selectedPatient || !noteText.trim() || !user) return;
    savingNote = true;
    await addDoctorNote({
      doctorId: user.uid,
      patientId: selectedPatient.uid,
      note: noteText.trim(),
      createdAt: new Date(),
      flagged: false
    });
    noteSaved = true;
    noteText = '';
    savingNote = false;
    setTimeout(() => noteSaved = false, 3000);
  }

  function getPainColor(score: number): string {
    if (score <= 3) return 'text-accent-green';
    if (score <= 6) return 'text-accent-amber';
    return 'text-accent-red';
  }
</script>

<svelte:head><title>Admin – SpineSync</title></svelte:head>

<div class="space-y-6 animate-fade-in">
  <!-- Header -->
  <div class="flex items-start justify-between">
    <div>
      <h1 class="page-title">Caregiver Dashboard</h1>
      <p class="text-muted text-sm mt-1">Monitor patient progress and recovery across your panel</p>
    </div>
    <span class="badge badge-primary">
      {isDoctor ? '👨‍⚕️ Doctor View' : 'Authenticating...'}
    </span>
  </div>

  {#if loading}
    <div class="flex justify-center py-20"><LoadingSpinner label="Loading patients…" /></div>
  {:else if patients.length === 0}
    <EmptyState title="No patients yet" description="Patients will appear here once they register and log data." icon="👥" />
  {:else}
    <!-- Stats -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div class="card text-center">
        <p class="text-3xl font-semibold text-black">{patients.length}</p>
        <p class="text-xs text-muted mt-1">Total Patients</p>
      </div>
      <div class="card text-center">
        <p class="text-3xl font-semibold text-accent-red">{patients.filter(p => p.flagged).length}</p>
        <p class="text-xs text-muted mt-1">Flagged Alerts</p>
      </div>
      <div class="card text-center">
        <p class="text-3xl font-semibold text-accent-green">{patients.filter(p => p.logCount > 5).length}</p>
        <p class="text-xs text-muted mt-1">Active Patients</p>
      </div>
      <div class="card text-center">
        <p class="text-3xl font-semibold text-muted">{patients.filter(p => p.logCount === 0).length}</p>
        <p class="text-xs text-muted mt-1">No Logs Yet</p>
      </div>
    </div>

    <!-- Flagged Alerts -->
    {#if patients.some(p => p.flagged)}
      <div class="card border-l-4 border-accent-red">
        <h2 class="section-title text-accent-red mb-3">🚨 Patients Requiring Attention</h2>
        <div class="space-y-2">
          {#each patients.filter(p => p.flagged) as p}
            <div class="flex items-center justify-between p-3 bg-accent-red/5 rounded-xl">
              <div>
                <p class="font-medium text-black text-sm">{p.displayName}</p>
                <p class="text-xs text-muted">Pain: {p.recentLog?.painScore}/10 · {p.recentLog?.symptoms?.join(', ')}</p>
              </div>
              <button onclick={() => selectedPatient = p} class="btn-secondary text-xs py-1.5 px-3">Review</button>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Patient List -->
    <div class="card overflow-hidden">
      <h2 class="section-title mb-4">Patient Overview</h2>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-border">
              <th class="text-left py-2.5 px-4 text-muted font-medium">Patient</th>
              <th class="text-center py-2.5 px-4 text-muted font-medium">Last Pain</th>
              <th class="text-center py-2.5 px-4 text-muted font-medium">Mobility</th>
              <th class="text-center py-2.5 px-4 text-muted font-medium">Logs</th>
              <th class="text-center py-2.5 px-4 text-muted font-medium">Status</th>
              <th class="py-2.5 px-4"></th>
            </tr>
          </thead>
          <tbody>
            {#each patients as p}
              <tr class="border-b border-surface last:border-0 hover:bg-surface transition-colors {selectedPatient?.uid === p.uid ? 'bg-primary/5' : ''}">
                <td class="py-3 px-4">
                  <div class="flex items-center gap-3">
                    <div class="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center text-primary font-semibold text-xs">
                      {p.displayName[0]}
                    </div>
                    <div>
                      <p class="font-medium text-black">{p.displayName}</p>
                      <p class="text-xs text-muted">{p.email}</p>
                    </div>
                  </div>
                </td>
                <td class="py-3 px-4 text-center">
                  {#if p.recentLog}
                    <span class="font-semibold {getPainColor(p.recentLog.painScore)}">{p.recentLog.painScore}/10</span>
                  {:else}
                    <span class="text-muted">—</span>
                  {/if}
                </td>
                <td class="py-3 px-4 text-center text-muted">{p.recentLog?.mobility ?? '—'}</td>
                <td class="py-3 px-4 text-center text-muted">{p.logCount}</td>
                <td class="py-3 px-4 text-center">
                  {#if p.flagged}
                    <span class="badge badge-danger">⚡ Alert</span>
                  {:else if p.logCount === 0}
                    <span class="badge text-muted bg-border/50">No data</span>
                  {:else}
                    <span class="badge badge-success">✓ OK</span>
                  {/if}
                </td>
                <td class="py-3 px-4 text-right">
                  <button onclick={() => selectedPatient = selectedPatient?.uid === p.uid ? null : p} class="text-xs text-primary hover:underline font-medium">
                    {selectedPatient?.uid === p.uid ? 'Close' : 'Details'}
                  </button>
                </td>
              </tr>
              {#if selectedPatient?.uid === p.uid}
                <tr class="bg-surface">
                  <td colspan="6" class="px-4 pb-4 pt-2">
                    <div class="space-y-3">
                      {#if p.recentLog}
                        <div class="grid grid-cols-3 gap-3 text-sm">
                          <div><p class="text-muted text-xs">Latest symptoms</p><p>{p.recentLog.symptoms?.join(', ') || 'None reported'}</p></div>
                          <div><p class="text-muted text-xs">Notes</p><p>{p.recentLog.notes || '—'}</p></div>
                          <div><p class="text-muted text-xs">Logged</p><p>{p.recentLog.date}</p></div>
                        </div>
                      {/if}
                      {#if noteSaved}
                        <Alert type="success" message="Note saved successfully." />
                      {/if}
                      <div class="flex gap-2">
                        <textarea bind:value={noteText} class="input-field flex-1" rows="1" placeholder="Add a clinical note for this patient…"></textarea>
                        <button onclick={saveNote} disabled={savingNote || !noteText.trim()} class="btn-primary text-sm px-4 flex-shrink-0">Save Note</button>
                      </div>
                    </div>
                  </td>
                </tr>
              {/if}
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  {/if}
</div>
