<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { authStore } from '$lib/stores/auth';
  import {
    getMyPatients,
    getSymptomLogs,
    getPatientFullData,
    addDoctorNote,
    getUserProfile
  } from '$lib/firebase/firestore';
  import { generateRecoverySummary } from '$lib/ai/gemini';
  import Alert from '$lib/components/Alert.svelte';
  import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import ProgressBar from '$lib/components/ProgressBar.svelte';
  import type { PatientFullData, SymptomLog } from '$lib/types';

  interface PatientRow {
    uid: string;
    displayName: string;
    email: string;
    recoveryStage?: string;
    recentLog?: SymptomLog;
    logCount: number;
    flagged: boolean;
    adherence: number;
  }

  let patients = $state<PatientRow[]>([]);
  let loading = $state(true);
  let searchQuery = $state('');
  let selectedPatientUid = $state<string | null>(null);
  let detailData = $state<PatientFullData | null>(null);
  let loadingDetail = $state(false);
  let noteText = $state('');
  let savingNote = $state(false);
  let noteSaved = $state(false);
  let aiSummary = $state('');
  let loadingAi = $state(false);
  let successMsg = $state('');

  const user = $derived($authStore.user);
  const userProfile = $derived($authStore.userProfile);
  const isDoctor = $derived(userProfile?.role === 'doctor');

  const stageLabelMap: Record<string, string> = {
    'pre-op': 'Pre-Surgery',
    'early': 'Early (0–6 wk)',
    'mid': 'Mid (6–12 wk)',
    'late': 'Late (3–6 mo)',
    'complete': 'Full Recovery'
  };

  const filteredPatients = $derived(
    patients.filter(p =>
      !searchQuery ||
      p.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.email.toLowerCase().includes(searchQuery.toLowerCase())
    )
  );

  const stats = $derived({
    total: patients.length,
    flagged: patients.filter(p => p.flagged).length,
    active: patients.filter(p => p.logCount >= 3).length,
    noData: patients.filter(p => p.logCount === 0).length
  });

  onMount(async () => {
    if (!user) { goto('/auth'); return; }
    if (!isDoctor) { goto('/dashboard'); return; }

    try {
      const assigned = await getMyPatients(user.uid);

      if (assigned.length === 0) {
        // No patients assigned yet — show empty state
        loading = false;
        return;
      }

      const rows = await Promise.all(
        assigned.map(async (p) => {
          const uid: string = p.uid;
          const [profile, logs] = await Promise.all([
            getUserProfile(uid),
            getSymptomLogs(uid, 7)
          ]);
          const recent = logs[0];
          const allExercises = 0; // basic — full count available in detail panel
          return {
            uid,
            displayName: profile?.displayName || p.displayName || 'Unknown',
            email: profile?.email || p.email || '',
            recoveryStage: p.recoveryStage,
            recentLog: recent,
            logCount: logs.length,
            flagged: recent ? recent.painScore >= 8 || (recent.symptoms?.length ?? 0) >= 3 : false,
            adherence: 0 // basic row doesn't load exercise data (perf) — detail panel does
          } as PatientRow;
        })
      );
      patients = rows.sort((a, b) => (b.flagged ? 1 : 0) - (a.flagged ? 1 : 0));
    } catch (e) {
      console.error(e);
    } finally {
      loading = false;
    }
  });

  async function viewPatient(uid: string) {
    if (selectedPatientUid === uid) {
      selectedPatientUid = null;
      detailData = null;
      aiSummary = '';
      return;
    }
    selectedPatientUid = uid;
    aiSummary = '';
    noteText = '';
    loadingDetail = true;
    try {
      detailData = await getPatientFullData(uid, user!.uid);
    } catch (err) {
      console.error('Error fetching patient details:', err);
      alert('Could not load patient details. Please check console for errors or try again later.');
      selectedPatientUid = null;
    } finally {
      loadingDetail = false;
    }
  }

  async function generateAiInsight() {
    if (!detailData || detailData.recentLogs.length < 3) return;
    loadingAi = true;
    try {
      const plan = detailData.exercisePlan;
      const allEx = plan ? [...(plan.morning || []), ...(plan.afternoon || []), ...(plan.evening || [])] : [];
      const adherence = allEx.length > 0
        ? Math.round((detailData.todayCompletions.length / allEx.length) * 100)
        : 0;
      aiSummary = await generateRecoverySummary({
        logs: detailData.recentLogs.slice(0, 7).map(l => ({ date: l.date, painScore: l.painScore, mobility: l.mobility })),
        exerciseAdherence: adherence
      });
    } finally {
      loadingAi = false;
    }
  }

  async function saveNote() {
    if (!selectedPatientUid || !noteText.trim() || !user) return;
    savingNote = true;
    try {
      await addDoctorNote({
        doctorId: user.uid,
        patientId: selectedPatientUid,
        note: noteText.trim(),
        createdAt: new Date(),
        flagged: false
      });
      // Refresh detail
      detailData = await getPatientFullData(selectedPatientUid, user.uid);
      noteText = '';
      noteSaved = true;
      setTimeout(() => noteSaved = false, 3000);
    } finally {
      savingNote = false;
    }
  }

  function getPainColor(score: number): string {
    if (score <= 3) return 'text-accent-green';
    if (score <= 6) return 'text-accent-amber';
    return 'text-accent-red';
  }

  function getPainBg(score: number): string {
    if (score <= 3) return 'bg-accent-green/20';
    if (score <= 6) return 'bg-accent-amber/20';
    return 'bg-accent-red/20';
  }

  function formatDate(d: string): string {
    return new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  }

  // Compute exercise adherence for detail panel
  const detailAdherence = $derived(() => {
    if (!detailData) return 0;
    const plan = detailData.exercisePlan;
    const allEx = plan ? [...(plan.morning || []), ...(plan.afternoon || []), ...(plan.evening || [])] : [];
    if (allEx.length === 0) return 0;
    return Math.round((detailData.todayCompletions.length / allEx.length) * 100);
  });

  const completedExIds = $derived(() =>
    new Set(detailData?.todayCompletions.map((c: any) => c.exerciseId) ?? [])
  );

  const allDetailExercises = $derived(() => {
    const plan = detailData?.exercisePlan;
    if (!plan) return [];
    return [...(plan.morning || []), ...(plan.afternoon || []), ...(plan.evening || [])];
  });
