<script lang="ts">
  import type { Exercise } from '$lib/types';

  interface Props {
    exercise: Exercise;
    completed?: boolean;
    onComplete?: (id: string) => void;
  }

  let { exercise, completed = false, onComplete }: Props = $props();
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
    <div class="flex items-center gap-3 mt-2">
      {#if exercise.duration}
        <span class="text-xs text-muted flex items-center gap-1">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          {exercise.duration}
        </span>
      {/if}
      {#if exercise.reps}
        <span class="text-xs text-muted flex items-center gap-1">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 01-4 4H3"/></svg>
          {exercise.reps}
        </span>
      {/if}
    </div>
  </div>
</div>
