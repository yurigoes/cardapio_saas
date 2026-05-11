FROM node:20-alpine

# Cria diretórios de estado e log
RUN mkdir -p /var/lib/sync-agent /var/log/sync-agent && \
    chown -R node:node /var/lib/sync-agent /var/log/sync-agent

WORKDIR /app

# Copia manifests primeiro (cache de layers)
COPY package.json ./
RUN npm install --production=false

# Compila TypeScript
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# Remove devDependencies para imagem menor
RUN npm prune --production

USER node

EXPOSE 3002

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3002/health || exit 1

CMD ["node", "dist/index.js"]
