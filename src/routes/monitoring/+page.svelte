<script lang="ts">
  import { onMount } from 'svelte';
  import { authStore } from '$lib/stores/auth';
  import { addSymptomLog, subscribeToSymptomLogs } from '$lib/firebase/firestore';
  import ProgressBar from '$lib/components/ProgressBar.svelte';
  import Alert from '$lib/components/Alert.svelte';
  import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import type { SymptomLog } from '$lib/types';

  let logs = $state<SymptomLog[]>([]);
  let loading = $state(true);
  let saving = $state(false);
  let saved = $state(false);
  let showForm = $state(false);

  // Form
  let painScore = $state(5);
  let mobility = $state(5);
  let mood = $state(5);
  let symptoms = $state<string[]>([]);
  let notes = $state('');

  const symptomOptions = [
    'Lower back pain', 'Neck pain', 'Leg numbness', 'Arm numbness',
    'Stiffness', 'Muscle weakness', 'Headache', 'Fatigue', 'Swelling', 'Tingling'
  ];

  const user = $derived($authStore.user);
  const today = new Date().toISOString().split('T')[0];
  const hasLoggedToday = $derived(logs.some(l => l.date === today));

  const avgPain = $derived(logs.length
    ? Math.round(logs.slice(0, 7).reduce((a, l) => a + l.painScore, 0) / Math.min(logs.length, 7) * 10) / 10
    : 0);
  const avgMobility = $derived(logs.length
    ? Math.round(logs.slice(0, 7).reduce((a, l) => a + l.mobility, 0) / Math.min(logs.length, 7) * 10) / 10
    : 0);

  let unsubscribe: (() => void) | undefined;

  onMount(() => {
    if (!user) return;
    unsubscribe = subscribeToSymptomLogs(user.uid, (l) => {
      logs = l;
      loading = false;
    });
    return () => unsubscribe?.();
  });

  function toggleSymptom(s: string) {
    symptoms = symptoms.includes(s) ? symptoms.filter(x => x !== s) : [...symptoms, s];
  }

  async function handleSave() {
    if (!user) return;
    saving = true;
    await addSymptomLog(user.uid, {
      uid: user.uid,
      date: today,
      painScore,
      mobility,
      mood,
      symptoms,
      notes,
      createdAt: new Date()
    });
    saved = true;
    showForm = false;
    saving = false;
    symptoms = [];
    notes = '';
    painScore = 5;
    mobility = 5;
    mood = 5;
    setTimeout(() => saved = false, 3000);
  }
</script>

<svelte:head><title>Monitoring – SpineSync</title></svelte:head>

