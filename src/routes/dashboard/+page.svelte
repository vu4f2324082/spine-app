<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { authStore } from '$lib/stores/auth';
  import { getSymptomLogs, getExercisePlan, getExerciseCompletions, saveExercisePlan } from '$lib/firebase/firestore';
  import { generateRecoverySummary, generatePhysiotherapyPlan } from '$lib/ai/gemini';
  import aiLogo from '$lib/assets/spine-app-ai-logo.jpg';
  import StatCard from '$lib/components/StatCard.svelte';
  import ProgressBar from '$lib/components/ProgressBar.svelte';
  import ExerciseCard from '$lib/components/ExerciseCard.svelte';
  import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import Alert from '$lib/components/Alert.svelte';
  import type { SymptomLog, ExercisePlan, ExerciseCompletion } from '$lib/types';

  let logs = $state<SymptomLog[]>([]);
  let plan = $state<ExercisePlan | null>(null);
  let todayCompletions = $state<ExerciseCompletion[]>([]);
  let aiSummary = $state('');
  let loading = $state(true);
  let uploadingPdf = $state(false);

  const today = new Date().toISOString().split('T')[0];
  const user = $derived($authStore.user);
  const profile = $derived($authStore.patientProfile);

  const todayLog = $derived(logs.find(l => l.date === today));
  const painScore = $derived(todayLog?.painScore ?? null);

  const allExercises = $derived(plan
    ? [...(plan.morning || []), ...(plan.afternoon || []), ...(plan.evening || [])]
    : []);

  const completedIds = $derived(new Set(todayCompletions.map(c => c.exerciseId)));

  const adherencePct = $derived(allExercises.length > 0
    ? Math.round((completedIds.size / allExercises.length) * 100) : 0);

  const recoveryDays = $derived(
    profile?.surgeryDate
      ? Math.max(0, Math.floor((Date.now() - new Date(profile.surgeryDate).getTime()) / 86400000))
      : 0
  );

  const quickLinks = [
    { href: '/assistant', label: 'Ask SpineGuide AI', icon: '🤖' },
    { href: '/monitoring', label: 'Log Symptoms', icon: '📝' },
    { href: '/education', label: 'Learn About Recovery', icon: '📚' },
    { href: '/profile', label: 'Update Profile', icon: '👤' }
  ];

  onMount(async () => {
    if (!user) return;

    // Doctors should always be on their own dashboard
    if ($authStore.userProfile?.role === 'doctor') {
      goto('/doctor');
      return;
    }

    const uid = user.uid;
    const [l, p, c] = await Promise.all([
      getSymptomLogs(uid, 14),
      getExercisePlan(uid),
      getExerciseCompletions(uid, today)
    ]);
    logs = l;
    plan = p;
    todayCompletions = c;

    if (l.length >= 3) {
      aiSummary = await generateRecoverySummary({
        logs: l.slice(0, 7).map(x => ({ date: x.date, painScore: x.painScore, mobility: x.mobility })),
        exerciseAdherence: adherencePct
      });
    }
    loading = false;
  });

  function getPainColor(score: number | null): 'green' | 'amber' | 'red' | 'primary' {
    if (score === null) return 'primary';
    if (score <= 3) return 'green';
    if (score <= 6) return 'amber';
    return 'red';
  }

  function getRecoveryStageLabel(stage?: string) {
    const labels: Record<string, string> = {
      'pre-op': 'Pre-Surgery', 'early': 'Early Recovery (0–6 weeks)',
      'mid': 'Mid Recovery (6–12 weeks)', 'late': 'Late Recovery (3–6 months)', 'complete': 'Full Recovery'
    };
    return labels[stage || ''] || 'Not set';
  }

  async function handleFileUpload(event: Event) {
    const target = event.target as HTMLInputElement;
    if (!target.files || target.files.length === 0) return;
    
    const file = target.files[0];
    if (file.type !== 'application/pdf') {
      alert('Please upload a valid PDF file.');
      return;
    }

    uploadingPdf = true;

    try {
      const formData = new FormData();
      formData.append('report', file);

      const res = await fetch('/api/upload-report', { method: 'POST', body: formData });
      const json = await res.json();
      
      if (!res.ok) throw new Error(json.error || 'Failed to upload report');

      if (json.data && user) {
        const { surgeryType: st, recoveryStage: rs, painScore: ps, symptoms: sym, limitations: lim } = json.data;
        
        const validSurgeries = [
          "Lumbar Discectomy", "Spinal Fusion", "Laminectomy", 
          "Cervical Discectomy", "Scoliosis Correction", "Vertebroplasty", "Other"
        ];
        const stLower = (st || '').toLowerCase();
        const extractedSurgeryType = validSurgeries.find(s => s.toLowerCase().includes(stLower) || stLower.includes(s.toLowerCase())) || "Other";
        
        const validStages = ["pre-op", "early", "mid", "late", "complete"];
        const extractedRecoveryStage = validStages.includes(rs) ? rs : "early";
        
        const raw = await generatePhysiotherapyPlan({ 
          surgeryType: extractedSurgeryType, 
          recoveryStage: extractedRecoveryStage, 
          painScore: typeof ps === 'number' ? ps : (painScore !== null ? painScore : 5), 
          symptoms: sym || '', 
          limitations: lim || '' 
        });
        
        const data = typeof raw === 'string' ? JSON.parse(raw) : raw;

        const addIds = (exercises: any, prefix: string) =>
          (exercises || []).map((e: any, i: number) => ({ ...e, id: `${prefix}_${i}`, category: prefix }));

        const newPlan = {
          uid: user.uid,
          generatedAt: new Date(),
          surgeryType: extractedSurgeryType,
          recoveryStage: extractedRecoveryStage,
          morning: addIds(data.morning, 'morning'),
          afternoon: addIds(data.afternoon, 'afternoon'),
          evening: addIds(data.evening, 'evening'),
          precautions: data.precautions || [],
          redFlags: data.redFlags || []
        };

        await saveExercisePlan(user.uid, newPlan);
        
        plan = newPlan;
        alert('Hospital report successfully processed and new plan generated!');
      }
    } catch (err: any) {
      alert(err.message || 'Error processing hospital report.');
    } finally {
      uploadingPdf = false;
      if (target) target.value = '';
    }
  }
