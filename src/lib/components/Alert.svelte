<script lang="ts">
  interface Props {
    type?: 'info' | 'warning' | 'danger' | 'success';
    title?: string;
    message: string;
    dismissible?: boolean;
    onDismiss?: () => void;
  }

  let { type = 'info', title, message, dismissible = false, onDismiss }: Props = $props();

  const styles: Record<string, string> = {
    info: 'bg-secondary/10 border-secondary/30 text-secondary',
    warning: 'bg-accent-amber/10 border-accent-amber/30 text-accent-amber',
    danger: 'bg-accent-red/10 border-accent-red/30 text-accent-red',
    success: 'bg-accent-green/10 border-accent-green/30 text-accent-green'
  };

  const icons: Record<string, string> = {
    info: 'ℹ',
    warning: '⚠',
    danger: '⛔',
    success: '✓'
  };
</script>

<div class="flex items-start gap-3 p-4 rounded-xl border {styles[type]} animate-fade-in" role="alert">
  <span class="flex-shrink-0 font-semibold mt-0.5">{icons[type]}</span>
  <div class="flex-1">
    {#if title}<p class="font-semibold text-sm mb-0.5">{title}</p>{/if}
    <p class="text-sm">{message}</p>
  </div>
  {#if dismissible}
    <button onclick={onDismiss} class="flex-shrink-0 opacity-60 hover:opacity-100 text-lg leading-none">×</button>
  {/if}
</div>
