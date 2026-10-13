FROM node:22-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates xz-utils libfuse2 file \
    libgl1 libglu1-mesa libegl1 libgtk-3-0 libwebkit2gtk-4.1-0 libxkbcommon0 libnss3 libatk-bridge2.0-0 libgbm1 libasound2 fonts-liberation \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && npx playwright install chromium --with-deps || true
# OrcaSlicer (laminador del servidor). Se extrae el AppImage; no necesita FUSE ni pantalla.
RUN bash scripts/install-orca.sh || echo "OrcaSlicer no se pudo instalar: el laminador del servidor quedará deshabilitado"
ENV NODE_ENV=production STORAGE_DIR=/data/storage DATA_DIR=/data PGLITE_DIR=/data/pgdata
VOLUME /data
EXPOSE 3000
CMD ["sh", "-c", "npx tsx scripts/seed.ts --bootstrap-only && npx next start -p 3000"]
