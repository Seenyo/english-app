FROM node:22.23.1-bookworm-slim

ENV NODE_ENV=production
WORKDIR /app

RUN apt-get update \
  && apt-get install --yes --no-install-recommends ca-certificates git \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY server ./server
COPY shared ./shared

USER node

CMD ["node", "--env-file-if-exists=/var/secrets/server/.env.server", "--import", "tsx", "server/index.ts"]
