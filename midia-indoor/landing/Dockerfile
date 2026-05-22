# ─────────────────────────────────────────────────────────────────────────────
# Three Digital Mídia — Landing/SaaS (Next.js 14 standalone)
# Build multi-stage enxuto. Imagem final ~150MB, roda na porta 3100.
# ─────────────────────────────────────────────────────────────────────────────

# 1) deps — instala dependências (cacheável)
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci || npm install

# 2) builder — compila o Next em modo standalone
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# 3) runner — só o necessário pra rodar
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3100
ENV HOSTNAME=0.0.0.0

RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

# output standalone: server.js + node_modules mínimos + estáticos
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3100
CMD ["node", "server.js"]
