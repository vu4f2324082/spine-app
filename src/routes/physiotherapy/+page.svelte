<script lang="ts">
  import { onMount } from 'svelte';
  import { authStore } from '$lib/stores/auth';
  import { generatePhysiotherapyPlan } from '$lib/ai/gemini';
  import { saveExercisePlan, getExercisePlan, markExerciseComplete, getExerciseCompletions } from '$lib/firebase/firestore';
  import ExerciseCard from '$lib/components/ExerciseCard.svelte';
  import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
  import Alert from '$lib/components/Alert.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import type { ExercisePlan, Exercise } from '$lib/types';

  let plan = $state<ExercisePlan | null>(null);
  let completedIds = $state<Set<string>>(new Set());
  let loadingPlan = $state(true);
  let generating = $state(false);
  let error = $state('');
  let showForm = $state(false);

  // Form state
  let surgeryType = $state('');
  let recoveryStage = $state('');
  let painScore = $state(5);
  let symptoms = $state('');
  let limitations = $state('');

  const user = $derived($authStore.user);
  const profile = $derived($authStore.patientProfile);
  const today = new Date().toISOString().split('T')[0];

  onMount(async () => {
    if (!user) return;
    const [p, c] = await Promise.all([
      getExercisePlan(user.uid),
      getExerciseCompletions(user.uid, today)
    ]);
    plan = p;
    completedIds = new Set(c.map(x => x.exerciseId));
    if (!p) showForm = true;
    if (profile) {
      surgeryType = profile.surgeryType || '';
      recoveryStage = profile.recoveryStage || '';
    }
    loadingPlan = false;
  });

  async function generatePlan() {
    if (!surgeryType || !recoveryStage) { error = 'Please select a surgery type and recovery stage.'; return; }
    generating = true;
    error = '';
    try {
      const raw = await generatePhysiotherapyPlan({ surgeryType, recoveryStage, painScore, symptoms, limitations });
      const data = typeof raw === 'string' ? JSON.parse(raw) : raw;

      const addIds = (exercises: Exercise[], prefix: string): Exercise[] =>
        exercises.map((e, i) => ({ ...e, id: `${prefix}_${i}`, category: prefix as Exercise['category'] }));

      const newPlan: ExercisePlan = {
        uid: user!.uid,
        generatedAt: new Date(),
        surgeryType,
        recoveryStage,
        morning: addIds(data.morning || [], 'morning'),
        afternoon: addIds(data.afternoon || [], 'afternoon'),
        evening: addIds(data.evening || [], 'evening'),
        precautions: data.precautions || [],
        redFlags: data.redFlags || []
      };
      plan = newPlan;
      showForm = false;
      await saveExercisePlan(user!.uid, newPlan);
    } catch (e: unknown) {
      const msg = (e as Error)?.message || '';
      if (msg.includes('API_KEY') || msg.includes('configured')) {
        error = msg;
      } else if (msg.includes('JSON')) {
        error = 'Could not parse exercise plan. Please try again.';
      } else {
        error = 'Failed to generate plan. Please try again in a moment.';
      }
    } finally {
      generating = false;
    }
  }

  async function handleComplete(exerciseId: string, exerciseName: string) {
    if (!user || completedIds.has(exerciseId)) return;
    completedIds = new Set([...completedIds, exerciseId]);
    await markExerciseComplete(user.uid, today, { exerciseId, exerciseName, completedAt: new Date() });
  }
</script>

<svelte:head><title>Physiotherapy Plan – SpineSync</title></svelte:head>

