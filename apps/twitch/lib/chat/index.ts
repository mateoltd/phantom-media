import type { ChatMessage } from "./messages.ts";
export interface IndexedRange { from: number; through: number; partial: boolean }
export function createChatIndex(maximum = 10_000) {
  const messages = new Map<string, ChatMessage>();
  let ranges: IndexedRange[] = [];
  return {
    add(incoming: ChatMessage[], range: IndexedRange) {
      for (const message of incoming) if (message.offset !== undefined) messages.set(message.id, message);
      while (messages.size > maximum) messages.delete(messages.keys().next().value!);
      ranges.push(range); ranges = ranges.slice(-128);
    },
    search(query: string): ChatMessage[] { const needle = query.toLocaleLowerCase().trim(); return needle ? [...messages.values()].filter(message => `${message.user} ${message.text}`.toLocaleLowerCase().includes(needle)).sort((a,b) => a.offset! - b.offset!).slice(0, 100) : []; },
    ranges: () => [...ranges],
    size: () => messages.size,
    reactions() {
      const bins = new Map<number, { count: number; emotes: number }>();
      for (const message of messages.values()) {
        const position = Math.floor(message.offset! / 60) * 60, bin = bins.get(position) ?? { count: 0, emotes: 0 };
        bin.count++; bin.emotes += message.fragments?.filter(fragment => fragment.emoteId).length ?? 0; bins.set(position, bin);
      }
      const baseline = [...bins.values()].reduce((sum, bin) => sum + bin.count, 0) / Math.max(1, bins.size);
      return [...bins.entries()].map(([position, bin]) => ({ position, ...bin, relative: bin.count / Math.max(1, baseline) })).sort((a,b) => b.relative - a.relative).slice(0, 12);
    },
  };
}
