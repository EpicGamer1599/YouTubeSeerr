FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig*.json vite.config.ts index.html ./
COPY server ./server
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime
ARG YTDLP_VERSION=2026.08.19
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv ffmpeg ca-certificates tini gosu \
    && python3 -m venv /opt/yt-dlp \
    && /opt/yt-dlp/bin/pip install --no-cache-dir "yt-dlp[default]==${YTDLP_VERSION}" \
    && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production PORT=5056 CONFIG_DIR=/config DOWNLOAD_DIR=/downloads MEDIA_DIR=/media/youtube PATH="/opt/yt-dlp/bin:${PATH}"
WORKDIR /app
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY scripts/backup.mjs ./scripts/backup.mjs
COPY scripts/entrypoint.sh /usr/local/bin/youtubeseerr-entrypoint
RUN sed -i 's/\r$//' /usr/local/bin/youtubeseerr-entrypoint && chmod 755 /usr/local/bin/youtubeseerr-entrypoint \
    && mkdir -p /config /downloads /media/youtube && chown node:node /config /downloads /media/youtube
EXPOSE 5056
ENTRYPOINT ["tini", "--", "youtubeseerr-entrypoint"]
CMD ["node", "dist/server/index.js"]
