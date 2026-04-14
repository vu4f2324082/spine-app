<script lang="ts">
  import { onMount } from 'svelte';
  import { activeTrackerId } from '$lib/stores/ui';
  import type { Exercise } from '$lib/types';
  import PoseTracker from './PoseTracker.svelte';

  interface Props {
    exercise: Exercise;
    completed?: boolean;
    onComplete?: (id: string) => void;
  }

  let { exercise, completed = false, onComplete }: Props = $props();

  let videoId = $state<string | null>(null);
  let loadingVideo = $state(false);

  let isTracking = $derived($activeTrackerId === exercise.id);

  function handleTrackerComplete() {
    if (onComplete) onComplete(exercise.id);
    setTimeout(() => { 
      if ($activeTrackerId === exercise.id) $activeTrackerId = null; 
    }, 3000);
  }

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
    class="flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all duration-150 mt-0.5 {completed ? 'bg-accent-green border-accent-green text-white cursor-pointer' : 'border-border hover:border-primary cursor-pointer'}"
    aria-label="{completed ? 'Mark incomplete' : 'Mark complete'}"
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
    
    <div class="flex items-center gap-3 mt-2 mb-3">
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

    <!-- Tracker or Video Player or Placeholder -->
    <div class="flex flex-wrap items-center gap-4">
      {#if isTracking}
        <div class="w-full">
          <PoseTracker 
            exerciseName={exercise.name} 
            description={exercise.description}
            reps={exercise.reps}
            duration={exercise.duration}
            onProgress={(p) => {}} 
            onComplete={handleTrackerComplete} 
            onClose={() => { if ($activeTrackerId === exercise.id) $activeTrackerId = null; }}
          />
        </div>
      {:else if videoId}
        <div class="overflow-hidden rounded-lg border border-border bg-black aspect-video w-full max-w-sm shadow-sm">
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
        <div class="h-32 rounded-lg bg-gray-100 animate-pulse flex items-center justify-center border border-border w-full max-w-sm">
          <span class="text-xs text-muted flex items-center gap-1">
            <svg class="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Finding video...
          </span>
        </div>
      {/if}

      {#if !completed && !isTracking}
        <button 
          class="group text-sm font-bold bg-accent-green/10 text-accent-green hover:bg-accent-green hover:text-white px-5 py-4 rounded-xl transition-all duration-200 flex flex-col items-center justify-center gap-2.5 border-2 border-accent-green/30 hover:shadow-md min-w-[150px] aspect-square max-h-[160px]"
          onclick={() => $activeTrackerId = exercise.id}
        >
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="group-hover:text-white"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>
          <span class="text-center font-extrabold tracking-wide uppercase text-xs group-hover:text-white">Track via<br/>Webcam</span>
        </button>
      {/if}
    </div>
  </div>
</div>
