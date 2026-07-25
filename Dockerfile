FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

FROM node:22-alpine AS runner

WORKDIR /app

# Keep yt-dlp current enough for YouTube extractor changes. Node is also used
# by yt-dlp as its JavaScript runtime.
ARG YT_DLP_VERSION=2026.6.9
RUN apk add --no-cache ffmpeg python3 py3-pip \
    && pip install --no-cache-dir --break-system-packages "yt-dlp==${YT_DLP_VERSION}"

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

RUN mkdir -p /tmp/ewyoutube-downloads \
    && chown nextjs:nodejs /tmp/ewyoutube-downloads

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV DOWNLOAD_TEMP_DIR="/tmp/ewyoutube-downloads"

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -q -O - http://127.0.0.1:3000/api/health >/dev/null || exit 1

CMD ["node", "server.js"]
