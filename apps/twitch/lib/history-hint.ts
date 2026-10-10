import { HISTORY_STORAGE, validHistory } from "./history.ts";

/**
 * What the browser can tell the home page before any of it runs: how many videos and channels your history will
 * put under the search. The server cannot know, so its HTML carries skeletons for both, and this decides whether
 * they show (see [data-pending] in twitch.css). It runs from the document head, ahead of the first paint, and
 * HomeView keeps the same attributes current afterwards.
 */
export const HISTORY_HINT = `try{var h=(${validHistory.toString()})(JSON.parse(localStorage.getItem(${JSON.stringify(HISTORY_STORAGE)})||"[]")),d=document.documentElement.dataset;if(h.length){d.history=Math.min(h.length,4);d.historyChannels=Math.min(new Set(h.filter(function(e){return e.resource.kind==="vod"&&/^[a-z0-9_]{3,25}$/i.test(e.channel.trim())}).map(function(e){return e.channel.trim().toLowerCase()})).size,6)}}catch(e){}`;
