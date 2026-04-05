<script lang="ts">
  import { onMount } from 'svelte';
  import { authStore } from '$lib/stores/auth';
  import { createChatSession, sendMessage } from '$lib/ai/gemini';
  import { getExercisePlan, getChatSessions, saveChatSession, deleteChatSession } from '$lib/firebase/firestore';
  import aiLogo from '$lib/assets/spine-app-ai-logo.jpg';
  import ChatBubble from '$lib/components/ChatBubble.svelte';
  import Alert from '$lib/components/Alert.svelte';
  import type { ChatMessage, ExercisePlan, ChatSession } from '$lib/types';

  // ── Reactive auth ────────────────────────────────────────────────────────────
  const user    = $derived($authStore.user);
  const profile = $derived($authStore.patientProfile);

  // ── UI state ─────────────────────────────────────────────────────────────────
  let messages        = $state<ChatMessage[]>([]);
  let inputText       = $state('');
  let isLoading       = $state(false);
  let sessionReady    = $state(false);
  let sidebarOpen     = $state(true);
  let historyLoading  = $state(false);
  let deletingId      = $state<string | undefined>(undefined);
  let messagesContainer: HTMLDivElement | undefined;

  let plan             = $state<ExercisePlan | null>(null);
  let currentSessionId = $state<string | undefined>(undefined);
  let pastSessions     = $state<ChatSession[]>([]);

  const defaultSuggestions = [
    'What should I expect after spine surgery?',
    'What exercises are safe for early recovery?',
    'How can I manage pain naturally?',
    'When can I return to normal activities?',
    'What are warning signs I should watch for?'
  ];
  let suggestions = $state<string[]>([...defaultSuggestions]);

  // ── Reactive data loading ────────────────────────────────────────────────────
  // Use $effect so we re-fetch whenever the user becomes available.
  // This handles the async Firebase auth delay correctly.
  $effect(() => {
    if (user) {
      loadUserData(user.uid);
    }
  });

  async function loadUserData(uid: string) {
    historyLoading = true;
    try {
      const [fetchedPlan, sessions] = await Promise.all([
        getExercisePlan(uid),
        getChatSessions(uid)
      ]);
      plan         = fetchedPlan;
      pastSessions = sessions;
    } catch (err) {
      console.error('[SpineGuide] Failed to load user data:', err);
    } finally {
      historyLoading = false;
    }
  }

  async function refreshHistory() {
    if (!user) return;
    try {
      pastSessions = await getChatSessions(user.uid);
    } catch (err) {
      console.error('[SpineGuide] Failed to refresh history:', err);
    }
  }

  onMount(() => { startNewSession(); });

  // ── Session helpers ───────────────────────────────────────────────────────────
  function startNewSession() {
    currentSessionId = undefined;
    suggestions      = [...defaultSuggestions];
    messages = [{
      role: 'model',
      content: `Hello! I'm SpineGuide, your AI recovery companion. I'm here to help you understand your spine surgery, answer recovery questions, and guide you through your physiotherapy journey.\n\nHow are you feeling today? What would you like to know?`,
      timestamp: new Date()
    }];
    createChatSession({
      surgeryType:      plan?.surgeryType      || profile?.surgeryType,
      recoveryStage:    plan?.recoveryStage    || profile?.recoveryStage,
      daysSinceSurgery: profile?.surgeryDate
        ? Math.floor((Date.now() - new Date(profile.surgeryDate).getTime()) / 86400000)
        : undefined,
      precautions: plan?.precautions ? plan.precautions.join(', ') : undefined
    });
    sessionReady = true;
  }

  function loadSession(session: ChatSession) {
    messages         = [...session.messages];
    currentSessionId = session.id;
    sessionReady     = true;
    setTimeout(() => messagesContainer?.scrollTo({ top: messagesContainer.scrollHeight, behavior: 'smooth' }), 60);
  }

  function generateTitle(msgs: ChatMessage[]): string {
    const first = msgs.find(m => m.role === 'user');
    if (!first) return 'New conversation';
    return first.content.length > 60 ? first.content.slice(0, 58) + '…' : first.content;
  }

  async function persistSession(msgs: ChatMessage[]) {
    if (!user) return;
    try {
      // Build payload — omit `id` when creating a new session so Firestore auto-generates
      const payload: Omit<ChatSession, 'id'> & { id?: string } = {
        uid:      user.uid,
        title:    generateTitle(msgs),
        messages: msgs,
        createdAt: new Date(),
        updatedAt:  new Date()
      };
      if (currentSessionId) payload.id = currentSessionId;

      const savedId = await saveChatSession(payload as ChatSession);
      if (!currentSessionId) {
        currentSessionId = savedId;
      }
      await refreshHistory();
    } catch (err) {
      console.error('[SpineGuide] Failed to save session:', err);
    }
  }

  async function handleDelete(e: MouseEvent, sessionId: string) {
    e.stopPropagation();
    if (!confirm('Delete this conversation?')) return;
    deletingId = sessionId;
    try {
      await deleteChatSession(sessionId);
      pastSessions = pastSessions.filter(s => s.id !== sessionId);
      if (currentSessionId === sessionId) startNewSession();
    } catch (err) {
      console.error('[SpineGuide] Failed to delete session:', err);
    } finally {
      deletingId = undefined;
    }
  }

  // ── Send ──────────────────────────────────────────────────────────────────────
  async function handleSend() {
    if (!inputText.trim() || isLoading || !sessionReady) return;

    const userMsg: ChatMessage = { role: 'user', content: inputText.trim(), timestamp: new Date() };
    messages  = [...messages, userMsg];
    inputText = '';
    isLoading = true;
    scrollBottom();

    try {
      const response = await sendMessage(null, userMsg.content);
      const aiMsg: ChatMessage = { role: 'model', content: response.text, timestamp: new Date() };
      suggestions = response.suggestions?.length ? response.suggestions : [...defaultSuggestions];
      messages    = [...messages, aiMsg];
      // Persist — intentionally not awaited so UI isn't blocked
      persistSession([...messages]);
    } catch (err) {
      console.error('[SpineGuide] Send failed:', err);
    } finally {
      isLoading = false;
      scrollBottom();
    }
  }

  function scrollBottom() {
    setTimeout(() => messagesContainer?.scrollTo({ top: messagesContainer.scrollHeight, behavior: 'smooth' }), 60);
  }

  function useSuggestion(s: string) { inputText = s; handleSend(); }
  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }

  // ── Date grouping ─────────────────────────────────────────────────────────────
  function toMs(v: any): number {
    return v && typeof v.toMillis === 'function' ? v.toMillis() : new Date(v || 0).getTime();
  }

  function groupLabel(ts: number): string {
    const delta = Date.now() - ts;
    if (delta < 86_400_000)     return 'Today';
    if (delta < 172_800_000)    return 'Yesterday';
    if (delta < 7 * 86_400_000) return 'This Week';
    return 'Older';
  }

  const groupedSessions = $derived.by(() => {
    const groups: Record<string, ChatSession[]> = {};
    for (const s of pastSessions) {
      const label = groupLabel(toMs(s.updatedAt));
      (groups[label] ??= []).push(s);
    }
    return ['Today', 'Yesterday', 'This Week', 'Older']
      .filter(k => groups[k]?.length)
      .map(k => ({ label: k, sessions: groups[k] }));
  });
