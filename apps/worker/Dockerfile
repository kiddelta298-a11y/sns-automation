# Playwright + Node.js worker
# Docker context: apps/worker/
FROM node:20-slim AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ── runtime ──
FROM node:20-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# Playwright system deps + Python (for Scrapling sidecar)
RUN apt-get update && apt-get install -y \
    libnss3 libnspr4 libdbus-1-3 libatk1.0-0 libatk-bridge2.0-0 \
    libcups2 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 \
    libxfixes3 libxrandr2 libgbm1 libasound2 \
    python3 python3-pip python3-venv \
    --no-install-recommends && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Playwright Chromium のみ
RUN npx playwright install chromium

# ── Scrapling sidecar (Python venv) ──
# Worker と同居させて追加コスト 0 で運用。
# 環境変数 THREADS_SCRAPER_ENGINE=scrapling のときだけ起動される。
ENV SCRAPLING_VENV=/opt/scrapling-venv
ENV PYTHON_BIN=/opt/scrapling-venv/bin/python3
COPY python/requirements.txt ./python/requirements.txt
RUN python3 -m venv ${SCRAPLING_VENV} \
 && ${SCRAPLING_VENV}/bin/pip install --no-cache-dir --upgrade pip \
 && ${SCRAPLING_VENV}/bin/pip install --no-cache-dir -r ./python/requirements.txt \
 && ${SCRAPLING_VENV}/bin/scrapling install || true
COPY python ./python

COPY --from=builder /app/dist ./dist

RUN mkdir -p ./data/sessions

EXPOSE 3001

CMD ["node", "dist/index.js"]
