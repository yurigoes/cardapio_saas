FROM node:20-alpine

# libusb para impressoras USB
RUN apk add --no-cache libusb-dev eudev-dev

# Cria diretórios de log
RUN mkdir -p /var/log/print-agent && \
    chown -R node:node /var/log/print-agent

WORKDIR /app

COPY package.json ./
RUN npm install --production=false

COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

RUN npm prune --production

USER node

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:3001/health || exit 1

CMD ["node", "dist/index.js"]
