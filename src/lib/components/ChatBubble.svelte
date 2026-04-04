<script lang="ts">
  import type { ChatMessage } from '$lib/types';

  interface Props {
    message: ChatMessage;
  }

  let { message }: Props = $props();
  const isUser = $derived(message.role === 'user');

  function formatTime(date: Date | { seconds: number }) {
    const d = date instanceof Date ? date : new Date((date as { seconds: number }).seconds * 1000);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
</script>

<div class="flex {isUser ? 'justify-end' : 'justify-start'} mb-4 animate-slide-up">
  {#if !isUser}
    <div class="w-8 h-8 bg-primary rounded-full flex items-center justify-center text-white text-xs font-semibold flex-shrink-0 mr-2 mt-auto">
      SG
    </div>
  {/if}

  <div class="max-w-[75%] flex flex-col {isUser ? 'items-end' : 'items-start'}">
    <div class="px-4 py-3 rounded-2xl text-sm leading-relaxed {isUser
      ? 'bg-primary text-white rounded-br-sm'
      : 'bg-white border border-border text-black rounded-bl-sm shadow-sm'}">
      {#if !isUser}
        <p class="text-xs font-semibold text-primary mb-1">SpineGuide AI</p>
      {/if}
      <p class="whitespace-pre-wrap">{message.content}</p>
    </div>
    <span class="text-xs text-muted mt-1 px-1">{formatTime(message.timestamp)}</span>
  </div>

  {#if isUser}
    <div class="w-8 h-8 bg-secondary/20 rounded-full flex items-center justify-center text-secondary text-xs font-semibold flex-shrink-0 ml-2 mt-auto">
      You
    </div>
  {/if}
</div>
