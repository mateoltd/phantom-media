import "server-only";

const DEFAULT_PROVIDER_URL = "http://127.0.0.1:4416";
const CLIENT_PATTERN = /^[a-z0-9_,-]+$/i;

export function getPoTokenProviderUrl(): string | null {
  const configured = process.env.YT_DLP_PROVIDER_URL?.trim();
  if (!configured) return null;

  try {
    const url = new URL(configured || DEFAULT_PROVIDER_URL);
    const isLoopback =
      url.hostname === "127.0.0.1" ||
      url.hostname === "::1" ||
      url.hostname === "localhost";
    if (url.protocol !== "http:" || !isLoopback || url.username || url.password) {
      return null;
    }
    url.pathname = url.pathname.replace(/\/+$/, "");
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

export function appendYouTubeRuntimeArgs(args: string[]): void {
  args.push("--js-runtimes", "node");

  const client = process.env.YT_DLP_YOUTUBE_CLIENT?.trim();
  if (client && CLIENT_PATTERN.test(client)) {
    args.push("--extractor-args", `youtube:player_client=${client}`);
  }

  const providerUrl = getPoTokenProviderUrl();
  if (providerUrl) {
    args.push(
      "--extractor-args",
      `youtubepot-bgutilhttp:base_url=${providerUrl}`
    );
  }
}
