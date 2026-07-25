import { Container } from "@cloudflare/containers";

const PRODUCTION_CONTAINER_ID = "phantom-production";

export class PhantomContainer extends Container<Cloudflare.Env> {
  defaultPort = 3000;
  requiredPorts = [3000];
  sleepAfter = "10m";
  enableInternet = true;
  pingEndpoint = "/api/health";
  envVars = {
    NODE_ENV: "production",
    PORT: "3000",
    HOSTNAME: "0.0.0.0",
    NEXT_PUBLIC_BASE_URL: "https://ewyoutube.com",
    NEXT_PUBLIC_DOWNLOADS_RESTRICTED: "false",
    DOWNLOAD_CLIENT_IP_HEADER: "cf-connecting-ip",
    DOWNLOAD_MAX_CONCURRENT: "1",
    DOWNLOAD_MAX_PENDING: "12",
    DOWNLOAD_MAX_JOBS_PER_IP: "2",
    DOWNLOAD_MAX_DURATION_SECONDS: "14400",
    DOWNLOAD_MAX_FILESIZE: "2G",
    DOWNLOAD_MAX_TEMP_BYTES: "8589934592",
    DOWNLOAD_JOB_TIMEOUT_SECONDS: "1800",
    DOWNLOAD_TEMP_DIR: "/tmp/ewyoutube-downloads",
    RESOLVE_MAX_PLAYLIST_ITEMS: "100",
    PROXY_MAX_ATTEMPTS: "10",
    PROXY_COOLDOWN_BASE_SECONDS: "30",
    PROXY_CHALLENGE_COOLDOWN_SECONDS: "600",
    PROXY_MIN_INTERVAL_MS: "5000",
    PROXY_ALLOW_DIRECT_FALLBACK: "false",
    EWYOUTUBE_PROXY_URLS: this.env.EWYOUTUBE_PROXY_URLS,
    YT_DLP_PATH: "yt-dlp",
    YT_DLP_METADATA_ATTEMPT_TIMEOUT_MS: "12000",
    YT_DLP_METADATA_TOTAL_TIMEOUT_MS: "45000",
    YT_DLP_PROVIDER_URL: "http://127.0.0.1:4416",
    YT_DLP_YOUTUBE_CLIENT: "mweb",
    POT_PROVIDER_PORT: "4416",
    FFMPEG_PATH: "/usr/bin",
  };
}

export default {
  async fetch(request, env): Promise<Response> {
    try {
      const container =
        env.PHANTOM_CONTAINER.getByName(PRODUCTION_CONTAINER_ID);
      return await container.fetch(request);
    } catch (error) {
      console.error(
        JSON.stringify({
          message: "container request failed",
          error:
            error instanceof Error ? error.message : "Unknown container error",
          path: new URL(request.url).pathname,
        })
      );
      return new Response("Phantom is temporarily starting. Please retry.", {
        status: 503,
        headers: {
          "Cache-Control": "no-store",
          "Content-Type": "text/plain; charset=utf-8",
          "Retry-After": "5",
        },
      });
    }
  },
} satisfies ExportedHandler<Cloudflare.Env>;
