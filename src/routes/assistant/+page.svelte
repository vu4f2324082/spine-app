<script lang="ts">
  import { onMount } from 'svelte';
  import { authStore } from '$lib/stores/auth';
  import { createChatSession, sendMessage } from '$lib/ai/gemini';
  import { getExercisePlan } from '$lib/firebase/firestore';
  import ChatBubble from '$lib/components/ChatBubble.svelte';
  import Alert from '$lib/components/Alert.svelte';
  import type { ChatMessage, ExercisePlan } from '$lib/types';

  let messages = $state<ChatMessage[]>([]);
  let inputText = $state('');
  let isLoading = $state(false);
  let sessionReady = $state(false);
  let messagesContainer: HTMLDivElement | undefined;
  
  let plan = $state<ExercisePlan | null>(null);

  const user = $derived($authStore.user);
  const profile = $derived($authStore.patientProfile);

  const defaultSuggestions = [
    'What should I expect after spine surgery?',
    'What exercises are safe for early recovery?',
    'How can I manage pain naturally?',
    'When can I return to normal activities?',
    'What are warning signs I should watch for?'
  ];
  let suggestions = $state<string[]>([...defaultSuggestions]);

  onMount(async () => {
    if (user) {
      plan = await getExercisePlan(user.uid);
    }
    startNewSession();
  });

  function startNewSession() {
    suggestions = [...defaultSuggestions];
    messages = [{
      role: 'model',
      content: `Hello! I'm SpineGuide, your AI recovery companion. I'm here to help you understand your spine surgery, answer recovery questions, and guide you through your physiotherapy journey.\n\nHow are you feeling today? What would you like to know?`,
      timestamp: new Date()
    }];
    
    createChatSession({
      surgeryType: plan?.surgeryType || profile?.surgeryType,
      recoveryStage: plan?.recoveryStage || profile?.recoveryStage,
      daysSinceSurgery: profile?.surgeryDate
        ? Math.floor((Date.now() - new Date(profile.surgeryDate).getTime()) / 86400000)
        : undefined,
      precautions: plan?.precautions ? plan.precautions.join(', ') : undefined
    });
    sessionReady = true;
  }

  async function handleSend() {
    if (!inputText.trim() || isLoading || !sessionReady) return;

    const userMessage: ChatMessage = {
      role: 'user',
      content: inputText.trim(),
      timestamp: new Date()
    };

    messages = [...messages, userMessage];
    inputText = '';
    isLoading = true;

    setTimeout(() => messagesContainer?.scrollTo({ top: messagesContainer.scrollHeight, behavior: 'smooth' }), 50);

    const response = await sendMessage(null, userMessage.content);

    const aiMessage: ChatMessage = {
      role: 'model',
      content: response.text,
      timestamp: new Date()
    };
    
    if (response.suggestions && response.suggestions.length > 0) {
      suggestions = response.suggestions;
    } else {
      suggestions = [...defaultSuggestions];
    }

    messages = [...messages, aiMessage];
    isLoading = false;

    setTimeout(() => messagesContainer?.scrollTo({ top: messagesContainer.scrollHeight, behavior: 'smooth' }), 50);
  }

  function useSuggestion(s: string) {
    inputText = s;
    handleSend();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }
</script>

<svelte:head><title>AI Assistant – SpineSync</title></svelte:head>

<div class="flex flex-col h-[calc(100vh-5rem)] max-w-3xl mx-auto animate-fade-in">
  <!-- Header -->
  <div class="flex items-center gap-3 pb-4 border-b border-border mb-4">
    <div class="w-10 h-10 bg-primary rounded-full flex items-center justify-center text-white font-semibold">SG</div>
    <div>
      <h1 class="font-semibold text-black">SpineGuide AI</h1>
      <p class="text-xs text-muted">Your personalized spine recovery companion</p>
    </div>
    <div class="ml-auto flex gap-2 items-center">
      <span class="badge badge-success text-[10px] sm:text-xs">🟢 Online</span>
      <button onclick={startNewSession} class="btn-secondary text-xs px-3 py-1.5 h-auto">Restart</button>
    </div>
  </div>

  <!-- Disclaimer -->
  <Alert
    type="info"
    message="SpineGuide provides educational guidance only. For medical emergencies, contact your doctor or call emergency services immediately."
  />

  <!-- Messages -->
  <div bind:this={messagesContainer} class="flex-1 overflow-y-auto py-4 space-y-1">
    {#each messages as msg (msg.timestamp)}
      <ChatBubble message={msg} />
    {/each}

    {#if !isLoading && messages.length > 0 && messages[messages.length - 1].role === 'model'}
      <div class="mt-4 pb-4">
        <p class="text-[11px] font-medium text-muted uppercase tracking-wider mb-3 px-10">Suggested questions</p>
        <div class="flex flex-wrap gap-2 px-10">
          {#each suggestions as s}
            <button
              onclick={() => useSuggestion(s)}
              class="text-xs px-3 py-2 bg-white text-black border border-border rounded-full hover:border-primary hover:text-primary hover:bg-primary/5 transition-all text-left shadow-sm"
            >{s}</button>
          {/each}
        </div>
      </div>
    {/if}

    {#if isLoading}
      <div class="flex justify-start mb-4 px-2">
        <div class="w-8 h-8 bg-primary rounded-full flex items-center justify-center text-white text-xs font-semibold flex-shrink-0 mr-2 shadow-sm">SG</div>
        <div class="bg-white border border-border rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
          <div class="flex gap-1.5 items-center h-4">
            <div class="w-1.5 h-1.5 bg-primary/60 rounded-full animate-bounce" style="animation-delay:0ms"></div>
            <div class="w-1.5 h-1.5 bg-primary/60 rounded-full animate-bounce" style="animation-delay:150ms"></div>
            <div class="w-1.5 h-1.5 bg-primary/60 rounded-full animate-bounce" style="animation-delay:300ms"></div>
          </div>
        </div>
      </div>
    {/if}
  </div>

  <!-- Input -->
  <div class="border-t border-border pt-4">
    <div class="flex gap-2 items-end">
      <textarea
        bind:value={inputText}
        onkeydown={handleKeydown}
        placeholder="Ask SpineGuide anything about your recovery…"
        rows="1"
        class="input-field resize-none flex-1 focus:ring-2 focus:ring-primary/20 shadow-sm transition-all"
        style="min-height:48px; max-height:120px"
        disabled={isLoading}
      ></textarea>
      <button
        onclick={handleSend}
        disabled={!inputText.trim() || isLoading}
        class="btn-primary h-12 w-12 flex items-center justify-center flex-shrink-0 shadow-md group border-0"
        aria-label="Send message"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
      </button>
    </div>
    <p class="text-[10px] text-muted mt-2 text-center pb-2">SpineGuide is not a doctor. Always follow your healthcare provider's instructions.</p>
  </div>
</div>
