<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { signIn, signUp, signInWithGoogle } from '$lib/firebase/auth';
  import { updateUserRole } from '$lib/firebase/firestore';
  import Alert from '$lib/components/Alert.svelte';
  import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
  import logo from '$lib/assets/spine-app-logo.png';

  let mode = $state<'login' | 'signup'>('login');
  let email = $state('');
  let password = $state('');
  let displayName = $state('');
  let role = $state<'patient' | 'doctor'>('patient');
  let loading = $state(false);
  let error = $state('');

  // Role-selector modal state (shown after Google sign-in for new users)
  let showRoleModal = $state(false);
  let pendingGoogleUid = $state('');
  let modalRole = $state<'patient' | 'doctor'>('patient');
  let savingRole = $state(false);

  // Check URL param for initial mode
  $effect(() => {
    const m = $page.url.searchParams.get('mode');
    if (m === 'login') mode = 'login';
  });

  function clearForm() {
    email = '';
    password = '';
    displayName = '';
    role = 'patient';
    error = '';
  }

  async function handleSubmit() {
    if (!email || !password) { error = 'Please fill in all required fields.'; return; }
    if (mode === 'signup' && !displayName) { error = 'Please enter your name.'; return; }
    if (password.length < 6) { error = 'Password must be at least 6 characters.'; return; }

    loading = true;
    error = '';
    try {
      if (mode === 'signup') {
        const user = await signUp(email, password, displayName, role);
        await authStore.refresh(user.uid);
        goto(role === 'doctor' ? '/doctor' : '/dashboard');
      } else {
        const user = await signIn(email, password);
        // Determine where to send the user based on their stored role.
        // We import getUserProfile lazily to avoid circular imports.
        const { getUserProfile } = await import('$lib/firebase/firestore');
        const profile = await getUserProfile(user.uid);
        goto(profile?.role === 'doctor' ? '/doctor' : '/dashboard');
      }
    } catch (e: unknown) {
      const msg = (e as { message?: string })?.message || '';
      if (msg.includes('email-already-in-use')) error = 'An account with this email already exists.';
      else if (msg.includes('user-not-found') || msg.includes('wrong-password') || msg.includes('invalid-credential')) error = 'Invalid email or password.';
      else if (msg.includes('API_KEY') || msg.includes('configuration')) error = 'Firebase is not configured. Please add your credentials to the .env file.';
      else error = 'Something went wrong. Please try again.';
    } finally {
      loading = false;
    }
  }

  async function handleGoogle() {
    loading = true;
    error = '';
    try {
      const { user, isNewUser } = await signInWithGoogle();
      if (isNewUser) {
        // Stop and ask the user what role they want
        pendingGoogleUid = user.uid;
        showRoleModal = true;
        loading = false;
      } else {
        const { getUserProfile } = await import('$lib/firebase/firestore');
        const profile = await getUserProfile(user.uid);
        goto(profile?.role === 'doctor' ? '/doctor' : '/dashboard');
      }
    } catch (e: unknown) {
      const msg = (e as { message?: string })?.message || '';
      if (msg.includes('popup-closed')) error = 'Sign-in popup was closed.';
      else if (msg.includes('API_KEY') || msg.includes('configuration')) error = 'Firebase is not configured. Please add your credentials to the .env file.';
      else error = 'Google sign-in failed. Please try again.';
    } finally {
      loading = false;
    }
  }

  async function confirmGoogleRole() {
    if (!pendingGoogleUid) return;
    savingRole = true;
    try {
      await updateUserRole(pendingGoogleUid, modalRole);
      showRoleModal = false;
      goto(modalRole === 'doctor' ? '/doctor' : '/dashboard');
    } catch {
      error = 'Failed to save your role. Please try again.';
      showRoleModal = false;
    } finally {
      savingRole = false;
    }
  }
</script>

<svelte:head>
  <title>{mode === 'login' ? 'Sign In' : 'Create Account'} – SpineSync</title>
</svelte:head>