</script>

<svelte:head><title>Dashboard – SpineSync</title></svelte:head>

{#if loading}
  <div class="flex items-center justify-center py-32"><LoadingSpinner label="Loading your dashboard…" /></div>
{:else}
  <div class="space-y-6 animate-fade-in">
    <!-- Header -->
    <div class="flex items-start justify-between">
      <div>
        <h1 class="page-title">Good morning, {user?.displayName?.split(' ')[0] || 'there'} 👋</h1>
        <p class="text-muted text-sm mt-1">{new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
      </div>
      {#if profile?.recoveryStage}
        <span class="badge badge-primary">{getRecoveryStageLabel(profile.recoveryStage)}</span>
      {/if}
    </div>

    <!-- Stats Row -->
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard
        title="Today's Pain"
        value={painScore !== null ? `${painScore}/10` : '—'}
        subtitle={painScore === null ? 'Log today\'s pain' : painScore <= 3 ? 'Mild – great progress!' : painScore <= 6 ? 'Moderate – take it easy' : 'High – rest and monitor'}
        icon="🩺"
        color={getPainColor(painScore)}
        trend={logs.length >= 2 && logs[0]?.painScore < logs[1]?.painScore ? 'down' : logs.length >= 2 && logs[0]?.painScore > logs[1]?.painScore ? 'up' : 'neutral'}
        trendLabel={logs.length >= 2 ? 'vs yesterday' : ''}
      />
      <StatCard
        title="Exercises Done"
        value="{completedIds.size}/{allExercises.length}"
        subtitle={adherencePct >= 80 ? 'Excellent adherence!' : 'Keep going!'}
        icon="💪"
        color="secondary"
      />
      <StatCard
        title="Days in Recovery"
        value={recoveryDays}
        subtitle="Since surgery"
        icon="📅"
        color="primary"
      />
      <StatCard
        title="Weekly Adherence"
        value="{adherencePct}%"
        subtitle="Exercise completion"
        icon="📊"
        color={adherencePct >= 70 ? 'green' : 'amber'}
      />
    </div>

    <!-- AI Summary + Today's Progress -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <!-- AI Summary -->
      <div class="lg:col-span-2 card space-y-4">
        <div class="flex items-center gap-2">
          <img src={aiLogo} alt="AI Avatar" class="w-8 h-8 rounded-full border border-border object-cover" />
          <h2 class="section-title">AI Weekly Insight</h2>
          <span class="badge badge-primary text-xs">SpineGuide</span>
        </div>
        {#if aiSummary}
          <p class="text-sm text-black leading-relaxed">{aiSummary}</p>
        {:else if logs.length < 3}
          <p class="text-sm text-muted">Log your symptoms for at least 3 days to receive AI-powered recovery insights.</p>
        {:else}
          <p class="text-sm text-muted">Generating your weekly insight…</p>
        {/if}
        <div class="flex gap-3 pt-2">
          <a href="/assistant" class="btn-primary text-sm px-4 py-2">Chat with SpineGuide</a>
          <a href="/monitoring" class="btn-secondary text-sm px-4 py-2">Log Symptoms</a>
        </div>
      </div>
      
      <!-- Upload Report Card -->
      <div class="lg:col-span-2 card bg-primary/5 border-2 border-dashed border-primary/30 text-center transition-colors hover:bg-primary/10">
        <h3 class="flex items-center justify-center gap-2 font-medium text-black mb-1">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-primary"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
          Update Your Recovery Plan
        </h3>
        <p class="text-[13px] text-muted mb-4 px-4 max-w-lg mx-auto">Upload a new hospital report (PDF) to automatically generate or update your custom physiotherapy schedule based on your latest condition.</p>
        
        <input type="file" accept="application/pdf" onchange={handleFileUpload} class="hidden" id="dash-report-upload" disabled={uploadingPdf} />
        
        <label for="dash-report-upload" class="inline-flex items-center justify-center btn-secondary cursor-pointer py-2 px-5 text-sm {uploadingPdf ? 'opacity-70 pointer-events-none' : ''}">
          {#if uploadingPdf}
            <LoadingSpinner size="sm" label="" />
            <span class="ml-2">Processing Report...</span>
          {:else}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="mr-2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
            Upload Report (PDF)
          {/if}
        </label>
      </div>

      <!-- Exercise Progress -->
      <div class="card space-y-4 row-span-2">
        <h2 class="section-title">Today's Exercises</h2>
        {#if allExercises.length === 0}
          <EmptyState title="No plan yet" description="Generate your physiotherapy plan to see today's exercises." icon="🏃" actionLabel="Create Plan" onAction={() => globalThis.location.href = '/physiotherapy'} />
        {:else}
          <div class="space-y-2">
            <ProgressBar value={completedIds.size} max={allExercises.length} label="Today's completion" />
          </div>
          <div class="space-y-2 max-h-48 overflow-y-auto">
            {#each allExercises.slice(0, 5) as ex}
              <div class="text-sm flex items-center gap-2 py-1">
                <span class="{completedIds.has(ex.id) ? 'text-accent-green' : 'text-border'}">{completedIds.has(ex.id) ? '✓' : '○'}</span>
                <span class="{completedIds.has(ex.id) ? 'text-muted line-through' : 'text-black'}">{ex.name}</span>
              </div>
            {/each}
            {#if allExercises.length > 5}
              <a href="/physiotherapy" class="text-xs text-primary hover:underline">+{allExercises.length - 5} more exercises →</a>
            {/if}
          </div>
          <a href="/physiotherapy" class="btn-secondary text-sm w-full justify-center">View All Exercises</a>
        {/if}
      </div>
    </div>

    <!-- Pain Trend -->
    {#if logs.length > 0}
      <div class="card">
        <h2 class="section-title mb-4">Recent Pain Trend</h2>
        <div class="flex items-end gap-2 h-24">
          {#each logs.slice(0, 14).reverse() as log}
            <div class="flex flex-col items-center gap-1 flex-1">
              <div
                class="w-full rounded-t transition-all duration-300 {log.painScore <= 3 ? 'bg-accent-green/60' : log.painScore <= 6 ? 'bg-accent-amber/60' : 'bg-accent-red/60'}"
                style="height: {Math.max(8, (log.painScore / 10) * 80)}px"
                title="Pain: {log.painScore}/10 on {log.date}"
              ></div>
              <span class="text-xs text-muted">{log.date.slice(5)}</span>
            </div>
          {/each}
        </div>
        <div class="flex items-center gap-4 mt-3 text-xs text-muted">
          <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-accent-green/60"></span> 1–3 Mild</span>
          <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-accent-amber/60"></span> 4–6 Moderate</span>
          <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-accent-red/60"></span> 7–10 Severe</span>
        </div>
      </div>
    {/if}

    <!-- Quick Links -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
      {#each quickLinks as link}
        <a href={link.href} class="card-hover flex flex-col items-center gap-3 text-center p-5 group">
          <span class="text-2xl">{link.icon}</span>
          <span class="text-sm font-medium text-black group-hover:text-primary transition-colors">{link.label}</span>
        </a>
      {/each}
    </div>

    <!-- Medical Disclaimer -->
    <div class="disclaimer">
      <strong>Medical Disclaimer:</strong> This platform provides educational and supportive guidance only. It does not replace professional medical advice, diagnosis, or treatment. Always consult your doctor for medical decisions.
    </div>
  </div>
{/if}
