<script lang="ts">
  import { page } from '$app/stores';
  import { isDoctor } from '$lib/stores/auth';

  const navItems = [
    { href: '/dashboard', label: 'Dashboard', reqDoctor: false, icon: `<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>` },
    { href: '/assistant', label: 'AI Assistant', reqDoctor: false, icon: `<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>` },
    { href: '/physiotherapy', label: 'Physiotherapy', reqDoctor: false, icon: `<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>` },
    { href: '/monitoring', label: 'Monitoring', reqDoctor: false, icon: `<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>` },
    { href: '/education', label: 'Education', reqDoctor: false, icon: `<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/></svg>` },
    { href: '/profile', label: 'Profile', reqDoctor: false, icon: `<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>` },
    { href: '/admin', label: 'Admin', reqDoctor: true, icon: `<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>` }
  ];
</script>

<aside class="fixed left-0 top-16 bottom-0 w-56 bg-card border-r border-border flex flex-col py-4 overflow-y-auto z-40 hidden lg:flex">
  <nav class="px-3 space-y-0.5 flex-1">
    {#each navItems as item}
      {#if !item.reqDoctor || $isDoctor}
        <a
          href={item.href}
          class="{$page.url.pathname.startsWith(item.href) ? 'nav-link-active' : 'nav-link'}"
        >
          <span class="flex-shrink-0">{@html item.icon}</span>
          <span>{item.label}</span>
        </a>
      {/if}
    {/each}
  </nav>

  <div class="px-3 mt-4">
    <div class="disclaimer">
      <p class="font-medium text-black text-xs mb-1">⚕️ Medical Disclaimer</p>
      <p>For educational guidance only. Always consult your doctor.</p>
    </div>
  </div>
</aside>
