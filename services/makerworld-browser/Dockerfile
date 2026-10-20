FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends chromium xvfb fonts-liberation ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /service
COPY services/makerworld-browser/*.mjs ./
USER node
ENV HOME=/tmp DISPLAY=:99
CMD ["node", "server.mjs"]
