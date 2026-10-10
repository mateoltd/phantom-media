import { FEATURED_CHANNELS } from "../discovery/featured.ts";
import type { SearchChannel } from "./contracts.ts";

/** Name hints only. Existence, live state and audience are resolved separately.
 * This small multilingual bootstrap is not an exhaustive Twitch directory. */
const names = [
  "rubius", "ibai", "illojuan", "elxokas", "thegrefg", "rickyedit", "alexelcapo", "elmariana", "quackity", "juansguarnizo", "rivers_gg", "spreen", "roier", "elspreen", "carola", "knekro", "vegetta777", "willyrex", "djmariio", "luzu", "mixwell", "bysTaXx", "miraieta",
  "kaicenat", "caseoh_", "asmongold", "sodapoppin", "lirik", "summit1g", "pokimane", "tarik", "hasanabi", "mizkif", "esfandtv", "nmplol", "extraemily", "forsen", "nymn", "squeex", "moonmoon", "piratesoftware", "cohhcarnage", "ludwig", "jerma985", "theshy", "caedrel", "loltyler1", "doublelift", "sneakylol", "riotgames", "lol_esports", "otplol_", "eslcs", "esl_dota2",
  "kamet0", "gotaga", "squeezie", "aminematue", "zerator", "domingo", "ponce", "jltomy", "papaplatte", "gronkh", "montanablack88", "trymacs", "eliasn97", "handofblood", "honeyPuu", "fextralife", "gaules", "alanzoka", "casimito", "loud_coringa", "cellbit", "brucedropemoff", "ironmouse", "ksononair", "shaka", "fps_shaka", "stylishnoob4", "jasper7se", "kato_junichi0817",
];
export const SEARCH_SEEDS: SearchChannel[] = [...FEATURED_CHANNELS.map(({ login, label }) => ({ login, displayName: label })),
  ...names.map(login => ({ login: login.toLowerCase(), displayName: login }))];
