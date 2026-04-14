<script lang="ts">
  import { goto } from '$app/navigation';
  import { authStore, isDoctor } from '$lib/stores/auth';
  import { isSidebarOpen } from '$lib/stores/ui';
  import { logout } from '$lib/firebase/auth';
  import logo from '$lib/assets/spine-app-logo.png';

  async function handleLogout() {
    await logout();
    goto('/');
  }
</script>

<header class="fixed top-0 left-0 right-0 z-50 bg-card border-b border-border shadow-sm">
  <div class="max-w-screen-xl mx-auto px-4 h-16 flex items-center justify-between">
    <div class="flex items-center gap-3">
      <!-- Hamburger Menu -->
      <button class="lg:hidden p-1.5 -ml-1 text-muted hover:text-black rounded-lg transition-colors" onclick={() => $isSidebarOpen = !$isSidebarOpen}>
        <svg width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path d="M4 6h16M4 12h16M4 18h16" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>

      <!-- Logo -->
      <a href={$isDoctor ? '/doctor' : '/dashboard'} class="flex items-center gap-2.5 group">
        <img src={logo} alt="SpineSync Logo" class="w-8 h-8 rounded-lg object-contain" />
        <span class="font-semibold text-black text-lg tracking-tight">SpineSync</span>
      </a>
    </div>


    <!-- User Actions -->
    <div class="flex items-center gap-3">
      {#if $authStore.user}
        <div class="hidden sm:flex items-center gap-2">
          <div class="relative">
            <div class="w-8 h-8 {$isDoctor ? 'bg-emerald-100' : 'bg-primary/10'} rounded-full flex items-center justify-center {$isDoctor ? 'text-emerald-700' : 'text-primary'} font-semibold text-sm">
              {$authStore.user.displayName?.[0]?.toUpperCase() || 'U'}
            </div>
            {#if $isDoctor}
              <span class="absolute -top-1 -right-1 text-[10px] leading-none">⚕️</span>
            {/if}
          </div>
          <div class="hidden lg:block">
            <p class="text-sm text-black font-medium leading-tight">{$authStore.user.displayName}</p>
            {#if $isDoctor}
              <p class="text-[10px] text-emerald-600 font-medium">Doctor</p>
            {:else}
              <p class="text-[10px] text-muted">Patient</p>
            {/if}
          </div>
        </div>
        <button onclick={handleLogout} class="btn-ghost text-sm px-3 py-1.5">Sign out</button>
      {:else}
        <a href="/auth" class="btn-primary text-sm px-4 py-2">Sign in</a>
      {/if}
    </div>
  </div>
</header>
