import { ChannelSearchIndex } from "./ranking.ts";
import { SEARCH_SEEDS } from "./seeds.ts";

export const channelIndex = new ChannelSearchIndex();
channelIndex.put(SEARCH_SEEDS);
