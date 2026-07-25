import { defineCloudflareConfig } from "@opennextjs/cloudflare";

/**
 * The stream app is pure Next: no long-lived process, no binaries, so it runs
 * on Workers directly rather than in a container the way the downloader does.
 * Caching is left at the defaults until there is a reason to pay for KV.
 */
export default defineCloudflareConfig();
