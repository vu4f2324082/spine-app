<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { authStore, isDoctor } from '$lib/stores/auth';
  import { logout } from '$lib/firebase/auth';
  import logo from '$lib/assets/spine-app-logo.png';

  const patientNavItems = [
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/assistant', label: 'AI Assistant' },
    { href: '/physiotherapy', label: 'Physiotherapy' },
    { href: '/monitoring', label: 'Monitoring' },
    { href: '/education', label: 'Education' },
    { href: '/profile', label: 'Profile' }
  ];

  const doctorNavItems = [
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/doctor', label: 'My Patients' },
    { href: '/profile', label: 'Profile' }
  ];

  const navItems = $derived($isDoctor ? doctorNavItems : patientNavItems);

  async function handleLogout() {
    await logout();
    goto('/');
  }
</script>

<header class="fixed top-0 left-0 right-0 z-50 bg-card border-b border-border shadow-sm">
  <div class="max-w-screen-xl mx-auto px-4 h-16 flex items-center justify-between">
    <!-- Logo -->
    <a href={$isDoctor ? '/doctor' : '/dashboard'} class="flex items-center gap-2.5 group">
      <img src={logo} alt="SpineSync Logo" class="w-8 h-8 rounded-lg object-contain" />
      <span class="font-semibold text-black text-lg tracking-tight">SpineSync</span>
    </a>

    <!-- Nav Links (desktop) -->
    <nav class="hidden md:flex items-center gap-1">
      {#each navItems as item}
        <a
          href={item.href}
          class="px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-150 {$page.url.pathname.startsWith(item.href) ? 'bg-primary/10 text-primary' : 'text-muted hover:text-black hover:bg-surface'}"
        >
          {item.label}
        </a>
      {/each}
    </nav>

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
