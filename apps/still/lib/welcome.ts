export const WELCOME_STORAGE = "phantom-welcome-seen";

/**
 * Whether the home page opens with its welcome, decided before the first paint like HISTORY_HINT: the server
 * cannot know a first visit, so its HTML carries the welcome hidden and this shows it (see still-welcome in
 * still.css). A browser that refuses storage gets no welcome, since it could never be told to stop.
 */
export const WELCOME_HINT = `try{if(location.pathname==="/"&&!localStorage.getItem(${JSON.stringify(WELCOME_STORAGE)}))document.documentElement.dataset.welcome="intro"}catch(e){}`;

/** `pending` is the server's answer, and the browser's until it has read its storage. */
export type WelcomePhase = "pending" | "intro" | "talk" | "done";

let phase: WelcomePhase | undefined;
const listeners = new Set<() => void>();

export function welcomePhase(): WelcomePhase {
  if (!phase) {
    try { phase = localStorage.getItem(WELCOME_STORAGE) ? "done" : "intro"; } catch { phase = "done"; }
  }
  return phase;
}

/** The welcome counts as seen once the mascot has landed or been skipped, so a reload never replays it. */
export function setWelcomePhase(next: WelcomePhase) {
  if (phase === next) return;
  phase = next;
  if (next === "talk" || next === "done") { try { localStorage.setItem(WELCOME_STORAGE, "1"); } catch {} }
  listeners.forEach((listener) => listener());
}

export function subscribeWelcome(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
