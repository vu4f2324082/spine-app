<script lang="ts">
  interface Props {
    value?: number;
    max?: number;
    label?: string;
    color?: 'primary' | 'amber' | 'red' | 'green';
    showPercent?: boolean;
    size?: 'sm' | 'md' | 'lg';
  }

  let {
    value = 0,
    max = 100,
    label = '',
    color = 'primary',
    showPercent = true,
    size = 'md'
  }: Props = $props();

  const percent = $derived(Math.min(100, Math.round((value / max) * 100)));

  const colorMap: Record<string, string> = {
    primary: 'bg-primary',
    amber: 'bg-accent-amber',
    red: 'bg-accent-red',
    green: 'bg-accent-green'
  };

  const sizeMap: Record<string, string> = {
    sm: 'h-1.5',
    md: 'h-2.5',
    lg: 'h-4'
  };
</script>

<div class="w-full">
  {#if label || showPercent}
    <div class="flex items-center justify-between mb-1.5">
      {#if label}<span class="text-sm font-medium text-black">{label}</span>{/if}
      {#if showPercent}<span class="text-sm text-muted">{percent}%</span>{/if}
    </div>
  {/if}
  <div class="w-full bg-border rounded-full overflow-hidden {sizeMap[size]}">
    <div
      class="h-full rounded-full transition-all duration-500 ease-out {colorMap[color]}"
      style="width: {percent}%"
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
    ></div>
  </div>
</div>
