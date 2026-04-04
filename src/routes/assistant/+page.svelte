<script lang="ts">
  import { onMount } from 'svelte';
  import { authStore } from '$lib/stores/auth';
  import { createChatSession, sendMessage } from '$lib/ai/gemini';
  import { saveChatSession, getChatSessions, getExercisePlan } from '$lib/firebase/firestore';
  import ChatBubble from '$lib/components/ChatBubble.svelte';
  import Alert from '$lib/components/Alert.svelte';
  import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
  import type { ChatMessage, ChatSession, ExercisePlan } from '$lib/types';

  let messages = $state<ChatMessage[]>([]);
  let inputText = $state('');
  let isLoading = $state(false);
  let sessionReady = $state(false);
  let sessionId = $state<string | null>(null);
  let messagesContainer: HTMLDivElement | undefined;
  
  let sessions = $state<ChatSession[]>([]);
  let loadingSessions = $state(true);
  let plan = $state<ExercisePlan | null>(null);

  const user = $derived($authStore.user);
  const profile = $derived($authStore.patientProfile);

  const suggestions = [
    'What should I expect after spine surgery?',
    'What exercises are safe for early recovery?',
    'How can I manage pain naturally?',
    'When can I return to normal activities?',
    'What are warning signs I should watch for?'
  ];

  onMount(async () => {
    if (user) {
      const [fetchedSessions, fetchedPlan] = await Promise.all([
        getChatSessions(user.uid),
        getExercisePlan(user.uid)
      ]);
      sessions = fetchedSessions;
      plan = fetchedPlan;
      loadingSessions = false;
    } else {
      loadingSessions = false;
    }

    startNewSession();
  });

  function startNewSession() {
    sessionId = null;
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

  function loadSession(session: ChatSession) {
    if (isLoading) return;
    sessionId = session.id || null;
    messages = session.messages || [];
    
    // Resume context
    createChatSession({
      surgeryType: plan?.surgeryType || profile?.surgeryType,
      recoveryStage: plan?.recoveryStage || profile?.recoveryStage,
      daysSinceSurgery: profile?.surgeryDate
        ? Math.floor((Date.now() - new Date(profile.surgeryDate).getTime()) / 86400000)
        : undefined,
      precautions: plan?.precautions ? plan.precautions.join(', ') : undefined
    }, messages.map(m => ({ role: m.role, parts: [{ text: m.content }] })));
    
    setTimeout(() => messagesContainer?.scrollTo({ top: messagesContainer.scrollHeight, behavior: 'smooth' }), 50);
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
      content: response,
      timestamp: new Date()
    };

    messages = [...messages, aiMessage];
    isLoading = false;

    setTimeout(() => messagesContainer?.scrollTo({ top: messagesContainer.scrollHeight, behavior: 'smooth' }), 50);

    if (user) {
      const id = await saveChatSession({
        id: sessionId || undefined,
        uid: user.uid,
        messages: messages,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      sessionId = id;
      
      // Update history list optimistically
      if (!sessions.find(s => s.id === id)) {
        sessions = [{ id, uid: user.uid, messages, createdAt: new Date(), updatedAt: new Date() }, ...sessions];
      } else {
        const idx = sessions.findIndex(s => s.id === id);
        if (idx !== -1) {
          const updated = [...sessions];
          updated[idx].messages = messages;
          updated[idx].updatedAt = new Date();
          sessions = updated.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
        }
      }
    }
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

<div class="flex h-[calc(100vh-5rem)] max-w-5xl mx-auto gap-6 transition-all duration-300">
  
  <!-- Sidebar for History -->
  <div class="hidden md:flex flex-col w-72 bg-card rounded-2xl border border-border shadow-sm overflow-hidden flex-shrink-0 animate-fade-in-up">
    <div class="p-4 border-b border-border bg-black/5">
      <button onclick={startNewSession} class="btn-primary w-full text-sm py-2.5 flex items-center justify-center gap-2">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
        New Chat
      </button>
    </div>
    
    <div class="flex-1 overflow-y-auto p-2">
      <h3 class="text-[11px] font-bold text-muted uppercase tracking-wider mb-2 px-3 pt-3">Previous Sessions</h3>
      {#if loadingSessions}
        <div class="flex justify-center p-6"><LoadingSpinner size="sm" label="Loading..." /></div>
      {:else if sessions.length === 0}
        <div class="px-3 py-6 text-xs text-muted text-center italic border border-dashed border-border rounded-xl m-2">No past sessions found. Start a new chat!</div>
      {:else}
        <ul class="space-y-1 mt-2">
          {#each sessions as session}
            <li>
              <button 
                onclick={() => loadSession(session)}
                class="w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors flex flex-col gap-1 
                       {sessionId === session.id ? 'bg-primary/10 border border-primary/20 text-primary font-medium shadow-sm' : 'text-black hover:bg-black/5 border border-transparent'}"
              >
                <div class="flex items-center gap-2">
                  <svg class="{sessionId === session.id ? 'text-primary' : 'text-muted'}" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                  <span class="truncate block flex-1">
                    {session.messages && session.messages.length > 1 
                      ? session.messages[1].content.substring(0, 35) + (session.messages[1].content.length > 35 ? '...' : '') 
                      : 'New Conversation'}
                  </span>
                </div>
                <span class="text-[10px] text-muted ml-6">
                  {new Date((session as any).updatedAt?.toMillis?.() || session.updatedAt || Date.now()).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  </div>

  <!-- Main Chat Area -->
  <div class="flex flex-col flex-1 animate-fade-in-up">
    <!-- Header -->
    <div class="flex items-center gap-3 pb-4 border-b border-border mb-4">
      <div class="w-10 h-10 bg-primary rounded-full flex items-center justify-center text-white font-semibold">SG</div>
      <div>
        <h1 class="font-semibold text-black">SpineGuide AI</h1>
        <p class="text-xs text-muted">Your personalized spine recovery companion</p>
      </div>
      <div class="ml-auto flex items-center gap-2">
        <span class="badge badge-success text-[10px] sm:text-xs">🟢 Online</span>
        <button onclick={startNewSession} class="md:hidden btn-secondary text-xs px-3 py-1.5 h-auto flex items-center gap-1">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          <span class="hidden sm:inline">New</span>
        </button>
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
          <p class="text-xs text-muted mb-3 px-10">Suggested questions:</p>
          <div class="flex flex-wrap gap-2 px-10">
            {#each suggestions as s}
              <button
                onclick={() => useSuggestion(s)}
                class="text-xs px-3 py-2 bg-white text-black border border-border rounded-full hover:border-primary hover:text-primary transition-colors text-left"
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
</div>
