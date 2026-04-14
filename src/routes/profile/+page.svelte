<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { authStore } from '$lib/stores/auth';
  import { deleteAccount } from '$lib/firebase/auth';
  import { getPatientProfile, savePatientProfile, getAllDoctors, updateUserRole } from '$lib/firebase/firestore';
  import Alert from '$lib/components/Alert.svelte';
  import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
  import type { PatientProfile, UserProfile } from '$lib/types';

  let loading = $state(true);
  let saving = $state(false);
  let saved = $state(false);
  let error = $state('');

  // Role elevation
  let elevatingRole = $state(false);
  let showElevationConfirm = $state(false);
  let roleElevated = $state(false);

  // Account deletion
  let showDeleteConfirm = $state(false);
  let deleteConfirmText = $state('');
  let deletingAccount = $state(false);

  // Doctor picker (patients only)
  let doctors = $state<(UserProfile & { uid: string })[]>([]);
  let selectedDoctorId = $state('');
  let doctorSearch = $state('');

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
  const isDoctor = $derived(userProfile?.role === 'doctor');

  const filteredDoctors = $derived(
    doctors.filter(d =>
      !doctorSearch ||
      d.displayName?.toLowerCase().includes(doctorSearch.toLowerCase()) ||
      d.email?.toLowerCase().includes(doctorSearch.toLowerCase())
    )
  );

  const selectedDoctorName = $derived(
    doctors.find(d => d.uid === selectedDoctorId)?.displayName || ''
  );

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
      selectedDoctorId = p.doctorId || '';
    }

    // Load doctors list for patients (so they can pick their doctor)
    if (!isDoctor) {
      try {
        const list = await getAllDoctors();
        doctors = list as (UserProfile & { uid: string })[];
      } catch {
        // Non-critical – just leave the list empty
      }
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
        allergies,
        doctorId: selectedDoctorId || undefined
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

  async function elevateToDoctor() {
    if (!user) return;
    elevatingRole = true;
    try {
      await updateUserRole(user.uid, 'doctor');
      await authStore.refresh(user.uid);
      roleElevated = true;
      showElevationConfirm = false;
    } catch {
      error = 'Failed to update role. Please try again.';
    } finally {
      elevatingRole = false;
    }
  }

  async function handleDeleteAccount() {
    if (!user || deleteConfirmText !== 'DELETE') return;
    deletingAccount = true;
    error = '';
    try {
      await deleteAccount(user.uid, userProfile?.role || 'patient');
      goto('/');
    } catch {
      error = 'Failed to delete account. You may need to sign out and sign back in to perform this action.';
      deletingAccount = false;
      showDeleteConfirm = false;
    }
  }
</script>

<svelte:head><title>Profile – SpineSync</title></svelte:head>

<div class="space-y-6 animate-fade-in max-w-2xl">
  <!-- Header -->
  <div>
    <h1 class="page-title">Your Profile</h1>
    <p class="text-muted text-sm mt-1">Keep your details up to date for personalized guidance</p>
  </div>

  {#if loading}
    <div class="flex justify-center py-20"><LoadingSpinner label="Loading profile…" /></div>
  {:else}
    {#if saved}
      <Alert type="success" title="Saved!" message="Your profile has been updated successfully." />
    {/if}
    {#if roleElevated}
      <Alert type="success" title="Role Updated!" message="Your account has been upgraded to Doctor. Please refresh the page or navigate to My Patients." />
    {/if}
    {#if error}
      <Alert type="danger" message={error} dismissible onDismiss={() => error = ''} />
    {/if}

    <!-- Account Info Card -->
    <div class="card">
      <h2 class="section-title mb-4">Account Information</h2>
      <div class="flex items-center gap-4 mb-4">
        <div class="w-16 h-16 {isDoctor ? 'bg-emerald-100' : 'bg-primary/10'} rounded-full flex items-center justify-center {isDoctor ? 'text-emerald-700' : 'text-primary'} text-2xl font-bold">
          {userProfile?.displayName?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || '?'}
        </div>
        <div>
          <p class="font-semibold text-black">{userProfile?.displayName || user?.displayName || 'User'}</p>
          <p class="text-sm text-muted">{user?.email}</p>
          <span class="badge mt-1 capitalize {isDoctor ? 'bg-emerald-100 text-emerald-700' : 'badge-primary'}">
            {isDoctor ? '👨‍⚕️ Doctor' : '🧑‍💼 Patient'}
          </span>
        </div>
      </div>

      <!-- Role Elevation (for patients who signed up incorrectly) -->
      {#if !isDoctor && !roleElevated}
        <div class="border-t border-border pt-4 mt-2">
          <p class="text-xs text-muted mb-2">Signed up as a patient by mistake?</p>
          {#if !showElevationConfirm}
            <button
              onclick={() => showElevationConfirm = true}
              class="text-xs text-emerald-600 hover:text-emerald-700 font-medium hover:underline"
            >
              Upgrade to Doctor Account →
            </button>
          {:else}
            <div class="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
              <p class="text-sm font-medium text-amber-800">⚠️ Confirm Role Change</p>
              <p class="text-xs text-amber-700">Switching to a Doctor account will remove access to patient features like Physiotherapy and Health Logs. This action cannot be undone easily.</p>
              <div class="flex gap-2">
                <button
                  onclick={elevateToDoctor}
                  disabled={elevatingRole}
                  class="btn-primary text-xs py-1.5 px-4 bg-emerald-600 hover:bg-emerald-700"
                >
                  {#if elevatingRole}<LoadingSpinner size="sm" label="" />{/if}
                  Yes, I'm a Doctor
                </button>
                <button onclick={() => showElevationConfirm = false} class="btn-secondary text-xs py-1.5 px-4">
                  Cancel
                </button>
              </div>
            </div>
          {/if}
        </div>
      {/if}
    </div>

    {#if isDoctor}
      <!-- Doctor Profile Info -->
      <div class="card space-y-4">
        <h2 class="section-title">Doctor Profile</h2>
        <p class="text-sm text-muted">As a doctor, patients will be able to link their account to you from their profile page. You can view your patients in the <a href="/doctor" class="text-primary hover:underline font-medium">My Patients</a> dashboard.</p>
        <div class="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center gap-3">
          <div class="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center text-xl flex-shrink-0">👨‍⚕️</div>
          <div>
            <p class="font-semibold text-emerald-800 text-sm">Doctor Dashboard Active</p>
            <p class="text-xs text-emerald-600">You have access to patient monitoring, health logs, and clinical notes.</p>
          </div>
        </div>
      </div>
    {:else}
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

        <!-- Doctor Picker -->
        <div class="border-t border-border pt-5">
          <h3 class="section-title mb-3">Your Doctor</h3>
          <p class="text-xs text-muted mb-3">Link your account to your doctor so they can monitor your recovery progress.</p>

          {#if doctors.length === 0}
            <p class="text-sm text-muted italic">No doctors have registered on SpineSync yet.</p>
          {:else}
            <div class="space-y-2">
              <input
                type="text"
                class="input-field text-sm"
                placeholder="Search doctors by name or email…"
                bind:value={doctorSearch}
              />
              <div class="border border-border rounded-xl overflow-hidden">
                <!-- No doctor option -->
                <button
                  type="button"
                  onclick={() => selectedDoctorId = ''}
                  class="w-full flex items-center gap-3 px-4 py-3 text-sm transition-colors {!selectedDoctorId ? 'bg-primary/5 text-primary font-medium' : 'hover:bg-surface text-muted'}"
                >
                  <span class="w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 {!selectedDoctorId ? 'border-primary bg-primary' : 'border-border'}">
                    {#if !selectedDoctorId}<span class="w-2 h-2 rounded-full bg-white"></span>{/if}
                  </span>
                  No doctor assigned
                </button>
                {#each filteredDoctors as doctor}
                  <button
                    type="button"
                    onclick={() => selectedDoctorId = doctor.uid}
                    class="w-full flex items-center gap-3 px-4 py-3 text-sm border-t border-border transition-colors {selectedDoctorId === doctor.uid ? 'bg-primary/5' : 'hover:bg-surface'}"
                  >
                    <span class="w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 {selectedDoctorId === doctor.uid ? 'border-primary bg-primary' : 'border-border'}">
                      {#if selectedDoctorId === doctor.uid}<span class="w-2 h-2 rounded-full bg-white"></span>{/if}
                    </span>
                    <div class="text-left">
                      <p class="font-medium text-black">{doctor.displayName}</p>
                      <p class="text-xs text-muted">{doctor.email}</p>
                    </div>
                    {#if selectedDoctorId === doctor.uid}
                      <span class="ml-auto badge badge-primary text-xs">Selected</span>
                    {/if}
                  </button>
                {/each}
              </div>
              {#if selectedDoctorName}
                <p class="text-xs text-primary">✓ Linked to Dr. {selectedDoctorName}</p>
              {/if}
            </div>
          {/if}
        </div>

        <button type="submit" disabled={saving} class="btn-primary w-full py-3 justify-center text-base">
          {#if saving}<LoadingSpinner size="sm" label="" />{/if}
          Save Profile
        </button>
      </form>
    {/if}

    <!-- Danger Zone (Delete Account) -->
    <div class="card border-accent-red/20">
      <h2 class="section-title text-accent-red mb-2">Danger Zone</h2>
      <p class="text-sm text-muted mb-4">Once you delete your account, there is no going back. All your data will be permanently removed.</p>
      
      {#if !showDeleteConfirm}
        <button
          type="button"
          class="btn-secondary text-accent-red border-accent-red/20 hover:bg-accent-red hover:text-white hover:border-accent-red"
          onclick={() => showDeleteConfirm = true}
        >
          Delete Account
        </button>
      {:else}
        <div class="bg-accent-red/5 border border-accent-red/20 rounded-xl p-4 space-y-3">
          <p class="text-sm font-medium text-accent-red">Are you absolutely sure?</p>
          <p class="text-xs text-muted">This action cannot be undone. Please type <strong>DELETE</strong> to confirm.</p>
          
          <input
            type="text"
            class="input-field text-sm"
            placeholder="Type DELETE"
            bind:value={deleteConfirmText}
          />
          
          <div class="flex gap-2 pt-2">
            <button
              type="button"
              class="btn-primary bg-accent-red hover:bg-accent-red/90 text-white border-none py-2 text-sm"
              disabled={deleteConfirmText !== 'DELETE' || deletingAccount}
              onclick={handleDeleteAccount}
            >
              {#if deletingAccount}<LoadingSpinner size="sm" label="" />{/if}
              Yes, delete my account
            </button>
            <button
              type="button"
              class="btn-secondary py-2 text-sm"
              onclick={() => { showDeleteConfirm = false; deleteConfirmText = ''; }}
              disabled={deletingAccount}
            >
              Cancel
            </button>
          </div>
        </div>
      {/if}
    </div>

    <div class="disclaimer">
      Your profile data is stored securely in Firebase and used only to personalize your physiotherapy and AI guidance. We do not share your health data with third parties.
    </div>
  {/if}
</div>
