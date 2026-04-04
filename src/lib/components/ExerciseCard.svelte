<script lang="ts">
  import { onMount } from 'svelte';
  import type { Exercise } from '$lib/types';

  interface Props {
    exercise: Exercise;
    completed?: boolean;
    onComplete?: (id: string) => void;
  }

  let { exercise, completed = false, onComplete }: Props = $props();

  let videoId = $state<string | null>(null);
  let loadingVideo = $state(false);

  // Extract video ID from videoUrl if it exists, otherwise search for it
  onMount(async () => {
    if (exercise.videoUrl && exercise.videoUrl.includes('youtube.com/watch?v=')) {
      videoId = new URL(exercise.videoUrl).searchParams.get('v');
    } else {
      loadingVideo = true;
      try {
        const res = await fetch(`/api/youtube-search?q=${encodeURIComponent(exercise.name)}`);
        const data = await res.json();
        if (data.videoId) {
          videoId = data.videoId;
        }
      } catch (e) {
        console.error('Failed to load video details', e);
      } finally {
        loadingVideo = false;
      }
    }
  });
</script>

<div class="bg-white border border-border rounded-xl p-4 flex items-start gap-3 transition-all duration-150 {completed ? 'opacity-60' : 'hover:shadow-card'}">
  <!-- Checkbox -->
  <button
    onclick={() => onComplete?.(exercise.id)}
    class="flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all duration-150 mt-0.5 {completed ? 'bg-accent-green border-accent-green text-white' : 'border-border hover:border-primary'}"
    aria-label="{completed ? 'Completed' : 'Mark complete'}"
    disabled={completed}
  >
    {#if completed}
      <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
        <path d="M10 3L5 8.5 2 5.5" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    {/if}
  </button>

  <!-- Content -->
  <div class="flex-1 min-w-0">
    <div class="flex items-center gap-2 flex-wrap">
      <h4 class="font-medium text-black text-sm {completed ? 'line-through' : ''}">{exercise.name}</h4>
      <span class="badge badge-primary capitalize">{exercise.category}</span>
    </div>
    <p class="text-muted text-xs mt-1">{exercise.description}</p>
    
    <!-- Video Player / Placeholder -->
    {#if videoId}
      <div class="mt-3 overflow-hidden rounded-lg border border-border bg-black aspect-video">
        <iframe 
          width="100%" 
          height="100%" 
          src="https://www.youtube.com/embed/{videoId}" 
          title="{exercise.name} video" 
          frameborder="0" 
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
          allowfullscreen>
        </iframe>
      </div>
    {:else if loadingVideo}
      <div class="mt-3 h-32 rounded-lg bg-gray-100 animate-pulse flex items-center justify-center border border-border">
        <span class="text-xs text-muted flex items-center gap-1">
          <svg class="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          Finding video...
        </span>
      </div>
    {/if}

    <div class="flex items-center gap-3 mt-3">
      {#if exercise.duration}
        <span class="text-xs text-muted flex items-center gap-1 font-medium bg-primary/5 px-2 py-1 rounded">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          {exercise.duration}
        </span>
      {/if}
      {#if exercise.reps}
        <span class="text-xs text-muted flex items-center gap-1 font-medium bg-secondary/30 px-2 py-1 rounded">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 01-4 4H3"/></svg>
          {exercise.reps}
        </span>
      {/if}
    </div>
  </div>
</div>