</script>

<svelte:head><title>AI Assistant – SpineSync</title></svelte:head>

<div class="flex h-[calc(100vh-5rem)] gap-0 overflow-hidden -mx-4 sm:-mx-6 lg:-mx-8 animate-fade-in">

  <!-- ══ SIDEBAR ═══════════════════════════════════════════════════════════════ -->
  <aside class="
    {sidebarOpen ? 'w-72' : 'w-0'}
    flex-shrink-0 overflow-hidden transition-[width] duration-300 ease-in-out
    bg-[#0f0f0f] border-r border-white/10 flex flex-col select-none
  ">
    <!-- Sidebar header -->
    <div class="flex items-center justify-between px-4 py-4 border-b border-white/10 flex-shrink-0">
      <span class="text-white font-semibold text-sm tracking-wide">Chat History</span>
      <button
        onclick={startNewSession}
        class="flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
        title="New chat"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        New chat
      </button>
    </div>

    <!-- Session list -->
    <div class="flex-1 overflow-y-auto px-2 py-2 space-y-4">
      {#if historyLoading}
        <!-- Loading skeleton -->
        <div class="space-y-2 px-2 pt-2">
          {#each [80, 60, 90, 55] as w}
            <div class="h-9 rounded-lg bg-white/8 animate-pulse" style="width:{w}%"></div>
          {/each}
        </div>
      {:else if pastSessions.length === 0}
        <div class="text-center mt-12 px-4">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="mx-auto text-white/30 mb-3">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          <p class="text-xs text-white/40">No conversations yet.<br/>Start chatting!</p>
        </div>
      {:else}
        {#each groupedSessions as group}
          <div>
            <p class="text-[10px] uppercase tracking-widest text-white/35 font-semibold px-3 mb-1">{group.label}</p>
            <div class="space-y-0.5">
              {#each group.sessions as session}
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div
                  class="group relative flex items-center rounded-lg px-3 py-2.5 cursor-pointer transition-all
                    {currentSessionId === session.id
                      ? 'bg-white/15 text-white'
                      : 'text-white/60 hover:bg-white/8 hover:text-white'}"
                  onclick={() => loadSession(session)}
                  title={session.title}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="flex-shrink-0 mr-2.5 opacity-60">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                  </svg>
                  <span class="text-[13px] truncate flex-1">{session.title || 'Chat Session'}</span>
                  <button
                    class="ml-1 flex-shrink-0 opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-500/20 hover:text-red-400 transition-all"
                    onclick={(e) => handleDelete(e, session.id!)}
                    disabled={deletingId === session.id}
                    aria-label="Delete conversation"
                  >
                    {#if deletingId === session.id}
                      <svg class="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                      </svg>
                    {:else}
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/>
                      </svg>
                    {/if}
                  </button>
                </div>
              {/each}
            </div>
          </div>
        {/each}
      {/if}
    </div>
  </aside>

  <!-- ══ MAIN CHAT PANE ════════════════════════════════════════════════════════ -->
  <div class="flex flex-col flex-1 min-w-0 bg-white">

    <!-- Header -->
    <div class="flex items-center gap-3 px-4 sm:px-6 py-3.5 border-b border-border flex-shrink-0">
      <button
        onclick={() => sidebarOpen = !sidebarOpen}
        class="p-1.5 rounded-lg hover:bg-surface transition-colors text-muted hover:text-black"
        aria-label="Toggle history panel"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
        </svg>
      </button>

      <img src={aiLogo} alt="AI Avatar" class="w-9 h-9 object-cover rounded-full border border-border shadow-sm flex-shrink-0" />
      <div class="min-w-0">
        <h1 class="font-semibold text-black text-sm leading-tight">SpineGuide AI</h1>
        <p class="text-[11px] text-muted leading-tight">Your personalized spine recovery companion</p>
      </div>
      <div class="ml-auto flex gap-2 items-center flex-shrink-0">
        <span class="badge badge-success text-[10px] sm:text-xs hidden sm:flex">🟢 Online</span>
        <button onclick={startNewSession} class="btn-primary text-xs px-3 py-1.5 h-auto whitespace-nowrap">
          + New Chat
        </button>
      </div>
    </div>

    <!-- Disclaimer -->
    <div class="px-4 sm:px-6 pt-3 flex-shrink-0">
      <Alert type="info" message="SpineGuide provides educational guidance only. For medical emergencies, contact your doctor or call emergency services immediately." />
    </div>

    <!-- Messages -->
    <div bind:this={messagesContainer} class="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-1">
      {#each messages as msg (msg.timestamp)}
        <ChatBubble message={msg} />
      {/each}

      {#if !isLoading && messages.length > 0 && messages[messages.length - 1].role === 'model'}
        <div class="mt-4 pb-2">
          <p class="text-[11px] font-medium text-muted uppercase tracking-wider mb-3">Suggested questions</p>
          <div class="flex flex-wrap gap-2">
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
          <img src={aiLogo} alt="AI" class="w-8 h-8 rounded-full flex-shrink-0 mr-2 mt-auto object-cover border border-border" />
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
    <div class="border-t border-border px-4 sm:px-6 pt-3 pb-4 flex-shrink-0">
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
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform">
            <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
          </svg>
        </button>
      </div>
      <p class="text-[10px] text-muted mt-2 text-center">SpineGuide is not a doctor. Always follow your healthcare provider's instructions.</p>
    </div>
  </div>
</div>