<!-- Role Selection Modal (Google new users) -->
{#if showRoleModal}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
    <div class="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4 animate-fade-in">
      <div class="text-center mb-6">
        <div class="w-14 h-14 bg-primary/10 rounded-full flex items-center justify-center text-3xl mx-auto mb-3">🏥</div>
        <h2 class="text-xl font-bold text-black">Welcome to SpineSync!</h2>
        <p class="text-muted text-sm mt-1">How will you be using SpineSync?</p>
      </div>

      <div class="grid grid-cols-2 gap-3 mb-6">
        <button
          onclick={() => modalRole = 'patient'}
          class="flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all duration-200 {modalRole === 'patient' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'}"
        >
          <span class="text-3xl">🧑‍💼</span>
          <span class="font-semibold text-sm text-black">I'm a Patient</span>
          <span class="text-xs text-muted text-center">Track my recovery & exercises</span>
        </button>
        <button
          onclick={() => modalRole = 'doctor'}
          class="flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all duration-200 {modalRole === 'doctor' ? 'border-emerald-500 bg-emerald-50' : 'border-border hover:border-emerald-300'}"
        >
          <span class="text-3xl">👨‍⚕️</span>
          <span class="font-semibold text-sm text-black">I'm a Doctor</span>
          <span class="text-xs text-muted text-center">Monitor my patients' progress</span>
        </button>
      </div>

      <button
        onclick={confirmGoogleRole}
        disabled={savingRole}
        class="btn-primary w-full py-3 justify-center text-base"
      >
        {#if savingRole}
          <LoadingSpinner size="sm" label="" />
        {/if}
        Continue as {modalRole === 'doctor' ? 'Doctor' : 'Patient'}
      </button>
    </div>
  </div>
{/if}

<div class="min-h-screen bg-bg flex">
  <!-- Left Panel -->
  <div class="hidden lg:flex flex-col justify-between w-2/5 bg-primary px-12 py-10">
    <a href="/" class="flex items-center gap-2.5">
      <img src={logo} alt="SpineSync Logo" class="w-9 h-9 rounded-xl object-contain bg-white/20 p-1" />
      <span class="font-semibold text-white text-xl">SpineSync</span>
    </a>
    <div>
      <h2 class="text-3xl font-bold text-white mb-4">Recovery made<br />personal and smart</h2>
      <p class="text-white/70 text-sm leading-relaxed">AI-powered guidance, personalized physiotherapy, and daily monitoring — all in one calm, supportive platform.</p>
    </div>
    <div class="disclaimer bg-white/10 border-white/20 text-white/70">
      <p class="font-medium text-white/90 text-xs mb-1">⚕️ Medical Disclaimer</p>
      <p>This platform provides educational guidance only. Always consult your healthcare provider.</p>
    </div>
  </div>

  <!-- Right Panel -->
  <div class="flex-1 flex flex-col items-center justify-center px-6 py-12">
    <div class="w-full max-w-md">
      <!-- Mobile Logo -->
      <a href="/" class="flex items-center gap-2 mb-8 lg:hidden">
        <img src={logo} alt="SpineSync Logo" class="w-8 h-8 rounded-lg object-contain" />
        <span class="font-semibold text-black text-lg">SpineSync</span>
      </a>

      <h1 class="text-2xl font-bold text-black mb-1">
        {mode === 'login' ? 'Welcome back' : 'Create your account'}
      </h1>
      <p class="text-muted text-sm mb-8">
        {mode === 'login' ? "Sign in to continue your journey." : "Join SpineSync as a patient or doctor."}
      </p>

      {#if error}
        <Alert type="danger" message={error} dismissible onDismiss={() => error = ''} />
        <div class="mb-4"></div>
      {/if}

      <!-- Google Sign In -->
      <button onclick={handleGoogle} disabled={loading} class="w-full flex items-center justify-center gap-3 px-4 py-3 bg-white border border-border rounded-xl text-sm font-medium hover:bg-surface transition-colors disabled:opacity-50 mb-6 text-black">
        <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
        Continue with Google
      </button>

      <div class="relative mb-6">
        <div class="absolute inset-0 flex items-center"><div class="w-full border-t border-border"></div></div>
        <div class="relative flex justify-center text-xs text-muted bg-bg px-3">or use email</div>
      </div>

      <!-- Form -->
      <form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }} class="space-y-4">
        {#if mode === 'signup'}
          <div>
            <label class="label" for="name">Full Name</label>
            <input id="name" type="text" class="input-field" placeholder="Your full name" bind:value={displayName} required />
          </div>

          <!-- Role Selector (signup only) -->
          <div>
            <p class="label mb-2 font-medium text-sm text-black">I am signing up as</p>
            <div class="grid grid-cols-2 gap-2">
              <button
                type="button"
                onclick={() => role = 'patient'}
                class="flex items-center gap-2 p-3 rounded-xl border-2 transition-all duration-200 text-left {role === 'patient' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'}"
              >
                <span class="text-xl">🧑‍💼</span>
                <div>
                  <p class="font-semibold text-sm text-black leading-tight">Patient</p>
                  <p class="text-xs text-muted">Track recovery</p>
                </div>
              </button>
              <button
                type="button"
                onclick={() => role = 'doctor'}
                class="flex items-center gap-2 p-3 rounded-xl border-2 transition-all duration-200 text-left {role === 'doctor' ? 'border-emerald-500 bg-emerald-50' : 'border-border hover:border-emerald-300'}"
              >
                <span class="text-xl">👨‍⚕️</span>
                <div>
                  <p class="font-semibold text-sm text-black leading-tight">Doctor</p>
                  <p class="text-xs text-muted">Monitor patients</p>
                </div>
              </button>
            </div>
          </div>
        {/if}

        <div>
          <label class="label" for="email">Email Address</label>
          <input id="email" type="email" class="input-field" placeholder="you@example.com" bind:value={email} required />
        </div>
        <div>
          <label class="label" for="password">Password</label>
          <input id="password" type="password" class="input-field" placeholder={mode === 'signup' ? 'At least 6 characters' : 'Your password'} bind:value={password} required />
        </div>

        <button type="submit" disabled={loading} class="btn-primary w-full py-3 justify-center text-base mt-2">
          {#if loading}
            <LoadingSpinner size="sm" label="" />
          {/if}
          {mode === 'login' ? 'Sign In' : (role === 'doctor' ? 'Create Doctor Account' : 'Create Patient Account')}
        </button>
      </form>

      <p class="text-center text-sm text-muted mt-6">
        {mode === 'login' ? "Don't have an account?" : "Already have an account?"}
        <button
          onclick={() => { mode = mode === 'login' ? 'signup' : 'login'; clearForm(); }}
          class="text-primary font-medium ml-1 hover:underline"
        >
          {mode === 'login' ? 'Sign up' : 'Sign in'}
        </button>
      </p>
    </div>
  </div>
</div>
