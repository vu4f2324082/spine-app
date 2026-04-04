<script lang="ts">
  import { onMount } from 'svelte';
  import { authStore } from '$lib/stores/auth';
  import { getPatientProfile, savePatientProfile } from '$lib/firebase/firestore';
  import Alert from '$lib/components/Alert.svelte';
  import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
  import type { PatientProfile } from '$lib/types';

  let loading = $state(true);
  let saving = $state(false);
  let saved = $state(false);
  let error = $state('');

  // Form fields
  let surgeryType = $state('');
  let surgeryDate = $state('');
  let recoveryStage = $state<PatientProfile['recoveryStage']>('early');
  let age = $state<number>(0);
  let phoneNumber = $state('');
  let height = $state<number>(0);
  let weight = $state<number>(0);
  let medications = $state('');
  let allergies = $state('');

  const user = $derived($authStore.user);
  const userProfile = $derived($authStore.userProfile);

  onMount(async () => {
    if (!user) return;
    const p = await getPatientProfile(user.uid);
    if (p) {
      surgeryType = p.surgeryType || '';
      surgeryDate = p.surgeryDate || '';
      recoveryStage = p.recoveryStage || 'early';
      age = p.age || 0;
      phoneNumber = p.phoneNumber || '';
      height = p.height || 0;
      weight = p.weight || 0;
      medications = p.medications || '';
      allergies = p.allergies || '';
    }
    loading = false;
  });

  async function handleSave() {
    if (!user) return;
    saving = true;
    error = '';
    try {
      await savePatientProfile(user.uid, {
        uid: user.uid,
        surgeryType,
        surgeryDate,
        recoveryStage,
        age,
        phoneNumber,
        height,
        weight,
        medications,
        allergies
      });
      await authStore.refresh(user.uid);
      saved = true;
      setTimeout(() => saved = false, 3000);
    } catch {
      error = 'Failed to save profile. Please try again.';
    } finally {
      saving = false;
    }
  }
</script>

<svelte:head><title>Profile – SpineSync</title></svelte:head>

<div class="space-y-6 animate-fade-in max-w-2xl">
  <!-- Header -->
  <div>
    <h1 class="page-title">Your Profile</h1>
    <p class="text-muted text-sm mt-1">Keep your medical details up to date for personalized guidance</p>
  </div>

  {#if loading}
    <div class="flex justify-center py-20"><LoadingSpinner label="Loading profile…" /></div>
  {:else}
    {#if saved}
      <Alert type="success" title="Saved!" message="Your profile has been updated successfully." />
    {/if}
    {#if error}
      <Alert type="danger" message={error} dismissible onDismiss={() => error = ''} />
    {/if}

    <!-- Account Info Card -->
    <div class="card">
      <h2 class="section-title mb-4">Account Information</h2>
      <div class="flex items-center gap-4 mb-4">
        <div class="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center text-primary text-2xl font-bold">
          {userProfile?.displayName?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || '?'}
        </div>
        <div>
          <p class="font-semibold text-black">{userProfile?.displayName || user?.displayName || 'Patient'}</p>
          <p class="text-sm text-muted">{user?.email}</p>
          <span class="badge badge-primary mt-1 capitalize">{userProfile?.role || 'patient'}</span>
        </div>
      </div>
    </div>

    <!-- Medical Profile Form -->
    <form onsubmit={(e) => { e.preventDefault(); handleSave(); }} class="card space-y-5">
      <h2 class="section-title">Medical Details</h2>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label class="label" for="surgeryType">Surgery Type</label>
          <select id="surgeryType" class="input-field" bind:value={surgeryType}>
            <option value="">Not specified</option>
            <option>Lumbar Discectomy</option>
            <option>Spinal Fusion</option>
            <option>Laminectomy</option>
            <option>Cervical Discectomy (ACDF)</option>
            <option>Scoliosis Correction</option>
            <option>Vertebroplasty / Kyphoplasty</option>
            <option>Other Spine Surgery</option>
          </select>
        </div>

        <div>
          <label class="label" for="surgeryDate">Surgery Date</label>
          <input id="surgeryDate" type="date" class="input-field" bind:value={surgeryDate} />
        </div>

        <div>
          <label class="label" for="stage">Recovery Stage</label>
          <select id="stage" class="input-field" bind:value={recoveryStage}>
            <option value="pre-op">Pre-Surgery Preparation</option>
            <option value="early">Early Recovery (0–6 weeks)</option>
            <option value="mid">Mid Recovery (6–12 weeks)</option>
            <option value="late">Late Recovery (3–6 months)</option>
            <option value="complete">Full Recovery / Maintenance</option>
          </select>
        </div>

        <div>
          <label class="label" for="age">Age</label>
          <input id="age" type="number" min="0" max="120" class="input-field" placeholder="Your age" bind:value={age} />
        </div>

        <div>
          <label class="label" for="height">Height (cm)</label>
          <input id="height" type="number" min="0" class="input-field" placeholder="e.g., 170" bind:value={height} />
        </div>

        <div>
          <label class="label" for="weight">Weight (kg)</label>
          <input id="weight" type="number" min="0" class="input-field" placeholder="e.g., 70" bind:value={weight} />
        </div>

        <div>
          <label class="label" for="phone">Phone Number</label>
          <input id="phone" type="tel" class="input-field" placeholder="+44 7XXX XXXXXX" bind:value={phoneNumber} />
        </div>
      </div>

      <div>
        <label class="label" for="medications">Current Medications</label>
        <textarea id="medications" class="input-field" rows="2" placeholder="List any medications you are currently taking…" bind:value={medications}></textarea>
      </div>

      <div>
        <label class="label" for="allergies">Known Allergies</label>
        <textarea id="allergies" class="input-field" rows="2" placeholder="Any known drug or other allergies…" bind:value={allergies}></textarea>
      </div>

      <button type="submit" disabled={saving} class="btn-primary w-full py-3 justify-center text-base">
        {#if saving}<LoadingSpinner size="sm" label="" />{/if}
        Save Profile
      </button>
    </form>

    <div class="disclaimer">
      Your profile data is stored securely in Firebase and used only to personalize your physiotherapy and AI guidance. We do not share your health data with third parties.
    </div>
  {/if}
</div>
