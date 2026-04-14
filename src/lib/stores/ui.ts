import { writable } from 'svelte/store';

export const isSidebarOpen = writable(false);
export const activeTrackerId = writable<string | null>(null);
