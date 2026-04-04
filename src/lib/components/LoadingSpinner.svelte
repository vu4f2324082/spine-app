<script lang="ts">
  interface Props {
    size?: 'sm' | 'md' | 'lg';
    label?: string;
  }

  let { size = 'md', label = 'Loading...' }: Props = $props();

  const sizeMap: Record<string, string> = {
    sm: 'w-4 h-4 border-2',
    md: 'w-8 h-8 border-2',
    lg: 'w-12 h-12 border-3'
  };
</script>

<div class="flex flex-col items-center justify-center gap-3" role="status" aria-label={label}>
  <div class="{sizeMap[size]} border-border border-t-primary rounded-full animate-spin"></div>
  {#if label && size !== 'sm'}
    <p class="text-sm text-muted">{label}</p>
  {/if}
</div>