</script>

<svelte:head><title>My Patients – SpineSync</title></svelte:head>

<div class="space-y-6 animate-fade-in">
  <!-- Header -->
  <div class="flex items-start justify-between flex-wrap gap-3">
    <div>
      <h1 class="page-title">Good day, Dr. {user?.displayName?.split(' ')[0] || 'Doctor'} 👨‍⚕️</h1>
      <p class="text-muted text-sm mt-1">
        {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
      </p>
    </div>
    <span class="badge bg-emerald-100 text-emerald-700 border border-emerald-200">
      👨‍⚕️ Doctor Dashboard
    </span>
  </div>

  {#if loading}
    <div class="flex justify-center py-24"><LoadingSpinner label="Loading your patients…" /></div>
  {:else if patients.length === 0}
    <!-- Empty state: no patients linked yet -->
    <div class="card text-center py-16 max-w-lg mx-auto">
      <div class="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center text-4xl mx-auto mb-4">👥</div>
      <h2 class="text-xl font-semibold text-black mb-2">No Patients Yet</h2>
      <p class="text-muted text-sm max-w-sm mx-auto leading-relaxed">Patients will appear here once they link their account to you from their Profile page. Share your name so they can find you in the doctor search.</p>
      <div class="mt-6 bg-surface border border-border rounded-xl p-4 text-left max-w-xs mx-auto">
        <p class="text-xs text-muted mb-1">Your name shown to patients:</p>
        <p class="font-semibold text-black">{userProfile?.displayName}</p>
        <p class="text-xs text-muted mt-0.5">{userProfile?.email}</p>
      </div>
    </div>
  {:else}
    <!-- Overview Stats -->
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <div class="card text-center group hover:border-primary/30 transition-colors">
        <p class="text-3xl font-bold text-black">{stats.total}</p>
        <p class="text-xs text-muted mt-1">Total Patients</p>
      </div>
      <div class="card text-center group hover:border-accent-red/30 transition-colors">
        <p class="text-3xl font-bold {stats.flagged > 0 ? 'text-accent-red' : 'text-muted'}">{stats.flagged}</p>
        <p class="text-xs text-muted mt-1">⚡ Flagged Alerts</p>
      </div>
      <div class="card text-center group hover:border-accent-green/30 transition-colors">
        <p class="text-3xl font-bold text-accent-green">{stats.active}</p>
        <p class="text-xs text-muted mt-1">Active (≥3 logs)</p>
      </div>
      <div class="card text-center group transition-colors">
        <p class="text-3xl font-bold text-muted">{stats.noData}</p>
        <p class="text-xs text-muted mt-1">No Logs Yet</p>
      </div>
    </div>

    <!-- Flagged Alerts Banner -->
    {#if filteredPatients.some(p => p.flagged)}
      <div class="card border-l-4 border-accent-red bg-accent-red/5">
        <h2 class="section-title text-accent-red mb-3">🚨 Patients Requiring Attention</h2>
        <div class="space-y-2">
          {#each filteredPatients.filter(p => p.flagged) as p}
            <div class="flex items-center justify-between p-3 bg-white rounded-xl border border-accent-red/20">
              <div>
                <p class="font-semibold text-black text-sm">{p.displayName}</p>
                <p class="text-xs text-muted">
                  Pain: <span class="font-medium {getPainColor(p.recentLog!.painScore)}">{p.recentLog!.painScore}/10</span>
                  {#if p.recentLog?.symptoms?.length}· {p.recentLog.symptoms.slice(0, 2).join(', ')}{p.recentLog.symptoms.length > 2 ? '…' : ''}{/if}
                </p>
              </div>
              <button onclick={() => viewPatient(p.uid)} class="btn-secondary text-xs py-1.5 px-3">
                View Patient
              </button>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Patient Roster -->
    <div class="card overflow-hidden">
      <div class="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h2 class="section-title">Patient Roster</h2>
        <div class="relative">
          <svg class="absolute left-3 top-1/2 -translate-y-1/2 text-muted" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input
            type="text"
            class="input-field text-sm pl-9 py-2 w-52"
            placeholder="Search patients…"
            bind:value={searchQuery}
          />
        </div>
      </div>

      <div class="overflow-x-auto -mx-6 px-6">
        <table class="w-full text-sm min-w-[600px]">
          <thead>
            <tr class="border-b border-border">
              <th class="text-left py-2.5 text-muted font-medium">Patient</th>
              <th class="text-center py-2.5 text-muted font-medium">Stage</th>
              <th class="text-center py-2.5 text-muted font-medium">Pain</th>
              <th class="text-center py-2.5 text-muted font-medium">Mobility</th>
              <th class="text-center py-2.5 text-muted font-medium">Logs</th>
              <th class="text-center py-2.5 text-muted font-medium">Status</th>
              <th class="py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {#each filteredPatients as p}
              <tr class="border-b border-surface last:border-0 hover:bg-surface/60 transition-colors {selectedPatientUid === p.uid ? 'bg-primary/5' : ''}">
                <td class="py-3 pr-4">
                  <div class="flex items-center gap-3">
                    <div class="w-9 h-9 {p.flagged ? 'bg-accent-red/10' : 'bg-primary/10'} rounded-full flex items-center justify-center {p.flagged ? 'text-accent-red' : 'text-primary'} font-bold text-sm flex-shrink-0">
                      {p.displayName[0]?.toUpperCase()}
                    </div>
                    <div class="min-w-0">
                      <p class="font-medium text-black truncate">{p.displayName}</p>
                      <p class="text-xs text-muted truncate">{p.email}</p>
                    </div>
                  </div>
                </td>
                <td class="py-3 text-center">
                  {#if p.recoveryStage}
                    <span class="badge badge-primary text-[11px]">{stageLabelMap[p.recoveryStage] || p.recoveryStage}</span>
                  {:else}
                    <span class="text-muted">—</span>
                  {/if}
                </td>
                <td class="py-3 text-center">
                  {#if p.recentLog}
                    <span class="inline-flex items-center justify-center w-10 h-7 rounded-lg font-semibold text-sm {getPainBg(p.recentLog.painScore)} {getPainColor(p.recentLog.painScore)}">
                      {p.recentLog.painScore}
                    </span>
                  {:else}
                    <span class="text-muted">—</span>
                  {/if}
                </td>
                <td class="py-3 text-center text-muted">{p.recentLog?.mobility ?? '—'}</td>
                <td class="py-3 text-center text-muted">{p.logCount}</td>
                <td class="py-3 text-center">
                  {#if p.flagged}
                    <span class="badge badge-danger text-[11px]">⚡ Alert</span>
                  {:else if p.logCount === 0}
                    <span class="badge text-muted bg-border/30 text-[11px]">No data</span>
                  {:else}
                    <span class="badge badge-success text-[11px]">✓ OK</span>
                  {/if}
                </td>
                <td class="py-3 text-right">
                  <button
                    onclick={() => viewPatient(p.uid)}
                    class="text-xs font-medium transition-colors {selectedPatientUid === p.uid ? 'text-muted hover:text-black' : 'text-primary hover:text-primary/70'}"
                  >
                    {selectedPatientUid === p.uid ? '✕ Close' : 'View →'}
                  </button>
                </td>
              </tr>

              <!-- Inline Detail Panel -->
              {#if selectedPatientUid === p.uid}
                <tr>
                  <td colspan="7" class="p-0">
                    <div class="bg-surface border-b border-border">
                      {#if loadingDetail}
                        <div class="flex justify-center py-10"><LoadingSpinner label="Loading patient data…" /></div>
                      {:else if detailData}
                        <div class="p-6 space-y-6">
                          <!-- Patient Header -->
                          <div class="flex items-center justify-between flex-wrap gap-4">
                            <div class="flex items-center gap-4">
                              <div class="w-14 h-14 bg-primary/10 rounded-full flex items-center justify-center text-primary text-2xl font-bold">
                                {detailData.displayName[0]?.toUpperCase()}
                              </div>
                              <div>
                                <h3 class="text-lg font-bold text-black">{detailData.displayName}</h3>
                                <p class="text-sm text-muted">{detailData.email}</p>
                                {#if detailData.patientProfile?.recoveryStage}
                                  <span class="badge badge-primary text-xs mt-1">{stageLabelMap[detailData.patientProfile.recoveryStage] || detailData.patientProfile.recoveryStage}</span>
                                {/if}
                              </div>
                            </div>
                            {#if detailData.flagged}
                              <span class="badge badge-danger">⚡ Needs Attention</span>
                            {/if}
                          </div>

                          <!-- Detail Grid -->
                          <div class="grid grid-cols-1 lg:grid-cols-3 gap-5">

                            <!-- LEFT: Health Vitals + Logs -->
                            <div class="lg:col-span-2 space-y-5">

                              <!-- Pain & Mobility Trend (7 days) -->
                              {#if detailData.recentLogs.length > 0}
                                <div class="bg-white rounded-xl border border-border p-4">
                                  <h4 class="text-sm font-semibold text-black mb-3">📈 Pain Trend (Last {Math.min(detailData.recentLogs.length, 7)} Days)</h4>
                                  <div class="flex items-end gap-1.5 h-20">
                                    {#each detailData.recentLogs.slice(0, 7).reverse() as log}
                                      <div class="flex flex-col items-center gap-1 flex-1 min-w-0">
                                        <div
                                          class="w-full rounded-t transition-all duration-300 {log.painScore <= 3 ? 'bg-accent-green/70' : log.painScore <= 6 ? 'bg-accent-amber/70' : 'bg-accent-red/70'}"
                                          style="height: {Math.max(6, (log.painScore / 10) * 64)}px"
                                          title="Pain: {log.painScore}/10 — {log.date}"
                                        ></div>
                                        <span class="text-[10px] text-muted w-full text-center truncate">{log.date.slice(5)}</span>
                                      </div>
                                    {/each}
                                  </div>
                                  <div class="flex gap-4 mt-2 text-[10px] text-muted">
                                    <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-accent-green/70"></span>1–3 Mild</span>
                                    <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-accent-amber/70"></span>4–6 Mod</span>
                                    <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-accent-red/70"></span>7–10 Severe</span>
                                  </div>
                                </div>
                              {/if}

                              <!-- Recent Symptom Logs -->
                              <div class="bg-white rounded-xl border border-border p-4">
                                <h4 class="text-sm font-semibold text-black mb-3">📋 Recent Health Logs</h4>
                                {#if detailData.recentLogs.length === 0}
                                  <p class="text-sm text-muted italic">No health logs submitted yet.</p>
                                {:else}
                                  <div class="space-y-3 max-h-60 overflow-y-auto pr-1">
                                    {#each detailData.recentLogs.slice(0, 5) as log}
                                      <div class="flex gap-3 text-sm border-b border-surface pb-3 last:border-0 last:pb-0">
                                        <div class="flex-shrink-0 text-center">
                                          <p class="text-[11px] text-muted">{formatDate(log.date)}</p>
                                          <span class="inline-flex items-center justify-center w-8 h-6 rounded-lg text-xs font-bold {getPainBg(log.painScore)} {getPainColor(log.painScore)} mt-0.5">{log.painScore}</span>
                                        </div>
                                        <div class="flex-1 min-w-0">
                                          <div class="flex gap-3 text-xs text-muted mb-1">
                                            <span>🏃 Mobility: {log.mobility}/10</span>
                                            <span>😊 Mood: {log.mood}/10</span>
                                          </div>
                                          {#if log.symptoms?.length > 0}
                                            <p class="text-xs text-black">{log.symptoms.join(', ')}</p>
                                          {/if}
                                          {#if log.notes}
                                            <p class="text-xs text-muted mt-0.5 italic truncate">"{log.notes}"</p>
                                          {/if}
                                        </div>
                                      </div>
                                    {/each}
                                  </div>
                                {/if}
                              </div>

                              <!-- Medical Details -->
                              {#if detailData.patientProfile}
                                {@const pp = detailData.patientProfile}
                                <div class="bg-white rounded-xl border border-border p-4">
                                  <h4 class="text-sm font-semibold text-black mb-3">🏥 Medical Details</h4>
                                  <div class="grid grid-cols-2 gap-3 text-sm">
                                    {#if pp.surgeryType}
                                      <div><p class="text-xs text-muted">Surgery</p><p class="font-medium text-black">{pp.surgeryType}</p></div>
                                    {/if}
                                    {#if pp.surgeryDate}
                                      <div><p class="text-xs text-muted">Surgery Date</p><p class="font-medium text-black">{pp.surgeryDate}</p></div>
                                    {/if}
                                    {#if pp.age}
                                      <div><p class="text-xs text-muted">Age</p><p class="font-medium text-black">{pp.age}</p></div>
                                    {/if}
                                    {#if pp.height || pp.weight}
                                      <div><p class="text-xs text-muted">Height / Weight</p><p class="font-medium text-black">{pp.height || '—'}cm / {pp.weight || '—'}kg</p></div>
                                    {/if}
                                    {#if pp.medications}
                                      <div class="col-span-2"><p class="text-xs text-muted">Medications</p><p class="text-black">{pp.medications}</p></div>
                                    {/if}
                                    {#if pp.allergies}
                                      <div class="col-span-2"><p class="text-xs text-muted">Allergies</p><p class="text-black">{pp.allergies}</p></div>
                                    {/if}
                                  </div>
                                </div>
                              {/if}
                            </div>

                            <!-- RIGHT: Exercise + AI + Notes -->
                            <div class="space-y-5">

                              <!-- Exercise Adherence -->
                              <div class="bg-white rounded-xl border border-border p-4">
                                <h4 class="text-sm font-semibold text-black mb-3">💪 Today's Exercise</h4>
                                {#if allDetailExercises().length === 0}
                                  <p class="text-xs text-muted">No exercise plan generated yet.</p>
                                {:else}
                                  <ProgressBar value={detailData.todayCompletions.length} max={allDetailExercises().length} label="Today's completion" />
                                  <div class="mt-3 space-y-1.5 max-h-32 overflow-y-auto">
                                    {#each allDetailExercises().slice(0, 6) as ex}
                                      <div class="flex items-center gap-2 text-xs">
                                        <span class="{completedExIds().has(ex.id) ? 'text-accent-green' : 'text-border'}">
                                          {completedExIds().has(ex.id) ? '✓' : '○'}
                                        </span>
                                        <span class="{completedExIds().has(ex.id) ? 'text-muted line-through' : 'text-black'} truncate">{ex.name}</span>
                                      </div>
                                    {/each}
                                  </div>
                                {/if}
                              </div>

                              <!-- AI Insight -->
                              <div class="bg-white rounded-xl border border-border p-4">
                                <h4 class="text-sm font-semibold text-black mb-2">🤖 AI Recovery Insight</h4>
                                {#if aiSummary}
                                  <p class="text-xs text-black leading-relaxed">{aiSummary}</p>
                                {:else if detailData.recentLogs.length < 3}
                                  <p class="text-xs text-muted">Patient needs at least 3 health logs for AI analysis.</p>
                                {:else}
                                  <button
                                    onclick={generateAiInsight}
                                    disabled={loadingAi}
                                    class="btn-secondary text-xs w-full justify-center py-2"
                                  >
                                    {#if loadingAi}<LoadingSpinner size="sm" label="" />{/if}
                                    Generate AI Summary
                                  </button>
                                {/if}
                              </div>

                              <!-- Doctor Notes -->
                              <div class="bg-white rounded-xl border border-border p-4">
                                <h4 class="text-sm font-semibold text-black mb-3">📝 Clinical Notes</h4>

                                {#if noteSaved}
                                  <Alert type="success" message="Note saved." />
                                {/if}

                                <!-- Existing notes -->
                                {#if detailData.doctorNotes.length > 0}
                                  <div class="space-y-2 mb-3 max-h-40 overflow-y-auto">
                                    {#each detailData.doctorNotes as note}
                                      <div class="bg-surface rounded-lg p-2.5 text-xs">
                                        <p class="text-black">{note.note}</p>
                                        <p class="text-muted mt-1">
                                          {note.createdAt
                                            ? (typeof (note.createdAt as any).toDate === 'function'
                                                ? (note.createdAt as any).toDate().toLocaleDateString('en-GB')
                                                : new Date(note.createdAt as any).toLocaleDateString('en-GB'))
                                            : ''}
                                        </p>
                                      </div>
                                    {/each}
                                  </div>
                                {:else}
                                  <p class="text-xs text-muted mb-3">No notes yet.</p>
                                {/if}

                                <!-- Add note -->
                                <div class="flex gap-2">
                                  <textarea
                                    bind:value={noteText}
                                    class="input-field flex-1 text-xs"
                                    rows="2"
                                    placeholder="Add a clinical note…"
                                  ></textarea>
                                  <button
                                    onclick={saveNote}
                                    disabled={savingNote || !noteText.trim()}
                                    class="btn-primary text-xs px-3 flex-shrink-0 self-end"
                                  >
                                    {#if savingNote}<LoadingSpinner size="sm" label="" />{:else}Save{/if}
                                  </button>
                                </div>
                              </div>

                            </div>
                          </div>
                        </div>
                      {/if}
                    </div>
                  </td>
                </tr>
              {/if}
            {/each}
          </tbody>
        </table>
      </div>

      {#if filteredPatients.length === 0 && searchQuery}
        <div class="py-10 text-center text-sm text-muted">No patients match "{searchQuery}"</div>
      {/if}
    </div>
  {/if}
</div>