<div class="space-y-6 animate-fade-in">
  <!-- Header -->
  <div class="flex items-start justify-between">
    <div>
      <h1 class="page-title">Recovery Monitoring</h1>
      <p class="text-muted text-sm mt-1">Track your pain, mobility, and symptoms over time</p>
    </div>
    {#if !showForm}
      <button onclick={() => showForm = true} class="btn-primary text-sm" disabled={hasLoggedToday}>
        {hasLoggedToday ? '✓ Logged Today' : '+ Log Today'}
      </button>
    {/if}
  </div>

  {#if saved}
    <Alert type="success" title="Logged!" message="Today's health data has been saved. Keep it up!" />
  {/if}

  {#if showForm}
    <!-- Log Form -->
    <div class="card max-w-xl space-y-5">
      <h2 class="section-title">Daily Health Log – {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</h2>

      <div>
        <label class="label">Pain Level: <strong>{painScore}/10</strong></label>
        <input type="range" min="0" max="10" bind:value={painScore} class="w-full accent-primary" />
        <div class="flex justify-between text-xs text-muted mt-1"><span>No pain</span><span>Severe</span></div>
      </div>

      <div>
        <label class="label">Mobility: <strong>{mobility}/10</strong></label>
        <input type="range" min="0" max="10" bind:value={mobility} class="w-full accent-secondary" />
        <div class="flex justify-between text-xs text-muted mt-1"><span>Very limited</span><span>Full mobility</span></div>
      </div>

      <div>
        <label class="label">Mood: <strong>{mood}/10</strong></label>
        <input type="range" min="0" max="10" bind:value={mood} class="w-full accent-primary" />
        <div class="flex justify-between text-xs text-muted mt-1"><span>Very low</span><span>Excellent</span></div>
      </div>

      <div>
        <label class="label">Symptoms Today</label>
        <div class="flex flex-wrap gap-2">
          {#each symptomOptions as s}
            <button
              onclick={() => toggleSymptom(s)}
              class="text-xs px-3 py-1.5 rounded-full border transition-all {symptoms.includes(s) ? 'bg-primary text-white border-primary' : 'bg-white border-border hover:border-primary'}"
            >{s}</button>
          {/each}
        </div>
      </div>

      <div>
        <label class="label" for="notes">Notes</label>
        <textarea id="notes" class="input-field" rows="2" placeholder="How are you feeling overall? Any concerns?" bind:value={notes}></textarea>
      </div>

      <div class="flex gap-3">
        <button onclick={handleSave} disabled={saving} class="btn-primary flex-1 justify-center py-2.5">
          {#if saving}<LoadingSpinner size="sm" label="" />{/if}
          Save Log
        </button>
        <button onclick={() => showForm = false} class="btn-ghost px-4">Cancel</button>
      </div>
    </div>
  {/if}

  {#if loading}
    <div class="flex justify-center py-20"><LoadingSpinner label="Loading your logs…" /></div>
  {:else if logs.length === 0}
    <EmptyState
      title="No logs yet"
      description="Start tracking your daily symptoms and pain levels to see trends and progress over time."
      icon="📋"
      actionLabel="Log Today's Health"
      onAction={() => showForm = true}
    />
  {:else}
    <!-- Summary Stats -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div class="card text-center">
        <p class="text-xs text-muted uppercase tracking-wide mb-2">Avg Pain (7 days)</p>
        <p class="text-3xl font-semibold {avgPain <= 3 ? 'text-accent-green' : avgPain <= 6 ? 'text-accent-amber' : 'text-accent-red'}">{avgPain}<span class="text-lg">/10</span></p>
      </div>
      <div class="card text-center">
        <p class="text-xs text-muted uppercase tracking-wide mb-2">Avg Mobility (7 days)</p>
        <p class="text-3xl font-semibold text-primary">{avgMobility}<span class="text-lg">/10</span></p>
      </div>
      <div class="card text-center">
        <p class="text-xs text-muted uppercase tracking-wide mb-2">Logs Recorded</p>
        <p class="text-3xl font-semibold text-black">{logs.length}</p>
      </div>
    </div>

    <!-- Pain Trend Chart -->
    <div class="card">
      <h2 class="section-title mb-4">Pain & Mobility Trend</h2>
      <div class="flex items-end gap-1.5 h-32 border-b border-border pb-2">
        {#each logs.slice(0, 14).reverse() as log}
          <div class="flex flex-col items-center gap-1 flex-1 min-w-0">
            <div class="relative w-full flex flex-col gap-0.5">
              <div
                class="w-full rounded-sm bg-accent-red/40"
                style="height:{Math.max(4, (log.painScore / 10) * 96)}px"
                title="Pain: {log.painScore}/10"
              ></div>
            </div>
          </div>
        {/each}
      </div>
      <div class="flex items-end gap-1.5 h-20 mt-1">
        {#each logs.slice(0, 14).reverse() as log}
          <div class="flex flex-col items-center gap-1 flex-1 min-w-0">
            <div
              class="w-full rounded-sm bg-primary/40"
              style="height:{Math.max(4, (log.mobility / 10) * 64)}px"
              title="Mobility: {log.mobility}/10"
            ></div>
            <span class="text-xs text-muted truncate w-full text-center">{log.date.slice(5)}</span>
          </div>
        {/each}
      </div>
      <div class="flex gap-4 mt-3 text-xs text-muted">
        <span class="flex items-center gap-1"><span class="w-3 h-2 rounded-sm bg-accent-red/40"></span> Pain</span>
        <span class="flex items-center gap-1"><span class="w-3 h-2 rounded-sm bg-primary/40"></span> Mobility</span>
      </div>
    </div>

    <!-- Recent Logs Table -->
    <div class="card overflow-hidden">
      <h2 class="section-title mb-4">Recent Logs</h2>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-border">
              <th class="text-left py-2 px-3 text-muted font-medium">Date</th>
              <th class="text-center py-2 px-3 text-muted font-medium">Pain</th>
              <th class="text-center py-2 px-3 text-muted font-medium">Mobility</th>
              <th class="text-center py-2 px-3 text-muted font-medium">Mood</th>
              <th class="text-left py-2 px-3 text-muted font-medium">Symptoms</th>
            </tr>
          </thead>
          <tbody>
            {#each logs as log}
              <tr class="border-b border-surface last:border-0 hover:bg-surface transition-colors">
                <td class="py-3 px-3 font-medium">{new Date(log.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</td>
                <td class="py-3 px-3 text-center">
                  <span class="badge {log.painScore <= 3 ? 'badge-success' : log.painScore <= 6 ? 'badge-warning' : 'badge-danger'}">{log.painScore}/10</span>
                </td>
                <td class="py-3 px-3 text-center text-muted">{log.mobility}/10</td>
                <td class="py-3 px-3 text-center text-muted">{log.mood}/10</td>
                <td class="py-3 px-3 text-muted text-xs">{log.symptoms?.join(', ') || '—'}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  {/if}
</div>
