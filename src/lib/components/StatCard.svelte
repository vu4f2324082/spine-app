<script lang="ts">
  interface Props {
    title: string;
    value: string | number;
    subtitle?: string;
    icon?: string;
    color?: 'primary' | 'amber' | 'red' | 'green' | 'secondary';
    trend?: 'up' | 'down' | 'neutral';
    trendLabel?: string;
  }

  let { title, value, subtitle, icon, color = 'primary', trend, trendLabel }: Props = $props();

  const colorMap: Record<string, string> = {
    primary: 'bg-primary/10 text-primary',
    amber: 'bg-accent-amber/10 text-accent-amber',
    red: 'bg-accent-red/10 text-accent-red',
    green: 'bg-accent-green/10 text-accent-green',
    secondary: 'bg-secondary/10 text-secondary'
  };
</script>

<div class="card-hover animate-fade-in">
  <div class="flex items-start justify-between">
    <div class="flex-1">
      <p class="text-xs font-medium text-muted uppercase tracking-wide">{title}</p>
      <p class="text-3xl font-semibold text-black mt-1">{value}</p>
      {#if subtitle}
        <p class="text-xs text-muted mt-1">{subtitle}</p>
      {/if}
      {#if trend && trendLabel}
        <div class="flex items-center gap-1 mt-2">
          <span class="text-xs font-medium {trend === 'up' ? 'text-accent-green' : trend === 'down' ? 'text-accent-red' : 'text-muted'}">
            {trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→'} {trendLabel}
          </span>
        </div>
      {/if}
    </div>
    {#if icon}
      <div class="w-12 h-12 rounded-xl flex items-center justify-center text-xl flex-shrink-0 {colorMap[color]}">
        {icon}
      </div>
    {/if}
  </div>
</div>
