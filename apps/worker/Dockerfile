# Playwright + Node.js worker
# node:20-slim (Debian ベース) は Playwright の依存解決が容易
FROM node:20-slim AS builder

WORKDIR /app

# モノレポ: api と worker の依存だけをインストール
COPY apps/worker/package.json apps/worker/package-lock.json* ./apps/worker/
WORKDIR /app/apps/worker
RUN npm ci

COPY apps/worker/ .
RUN npm run build

# ── runtime ──
FROM node:20-slim AS runner

WORKDIR /app/apps/worker

ENV NODE_ENV=production
# Render は /tmp を共有メモリ代わりに使う
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# Playwright system deps をインストール
RUN apt-get update && apt-get install -y \
    libnss3 libnspr4 libdbus-1-3 libatk1.0-0 libatk-bridge2.0-0 \
    libcups2 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 \
    libxfixes3 libxrandr2 libgbm1 libasound2 \
    --no-install-recommends && rm -rf /var/lib/apt/lists/*

COPY apps/worker/package.json apps/worker/package-lock.json* ./
RUN npm ci --omit=dev

# Playwright Chromium のみインストール（Firefox/WebKit は不要）
RUN npx playwright install chromium

COPY --from=builder /app/apps/worker/dist ./dist

# セッション保存ディレクトリ（Render Disk でマウント）
RUN mkdir -p ./data/sessions

EXPOSE 3001

CMD ["node", "dist/index.js"]
