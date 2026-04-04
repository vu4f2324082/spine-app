<script lang="ts">
  interface Props {
    title: string;
    description?: string;
    icon?: string;
    actionLabel?: string;
    onAction?: () => void;
  }

  let { title, description, icon = '🩹', actionLabel, onAction }: Props = $props();
</script>

<div class="flex flex-col items-center justify-center py-16 text-center animate-fade-in">
  <div class="text-5xl mb-4">{icon}</div>
  <h3 class="text-lg font-semibold text-black mb-2">{title}</h3>
  {#if description}
    <p class="text-sm text-muted max-w-xs">{description}</p>
  {/if}
  {#if actionLabel && onAction}
    <button onclick={onAction} class="btn-primary mt-6">{actionLabel}</button>
  {/if}
</div>