<div class="space-y-6 animate-fade-in">
  <!-- Header -->
  <div class="flex items-start justify-between">
    <div>
      <h1 class="page-title">Physiotherapy Plan</h1>
      <p class="text-muted text-sm mt-1">Personalized exercises for your spine recovery journey</p>
    </div>
    {#if plan && !showForm}
      <button onclick={() => { showForm = true; error = ''; }} class="btn-secondary text-sm">Regenerate Plan</button>
    {/if}
  </div>

  {#if loadingPlan}
    <div class="flex justify-center py-20"><LoadingSpinner label="Loading your plan…" /></div>
  {:else if showForm}
    <!-- Plan Generator Form -->
    <div class="card max-w-xl">
      <h2 class="section-title mb-1">Generate Your Plan</h2>
      <p class="text-muted text-sm mb-6">Answer a few questions so SpineGuide AI can create the right exercises for you.</p>

      {#if error}
        <Alert type="danger" message={error} dismissible onDismiss={() => error = ''} />
        <div class="mb-4"></div>
      {/if}

      <div class="space-y-4">
        <div>
          <label class="label" for="surgeryType">Surgery Type *</label>
          <select id="surgeryType" class="input-field" bind:value={surgeryType}>
            <option value="">Select surgery type…</option>
            <option value="Lumbar Discectomy">Lumbar Discectomy</option>
            <option value="Spinal Fusion">Spinal Fusion</option>
            <option value="Laminectomy">Laminectomy</option>
            <option value="Cervical Discectomy">Cervical Discectomy (ACDF)</option>
            <option value="Scoliosis Correction">Scoliosis Correction</option>
            <option value="Vertebroplasty">Vertebroplasty / Kyphoplasty</option>
            <option value="Other">Other Spine Surgery</option>
          </select>
        </div>

        <div>
          <label class="label" for="stage">Recovery Stage *</label>
          <select id="stage" class="input-field" bind:value={recoveryStage}>
            <option value="">Select recovery stage…</option>
            <option value="pre-op">Pre-Surgery Preparation</option>
            <option value="early">Early Recovery (0–6 weeks post-op)</option>
            <option value="mid">Mid Recovery (6–12 weeks)</option>
            <option value="late">Late Recovery (3–6 months)</option>
            <option value="complete">Maintenance / Full Recovery</option>
          </select>
        </div>

        <div>
          <label class="label" for="pain">Current Pain Level: <strong>{painScore}/10</strong></label>
          <input id="pain" type="range" min="0" max="10" bind:value={painScore} class="w-full accent-primary" />
          <div class="flex justify-between text-xs text-muted mt-1"><span>No pain</span><span>Worst pain</span></div>
        </div>

        <div>
          <label class="label" for="symptoms">Current Symptoms</label>
          <textarea id="symptoms" class="input-field" rows="2" placeholder="e.g., lower back stiffness, numbness in left leg…" bind:value={symptoms}></textarea>
        </div>

        <div>
          <label class="label" for="limits">Physical Limitations</label>
          <textarea id="limits" class="input-field" rows="2" placeholder="e.g., cannot bend forward, limited walking distance…" bind:value={limitations}></textarea>
        </div>

        <button onclick={generatePlan} disabled={generating} class="btn-primary w-full py-3 justify-center text-base">
          {#if generating}
            <LoadingSpinner size="sm" label="" />
            Generating your plan…
          {:else}
            ✦ Generate My Physiotherapy Plan
          {/if}
        </button>
      </div>
    </div>

  {:else if plan}
    <!-- Plan Content -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
      <div class="badge badge-primary py-1.5 px-3 w-fit">Surgery: {plan.surgeryType}</div>
      <div class="badge badge-primary py-1.5 px-3 w-fit">Stage: {plan.recoveryStage}</div>
    </div>

    <!-- Exercise Sections -->
    {#each [
      { key: 'morning', label: '🌅 Morning Exercises', exercises: plan.morning },
      { key: 'afternoon', label: '☀️ Afternoon Exercises', exercises: plan.afternoon },
      { key: 'evening', label: '🌙 Evening / Wind-Down', exercises: plan.evening }
    ] as section}
      {#if section.exercises?.length > 0}
        <div class="card">
          <h2 class="section-title mb-4">{section.label}</h2>
          <div class="space-y-3">
            {#each section.exercises as exercise}
              <ExerciseCard
                {exercise}
                completed={completedIds.has(exercise.id)}
                onComplete={(id) => handleComplete(id, exercise.name)}
              />
            {/each}
          </div>
        </div>
      {/if}
    {/each}

    <!-- Precautions -->
    {#if plan.precautions?.length > 0}
      <div class="card border-l-4 border-accent-amber">
        <h2 class="section-title mb-3 text-accent-amber">⚠️ Precautions</h2>
        <ul class="space-y-2">
          {#each plan.precautions as p}
            <li class="flex items-start gap-2 text-sm text-black">
              <span class="text-accent-amber mt-0.5">•</span> {p}
            </li>
          {/each}
        </ul>
      </div>
    {/if}

    <!-- Red Flags -->
    {#if plan.redFlags?.length > 0}
      <div class="card border-l-4 border-accent-red">
        <h2 class="section-title mb-3 text-accent-red">🚨 Red Flags – Contact Your Doctor Immediately</h2>
        <ul class="space-y-2">
          {#each plan.redFlags as flag}
            <li class="flex items-start gap-2 text-sm text-black">
              <span class="text-accent-red mt-0.5">⚡</span> {flag}
            </li>
          {/each}
        </ul>
      </div>
    {/if}

    <div class="disclaimer">
      <strong>Important:</strong> This exercise plan is AI-generated based on your inputs. Always perform exercises gently and stop if you experience increased pain. Consult your physiotherapist before starting any new exercise routine.
    </div>
  {/if}
</div>
