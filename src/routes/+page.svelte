<script lang="ts">
  import { goto } from '$app/navigation';
  import Spine3D from '$lib/components/Spine3D.svelte';

  const features = [
    { icon: '🤖', title: 'AI Assistant', desc: 'SpineGuide AI answers your recovery questions in simple, clear language — anytime you need support.' },
    { icon: '🏃', title: 'Physiotherapy Plans', desc: 'Personalized exercise routines tailored to your surgery type and recovery stage.' },
    { icon: '📊', title: 'Progress Monitoring', desc: 'Track pain levels, mobility, and exercise adherence with visual charts and weekly summaries.' },
    { icon: '📚', title: 'Education Library', desc: 'Learn about spine surgery, recovery stages, and physiotherapy tips in easy-to-understand content.' },
    { icon: '🗓️', title: 'Daily Journaling', desc: 'Log symptoms, mood, and exercise completions to build a complete recovery journal.' },
    { icon: '👨‍⚕️', title: 'Caregiver Dashboard', desc: 'Doctors and caregivers can monitor patient progress, review logs, and add clinical notes.' }
  ];

  const steps = [
    { title: 'Set Up Your Profile', desc: 'Enter your surgery details and recovery stage for personalized guidance.' },
    { title: 'Get Your Plan', desc: 'AI generates a personalized physiotherapy and education plan for you.' },
    { title: 'Track Daily', desc: 'Log symptoms, complete exercises, and chat with your AI companion.' },
    { title: 'Review Progress', desc: 'View trends, weekly summaries, and share with your healthcare team.' }
  ];
</script>

<svelte:head>
  <title>SpineSync – Your Recovery Companion</title>
</svelte:head>

<!-- 3D Interactive Background -->
<div class="fixed inset-0 z-0 opacity-40">
  <Spine3D showControls={false} />
</div>

<!-- Main Content Overlay -->
<div class="min-h-screen bg-transparent flex flex-col relative z-10 pointer-events-none">
  <!-- Re-enable pointer events for interactive elements inside -->
  <div class="pointer-events-auto flex w-full flex-col min-h-screen">
    
    <!-- Top Nav -->
    <nav class="flex items-center justify-between px-8 py-5 max-w-screen-xl mx-auto w-full">
      <div class="flex items-center gap-2.5">
        <div class="w-9 h-9 bg-primary rounded-xl flex items-center justify-center text-white font-bold text-base">S</div>
        <span class="font-semibold text-black text-xl tracking-tight">SpineSync</span>
      </div>
      <div class="flex items-center gap-3">
        <a href="/auth?mode=login" class="btn-ghost text-sm">Sign in</a>
        <a href="/auth" class="btn-primary text-sm">Get Started</a>
      </div>
    </nav>

    <!-- Hero -->
    <section class="flex-1 flex flex-col items-center justify-center text-center px-6 py-20 mt-10">
      <div class="badge badge-primary mb-6 text-xs py-1 px-3">🏥 AI-Powered Recovery Platform</div>
      <h1 class="text-5xl md:text-6xl font-bold text-black leading-tight max-w-3xl mb-6">
        Your Guide Through<br /><span class="text-primary">Spine Recovery</span>
      </h1>
      <p class="text-lg text-muted max-w-xl mb-10 leading-relaxed bg-white/50 backdrop-blur-sm p-4 rounded-xl border border-border">
        Personalized physiotherapy plans, real-time progress monitoring, and AI-powered support — helping spine patients feel informed, supported, and confident at every step.
      </p>
      <div class="flex flex-col sm:flex-row items-center gap-4">
        <a href="/auth" class="btn-primary px-8 py-3 text-base">
          Get Started Free
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
        </a>
        <a href="/auth?mode=login" class="btn-secondary px-8 py-3 text-base bg-white/50 backdrop-blur-sm">Sign In</a>
        <a href="/education" class="btn-ghost px-6 py-3 text-base">Explore Education</a>
      </div>

      <!-- Disclaimer -->
      <p class="text-xs text-muted mt-10 max-w-md bg-white/60 backdrop-blur-sm p-2 rounded-lg border border-border">
        ⚕️ This platform provides educational and supportive guidance only. It does not replace professional medical advice, diagnosis, or treatment.
      </p>
    </section>

    <!-- Feature Cards -->
    <section class="py-20 px-6">
      <div class="max-w-screen-xl mx-auto border-t border-border pt-16">
        <h2 class="text-3xl font-bold text-center text-black mb-4">Everything You Need for Recovery</h2>
        <p class="text-center text-muted mb-12 max-w-lg mx-auto">From day one post-surgery to full recovery, SpineSync is with you every step of the way.</p>

        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {#each features as f}
            <div class="card-hover group">
              <div class="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4 text-2xl group-hover:bg-primary/20 transition-colors">
                {f.icon}
              </div>
              <h3 class="font-semibold text-black mb-2">{f.title}</h3>
              <p class="text-sm text-muted leading-relaxed">{f.desc}</p>
            </div>
          {/each}
        </div>
      </div>
    </section>

    <!-- Recovery Steps -->
    <section class="py-20 px-6 bg-white/80 backdrop-blur-md border-t border-border">
      <div class="max-w-screen-xl mx-auto">
        <h2 class="text-3xl font-bold text-center text-black mb-12">Your Recovery Journey</h2>
        <div class="flex flex-col md:flex-row items-start gap-8 justify-center">
          {#each steps as step, i}
            <div class="flex-1 text-center max-w-xs mx-auto">
              <div class="w-12 h-12 bg-primary text-white rounded-full flex items-center justify-center text-lg font-bold mx-auto mb-4 shadow-md">{i+1}</div>
              <h3 class="font-semibold text-black mb-2">{step.title}</h3>
              <p class="text-sm text-muted">{step.desc}</p>
            </div>
            {#if i < steps.length - 1}
              <div class="hidden md:flex items-center pt-6 text-xl text-border">→</div>
            {/if}
          {/each}
        </div>
      </div>
    </section>

    <!-- CTA -->
    <section class="py-20 px-6 text-center">
      <div class="max-w-2xl mx-auto card bg-white/90 backdrop-blur-md shadow-xl border-border">
        <h2 class="text-2xl font-bold text-black mb-3">Ready to Start Your Recovery?</h2>
        <p class="text-muted mb-8">Join spine patients who are recovering smarter with AI-guided support.</p>
        <a href="/auth" class="btn-primary px-10 py-3 text-base shadow-md hover:shadow-lg">Create Free Account</a>
      </div>
    </section>

    <!-- Footer -->
    <footer class="border-t border-border py-8 px-6 text-center bg-bg relative z-10">
      <p class="text-sm text-muted">© 2026 SpineSync. Educational platform — not a replacement for medical care.</p>
    </footer>
  </div>
</div>
