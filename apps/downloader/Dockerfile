# Built from the workspace root (see `image_build_context` in wrangler.jsonc),
# because the app is compiled against packages that live outside its folder.
FROM node:22-bookworm-slim AS builder

WORKDIR /app

ARG NEXT_PUBLIC_BASE_URL=https://ewyoutube.com
ARG NEXT_PUBLIC_DOWNLOADS_RESTRICTED=false
ENV NEXT_PUBLIC_BASE_URL=$NEXT_PUBLIC_BASE_URL
ENV NEXT_PUBLIC_DOWNLOADS_RESTRICTED=$NEXT_PUBLIC_DOWNLOADS_RESTRICTED

# Manifests first so a dependency-free code change reuses the install layer.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/config/package.json ./packages/config/
COPY packages/theme/package.json ./packages/theme/
COPY packages/ui/package.json ./packages/ui/
COPY apps/downloader/package.json ./apps/downloader/
RUN corepack enable && pnpm install --frozen-lockfile --filter @phantom/downloader...

COPY packages ./packages
COPY apps/downloader ./apps/downloader
RUN pnpm --filter @phantom/downloader build

# Pin the provider image by release and immutable multi-architecture digest.
# It supplies the local HTTP service used by the matching yt-dlp plugin.
FROM brainicism/bgutil-ytdlp-pot-provider:1.3.1-node@sha256:1aaa43a0ca72dfca6a6d2129a0fb4a23465c25adb1b043f8aff829a20825646b AS runner

USER root
WORKDIR /srv/phantom

# Keep yt-dlp and its provider plugin pinned together. The provider image
# already contains Node and the compiled token service under /app.
ARG YT_DLP_VERSION=2026.7.4
ARG BGUTIL_PROVIDER_VERSION=1.3.1
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      ca-certificates ffmpeg python3 python3-pip tini \
    && pip3 install --no-cache-dir --break-system-packages \
      "yt-dlp[default]==${YT_DLP_VERSION}" \
      "bgutil-ytdlp-pot-provider==${BGUTIL_PROVIDER_VERSION}" \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production

# The standalone bundle keeps the workspace layout, so the app entry point sits
# at apps/downloader/server.js rather than at the root.
COPY --chown=node:node --from=builder /app/apps/downloader/.next/standalone ./
COPY --chown=node:node --from=builder /app/apps/downloader/.next/static ./apps/downloader/.next/static
COPY --chown=node:node --from=builder /app/apps/downloader/public ./apps/downloader/public
COPY apps/downloader/docker-entrypoint.sh /usr/local/bin/phantom-entrypoint

RUN mkdir -p /tmp/ewyoutube-downloads \
    && chown node:node /tmp/ewyoutube-downloads \
    && chmod 0755 /usr/local/bin/phantom-entrypoint

USER node

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV DOWNLOAD_TEMP_DIR="/tmp/ewyoutube-downloads"
ENV POT_PROVIDER_PORT=4416
ENV YT_DLP_PROVIDER_URL="http://127.0.0.1:4416"
ENV YT_DLP_YOUTUBE_CLIENT="mweb"

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e 'fetch("http://127.0.0.1:3000/api/health").then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))'

ENTRYPOINT ["/usr/bin/tini", "-g", "--", "/usr/local/bin/phantom-entrypoint"]
CMD ["node", "apps/downloader/server.js"]
