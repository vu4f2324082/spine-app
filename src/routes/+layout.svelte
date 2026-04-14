<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { authStore } from '$lib/stores/auth';
  import Navbar from '$lib/components/Navbar.svelte';
  import Sidebar from '$lib/components/Sidebar.svelte';

  const publicRoutes = ['/', '/auth'];

  // Routes only patients can access
  const patientOnlyRoutes = ['/physiotherapy', '/monitoring', '/assistant', '/education'];
  // Routes only doctors can access
  const doctorOnlyRoutes = ['/doctor'];

  const isPublicRoute = $derived(
    publicRoutes.some(r => $page.url.pathname === r || $page.url.pathname.startsWith('/auth'))
  );

  const isAuthenticatedRoute = $derived(!isPublicRoute);
  const currentPath = $derived($page.url.pathname);
  const role = $derived($authStore.userProfile?.role);

  onMount(() => {
    authStore.init();
  });

  $effect(() => {
    if ($authStore.initialized && !$authStore.loading) {
      // Not logged in → send to auth
      if (isAuthenticatedRoute && !$authStore.user) {
        goto('/auth');
        return;
      }
      // Logged in on auth page → send to correct dashboard
      if ($page.url.pathname === '/auth' && $authStore.user && $authStore.userProfile) {
        goto(role === 'doctor' ? '/doctor' : '/dashboard');
        return;
      }
      // Doctor visiting a patient-only route
      if (role === 'doctor' && patientOnlyRoutes.some(r => currentPath.startsWith(r))) {
        goto('/doctor');
        return;
      }
      // Patient visiting a doctor-only route
      if (role === 'patient' && doctorOnlyRoutes.some(r => currentPath.startsWith(r))) {
        goto('/dashboard');
        return;
      }
    }
  });

  const { children } = $props();
</script>

{#if $authStore.loading && !$authStore.initialized}
  <div class="min-h-screen flex items-center justify-center bg-bg">
    <div class="flex flex-col items-center gap-3">
      <div class="w-10 h-10 border-2 border-border border-t-primary rounded-full animate-spin"></div>
      <p class="text-sm text-muted">Loading SpineSync…</p>
    </div>
  </div>
{:else if isAuthenticatedRoute && $authStore.initialized}
  <div class="min-h-screen bg-bg">
    <Navbar />
    <Sidebar />
    <main class="pt-16 lg:pl-56">
      <div class="p-6 max-w-screen-xl mx-auto">
        {@render children()}
      </div>
    </main>
  </div>
{:else}
  {@render children()}
{/if}
