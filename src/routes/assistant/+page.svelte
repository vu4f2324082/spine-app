<script lang="ts">
  import { onMount } from 'svelte';
  import { authStore } from '$lib/stores/auth';
  import { createChatSession, sendMessage } from '$lib/ai/gemini';
  import { getExercisePlan, getChatSessions, saveChatSession } from '$lib/firebase/firestore';
  import aiLogo from '$lib/assets/spine-app-ai-logo.jpg';
  import ChatBubble from '$lib/components/ChatBubble.svelte';
  import Alert from '$lib/components/Alert.svelte';
  import type { ChatMessage, ExercisePlan, ChatSession } from '$lib/types';

  let messages = $state<ChatMessage[]>([]);
  let inputText = $state('');
  let isLoading = $state(false);
  let sessionReady = $state(false);
  let messagesContainer: HTMLDivElement | undefined;
  
  let plan = $state<ExercisePlan | null>(null);
  let currentSessionId = $state<string | undefined>(undefined);
  let pastSessions = $state<ChatSession[]>([]);
  let isHistoryOpen = $state(false);

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
      pastSessions = await getChatSessions(user.uid);
    }
    startNewSession();
  });

  function startNewSession() {
    currentSessionId = undefined;
    isHistoryOpen = false;
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

    if (user) {
      const sessionData = {
        id: currentSessionId,
        uid: user.uid,
        messages: [...messages],
        updatedAt: new Date()
      } as ChatSession;
      
      saveChatSession(sessionData).then(savedId => {
        if (!currentSessionId) {
          currentSessionId = savedId;
          getChatSessions(user.uid).then(sessions => {
            pastSessions = sessions;
          });
        }
      });
    }

    setTimeout(() => messagesContainer?.scrollTo({ top: messagesContainer.scrollHeight, behavior: 'smooth' }), 50);
  }

  function loadSession(session: ChatSession) {
    messages = [...session.messages];
    currentSessionId = session.id;
    isHistoryOpen = false;
    sessionReady = true;
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
    <img src={aiLogo} alt="AI Avatar" class="w-10 h-10 object-cover rounded-full border border-border shadow-sm" />
    <div>
      <h1 class="font-semibold text-black">SpineGuide AI</h1>
      <p class="text-xs text-muted">Your personalized spine recovery companion</p>
    </div>
    <div class="ml-auto flex gap-2 items-center">
      <span class="badge badge-success text-[10px] sm:text-xs">🟢 Online</span>
      <button onclick={() => isHistoryOpen = true} class="btn-secondary text-xs px-3 py-1.5 h-auto whitespace-nowrap">History</button>
      <button onclick={startNewSession} class="btn-primary text-xs px-3 py-1.5 h-auto whitespace-nowrap">New Chat</button>
    </div>
  </div>

  <!-- Disclaimer -->
  <Alert
    type="info"
    message="SpineGuide provides educational guidance only. For medical emergencies, contact your doctor or call emergency services immediately."
  />

  <!-- History Sidebar Overlay -->
  {#if isHistoryOpen}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="fixed inset-0 bg-black/50 z-[100] flex justify-end" onclick={() => isHistoryOpen = false}>
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="bg-white w-80 h-full shadow-2xl flex flex-col transform transition-transform duration-300 translate-x-0" onclick={(e) => e.stopPropagation()}>
        <div class="p-4 border-b border-border flex justify-between items-center bg-surface/30">
          <h2 class="font-semibold text-lg text-black">Chat History</h2>
          <button onclick={() => isHistoryOpen = false} class="p-2 hover:bg-surface rounded-full transition-colors" aria-label="Close Chat History">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
        <div class="flex-1 overflow-y-auto p-3">
          {#if pastSessions.length === 0}
            <div class="text-center mt-10">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="mx-auto text-muted mb-3"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
              <p class="text-sm text-muted">No past conversations found.</p>
            </div>
          {:else}
            <div class="space-y-2">
              {#each pastSessions as session}
                <button 
                  class="w-full text-left p-3 rounded-xl transition-all shadow-sm {currentSessionId === session.id ? 'bg-primary/5 border border-primary/30' : 'bg-white border border-border hover:border-primary/30 hover:shadow-md'}"
                  onclick={() => loadSession(session)}
                >
                  <p class="text-sm font-medium line-clamp-1 block w-full text-black">
                    {session.messages.find(m => m.role === 'user')?.content || 'Chat Session'}
                  </p>
                  <p class="text-xs text-muted mt-1.5 flex items-center gap-1">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                    {new Date(session.updatedAt && typeof (session.updatedAt as any).toMillis === 'function' ? (session.updatedAt as any).toMillis() : session.updatedAt || Date.now()).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute:'2-digit' })}
                  </p>
                </button>
              {/each}
            </div>
          {/if}
        </div>
      </div>
    </div>
  {/if}

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
        <img src={aiLogo} alt="AI Avatar" class="w-8 h-8 rounded-full flex-shrink-0 mr-2 mt-auto object-cover border border-border" />
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
